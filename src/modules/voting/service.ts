import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, invalidTransition, notFound } from "@/lib/errors";
import { hashIp } from "@/lib/request";
import { isValidScreenCode } from "@/lib/screen-code";
import { lockPerformance } from "@/modules/events/service";

export interface VoteContext {
  event: { id: string; slug: string; name: string; mode: string; status: string };
  config: {
    screenCodeRequired: boolean;
    screenCodeRotationSec: number;
    allowVoteEdit: boolean;
    variant: "FULL" | "QUICK";
    showVoteCount: boolean;
    turnstileEnabled: boolean;
    postVote: { bandProfile: boolean; optIn: boolean; reservation: boolean; reservationUrl: string | null; sponsor: boolean };
  };
  performance: null | {
    id: string;
    status: string;
    band: { id: string; name: string; slug: string; imageUrl: string | null; genre: string | null; instagram: string | null; spotify: string | null; youtube: string | null; tiktok: string | null };
    graceUntil: string | null;
    votesReceived: number;
  };
  criteria: { id: string; key: string; nameEs: string; nameEn: string; descriptionEs: string | null; descriptionEn: string | null; scaleMin: number; scaleMax: number }[];
  existing: null | { submissionId: string; items: { criterionId: string; value: number }[]; comment: string | null; status: string };
  sponsor: null | { placementId: string; code: string; imageUrl: string | null; headlineEs: string | null; headlineEn: string | null; ctaLabelEs: string | null; ctaLabelEn: string | null; ctaUrl: string | null; sponsorName: string };
}

/** Resolves what the ONE EVENT QR should show right now for this voter. */
export async function getVoteContext(eventSlug: string, voterSessionId: string | null): Promise<VoteContext> {
  const event = await db.eventEdition.findUnique({
    where: { slug: eventSlug },
    include: {
      config: true,
      groups: { where: { kind: "PUBLIC" }, include: { scorecard: { include: { criteria: { orderBy: { order: "asc" } } } } } },
      placements: { where: { kind: "VOTE_LANDING_HEADER", isActive: true }, include: { campaign: { include: { sponsor: true } } }, take: 1 },
    },
  });
  if (!event || !event.config) throw notFound("Event");
  const cfg = event.config;
  const active = await db.performance.findFirst({
    where: { round: { eventId: event.id }, status: { in: ["ON_STAGE", "VOTING_OPEN", "GRACE_PERIOD", "VOTING_CLOSED", "CALCULATING", "RESULT_READY", "PARTIAL_REVEALED"] } },
    orderBy: [{ onStageAt: "desc" }],
    include: { band: true, _count: { select: { submissions: { where: { group: "PUBLIC", status: { in: ["ACCEPTED", "FLAGGED_FOR_REVIEW"] } } } } } },
  });
  const publicGroup = event.groups[0];
  const allCriteria = publicGroup?.scorecard?.criteria ?? [];
  const criteria = cfg.publicScorecardVariant === "QUICK" ? allCriteria.filter((c) => c.includedInQuick || c.key === "global") : allCriteria;

  let existing: VoteContext["existing"] = null;
  if (active && voterSessionId) {
    const sub = await db.scoreSubmission.findUnique({
      where: { performanceId_voterSessionId: { performanceId: active.id, voterSessionId } },
      include: { items: true },
    });
    if (sub) existing = { submissionId: sub.submissionKey, items: sub.items.map((i) => ({ criterionId: i.criterionId, value: i.value })), comment: sub.comment, status: sub.status };
  }
  const pl = event.placements[0];
  return {
    event: { id: event.id, slug: event.slug, name: event.name, mode: event.mode, status: event.status },
    config: {
      screenCodeRequired: cfg.screenCodeRequired,
      screenCodeRotationSec: cfg.screenCodeRotationSec,
      allowVoteEdit: cfg.allowVoteEdit,
      variant: cfg.publicScorecardVariant,
      showVoteCount: cfg.showVoteCountPublicly,
      turnstileEnabled: cfg.turnstileEnabled,
      postVote: {
        bandProfile: cfg.postVoteShowBandProfile,
        optIn: cfg.postVoteShowOptIn,
        reservation: cfg.postVoteShowReservation,
        reservationUrl: cfg.reservationUrl,
        sponsor: cfg.postVoteShowSponsor,
      },
    },
    performance: active
      ? {
          id: active.id,
          status: active.status,
          band: {
            id: active.band.id,
            name: active.band.name,
            slug: active.band.slug,
            imageUrl: active.band.imageUrl,
            genre: active.band.genre,
            instagram: active.band.instagram,
            spotify: active.band.spotify,
            youtube: active.band.youtube,
            tiktok: active.band.tiktok,
          },
          graceUntil: active.graceUntil?.toISOString() ?? null,
          votesReceived: active._count.submissions,
        }
      : null,
    criteria: criteria.map((c) => ({ id: c.id, key: c.key, nameEs: c.nameEs, nameEn: c.nameEn, descriptionEs: c.descriptionEs, descriptionEn: c.descriptionEn, scaleMin: c.scaleMin, scaleMax: c.scaleMax })),
    existing,
    sponsor: pl
      ? { placementId: pl.id, code: pl.code, imageUrl: pl.imageUrl ?? pl.campaign.sponsor.logoUrl, headlineEs: pl.headlineEs, headlineEn: pl.headlineEn, ctaLabelEs: pl.ctaLabelEs, ctaLabelEn: pl.ctaLabelEn, ctaUrl: pl.ctaUrl, sponsorName: pl.campaign.sponsor.name }
      : null,
  };
}

