import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, notFound } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/hash";
import type { PerformanceResult } from "@/modules/scoring-engine";

/**
 * Builds the post-event report for one band. Never includes other bands' individual scores nor
 * evaluator identities. Level SUMMARY: own scores + night averages. DETAILED: adds per-criterion
 * comparison and anonymous comments.
 */
export async function buildBandReport(actor: { userId: string; name: string }, performanceId: string) {
  const p = await db.performance.findUnique({ where: { id: performanceId }, include: { band: true, currentResult: true, qualification: true, round: { include: { event: { include: { config: true, placements: { where: { kind: "BAND_REPORT_FOOTER", isActive: true }, include: { campaign: { include: { sponsor: true } } } } } }, performances: { include: { currentResult: true } } } } } });
  if (!p || !p.currentResult) throw notFound("Result");
  const cfg = p.round.event.config!;
  if (!cfg.bandReportEnabled || cfg.bandReportLevel === "NONE") throw new AppError("FORBIDDEN", "Band reports are disabled for this event.");
  const mine = p.currentResult.payload as unknown as PerformanceResult;
  const others = p.round.performances.filter((x) => x.currentResult).map((x) => x.currentResult!.payload as unknown as PerformanceResult);
  const avg = (get: (r: PerformanceResult) => string | null | undefined) => {
    const vals = others.map(get).filter((v): v is string => !!v).map(Number);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
  };
  const group = (r: PerformanceResult, k: string) => r.groups.find((g) => g.kind === k)?.score ?? null;
  const payload: Record<string, unknown> = {
    band: p.band.name,
    event: p.round.event.name,
    date: p.round.event.scheduledAt.toISOString(),
    level: cfg.bandReportLevel,
    position: p.qualification?.position ?? null,
    qualification: p.qualification?.status ?? null,
    bandsInRound: others.length,
    finalScore: mine.finalScore,
    nightAverageFinal: avg((r) => r.finalScore),
    groups: ["PUBLIC", "STAFF", "JUDGE"].map((k) => ({ kind: k, score: group(mine, k), nightAverage: avg((r) => group(r, k)), votes: mine.groups.find((g) => g.kind === k)?.acceptedCount ?? 0 })),
    publicVsJudge: group(mine, "PUBLIC") && group(mine, "JUDGE") ? (Number(group(mine, "PUBLIC")) - Number(group(mine, "JUDGE"))).toFixed(2) : null,
    sponsor: p.round.event.placements[0] ? { name: p.round.event.placements[0].campaign.sponsor.name, imageUrl: p.round.event.placements[0].imageUrl ?? p.round.event.placements[0].campaign.sponsor.logoUrl, code: p.round.event.placements[0].code } : null,
  };
  if (cfg.bandReportLevel === "DETAILED") {
    const pub = mine.groups.find((g) => g.kind === "PUBLIC");
    payload.criteria = (pub?.criteria ?? []).map((c) => ({
      key: c.key,
      mine: c.mean,
      nightAverage: avg((r) => r.groups.find((g) => g.kind === "PUBLIC")?.criteria.find((x) => x.key === c.key)?.mean),
      judge: mine.groups.find((g) => g.kind === "JUDGE")?.criteria.find((x) => x.key === c.key)?.mean ?? null,
    }));
    const comments = await db.scoreSubmission.findMany({ where: { performanceId, status: "ACCEPTED", comment: { not: null } }, select: { comment: true, group: true } });
    payload.comments = comments.map((c) => ({ group: c.group, text: c.comment })).filter((c) => c.text && c.text.length > 2);
    const fans = await db.attribution.count({ where: { eventId: p.round.eventId, bandId: p.bandId, kind: "BAND_FOLLOW" } });
    payload.newFollowers = fans;
  }
  const viewToken = randomToken(16);
  const report = await db.bandReport.upsert({
    where: { performanceId_bandId: { performanceId, bandId: p.bandId } },
    create: { eventId: p.round.eventId, bandId: p.bandId, performanceId, level: cfg.bandReportLevel, payload: payload as Prisma.InputJsonValue, viewTokenHash: sha256(viewToken) },
    update: { level: cfg.bandReportLevel, payload: payload as Prisma.InputJsonValue, viewTokenHash: sha256(viewToken) },
  });
  await audit(db, { action: "BAND_REPORT_GENERATED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId: p.round.eventId, performanceId, entityType: "BandReport", entityId: report.id });
  return { report, url: `${env().APP_URL}/b/report/${viewToken}`, contactEmail: p.band.contactEmail };
}

export async function markReportSent(reportId: string, sentTo: string) {
  const r = await db.bandReport.update({ where: { id: reportId }, data: { sentAt: new Date(), sentTo } });
  await audit(db, { action: "BAND_REPORT_SENT", actorType: "SYSTEM", eventId: r.eventId, performanceId: r.performanceId, entityType: "BandReport", entityId: r.id, payload: { sentTo } });
}

export async function getReportByToken(token: string) {
  const r = await db.bandReport.findUnique({ where: { viewTokenHash: sha256(token) }, include: { band: true } });
  if (!r) throw notFound("Report");
  return r;
}
