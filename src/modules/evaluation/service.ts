import type { GroupKind } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, invalidTransition, notFound } from "@/lib/errors";
import { lockPerformance } from "@/modules/events/service";

export async function getEvaluatorContext(assignmentId: string) {
  const a = await db.evaluatorAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      person: true,
      conflicts: true,
      event: {
        include: {
          config: true,
          groups: { include: { scorecard: { include: { criteria: { orderBy: { order: "asc" } } } } } },
        },
      },
    },
  });
  if (!a) throw notFound("Assignment");
  const group = a.event.groups.find((g) => g.kind === a.group);
  const criteria = group?.scorecard?.criteria ?? [];
  const active = await db.performance.findFirst({
    where: { round: { eventId: a.eventId }, status: { in: ["ON_STAGE", "VOTING_OPEN", "GRACE_PERIOD", "VOTING_CLOSED", "CALCULATING", "RESULT_READY", "PARTIAL_REVEALED"] } },
    orderBy: [{ onStageAt: "desc" }],
    include: { band: true, timer: true },
  });
  const mine = await db.scoreSubmission.findMany({
    where: { assignmentId, eventId: a.eventId },
    include: { items: true, performance: { include: { band: true } } },
    orderBy: { submittedAt: "asc" },
  });
  const notifications = await db.notification.findMany({
    where: { eventId: a.eventId, audience: { in: ["ALL_EVALUATORS", a.group === "JUDGE" ? "JUDGES" : "STAFF"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return {
    assignment: { id: a.id, group: a.group, personName: a.person.name, individualWeightBp: a.individualWeightBp },
    event: { id: a.eventId, name: a.event.name, slug: a.event.slug, status: a.event.status, timerPlannedSeconds: a.event.config?.timerPlannedSeconds ?? 2700 },
    criteria: criteria.map((c) => ({ id: c.id, key: c.key, nameEs: c.nameEs, nameEn: c.nameEn, descriptionEs: c.descriptionEs, descriptionEn: c.descriptionEn, scaleMin: c.scaleMin, scaleMax: c.scaleMax })),
    active: active
      ? {
          id: active.id,
          status: active.status,
          band: { id: active.band.id, name: active.band.name, imageUrl: active.band.imageUrl, genre: active.band.genre },
          timer: active.timer
            ? { status: active.timer.status, plannedSeconds: active.timer.plannedSeconds, startedAt: active.timer.startedAt?.toISOString() ?? null, pausedAt: active.timer.pausedAt?.toISOString() ?? null, pausedTotalSeconds: active.timer.pausedTotalSeconds, actualSeconds: active.timer.actualSeconds }
            : null,
          conflict: a.conflicts.some((c) => c.bandId === active.bandId),
          mine: mine.find((m) => m.performanceId === active.id)
            ? (() => {
                const m = mine.find((x) => x.performanceId === active.id)!;
                return { id: m.id, status: m.status, lockedAt: m.lockedAt?.toISOString() ?? null, items: m.items.map((i) => ({ criterionId: i.criterionId, value: i.value })), comment: m.comment };
              })()
            : null,
        }
      : null,
    history: mine.filter((m) => m.status !== "DRAFT").map((m) => ({ performanceId: m.performanceId, band: m.performance.band.name, lockedAt: m.lockedAt?.toISOString() ?? null })),
    notifications: notifications.map((n) => ({ id: n.id, kind: n.kind, titleEs: n.titleEs, titleEn: n.titleEn, createdAt: n.createdAt.toISOString() })),
  };
}

export interface EvaluationInput {
  assignmentId: string;
  group: GroupKind;
  performanceId: string;
  items: { criterionId: string; value: number }[];
  comment?: string | null;
  submissionKey: string;
  requestId?: string;
}

/** Saves a draft (upsert, never locked). */
export async function saveDraft(input: EvaluationInput) {
  return db.$transaction(async (tx) => {
    const { eventId, roundId } = await performanceMeta(tx, input.performanceId);
    await assertNoConflict(tx, input.assignmentId, input.performanceId);
    await validateItems(tx, eventId, input.group, input.items, false);
    const existing = await tx.scoreSubmission.findUnique({ where: { performanceId_assignmentId: { performanceId: input.performanceId, assignmentId: input.assignmentId } } });
    if (existing && existing.status !== "DRAFT") throw new AppError("CONFLICT", "Evaluation is locked.");
    if (existing) {
      await tx.scoreItem.deleteMany({ where: { submissionId: existing.id } });
      return tx.scoreSubmission.update({ where: { id: existing.id }, data: { comment: input.comment ?? null, items: { create: input.items } } });
    }
    return tx.scoreSubmission.create({
      data: { submissionKey: input.submissionKey, eventId, roundId, performanceId: input.performanceId, group: input.group, assignmentId: input.assignmentId, status: "DRAFT", comment: input.comment ?? null, items: { create: input.items } },
    });
  });
}

/** Final submission: validates completeness, locks, audits. Idempotent if already locked with same key. */
export async function submitFinal(input: EvaluationInput) {
  return db.$transaction(async (tx) => {
    const perf = await lockPerformance(tx, input.performanceId);
    const allowed: string[] = ["ON_STAGE", "VOTING_OPEN", "GRACE_PERIOD", "VOTING_CLOSED"];
    if (!allowed.includes(perf.status)) throw invalidTransition("This band is no longer accepting evaluations.", { status: perf.status });
    const { eventId, roundId } = await performanceMeta(tx, input.performanceId);
    await assertNoConflict(tx, input.assignmentId, input.performanceId);
    await validateItems(tx, eventId, input.group, input.items, true);
    const existing = await tx.scoreSubmission.findUnique({ where: { performanceId_assignmentId: { performanceId: input.performanceId, assignmentId: input.assignmentId } } });
    if (existing && existing.status !== "DRAFT") {
      if (existing.submissionKey === input.submissionKey) return existing;
      throw new AppError("CONFLICT", "Evaluation already submitted and locked.");
    }
    const now = new Date();
    let sub;
    if (existing) {
      await tx.scoreItem.deleteMany({ where: { submissionId: existing.id } });
      sub = await tx.scoreSubmission.update({
        where: { id: existing.id },
        data: { submissionKey: input.submissionKey, status: "ACCEPTED", lockedAt: now, submittedAt: now, comment: input.comment ?? null, items: { create: input.items } },
      });
    } else {
      sub = await tx.scoreSubmission.create({
        data: { submissionKey: input.submissionKey, eventId, roundId, performanceId: input.performanceId, group: input.group, assignmentId: input.assignmentId, status: "ACCEPTED", lockedAt: now, comment: input.comment ?? null, items: { create: input.items } },
      });
    }
    await audit(tx, { action: input.group === "JUDGE" ? "JUDGE_SUBMITTED" : "STAFF_SUBMITTED", actorType: "EVALUATOR", actorId: input.assignmentId, eventId, performanceId: input.performanceId, entityType: "ScoreSubmission", entityId: sub.id, requestId: input.requestId });
    return sub;
  });
}

export async function unlockSubmission(actor: { userId: string; name: string }, submissionId: string, reason: string) {
  if (!reason.trim()) throw new AppError("VALIDATION", "A reason is required to unlock.");
  return db.$transaction(async (tx) => {
    const s = await tx.scoreSubmission.findUnique({ where: { id: submissionId }, include: { items: true } });
    if (!s || !s.assignmentId) throw notFound("Submission");
    await tx.submissionRevision.create({ data: { submissionId, revision: s.revision, itemsJson: s.items.map((i) => ({ criterionId: i.criterionId, value: i.value })), comment: s.comment, status: s.status, reason } });
    const updated = await tx.scoreSubmission.update({ where: { id: submissionId }, data: { status: "DRAFT", lockedAt: null, unlockedAt: new Date(), unlockedBy: actor.userId, unlockReason: reason, revision: { increment: 1 } } });
    await audit(tx, { action: "SUBMISSION_UNLOCKED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId: s.eventId, performanceId: s.performanceId, entityType: "ScoreSubmission", entityId: submissionId, payload: { reason } });
    return updated;
  });
}

export async function declareConflict(assignmentId: string, bandId: string, reason?: string) {
  return db.$transaction(async (tx) => {
    const a = await tx.evaluatorAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    const c = await tx.conflictOfInterest.upsert({ where: { assignmentId_bandId: { assignmentId, bandId } }, create: { assignmentId, bandId, reason }, update: { reason } });
    await audit(tx, { action: "CONFLICT_DECLARED", actorType: "EVALUATOR", actorId: assignmentId, eventId: a.eventId, entityType: "Band", entityId: bandId, payload: { reason: reason ?? null } });
    return c;
  });
}

// ───────────────────────── helpers ─────────────────────────

type TxLike = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function performanceMeta(tx: TxLike, performanceId: string) {
  const p = await tx.performance.findUnique({ where: { id: performanceId }, select: { roundId: true, round: { select: { eventId: true } } } });
  if (!p) throw notFound("Performance");
  return { eventId: p.round.eventId, roundId: p.roundId };
}

async function assertNoConflict(tx: TxLike, assignmentId: string, performanceId: string) {
  const p = await tx.performance.findUniqueOrThrow({ where: { id: performanceId }, select: { bandId: true } });
  const c = await tx.conflictOfInterest.findUnique({ where: { assignmentId_bandId: { assignmentId, bandId: p.bandId } } });
  if (c) throw new AppError("FORBIDDEN", "You declared a conflict of interest for this band.");
}

async function validateItems(tx: TxLike, eventId: string, group: GroupKind, items: { criterionId: string; value: number }[], complete: boolean) {
  const g = await tx.votingGroup.findUnique({ where: { eventId_kind: { eventId, kind: group } }, include: { scorecard: { include: { criteria: true } } } });
  const criteria = g?.scorecard?.criteria ?? [];
  const byId = new Map(criteria.map((c) => [c.id, c]));
  for (const i of items) {
    const c = byId.get(i.criterionId);
    if (!c) throw new AppError("VALIDATION", "Unknown criterion.", { criterionId: i.criterionId });
    if (!Number.isInteger(i.value) || i.value < c.scaleMin || i.value > c.scaleMax) throw new AppError("VALIDATION", `Score for ${c.key} out of range.`, { criterion: c.key });
  }
  if (complete) {
    const answered = new Set(items.map((i) => i.criterionId));
    const missing = criteria.filter((c) => !answered.has(c.id));
    if (missing.length) throw new AppError("VALIDATION", "All criteria must be rated.", { missing: missing.map((c) => c.key) });
  }
}