export interface SubmitVoteInput {
  submissionKey: string;
  performanceId: string;
  voterSessionId: string;
  items: { criterionId: string; value: number }[];
  comment?: string | null;
  screenCode?: string | null;
  clientDurationMs?: number | null;
  locale: string;
  ip: string | null;
  refBandId?: string | null;
  requestId?: string;
}

export interface SubmitVoteResult {
  submissionId: string;
  status: string;
  confirmation: string;
  duplicate: boolean;
  acceptedInGrace: boolean;
}

/**
 * Idempotent public vote submission. Locks the performance row so acceptance is decided against
 * the authoritative server-side status; validates values against the frozen scorecard; computes
 * risk signals (never deletes; flags for review).
 */
export async function submitPublicVote(input: SubmitVoteInput): Promise<SubmitVoteResult> {
  return db.$transaction(async (tx) => {
    // Idempotency: same key → same answer.
    const dup = await tx.scoreSubmission.findUnique({ where: { submissionKey: input.submissionKey } });
    if (dup) {
      return { submissionId: dup.submissionKey, status: dup.status, confirmation: confirmationCode(dup.id), duplicate: true, acceptedInGrace: dup.acceptedInGrace };
    }

    const perf = await lockPerformance(tx, input.performanceId);
    const inGrace = perf.status === "GRACE_PERIOD";
    if (perf.status !== "VOTING_OPEN" && !inGrace) throw invalidTransition("Voting is closed for this band.", { status: perf.status });
    if (inGrace && perf.graceUntil && perf.graceUntil.getTime() < Date.now()) throw invalidTransition("Voting is closed for this band.", { status: "VOTING_CLOSED" });

    const round = await tx.round.findUniqueOrThrow({ where: { id: perf.roundId }, select: { eventId: true } });
    const eventId = round.eventId;
    const [cfg, group, salt] = await Promise.all([
      tx.eventConfig.findUniqueOrThrow({ where: { eventId } }),
      tx.votingGroup.findUniqueOrThrow({ where: { eventId_kind: { eventId, kind: "PUBLIC" } }, include: { scorecard: { include: { criteria: true } } } }),
      tx.eventSecuritySalt.findUnique({ where: { eventId } }),
    ]);

    if (cfg.screenCodeRequired) {
      if (!input.screenCode || !isValidScreenCode(eventId, cfg.screenCodeRotationSec, input.screenCode)) {
        throw new AppError("VALIDATION", "Screen code is invalid.", { field: "screenCode" });
      }
    }

    const criteria = group.scorecard?.criteria ?? [];
    const variant = cfg.publicScorecardVariant;
    const required = variant === "QUICK" ? criteria.filter((c) => c.includedInQuick || c.key === "global") : criteria;
    const byId = new Map(criteria.map((c) => [c.id, c]));
    for (const item of input.items) {
      const c = byId.get(item.criterionId);
      if (!c) throw new AppError("VALIDATION", "Unknown criterion.", { criterionId: item.criterionId });
      if (!Number.isInteger(item.value) || item.value < c.scaleMin || item.value > c.scaleMax) {
        throw new AppError("VALIDATION", `Score for ${c.key} must be an integer between ${c.scaleMin} and ${c.scaleMax}.`, { criterion: c.key });
      }
    }
    const answered = new Set(input.items.map((i) => i.criterionId));
    const missing = required.filter((c) => !answered.has(c.id));
    if (missing.length) throw new AppError("VALIDATION", "All criteria must be rated.", { missing: missing.map((c) => c.key) });

    // Duplicate per performance: honour allowVoteEdit.
    const existing = await tx.scoreSubmission.findUnique({ where: { performanceId_voterSessionId: { performanceId: input.performanceId, voterSessionId: input.voterSessionId } }, include: { items: true } });
    if (existing && !cfg.allowVoteEdit) {
      throw new AppError("CONFLICT", "You already voted for this band.", { submissionId: existing.submissionKey });
    }

    // Per-event voter state (ip hash with the event salt; fan attribution).
    const ipHash = hashIp(input.ip, salt?.salt ?? null);
    await tx.voterEventState.upsert({
      where: { voterSessionId_eventId: { voterSessionId: input.voterSessionId, eventId } },
      create: { voterSessionId: input.voterSessionId, eventId, ipHash, refBandId: input.refBandId ?? null },
      update: { ipHash: ipHash ?? undefined },
    });

    // Risk signals
    const signals: { kind: string; weight: number; detail?: unknown }[] = [];
    if (input.clientDurationMs !== null && input.clientDurationMs !== undefined && input.clientDurationMs < 4000) {
      signals.push({ kind: "TOO_FAST", weight: 2500, detail: { ms: input.clientDurationMs } });
    }
    if (ipHash) {
      const sameIp = await tx.voterEventState.count({ where: { eventId, ipHash } });
      // Shared venue Wi-Fi / CGNAT: only a weak signal, and only when extreme.
      if (sameIp > 150) signals.push({ kind: "IP_CLUSTER", weight: 1000, detail: { count: sameIp } });
    }
    if (cfg.porraPatternFlag) {
      const porra = await detectPorraPattern(tx, input.voterSessionId, perf.roundId, input.performanceId, input.items, criteria);
      if (porra) signals.push({ kind: "PORRA_PATTERN", weight: 6000, detail: porra });
    }
    const riskScoreBp = Math.min(10000, signals.reduce((s, x) => s + x.weight, 0));
    const status = riskScoreBp >= 5000 ? "FLAGGED_FOR_REVIEW" : "ACCEPTED";

    const data = {
      status,
      riskScoreBp,
      riskSignals: signals as unknown as Prisma.InputJsonValue,
      comment: input.comment?.trim().slice(0, 500) || null,
      clientDurationMs: input.clientDurationMs ?? null,
      acceptedInGrace: inGrace,
      locale: input.locale,
      scorecardVariant: variant,
    } as const;

    let submission;
    if (existing) {
      await tx.submissionRevision.create({
        data: { submissionId: existing.id, revision: existing.revision, itemsJson: existing.items.map((i) => ({ criterionId: i.criterionId, value: i.value })), comment: existing.comment, status: existing.status, reason: "VOTER_EDIT" },
      });
      await tx.scoreItem.deleteMany({ where: { submissionId: existing.id } });
      submission = await tx.scoreSubmission.update({
        where: { id: existing.id },
        data: { ...data, submissionKey: input.submissionKey, submittedAt: new Date(), revision: { increment: 1 }, items: { create: input.items } },
      });
    } else {
      submission = await tx.scoreSubmission.create({
        data: {
          submissionKey: input.submissionKey,
          eventId,
          roundId: perf.roundId,
          performanceId: input.performanceId,
          group: "PUBLIC",
          voterSessionId: input.voterSessionId,
          ...data,
          items: { create: input.items },
        },
      });
    }
    await audit(tx, {
      action: existing ? "SUBMISSION_EDITED" : status === "ACCEPTED" ? "SUBMISSION_ACCEPTED" : "SUBMISSION_FLAGGED",
      actorType: "VOTER",
      actorId: input.voterSessionId,
      eventId,
      performanceId: input.performanceId,
      entityType: "ScoreSubmission",
      entityId: submission.id,
      ipHash,
      requestId: input.requestId,
      payload: { riskScoreBp, signals: signals.map((s) => s.kind), inGrace },
    });
    return { submissionId: submission.submissionKey, status, confirmation: confirmationCode(submission.id), duplicate: false, acceptedInGrace: inGrace };
  });
}

