import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { notFound } from "@/lib/errors";
import { screenCode } from "@/lib/screen-code";
import { timerElapsedSeconds } from "@/modules/events/service";
import { projectPartial } from "@/modules/results/service";
import type { PerformanceResult, RankingEntry } from "@/modules/scoring-engine";

/**
 * Public-safe snapshot for /stage. Never includes scores that are not revealed; never includes
 * evaluator identities or flagged counts.
 */
export async function stageSnapshot(eventSlug: string) {
  const event = await db.eventEdition.findUnique({
    where: { slug: eventSlug },
    include: {
      config: true,
      stageScene: true,
      placements: { where: { isActive: true, kind: { in: ["STAGE_PRESENTED_BY", "STAGE_BREAK", "STAGE_TRANSITION"] } }, include: { campaign: { include: { sponsor: true } } } },
      rounds: { orderBy: { order: "asc" }, include: { performances: { where: { status: { not: "CANCELLED" } }, orderBy: { slotOrder: "asc" }, include: { band: true, currentResult: true, qualification: true, timer: true, _count: { select: { submissions: { where: { group: "PUBLIC", status: { in: ["ACCEPTED", "FLAGGED_FOR_REVIEW"] } } } } } } } } },
    },
  });
  if (!event || !event.config) throw notFound("Event");
  const cfg = event.config;
  const scene = event.stageScene ?? { type: "WELCOME" as const, payload: {}, version: 0 };
  const payload = (scene.payload ?? {}) as Record<string, unknown>;
  const performances = event.rounds.flatMap((r) => r.performances.map((p) => ({ ...p, roundId: r.id, roundName: r.name })));
  const inFlight = performances
    .filter((p) => ["ON_STAGE", "VOTING_OPEN", "GRACE_PERIOD", "VOTING_CLOSED", "CALCULATING", "RESULT_READY", "PARTIAL_REVEALED"].includes(p.status))
    .sort((a, b) => (b.onStageAt?.getTime() ?? 0) - (a.onStageAt?.getTime() ?? 0));
  const active = performances.find((p) => p.id === payload.performanceId) ?? inFlight[0] ?? null;
  const nextBand = active ? performances.find((p) => p.roundId === active.roundId && p.slotOrder > active.slotOrder && p.status === "SCHEDULED") : performances.find((p) => p.status === "SCHEDULED");
  const code = cfg.screenCodeRequired ? screenCode(event.id, cfg.screenCodeRotationSec) : null;

  const roundForReveal = event.rounds.find((r) => r.id === payload.roundId) ?? event.rounds.find((r) => r.status === "PUBLISHED") ?? null;
  const ranking = roundForReveal ? await db.ranking.findFirst({ where: { roundId: roundForReveal.id, isFinal: true }, orderBy: { createdAt: "desc" } }) : null;
  const rankingEntries = (ranking?.payload as unknown as RankingEntry[] | undefined) ?? [];
  const qualifications = roundForReveal ? roundForReveal.performances.map((p) => p.qualification).filter(Boolean) : [];

  const presentedBy = event.placements.find((p) => p.kind === "STAGE_PRESENTED_BY");
  const sponsorScene = event.placements.filter((p) => p.kind === "STAGE_BREAK" || p.kind === "STAGE_TRANSITION");

  return {
    event: { id: event.id, name: event.name, slug: event.slug, mode: event.mode, status: event.status },
    scene: { type: scene.type, version: scene.version, payload },
    voteUrl: `${env().APP_URL}/vote/${event.slug}`,
    screenCode: code ? { code: code.code, expiresInSec: code.expiresInSec, rotationSec: cfg.screenCodeRotationSec } : null,
    showTimer: cfg.stageShowTimer,
    showVoteCount: cfg.showVoteCountPublicly,
    active: active
      ? {
          id: active.id,
          status: active.status,
          band: { name: active.band.name, imageUrl: active.band.imageUrl, genre: active.band.genre, instagram: active.band.instagram },
          slotOrder: active.slotOrder,
          votesReceived: active._count.submissions,
          graceUntil: active.graceUntil?.toISOString() ?? null,
          timer: active.timer && cfg.stageShowTimer ? { remaining: active.timer.plannedSeconds - timerElapsedSeconds(active.timer), status: active.timer.status } : null,
          partial: active.currentResult?.partialRevealedAt ? projectPartial(active.currentResult.payload as unknown as PerformanceResult, cfg.partialRevealPolicy) : null,
        }
      : null,
    nextBand: nextBand ? { name: nextBand.band.name, imageUrl: nextBand.band.imageUrl, slotOrder: nextBand.slotOrder } : null,
    lineup: performances.map((p) => ({ id: p.id, band: p.band.name, slotOrder: p.slotOrder, status: p.status, round: p.roundName })),
    reveal: roundForReveal
      ? {
          roundId: roundForReveal.id,
          order: cfg.finalRevealOrder,
          style: cfg.finalRevealStyle,
          revealedCount: typeof payload.revealedCount === "number" ? payload.revealedCount : rankingEntries.length,
          entries: rankingEntries.map((e) => ({ position: e.position, bandName: e.bandName, finalScore: e.finalScore, performanceId: e.performanceId, imageUrl: roundForReveal.performances.find((p) => p.id === e.performanceId)?.band.imageUrl ?? null, status: qualifications.find((q) => q!.performanceId === e.performanceId)?.status ?? "PENDING" })),
        }
      : null,
    sponsor: {
      presentedBy: presentedBy ? { name: presentedBy.campaign.sponsor.name, imageUrl: presentedBy.imageUrl ?? presentedBy.campaign.sponsor.logoUrl, placementId: presentedBy.id } : null,
      scenes: sponsorScene.map((p) => ({ name: p.campaign.sponsor.name, imageUrl: p.imageUrl ?? p.campaign.sponsor.logoUrl, headlineEs: p.headlineEs, headlineEn: p.headlineEn, placementId: p.id })),
    },
    serverTime: new Date().toISOString(),
  };
}

export type StageSnapshot = Awaited<ReturnType<typeof stageSnapshot>>;
