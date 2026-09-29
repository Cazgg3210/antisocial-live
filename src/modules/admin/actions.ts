"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { requireRole, type AdminSession } from "@/lib/auth/admin-session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/hash";
import { hashPassword } from "@/lib/auth/password";
import { addPerformance, createEvent, reorderPerformances, setEventMode, transitionEvent } from "@/modules/events/service";
import { issueEvaluatorToken, revokeEvaluatorAccess, setEvaluatorPin } from "@/modules/identity/service";
import { DEFAULT_CRITERIA } from "@/modules/scoring-config/service";

export type ActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

const str = (fd: FormData, k: string) => (fd.get(k)?.toString() ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const opt = (v: string) => (v === "" ? null : v);

async function guard(fn: (s: AdminSession) => Promise<ActionResult | void>, role: Parameters<typeof requireRole>[0] = "EVENT_MANAGER", eventId?: string): Promise<ActionResult> {
  try {
    const s = await requireRole(role, eventId);
    return (await fn(s)) ?? { ok: true };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    if (e && typeof e === "object" && "message" in e) return { ok: false, error: String((e as Error).message) };
    return { ok: false, error: "Unexpected error" };
  }
}

// ───────────────────────── EVENTS ─────────────────────────

export async function createEventAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id: string | null = null;
  const r = await guard(async (s) => {
    const ev = await createEvent(
      { userId: s.userId, name: s.name },
      { seriesId: str(fd, "seriesId"), venueId: str(fd, "venueId"), name: str(fd, "name"), scheduledAt: new Date(str(fd, "scheduledAt")), mode: "REHEARSAL" },
    );
    id = ev.id;
  });
  if (r.ok && id) redirect(`/admin/events/${id}`);
  return r;
}