/** "10 to one band, minimum to the others" across ≥3 bands of the round. */
async function detectPorraPattern(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  voterSessionId: string,
  roundId: string,
  performanceId: string,
  items: { criterionId: string; value: number }[],
  criteria: { id: string; scaleMin: number; scaleMax: number }[],
) {
  const others = await tx.scoreSubmission.findMany({
    where: { roundId, voterSessionId, performanceId: { not: performanceId } },
    include: { items: true },
  });
  if (others.length < 2) return null;
  const byId = new Map(criteria.map((c) => [c.id, c]));
  const isMax = (list: { criterionId: string; value: number }[]) => list.every((i) => i.value === byId.get(i.criterionId)?.scaleMax);
  const isMin = (list: { criterionId: string; value: number }[]) => list.every((i) => i.value === byId.get(i.criterionId)?.scaleMin);
  const all = [{ performanceId, items }, ...others.map((o) => ({ performanceId: o.performanceId, items: o.items }))];
  const maxed = all.filter((a) => isMax(a.items));
  const minned = all.filter((a) => isMin(a.items));
  if (maxed.length === 1 && minned.length === all.length - 1) {
    return { favored: maxed[0].performanceId, bands: all.length };
  }
  return null;
}

export function confirmationCode(submissionDbId: string): string {
  return submissionDbId.slice(-6).toUpperCase();
}

export async function reviewSubmission(actor: { userId: string; name: string }, submissionId: string, decision: "ACCEPTED" | "REJECTED", reason: string) {
  return db.$transaction(async (tx) => {
    const s = await tx.scoreSubmission.findUnique({ where: { id: submissionId } });
    if (!s) throw notFound("Submission");
    const updated = await tx.scoreSubmission.update({ where: { id: submissionId }, data: { status: decision, reviewedAt: new Date(), reviewedBy: actor.userId, reviewReason: reason } });
    await audit(tx, { action: "SUBMISSION_REVIEWED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId: s.eventId, performanceId: s.performanceId, entityType: "ScoreSubmission", entityId: submissionId, payload: { from: s.status, to: decision, reason } });
    return updated;
  });
}
