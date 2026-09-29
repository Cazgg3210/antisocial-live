import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import { AppError, invalidTransition, notFound } from "@/lib/errors";
import { hashCanonical } from "@/lib/hash";
import { eventIdOfPerformance, lockPerformance, setSceneTx, type Actor } from "@/modules/events/service";
import {
  calculatePerformance,
  ENGINE_VERSION,
  qualify,
  rankResults,
  type EngineConfig,
  type EngineSubmission,
  type PerformanceResult,
  type RankingEntry,
} from "@/modules/scoring-engine";

async function loadRoundSubmissions(tx: Tx | typeof db, roundId: string): Promise<EngineSubmission[]> {
  const subs = await tx.scoreSubmission.findMany({ where: { roundId, status: { not: "DRAFT" } }, include: { items: true } });
  return subs.map((s) => ({
    id: s.id,
    performanceId: s.performanceId,
    group: s.group,
    actorId: s.voterSessionId ?? s.assignmentId ?? "",
    scorecardVariant: s.scorecardVariant,
    status: s.status,
    items: s.items.map((i) => ({ criterionId: i.criterionId, value: i.value })),
  }));
}

/**
 * CALCULATE: runs the engine against the frozen snapshot of this performance, stores an
 * immutable ResultSnapshot chained by hash to the previous snapshot of the event.
 */
