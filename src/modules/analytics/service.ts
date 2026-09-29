import Decimal from "decimal.js";
import { db } from "@/lib/db";
import type { PerformanceResult } from "@/modules/scoring-engine";

/** Operational + commercial analytics for one event. Official results come from ResultSnapshot only. */
export async function eventAnalytics(eventId: string) {
  const event = await db.eventEdition.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      rounds: { include: { performances: { include: { band: true, currentResult: true, timer: true, qualification: true }, orderBy: { slotOrder: "asc" } } } },
      groups: { include: { scorecard: { include: { criteria: { orderBy: { order: "asc" } } } } } },
    },
  });
  const perfs = event.rounds.flatMap((r) => r.performances);
  const subs = await db.scoreSubmission.findMany({ where: { eventId, status: { not: "DRAFT" } }, include: { items: true } });
  const publicSubs = subs.filter((s) => s.group === "PUBLIC");
  const accepted = publicSubs.filter((s) => s.status === "ACCEPTED");
  const sessions = new Set(publicSubs.map((s) => s.voterSessionId)).size;
  const durations = accepted.map((s) => s.clientDurationMs).filter((d): d is number => d !== null && d > 0);
  const votesPerBand = new Map<string, number>();
  for (const s of publicSubs) votesPerBand.set(s.performanceId, (votesPerBand.get(s.performanceId) ?? 0) + 1);
  const multiBand = [...publicSubs.reduce((m, s) => m.set(s.voterSessionId!, (m.get(s.voterSessionId!) ?? 0) + 1), new Map<string, number>()).values()].filter((n) => n >= 2).length;

  // Returning voters: sessions that voted in another event before this one.
  const sessionIds = [...new Set(publicSubs.map((s) => s.voterSessionId!))];
  const returning = sessionIds.length ? await db.scoreSubmission.groupBy({ by: ["voterSessionId"], where: { voterSessionId: { in: sessionIds }, eventId: { not: eventId }, group: "PUBLIC" } }) : [];

  const criteria = event.groups.find((g) => g.kind === "PUBLIC")?.scorecard?.criteria ?? [];
  const byCriterion = criteria.map((c) => {
    const vals = accepted.flatMap((s) => s.items.filter((i) => i.criterionId === c.id).map((i) => i.value));
    const dist = Array.from({ length: c.scaleMax - c.scaleMin + 1 }, (_, i) => vals.filter((v) => v === c.scaleMin + i).length);
    return { key: c.key, nameEs: c.nameEs, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, distribution: dist, count: vals.length };
  });

  const bands = perfs.map((p) => {
    const r = p.currentResult?.payload as unknown as PerformanceResult | undefined;
    const g = (k: string) => r?.groups.find((x) => x.kind === k)?.score ?? null;
    const pub = g("PUBLIC"), judge = g("JUDGE"), staff = g("STAFF");
    return {
      performanceId: p.id,
      band: p.band.name,
      slotOrder: p.slotOrder,
      status: p.status,
      votes: votesPerBand.get(p.id) ?? 0,
      flagged: publicSubs.filter((s) => s.performanceId === p.id && s.status === "FLAGGED_FOR_REVIEW").length,
      final: r?.finalScore ?? null,
      publicScore: pub,
      judgeScore: judge,
      staffScore: staff,
      divergence: pub && judge ? new Decimal(pub).minus(judge).toDecimalPlaces(2).toString() : null,
      actualSeconds: p.timer?.actualSeconds ?? null,
      overtimeSeconds: p.timer?.overtimeSeconds ?? null,
      qualification: p.qualification?.status ?? null,
      position: p.qualification?.position ?? null,
    };
  });

  const [contacts, optIns, follows, reservationClicks, sponsorStats] = await Promise.all([
    db.audienceContact.count({ where: { eventId } }),
    db.attribution.count({ where: { eventId, kind: "OPT_IN" } }),
    db.attribution.groupBy({ by: ["bandId"], where: { eventId, kind: "BAND_FOLLOW" }, _count: { _all: true } }),
    db.attribution.count({ where: { eventId, kind: "RESERVATION_CLICK" } }),
    db.sponsorInteraction.groupBy({ by: ["placementId", "kind"], where: { eventId }, _count: { _all: true } }),
  ]);
  const placements = await db.sponsorPlacement.findMany({ where: { id: { in: sponsorStats.map((s) => s.placementId) } }, include: { campaign: { include: { sponsor: true } } } });
  const sponsors = placements.map((p) => {
    const n = (k: string) => sponsorStats.find((s) => s.placementId === p.id && s.kind === k)?._count._all ?? 0;
    return { sponsor: p.campaign.sponsor.name, kind: p.kind, impressions: n("IMPRESSION"), clicks: n("CLICK"), qr: n("QR_SCAN") };
  });

  return {
    event: { id: event.id, name: event.name, mode: event.mode, status: event.status, expectedAttendance: event.expectedAttendance },
    operational: {
      performances: perfs.length,
      publicVotes: publicSubs.length,
      accepted: accepted.length,
      flagged: publicSubs.filter((s) => s.status === "FLAGGED_FOR_REVIEW").length,
      rejected: publicSubs.filter((s) => s.status === "REJECTED").length,
      uniqueSessions: sessions,
      participationRate: event.expectedAttendance ? sessions / event.expectedAttendance : null,
      multiBandVoters: multiBand,
      returningVoters: returning.length,
      avgVoteSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000) : null,
      judgeSubmissions: subs.filter((s) => s.group === "JUDGE").length,
      staffSubmissions: subs.filter((s) => s.group === "STAFF").length,
      byCriterion,
      bands,
    },
    commercial: {
      contacts,
      optIns,
      optInRate: sessions ? optIns / sessions : null,
      follows: follows.map((f) => ({ bandId: f.bandId, count: f._count._all, band: perfs.find((p) => p.bandId === f.bandId)?.band.name ?? "?" })),
      reservationClicks,
      sponsors,
    },
  };
}

export async function seriesComparison(seriesId: string) {
  const events = await db.eventEdition.findMany({ where: { seriesId, mode: "LIVE" }, orderBy: { scheduledAt: "asc" }, select: { id: true, name: true, expectedAttendance: true } });
  const out = [];
  for (const e of events) {
    const votes = await db.scoreSubmission.count({ where: { eventId: e.id, group: "PUBLIC", status: "ACCEPTED" } });
    const sessions = await db.scoreSubmission.findMany({ where: { eventId: e.id, group: "PUBLIC" }, distinct: ["voterSessionId"], select: { voterSessionId: true } });
    const optIns = await db.attribution.count({ where: { eventId: e.id, kind: "OPT_IN" } });
    out.push({ ...e, votes, sessions: sessions.length, optIns });
  }
  return out;
}
