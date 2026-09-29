/**
 * Integration tests against a real PostgreSQL (DATABASE_URL). They create their own event so they
 * are independent from the seed, and exercise the transactional guarantees the unit tests cannot.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pgPool } from "@/lib/db";
import { createEvent, addPerformance, transitionEvent, startBand, openVoting, closeVoting, reopenVoting, settleGracePeriods, takeOperatorLock } from "@/modules/events/service";
import { submitPublicVote } from "@/modules/voting/service";
import { saveDraft, submitFinal } from "@/modules/evaluation/service";
import { calculateResult, finalizeRound, verifyResult } from "@/modules/results/service";
import { screenCode } from "@/lib/screen-code";
import { randomUUID } from "node:crypto";

const actor = { userId: "", name: "Integration" };
let eventId = "";
let roundId = "";
let perfA = "";
let perfB = "";
let criteriaIds: string[] = [];
let judgeA = "";
let judgeB = "";

async function newVoter() {
  const s = await db.voterSession.create({ data: { secretHash: randomUUID() } });
  return s.id;
}

async function vote(performanceId: string, voterSessionId: string, value: number, key = randomUUID()) {
  const cfg = await db.eventConfig.findUniqueOrThrow({ where: { eventId } });
  return submitPublicVote({
    submissionKey: key,
    performanceId,
    voterSessionId,
    items: criteriaIds.map((criterionId) => ({ criterionId, value })),
    screenCode: screenCode(eventId, cfg.screenCodeRotationSec).code,
    clientDurationMs: 9000,
    locale: "es-MX",
    ip: "203.0.113.7",
  });
}

beforeAll(async () => {
  const org = await db.organization.findFirstOrThrow();
  const admin = await db.user.findFirstOrThrow({ where: { organizationId: org.id } });
  actor.userId = admin.id;
  const venue = await db.venue.findFirstOrThrow({ where: { organizationId: org.id } });
  const series = await db.eventSeries.findFirstOrThrow({ where: { organizationId: org.id } });
  const ev = await createEvent(actor, { seriesId: series.id, venueId: venue.id, name: `IT ${Date.now()}`, scheduledAt: new Date(), mode: "REHEARSAL" });
  eventId = ev.id;
  const round = await db.round.findFirstOrThrow({ where: { eventId } });
  roundId = round.id;
  const bands = await db.band.findMany({ where: { organizationId: org.id }, take: 2 });
  perfA = (await addPerformance(actor, roundId, bands[0].id)).id;
  perfB = (await addPerformance(actor, roundId, bands[1].id)).id;
  const group = await db.votingGroup.findUniqueOrThrow({ where: { eventId_kind: { eventId, kind: "PUBLIC" } }, include: { scorecard: { include: { criteria: true } } } });
  criteriaIds = group.scorecard!.criteria.map((c) => c.id);
  await db.votingGroup.update({ where: { id: group.id }, data: { minSubmissions: 2, minVotesPolicy: "BLOCK" } });
  const p1 = await db.person.create({ data: { organizationId: org.id, name: "IT Judge A" } });
  const p2 = await db.person.create({ data: { organizationId: org.id, name: "IT Judge B" } });
  const p3 = await db.person.create({ data: { organizationId: org.id, name: "IT Staff" } });
  judgeA = (await db.evaluatorAssignment.create({ data: { personId: p1.id, eventId, group: "JUDGE" } })).id;
  judgeB = (await db.evaluatorAssignment.create({ data: { personId: p2.id, eventId, group: "JUDGE" } })).id;
  await db.evaluatorAssignment.create({ data: { personId: p3.id, eventId, group: "STAFF" } });
  await transitionEvent(actor, eventId, "READY");
  await transitionEvent(actor, eventId, "LIVE");
  await takeOperatorLock(actor, eventId, true);
});

afterAll(async () => {
  await pgPool().end();
});

describe("voting lifecycle", () => {
  it("rejects votes before voting opens and accepts after", async () => {
    await startBand(actor, perfA);
    const v = await newVoter();
    await expect(vote(perfA, v, 8)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await openVoting(actor, perfA);
    const r = await vote(perfA, v, 8);
    expect(r.status).toBe("ACCEPTED");
    expect(r.duplicate).toBe(false);
  });

  it("is idempotent on the same submission key and blocks a second vote per performance", async () => {
    const v = await newVoter();
    const key = randomUUID();
    const a = await vote(perfA, v, 7, key);
    const b = await vote(perfA, v, 7, key);
    expect(b.duplicate).toBe(true);
    expect(b.confirmation).toBe(a.confirmation);
    await expect(vote(perfA, v, 9)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.scoreSubmission.count({ where: { performanceId: perfA, voterSessionId: v } })).toBe(1);
  });

  it("rejects a wrong screen code and out-of-range values", async () => {
    const v = await newVoter();
    await expect(submitPublicVote({ submissionKey: randomUUID(), performanceId: perfA, voterSessionId: v, items: criteriaIds.map((criterionId) => ({ criterionId, value: 8 })), screenCode: "0000", locale: "es-MX", ip: null })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(vote(perfA, v, 11)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("handles a burst of 60 concurrent voters without losing or duplicating any", async () => {
    const voters = await Promise.all(Array.from({ length: 60 }, newVoter));
    const results = await Promise.all(voters.map((v, i) => vote(perfA, v, 5 + (i % 5))));
    expect(results.every((r) => r.status === "ACCEPTED")).toBe(true);
    const count = await db.scoreSubmission.count({ where: { performanceId: perfA, group: "PUBLIC", status: "ACCEPTED" } });
    expect(count).toBeGreaterThanOrEqual(62);
  });

  it("close → grace period accepts in-flight votes with acceptedInGrace, then closes deterministically", async () => {
    await closeVoting(actor, perfA);
    const v = await newVoter();
    const r = await vote(perfA, v, 6);
    expect(r.acceptedInGrace).toBe(true);
    await db.performance.update({ where: { id: perfA }, data: { graceUntil: new Date(Date.now() - 1000) } });
    await settleGracePeriods();
    const p = await db.performance.findUniqueOrThrow({ where: { id: perfA } });
    expect(p.status).toBe("VOTING_CLOSED");
    await expect(vote(perfA, await newVoter(), 6)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("evaluation and results", () => {
  it("judge draft → final is locked; second final with another key is rejected", async () => {
    const items = criteriaIds.map((criterionId) => ({ criterionId, value: 8 }));
    await saveDraft({ assignmentId: judgeA, group: "JUDGE", performanceId: perfA, items: items.slice(0, 3), submissionKey: randomUUID() });
    const key = randomUUID();
    const s = await submitFinal({ assignmentId: judgeA, group: "JUDGE", performanceId: perfA, items, submissionKey: key });
    expect(s.status).toBe("ACCEPTED");
    expect(s.lockedAt).not.toBeNull();
    const again = await submitFinal({ assignmentId: judgeA, group: "JUDGE", performanceId: perfA, items, submissionKey: key });
    expect(again.id).toBe(s.id);
    await expect(submitFinal({ assignmentId: judgeA, group: "JUDGE", performanceId: perfA, items, submissionKey: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(saveDraft({ assignmentId: judgeA, group: "JUDGE", performanceId: perfA, items, submissionKey: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("calculates an immutable, verifiable result; repeated calculation gives identical score", async () => {
    const staff = await db.evaluatorAssignment.findFirstOrThrow({ where: { eventId, group: "STAFF" } });
    await submitFinal({ assignmentId: staff.id, group: "STAFF", performanceId: perfA, items: criteriaIds.map((criterionId) => ({ criterionId, value: 7 })), submissionKey: randomUUID() });
    const r1 = await calculateResult(actor, perfA);
    const r2 = await calculateResult(actor, perfA);
    expect(r1.finalScore.toString()).toBe(r2.finalScore.toString());
    expect(r2.previousHash).toBe(r1.hash);
    const v = await verifyResult(r2.id);
    expect(v.hashMatches).toBe(true);
    expect(v.scoreMatches).toBe(true);
    const payload = r2.payload as { policiesApplied: string[]; groups: { kind: string; evaluatorsAbsent?: string[] }[] };
    expect(payload.policiesApplied).toContain("MISSING_EVALUATOR(JUDGE:REDISTRIBUTE)");
    expect(payload.groups.find((g) => g.kind === "JUDGE")?.evaluatorsAbsent).toEqual([judgeB]);
    await expect(db.resultSnapshot.update({ where: { id: r2.id }, data: { finalScore: "1" } })).rejects.toThrow();
    await expect(db.$executeRaw`DELETE FROM "AuditEvent" WHERE "eventId" = ${eventId}`).rejects.toThrow();
  });

  it("blocks calculation when the public minimum is not met, and finalize requires every result", async () => {
    await startBand(actor, perfB);
    await openVoting(actor, perfB);
    await vote(perfB, await newVoter(), 9);
    await closeVoting(actor, perfB);
    await db.performance.update({ where: { id: perfB }, data: { graceUntil: new Date(Date.now() - 1000) } });
    await settleGracePeriods();
    await expect(finalizeRound(actor, roundId)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(calculateResult(actor, perfB)).rejects.toMatchObject({ code: "MIN_SUBMISSIONS_NOT_MET" });
    // Operator reopens (audited) to collect the missing vote, then closes again.
    await reopenVoting(actor, perfB, "integration: minimum not met");
    await vote(perfB, await newVoter(), 9);
    await closeVoting(actor, perfB);
    await db.performance.update({ where: { id: perfB }, data: { graceUntil: new Date(Date.now() - 1000) } });
    await settleGracePeriods();
    await submitFinal({ assignmentId: judgeA, group: "JUDGE", performanceId: perfB, items: criteriaIds.map((criterionId) => ({ criterionId, value: 9 })), submissionKey: randomUUID() });
    const staff = await db.evaluatorAssignment.findFirstOrThrow({ where: { eventId, group: "STAFF" } });
    await submitFinal({ assignmentId: staff.id, group: "STAFF", performanceId: perfB, items: criteriaIds.map((criterionId) => ({ criterionId, value: 9 })), submissionKey: randomUUID() });
    await calculateResult(actor, perfB);
    const fin = await finalizeRound(actor, roundId);
    expect(fin.ranking[0].position).toBe(1);
    expect(fin.ranking[0].performanceId).toBe(perfB);
    const q = await db.qualification.findMany({ where: { roundId } });
    expect(q.find((x) => x.performanceId === perfB)?.status).toBe("QUALIFIED");
    expect(q.find((x) => x.performanceId === perfA)?.status).toBe("ELIMINATED");
  });

  it("flags the porra pattern (max to one band, min to the rest) without deleting it", async () => {
    // Needs ≥3 bands voted by the same voter; use a third performance in a fresh round of the same event.
    const round2 = await db.round.create({ data: { eventId, name: "R2", order: 2 } });
    const org = await db.organization.findFirstOrThrow();
    const bands = await db.band.findMany({ where: { organizationId: org.id }, skip: 2, take: 3 });
    const perfs = [];
    for (const b of bands) perfs.push(await addPerformance(actor, round2.id, b.id));
    const voter = await newVoter();
    for (const [i, p] of perfs.entries()) {
      await startBand(actor, p.id);
      await openVoting(actor, p.id);
      const r = await vote(p.id, voter, i === 1 ? 10 : 1);
      if (i === 2) {
        expect(r.status).toBe("FLAGGED_FOR_REVIEW");
        const s = await db.scoreSubmission.findUniqueOrThrow({ where: { submissionKey: r.submissionId } });
        expect((s.riskSignals as { kind: string }[]).some((x) => x.kind === "PORRA_PATTERN")).toBe(true);
      } else expect(r.status).toBe("ACCEPTED");
      await closeVoting(actor, p.id);
      await db.performance.update({ where: { id: p.id }, data: { graceUntil: new Date(Date.now() - 1000) } });
      await settleGracePeriods();
    }
  });
});