export async function calculateResult(actor: Actor, performanceId: string) {
  return db.$transaction(async (tx) => {
    const perf = await lockPerformance(tx, performanceId);
    const allowed: string[] = ["VOTING_CLOSED", "CALCULATING", "RESULT_READY", "PARTIAL_REVEALED"];
    if (!allowed.includes(perf.status)) throw invalidTransition("Voting must be closed before calculating.", { status: perf.status });
    const full = await tx.performance.findUniqueOrThrow({ where: { id: performanceId }, include: { band: true, timer: true, snapshot: true, round: true } });
    if (!full.snapshot) throw invalidTransition("Performance has no configuration snapshot.");
    const eventId = full.round.eventId;
    const config = full.snapshot.payload as unknown as EngineConfig;
    const roundSubmissions = await loadRoundSubmissions(tx, full.roundId);

    await tx.performance.update({ where: { id: performanceId }, data: { status: "CALCULATING", version: { increment: 1 } } });
    const result = calculatePerformance({
      config,
      performance: { performanceId, bandId: full.bandId, bandName: full.band.name, overtimeSeconds: full.timer?.overtimeSeconds ?? 0 },
      roundSubmissions,
    });

    const prev = await tx.resultSnapshot.findFirst({ where: { eventId }, orderBy: { calculatedAt: "desc" }, select: { hash: true } });
    const calculatedAt = new Date();
    const body = { result, configurationSnapshotId: full.snapshot.id, engineVersion: ENGINE_VERSION, calculatedAt: calculatedAt.toISOString(), previousHash: prev?.hash ?? null };
    const hash = hashCanonical(body);
    const snapshot = await tx.resultSnapshot.create({
      data: {
        eventId,
        roundId: full.roundId,
        performanceId,
        configurationSnapshotId: full.snapshot.id,
        engineVersion: ENGINE_VERSION,
        payload: result as unknown as Prisma.InputJsonValue,
        finalScore: result.finalScore,
        hash,
        previousHash: prev?.hash ?? null,
        calculatedAt,
        calculatedBy: actor.userId,
      },
    });
    await tx.performance.update({ where: { id: performanceId }, data: { status: "RESULT_READY", currentResultId: snapshot.id, version: { increment: 1 } } });
    await audit(tx, { action: "RESULT_CALCULATED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId, performanceId, entityType: "ResultSnapshot", entityId: snapshot.id, requestId: actor.requestId, payload: { hash, finalScore: result.finalScore, policies: result.policiesApplied } });
    await setSceneTx(tx, eventId, "CALCULATING", { performanceId }, actor.userId);
    return snapshot;
  });
}

export async function approveResult(actor: Actor, performanceId: string) {
  return db.$transaction(async (tx) => {
    const p = await tx.performance.findUniqueOrThrow({ where: { id: performanceId }, include: { currentResult: true } });
    if (!p.currentResult) throw invalidTransition("No result to approve.");
    if (p.currentResult.calculatedBy === actor.userId) throw new AppError("FORBIDDEN", "Two-person control: the approver must differ from the calculator.");
    const eventId = await eventIdOfPerformance(tx, performanceId);
    const r = await tx.resultSnapshot.update({ where: { id: p.currentResult.id }, data: { approvedAt: new Date(), approvedBy: actor.userId } });
    await audit(tx, { action: "RESULT_APPROVED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId, performanceId, entityType: "ResultSnapshot", entityId: r.id });
    return r;
  });
}

/** Partial reveal after a band, filtered by the event's PARTIAL_REVEAL_POLICY. */
export async function revealPartial(actor: Actor, performanceId: string) {
  return db.$transaction(async (tx) => {
    const perf = await lockPerformance(tx, performanceId);
    if (perf.status !== "RESULT_READY" && perf.status !== "PARTIAL_REVEALED") throw invalidTransition("Result is not ready.", { status: perf.status });
    const eventId = await eventIdOfPerformance(tx, performanceId);
    const cfg = await tx.eventConfig.findUniqueOrThrow({ where: { eventId } });
    const p = await tx.performance.findUniqueOrThrow({ where: { id: performanceId }, include: { currentResult: true } });
    if (!p.currentResult) throw invalidTransition("No result.");
    if (cfg.requireResultApproval && !p.currentResult.approvedAt) throw invalidTransition("Result requires approval before reveal.");
    if (cfg.partialRevealPolicy === "NONE" || cfg.partialRevealPolicy === "FINAL_ONLY") throw invalidTransition("Partial reveal is disabled for this event.");
    await tx.resultSnapshot.update({ where: { id: p.currentResult.id }, data: { partialRevealedAt: new Date() } });
    await tx.performance.update({ where: { id: performanceId }, data: { status: "PARTIAL_REVEALED", version: { increment: 1 } } });
    await audit(tx, { action: "RESULT_PARTIAL_REVEALED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId, performanceId, payload: { policy: cfg.partialRevealPolicy } });
    await setSceneTx(tx, eventId, "PARTIAL_RESULT", { performanceId }, actor.userId);
  });
}

/** Public-safe projection of a result according to a reveal policy. */
export function projectPartial(result: PerformanceResult, policy: string) {
  const pick = (kinds: string[]) => result.groups.filter((g) => kinds.includes(g.kind)).map((g) => ({ kind: g.kind, score: g.score, count: g.acceptedCount }));
  switch (policy) {
    case "JUDGES_ONLY":
      return { groups: pick(["JUDGE"]), final: null };
    case "STAFF_ONLY":
      return { groups: pick(["STAFF"]), final: null };
    case "JUDGES_AND_STAFF":
      return { groups: pick(["JUDGE", "STAFF"]), final: null };
    case "ALL_GROUPS":
      return { groups: pick(["JUDGE", "STAFF", "PUBLIC"]), final: result.finalScore };
    default:
      return { groups: [], final: null };
  }
}

/**
 * FINAL REVEAL / finalize round: every non-cancelled performance must have a result; builds the
 * ranking, resolves ties, records qualification and feeds qualifiers into the next round.
 */
export async function finalizeRound(actor: Actor, roundId: string, manualOrder?: { performanceId: string; position: number }[]) {
  return db.$transaction(async (tx) => {
    const round = await tx.round.findUnique({ where: { id: roundId }, include: { performances: { where: { status: { not: "CANCELLED" } }, include: { currentResult: true, band: true } }, event: { include: { config: true } } } });
    if (!round) throw notFound("Round");
    const missing = round.performances.filter((p) => !p.currentResult);
    if (missing.length) throw invalidTransition("All bands need a calculated result first.", { missing: missing.map((p) => p.band.name) });
    const cfg = round.event.config!;
    if (cfg.requireResultApproval) {
      const unapproved = round.performances.filter((p) => !p.currentResult!.approvedAt);
      if (unapproved.length) throw invalidTransition("All results require approval.", { unapproved: unapproved.map((p) => p.band.name) });
    }
    const results = round.performances.map((p) => p.currentResult!.payload as unknown as PerformanceResult);
    let ranking = rankResults(results, (cfg.tieBreakers as unknown) as EngineConfig["tieBreakers"]);

    if (ranking.some((r) => r.unresolvedTie)) {
      if (!manualOrder) throw new AppError("CONFLICT", "Unresolved tie requires a manual committee decision.", { ties: ranking.filter((r) => r.unresolvedTie).map((r) => r.bandName) });
      ranking = applyManualOrder(ranking, manualOrder);
      await tx.tieBreakDecision.create({ data: { roundId, bandIds: ranking.filter((r) => r.tieBreakTrail.includes("MANUAL")).map((r) => r.bandId), method: "MANUAL", reason: "Committee decision", decidedBy: actor.userId } });
    }

    const statuses = qualify(ranking, round.qualifiersCount);
    const rankingHash = hashCanonical(ranking);
    await tx.ranking.create({ data: { roundId, payload: ranking as unknown as Prisma.InputJsonValue, hash: rankingHash, isFinal: true, createdBy: actor.userId } });

    for (const e of ranking) {
      const st = statuses.find((s) => s.performanceId === e.performanceId)!.status;
      await tx.qualification.upsert({
        where: { performanceId: e.performanceId },
        create: { roundId, performanceId: e.performanceId, bandId: e.bandId, position: e.position, finalScore: e.finalScore, status: st, tieBreakApplied: e.tieBreakTrail },
        update: { position: e.position, finalScore: e.finalScore, status: st, tieBreakApplied: e.tieBreakTrail },
      });
      const p = round.performances.find((x) => x.id === e.performanceId)!;
      await tx.resultSnapshot.update({ where: { id: p.currentResult!.id }, data: { publishedAt: new Date(), publishedBy: actor.userId } });
      await tx.performance.update({ where: { id: e.performanceId }, data: { status: "FINALIZED", finalizedAt: new Date(), version: { increment: 1 } } });
    }

    // Feed qualifiers into the next round (bracket).
    if (round.nextRoundId) {
      const qualified = ranking.filter((e) => statuses.find((s) => s.performanceId === e.performanceId)!.status === "QUALIFIED");
      const next = await tx.round.findUniqueOrThrow({ where: { id: round.nextRoundId }, include: { performances: true } });
      let slot = Math.max(0, ...next.performances.map((p) => p.slotOrder));
      for (const q of qualified) {
        if (next.performances.some((p) => p.bandId === q.bandId)) continue;
        const np = await tx.performance.create({ data: { roundId: next.id, bandId: q.bandId, slotOrder: ++slot } });
        await tx.qualification.update({ where: { performanceId: q.performanceId }, data: { advancedToPerformanceId: np.id } });
      }
    }

    await tx.round.update({ where: { id: roundId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    await audit(tx, { action: "RESULT_PUBLISHED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId: round.eventId, entityType: "Round", entityId: roundId, requestId: actor.requestId, payload: { rankingHash, qualifiers: round.qualifiersCount } });
    await setSceneTx(tx, round.eventId, "FINAL_COUNTDOWN", { roundId, revealedCount: 0 }, actor.userId);
    return { ranking, rankingHash };
  });
}

function applyManualOrder(ranking: RankingEntry[], manual: { performanceId: string; position: number }[]): RankingEntry[] {
  const pos = new Map(manual.map((m) => [m.performanceId, m.position]));
  const out = ranking.map((r) => (r.unresolvedTie && pos.has(r.performanceId) ? { ...r, position: pos.get(r.performanceId)!, unresolvedTie: false, tieBreakTrail: [...r.tieBreakTrail, "MANUAL"] } : r));
  out.sort((a, b) => a.position - b.position);
  let p = 0;
  return out.map((r, i) => {
    if (i === 0 || r.position !== out[i - 1].position) p = i + 1;
    return { ...r, position: p };
  });
}

export async function overrideQualification(actor: Actor, performanceId: string, status: "QUALIFIED" | "ELIMINATED", reason: string) {
  if (!reason.trim()) throw new AppError("VALIDATION", "A reason is required.");
  return db.$transaction(async (tx) => {
    const q = await tx.qualification.findUnique({ where: { performanceId } });
    if (!q) throw notFound("Qualification");
    const eventId = await eventIdOfPerformance(tx, performanceId);
    const updated = await tx.qualification.update({ where: { performanceId }, data: { status } });
    await audit(tx, { action: "QUALIFIER_CHANGED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId, performanceId, payload: { from: q.status, to: status, reason } });
    return updated;
  });
}

/** Re-runs the engine on a stored snapshot and checks the hash; used by the audit UI. */
export async function verifyResult(resultId: string) {
  const r = await db.resultSnapshot.findUnique({ where: { id: resultId }, include: { snapshot: true, performance: { include: { band: true, timer: true } } } });
  if (!r) throw notFound("Result");
  const recomputed = calculatePerformance({
    config: r.snapshot.payload as unknown as EngineConfig,
    performance: { performanceId: r.performanceId, bandId: r.performance.bandId, bandName: r.performance.band.name, overtimeSeconds: r.performance.timer?.overtimeSeconds ?? 0 },
    roundSubmissions: await loadRoundSubmissions(db, r.roundId),
  });
  const stored = r.payload as unknown as PerformanceResult;
  const body = { result: stored, configurationSnapshotId: r.configurationSnapshotId, engineVersion: r.engineVersion, calculatedAt: r.calculatedAt.toISOString(), previousHash: r.previousHash };
  return {
    hashMatches: hashCanonical(body) === r.hash,
    scoreMatches: recomputed.finalScore === stored.finalScore,
    storedFinal: stored.finalScore,
    recomputedFinal: recomputed.finalScore,
    note: recomputed.finalScore === stored.finalScore ? null : "Submissions changed after calculation (e.g. a review). Recalculate to refresh.",
  };
}