export async function updateEventAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "eventId");
  return guard(
    async (s) => {
      const data = { name: str(fd, "name"), scheduledAt: new Date(str(fd, "scheduledAt")), expectedAttendance: opt(str(fd, "expectedAttendance")) ? num(fd, "expectedAttendance") : null };
      await db.eventEdition.update({ where: { id: eventId }, data });
      const mode = str(fd, "mode");
      if (mode === "LIVE" || mode === "REHEARSAL") await setEventMode({ userId: s.userId, name: s.name }, eventId, mode);
      await audit(db, { action: "EVENT_UPDATED", actorType: "USER", actorId: s.userId, eventId, payload: data });
      revalidatePath(`/admin/events/${eventId}`);
      return { ok: true, message: "Saved" };
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function transitionEventAction(eventId: string, to: "CONFIGURING" | "READY" | "LIVE" | "CLOSING" | "COMPLETED" | "ARCHIVED"): Promise<ActionResult> {
  return guard(
    async (s) => {
      await transitionEvent({ userId: s.userId, name: s.name }, eventId, to);
      revalidatePath(`/admin/events/${eventId}`);
      return { ok: true, message: `Event is now ${to}` };
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function updateConfigAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "eventId");
  return guard(
    async (s) => {
      await assertUnlocked(eventId);
      const schema = z.object({
        graceSeconds: z.coerce.number().int().min(0).max(120),
        allowVoteEdit: z.boolean(),
        screenCodeRequired: z.boolean(),
        screenCodeRotationSec: z.coerce.number().int().min(20).max(600),
        turnstileEnabled: z.boolean(),
        publicScorecardVariant: z.enum(["FULL", "QUICK"]),
        voterNormalization: z.enum(["NONE", "Z_SCORE_PER_VOTER"]),
        multiBandVoterBoostBp: z.coerce.number().int().min(10000).max(30000),
        multiBandVoterMin: z.coerce.number().int().min(2).max(10),
        porraPatternFlag: z.boolean(),
        bayesianPriorVotes: z.coerce.number().int().min(0).max(100),
        judgeNormalization: z.enum(["NONE", "Z_SCORE_PER_JUDGE"]),
        decimalPrecision: z.coerce.number().int().min(0).max(6),
        roundingMode: z.enum(["HALF_UP", "HALF_EVEN"]),
        partialRevealPolicy: z.enum(["NONE", "JUDGES_ONLY", "STAFF_ONLY", "JUDGES_AND_STAFF", "ALL_GROUPS", "FINAL_ONLY"]),
        finalRevealOrder: z.enum(["ASCENDING", "DESCENDING", "ALPHABETICAL"]),
        finalRevealStyle: z.enum(["ONE_BY_ONE", "ALL_AT_ONCE"]),
        requireResultApproval: z.boolean(),
        showVoteCountPublicly: z.boolean(),
        timerPlannedSeconds: z.coerce.number().int().min(60).max(7200),
        timerReminderOffsets: z.string(),
        stageShowTimer: z.boolean(),
        overtimePolicy: z.enum(["NONE", "TIE_BREAKER", "PENALTY"]),
        overtimePenaltyBp: z.coerce.number().int().min(0).max(5000),
        tieBreakers: z.string(),
        bandReportEnabled: z.boolean(),
        bandReportLevel: z.enum(["NONE", "SUMMARY", "DETAILED"]),
        postVoteShowBandProfile: z.boolean(),
        postVoteShowOptIn: z.boolean(),
        postVoteShowReservation: z.boolean(),
        reservationUrl: z.string(),
        postVoteShowSponsor: z.boolean(),
      });
      const raw: Record<string, unknown> = {};
      for (const key of Object.keys(schema.shape)) {
        const def = schema.shape[key as keyof typeof schema.shape];
        raw[key] = def instanceof z.ZodBoolean ? bool(fd, key) : str(fd, key);
      }
      const v = schema.parse(raw);
      const offsets = v.timerReminderOffsets.split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)).map((m) => Math.round(m * 60));
      const tieBreakers = JSON.parse(v.tieBreakers) as unknown;
      if (!Array.isArray(tieBreakers)) throw new AppError("VALIDATION", "tieBreakers must be a JSON array");
      const data = { ...v, timerReminderOffsets: offsets, tieBreakers: tieBreakers as Prisma.InputJsonValue, reservationUrl: opt(v.reservationUrl) };
      await db.eventConfig.update({ where: { eventId }, data });
      await audit(db, { action: "POLICY_CHANGED", actorType: "USER", actorId: s.userId, eventId, payload: { ...v, tieBreakers } });
      revalidatePath(`/admin/events/${eventId}`);
      return { ok: true, message: "Policies saved" };
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function updateGroupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "eventId");
  return guard(
    async (s) => {
      await assertUnlocked(eventId);
      const groupId = str(fd, "groupId");
      const data = {
        weightBp: Math.round(num(fd, "weightPct") * 100),
        aggregation: str(fd, "aggregation") as "MEAN" | "MEDIAN" | "TRIMMED_MEAN",
        trimPercentBp: Math.round(num(fd, "trimPct") * 100),
        minSubmissions: num(fd, "minSubmissions"),
        minVotesPolicy: str(fd, "minVotesPolicy") as "BLOCK" | "REDISTRIBUTE" | "ZERO_WEIGHT",
        missingEvaluatorPolicy: str(fd, "missingEvaluatorPolicy") as "REDISTRIBUTE" | "REQUIRE_MIN" | "ZERO_WEIGHT",
        requiredEvaluatorCount: num(fd, "requiredEvaluatorCount"),
        scorecardId: opt(str(fd, "scorecardId")),
      };
      await db.votingGroup.update({ where: { id: groupId }, data });
      await audit(db, { action: "WEIGHT_CHANGED", actorType: "USER", actorId: s.userId, eventId, entityType: "VotingGroup", entityId: groupId, payload: data });
      revalidatePath(`/admin/events/${eventId}`);
      return { ok: true, message: "Group saved" };
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function updateCriterionAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "eventId");
  return guard(
    async (s) => {
      await assertUnlocked(eventId);
      const id = str(fd, "criterionId");
      const data = {
        nameEs: str(fd, "nameEs"),
        nameEn: str(fd, "nameEn"),
        descriptionEs: opt(str(fd, "descriptionEs")),
        descriptionEn: opt(str(fd, "descriptionEn")),
        weightBp: Math.round(num(fd, "weightPct") * 100),
        scaleMin: num(fd, "scaleMin"),
        scaleMax: num(fd, "scaleMax"),
        countsTowardScore: bool(fd, "countsTowardScore"),
        includedInQuick: bool(fd, "includedInQuick"),
        order: num(fd, "order"),
      };
      await db.criterion.update({ where: { id }, data });
      await audit(db, { action: "CRITERION_CHANGED", actorType: "USER", actorId: s.userId, eventId, entityType: "Criterion", entityId: id, payload: data });
      revalidatePath(`/admin/events/${eventId}`);
      return { ok: true, message: "Criterion saved" };
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function addCriterionAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "eventId");
  return guard(
    async (s) => {
      await assertUnlocked(eventId);
      const scorecardId = str(fd, "scorecardId");
      const count = await db.criterion.count({ where: { scorecardId } });
      const key = str(fd, "key") || `c${count + 1}`;
      const c = await db.criterion.create({ data: { scorecardId, key, nameEs: str(fd, "nameEs") || key, nameEn: str(fd, "nameEn") || key, order: count + 1, weightBp: 0 } });
      await audit(db, { action: "CRITERION_CHANGED", actorType: "USER", actorId: s.userId, eventId, entityType: "Criterion", entityId: c.id, payload: { created: true } });
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function deleteCriterionAction(eventId: string, criterionId: string): Promise<ActionResult> {
  return guard(
    async (s) => {
      await assertUnlocked(eventId);
      const used = await db.scoreItem.count({ where: { criterionId } });
      if (used) throw new AppError("CONFLICT", "Criterion already has scores; disable it instead (countsTowardScore=false).");
      await db.criterion.delete({ where: { id: criterionId } });
      await audit(db, { action: "CRITERION_CHANGED", actorType: "USER", actorId: s.userId, eventId, entityType: "Criterion", entityId: criterionId, payload: { deleted: true } });
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function createScorecardAction(eventId: string, name: string): Promise<ActionResult> {
  return guard(
    async () => {
      await assertUnlocked(eventId);
      await db.scorecardTemplate.create({ data: { eventId, name: name || "Scorecard", criteria: { create: DEFAULT_CRITERIA.map((c, i) => ({ ...c, order: i + 1 })) } } });
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

// ───────────────────────── ROUNDS & LINEUP ─────────────────────────

export async function updateRoundAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "eventId");
  return guard(
    async (s) => {
      const roundId = str(fd, "roundId");
      const data = { name: str(fd, "name"), qualifiersCount: num(fd, "qualifiersCount"), nextRoundId: opt(str(fd, "nextRoundId")) };
      await db.round.update({ where: { id: roundId }, data });
      await audit(db, { action: "ROUND_UPDATED", actorType: "USER", actorId: s.userId, eventId, entityType: "Round", entityId: roundId, payload: data });
      revalidatePath(`/admin/events/${eventId}`);
      return { ok: true, message: "Round saved" };
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function addRoundAction(eventId: string): Promise<ActionResult> {
  return guard(
    async () => {
      const count = await db.round.count({ where: { eventId } });
      await db.round.create({ data: { eventId, name: `Ronda ${count + 1}`, order: count + 1 } });
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function addPerformanceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "eventId");
  return guard(
    async (s) => {
      await addPerformance({ userId: s.userId, name: s.name }, str(fd, "roundId"), str(fd, "bandId"));
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function removePerformanceAction(eventId: string, performanceId: string): Promise<ActionResult> {
  return guard(
    async (s) => {
      const p = await db.performance.findUniqueOrThrow({ where: { id: performanceId } });
      if (p.status !== "SCHEDULED") throw new AppError("CONFLICT", "Only SCHEDULED bands can be removed; cancel it from the Control Room instead.");
      await db.performance.delete({ where: { id: performanceId } });
      await audit(db, { action: "PERFORMANCE_REMOVED", actorType: "USER", actorId: s.userId, eventId, performanceId });
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function movePerformanceAction(eventId: string, roundId: string, performanceId: string, dir: -1 | 1): Promise<ActionResult> {
  return guard(
    async (s) => {
      const list = await db.performance.findMany({ where: { roundId }, orderBy: { slotOrder: "asc" } });
      const i = list.findIndex((p) => p.id === performanceId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      const ids = list.map((p) => p.id);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await reorderPerformances({ userId: s.userId, name: s.name }, roundId, ids);
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

// ───────────────────────── EVALUATORS ─────────────────────────

export async function assignEvaluatorAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "eventId");
  return guard(
    async (s) => {
      let personId = str(fd, "personId");
      if (!personId) {
        const org = await db.eventEdition.findUniqueOrThrow({ where: { id: eventId }, select: { series: { select: { organizationId: true } } } });
        const p = await db.person.create({ data: { organizationId: org.series.organizationId, name: str(fd, "newName"), email: opt(str(fd, "newEmail")), phone: opt(str(fd, "newPhone")) } });
        personId = p.id;
      }
      const group = str(fd, "group") as "JUDGE" | "STAFF";
      const a = await db.evaluatorAssignment.upsert({
        where: { personId_eventId_group: { personId, eventId, group } },
        create: { personId, eventId, group, individualWeightBp: Math.round((num(fd, "weight") || 1) * 10000) },
        update: { status: "ACTIVE", individualWeightBp: Math.round((num(fd, "weight") || 1) * 10000) },
      });
      const pin = str(fd, "pin");
      if (pin) await setEvaluatorPin(a.id, pin);
      await audit(db, { action: "ROLE_ASSIGNED", actorType: "USER", actorId: s.userId, eventId, entityType: "EvaluatorAssignment", entityId: a.id, payload: { group, personId } });
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function issueTokenAction(eventId: string, assignmentId: string): Promise<ActionResult> {
  return guard(
    async (s) => {
      const t = await issueEvaluatorToken({ userId: s.userId, name: s.name }, assignmentId);
      revalidatePath(`/admin/events/${eventId}`);
      return { ok: true, message: `Link for ${t.personName}`, data: { url: t.url } };
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function revokeEvaluatorAction(eventId: string, assignmentId: string): Promise<ActionResult> {
  return guard(
    async (s) => {
      await revokeEvaluatorAccess({ userId: s.userId, name: s.name }, assignmentId, "admin");
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

export async function updateEvaluatorAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "eventId");
  return guard(
    async (s) => {
      const id = str(fd, "assignmentId");
      await db.evaluatorAssignment.update({ where: { id }, data: { individualWeightBp: Math.round((num(fd, "weight") || 1) * 10000) } });
      const pin = str(fd, "pin");
      if (pin === "clear") await setEvaluatorPin(id, null);
      else if (pin) await setEvaluatorPin(id, pin);
      await audit(db, { action: "ROLE_UPDATED", actorType: "USER", actorId: s.userId, eventId, entityType: "EvaluatorAssignment", entityId: id, payload: { weight: num(fd, "weight") } });
      revalidatePath(`/admin/events/${eventId}`);
    },
    "EVENT_MANAGER",
    eventId,
  );
}

// ───────────────────────── BANDS / PEOPLE ─────────────────────────

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function saveBandAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async (s) => {
    const id = str(fd, "id");
    const data = {
      name: str(fd, "name"),
      genre: opt(str(fd, "genre")),
      city: opt(str(fd, "city")),
      isTribute: bool(fd, "isTribute"),
      description: opt(str(fd, "description")),
      imageUrl: opt(str(fd, "imageUrl")),
      instagram: opt(str(fd, "instagram")),
      tiktok: opt(str(fd, "tiktok")),
      spotify: opt(str(fd, "spotify")),
      youtube: opt(str(fd, "youtube")),
      contactEmail: opt(str(fd, "contactEmail")),
      contactPhone: opt(str(fd, "contactPhone")),
    };
    if (!data.name) throw new AppError("VALIDATION", "Name is required");
    if (id) await db.band.update({ where: { id }, data });
    else {
      let slug = slugify(data.name);
      for (let i = 2; await db.band.findUnique({ where: { organizationId_slug: { organizationId: s.organizationId, slug } } }); i++) slug = `${slugify(data.name)}-${i}`;
      await db.band.create({ data: { ...data, organizationId: s.organizationId, slug } });
    }
    revalidatePath("/admin/bands");
    return { ok: true, message: "Band saved" };
  });
}

export async function savePersonAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async (s) => {
    const id = str(fd, "id");
    const data = { name: str(fd, "name"), email: opt(str(fd, "email")), phone: opt(str(fd, "phone")), notes: opt(str(fd, "notes")) };
    if (!data.name) throw new AppError("VALIDATION", "Name is required");
    if (id) await db.person.update({ where: { id }, data });
    else await db.person.create({ data: { ...data, organizationId: s.organizationId } });
    revalidatePath("/admin/people");
    return { ok: true, message: "Saved" };
  });
}

export async function createUserAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async (s) => {
    const role = str(fd, "role") as "ORGANIZATION_ADMIN" | "EVENT_MANAGER" | "STAGE_OPERATOR" | "STAFF_COORDINATOR";
    const password = str(fd, "password");
    if (password.length < 10) throw new AppError("VALIDATION", "Password must have at least 10 characters");
    const u = await db.user.create({ data: { organizationId: s.organizationId, email: str(fd, "email").toLowerCase(), name: str(fd, "name"), passwordHash: await hashPassword(password), roles: { create: [{ role }] } } });
    await audit(db, { action: "ROLE_ASSIGNED", actorType: "USER", actorId: s.userId, entityType: "User", entityId: u.id, payload: { role } });
    revalidatePath("/admin/people");
    return { ok: true, message: "User created" };
  }, "ORGANIZATION_ADMIN");
}

// ───────────────────────── SPONSORS ─────────────────────────

export async function saveSponsorAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async (s) => {
    const id = str(fd, "id");
    const data = { name: str(fd, "name"), logoUrl: opt(str(fd, "logoUrl")), websiteUrl: opt(str(fd, "websiteUrl")), contactName: opt(str(fd, "contactName")), contactEmail: opt(str(fd, "contactEmail")), notes: opt(str(fd, "notes")), isActive: bool(fd, "isActive") };
    if (id) await db.sponsor.update({ where: { id }, data });
    else await db.sponsor.create({ data: { ...data, organizationId: s.organizationId, slug: `${slugify(data.name)}-${randomToken(3).toLowerCase()}` } });
    revalidatePath("/admin/sponsors");
    return { ok: true, message: "Sponsor saved" };
  });
}

export async function saveCampaignAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = str(fd, "id");
    const data = { sponsorId: str(fd, "sponsorId"), name: str(fd, "name"), priority: num(fd, "priority"), isActive: bool(fd, "isActive"), startsAt: opt(str(fd, "startsAt")) ? new Date(str(fd, "startsAt")) : null, endsAt: opt(str(fd, "endsAt")) ? new Date(str(fd, "endsAt")) : null };
    if (id) await db.campaign.update({ where: { id }, data });
    else await db.campaign.create({ data });
    revalidatePath("/admin/sponsors");
    return { ok: true, message: "Campaign saved" };
  });
}

export async function savePlacementAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async (s) => {
    const id = str(fd, "id");
    const data = {
      campaignId: str(fd, "campaignId"),
      eventId: opt(str(fd, "eventId")),
      kind: str(fd, "kind") as "STAGE_TRANSITION" | "STAGE_BREAK" | "STAGE_PRESENTED_BY" | "VOTE_LANDING_HEADER" | "THANK_YOU_CTA" | "BAND_REPORT_FOOTER" | "RECAP_EMAIL",
      imageUrl: opt(str(fd, "imageUrl")),
      headlineEs: opt(str(fd, "headlineEs")),
      headlineEn: opt(str(fd, "headlineEn")),
      ctaLabelEs: opt(str(fd, "ctaLabelEs")),
      ctaLabelEn: opt(str(fd, "ctaLabelEn")),
      ctaUrl: opt(str(fd, "ctaUrl")),
      isActive: bool(fd, "isActive"),
    };
    if (id) await db.sponsorPlacement.update({ where: { id }, data });
    else await db.sponsorPlacement.create({ data: { ...data, code: randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || randomToken(4) } });
    await audit(db, { action: "SPONSOR_PLACEMENT_CHANGED", actorType: "USER", actorId: s.userId, eventId: data.eventId, payload: { kind: data.kind, campaignId: data.campaignId } });
    revalidatePath("/admin/sponsors");
    if (data.eventId) revalidatePath(`/admin/events/${data.eventId}`);
    return { ok: true, message: "Placement saved" };
  });
}

// ───────────────────────── APPLICATIONS ─────────────────────────

export async function saveCallAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = str(fd, "id");
    const data = {
      seriesId: str(fd, "seriesId"),
      titleEs: str(fd, "titleEs"),
      titleEn: str(fd, "titleEn") || str(fd, "titleEs"),
      descriptionEs: opt(str(fd, "descriptionEs")),
      descriptionEn: opt(str(fd, "descriptionEn")),
      status: str(fd, "status") as "DRAFT" | "OPEN" | "CLOSED",
      opensAt: opt(str(fd, "opensAt")) ? new Date(str(fd, "opensAt")) : null,
      closesAt: opt(str(fd, "closesAt")) ? new Date(str(fd, "closesAt")) : null,
      rulesVersion: str(fd, "rulesVersion") || "v1",
    };
    if (id) await db.applicationCall.update({ where: { id }, data });
    else await db.applicationCall.create({ data: { ...data, slug: `${slugify(data.titleEs)}-${randomToken(2).toLowerCase()}` } });
    revalidatePath("/admin/applications");
    return { ok: true, message: "Call saved" };
  });
}

export async function reviewApplicationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async (s) => {
    const id = str(fd, "id");
    const status = str(fd, "status") as "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "ACCEPTED" | "REJECTED" | "CONFIRMED";
    const app = await db.bandApplication.findUniqueOrThrow({ where: { id } });
    await db.applicationReview.upsert({
      where: { applicationId_reviewerId: { applicationId: id, reviewerId: s.userId } },
      create: { applicationId: id, reviewerId: s.userId, score: opt(str(fd, "score")) ? num(fd, "score") : null, notes: opt(str(fd, "notes")) },
      update: { score: opt(str(fd, "score")) ? num(fd, "score") : null, notes: opt(str(fd, "notes")) },
    });
    let acceptedBandId = app.acceptedBandId;
    if ((status === "ACCEPTED" || status === "CONFIRMED") && !acceptedBandId) {
      let slug = slugify(app.bandName);
      for (let i = 2; await db.band.findUnique({ where: { organizationId_slug: { organizationId: s.organizationId, slug } } }); i++) slug = `${slugify(app.bandName)}-${i}`;
      const band = await db.band.create({
        data: { organizationId: s.organizationId, name: app.bandName, slug, genre: app.genre, city: app.city, isTribute: app.isTribute, description: app.description, instagram: app.instagram, tiktok: app.tiktok, spotify: app.spotify, youtube: app.youtube, contactEmail: app.email, contactPhone: app.phone, membersJson: app.membersJson ?? undefined },
      });
      acceptedBandId = band.id;
    }
    await db.bandApplication.update({ where: { id }, data: { status, acceptedBandId } });
    await audit(db, { action: "APPLICATION_REVIEWED", actorType: "USER", actorId: s.userId, entityType: "BandApplication", entityId: id, payload: { status } });
    revalidatePath("/admin/applications");
    return { ok: true, message: `Application ${status}` };
  });
}

// ───────────────────────── AUDIENCE / PRIVACY ─────────────────────────

export async function processDataRequestAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async (s) => {
    const id = str(fd, "id");
    const status = str(fd, "status") as "IN_PROGRESS" | "COMPLETED" | "REJECTED";
    const req = await db.dataRequest.findUniqueOrThrow({ where: { id } });
    if (status === "COMPLETED" && req.kind === "CANCELLATION") {
      // Erase contact data; consents stay as evidence with the contact reference anonymized.
      const contacts = await db.audienceContact.findMany({ where: { organizationId: s.organizationId, email: req.email.toLowerCase() } });
      for (const c of contacts) {
        await db.consent.updateMany({ where: { contactId: c.id }, data: { revokedAt: new Date() } });
        await db.audienceContact.update({ where: { id: c.id }, data: { email: null, phone: null, name: null, status: "DELETED" } });
      }
    }
    await db.dataRequest.update({ where: { id }, data: { status, processedBy: s.userId, processedAt: new Date(), notes: opt(str(fd, "notes")) } });
    await audit(db, { action: "DATA_REQUEST_PROCESSED", actorType: "USER", actorId: s.userId, entityType: "DataRequest", entityId: id, payload: { status, kind: req.kind } });
    revalidatePath("/admin/audience");
    return { ok: true, message: "Request updated" };
  }, "ORGANIZATION_ADMIN");
}

export async function createDataRequestAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async (s) => {
    await db.dataRequest.create({ data: { organizationId: s.organizationId, kind: str(fd, "kind") as "ACCESS" | "RECTIFICATION" | "CANCELLATION" | "OPPOSITION", email: str(fd, "email").toLowerCase(), details: opt(str(fd, "details")) } });
    revalidatePath("/admin/audience");
    return { ok: true, message: "Request registered" };
  });
}

export async function unsubscribeContactAction(contactId: string): Promise<ActionResult> {
  return guard(async (s) => {
    await db.audienceContact.update({ where: { id: contactId }, data: { status: "UNSUBSCRIBED" } });
    await db.consent.updateMany({ where: { contactId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(db, { action: "CONSENT_REVOKED", actorType: "USER", actorId: s.userId, entityType: "AudienceContact", entityId: contactId });
    revalidatePath("/admin/audience");
  });
}

// ───────────────────────── helpers ─────────────────────────

/** Configuration is frozen once voting has opened on any performance of the event. */
async function assertUnlocked(eventId: string) {
  const opened = await db.performance.count({ where: { round: { eventId }, status: { notIn: ["SCHEDULED", "CANCELLED"] } } });
  if (opened > 0) throw new AppError("FROZEN", "Configuration is locked: voting already opened for this event. Changes require a new event or an explicit unlock with audit.");
}

export async function slugExists(slug: string): Promise<boolean> {
  return !!(await db.eventEdition.findUnique({ where: { slug } }));
}

export const _hash = sha256;
