import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { hashCanonical } from "@/lib/hash";
import { notFound } from "@/lib/errors";
import { collectConfigIssues, type EngineConfig, type ScoringError, type TieBreaker } from "@/modules/scoring-engine";

/** Default public scorecard for Guerra de Bandas (demo values — see BUSINESS_RULES.md). */
export const DEFAULT_CRITERIA = [
  { key: "calidad", nameEs: "Calidad musical", nameEn: "Musical quality", weightBp: 2000, includedInQuick: true },
  { key: "presencia", nameEs: "Presencia escénica", nameEn: "Stage presence", weightBp: 1500, includedInQuick: true },
  { key: "imagen", nameEs: "Imagen general de la banda", nameEn: "Overall band image", weightBp: 1000, includedInQuick: false },
  { key: "conexion", nameEs: "Conexión con el público", nameEn: "Audience connection", weightBp: 1500, includedInQuick: true },
  { key: "originalidad", nameEs: "Originalidad del espectáculo", nameEn: "Show originality", weightBp: 1000, includedInQuick: false },
  { key: "repertorio", nameEs: "Repertorio presentado", nameEn: "Repertoire", weightBp: 1000, includedInQuick: false },
  { key: "global", nameEs: "Evaluación global", nameEn: "Overall evaluation", weightBp: 2000, includedInQuick: true },
];

export const DEFAULT_GROUPS: { kind: "PUBLIC" | "STAFF" | "JUDGE"; name: string; weightBp: number }[] = [
  { kind: "PUBLIC", name: "Público", weightBp: 4000 },
  { kind: "STAFF", name: "Staff", weightBp: 2000 },
  { kind: "JUDGE", name: "Jurado", weightBp: 4000 },
];

/** Builds the pure engine config from the live database state of an event. */
export async function buildEngineConfig(eventId: string, tx: Tx | typeof db = db): Promise<EngineConfig> {
  const event = await tx.eventEdition.findUnique({
    where: { id: eventId },
    include: {
      config: true,
      groups: true,
      scorecards: { include: { criteria: { orderBy: { order: "asc" } } } },
      assignments: { where: { status: "ACTIVE" }, include: { conflicts: true } },
    },
  });
  if (!event || !event.config) throw notFound("Event configuration");
  const c = event.config;
  return {
    scorecards: event.scorecards.map((s) => ({
      id: s.id,
      criteria: s.criteria.map((cr) => ({
        id: cr.id,
        key: cr.key,
        weightBp: cr.weightBp,
        scaleMin: cr.scaleMin,
        scaleMax: cr.scaleMax,
        countsTowardScore: cr.countsTowardScore,
        includedInQuick: cr.includedInQuick,
      })),
    })),
    groups: event.groups.map((g) => ({
      kind: g.kind,
      weightBp: g.weightBp,
      aggregation: g.aggregation,
      trimPercentBp: g.trimPercentBp,
      minSubmissions: g.minSubmissions,
      minVotesPolicy: g.minVotesPolicy,
      missingEvaluatorPolicy: g.missingEvaluatorPolicy,
      requiredEvaluatorCount: g.requiredEvaluatorCount,
      scorecardId: g.scorecardId ?? "",
      evaluators:
        g.kind === "PUBLIC"
          ? undefined
          : event.assignments
              .filter((a) => a.group === g.kind)
              .map((a) => ({
                assignmentId: a.id,
                individualWeightBp: a.individualWeightBp,
                conflictBandIds: a.conflicts.map((x) => x.bandId),
              })),
    })),
    decimalPrecision: c.decimalPrecision,
    roundingMode: c.roundingMode,
    voterNormalization: c.voterNormalization,
    multiBandVoterBoostBp: c.multiBandVoterBoostBp,
    multiBandVoterMin: c.multiBandVoterMin,
    porraPatternFlag: c.porraPatternFlag,
    bayesianPriorVotes: c.bayesianPriorVotes,
    judgeNormalization: c.judgeNormalization,
    tieBreakers: c.tieBreakers as unknown as TieBreaker[],
    overtimePolicy: c.overtimePolicy,
    overtimePenaltyBp: c.overtimePenaltyBp,
  };
}

export async function configIssues(eventId: string): Promise<ScoringError[]> {
  return collectConfigIssues(await buildEngineConfig(eventId));
}

/**
 * Freezes the current configuration into an immutable, hashed snapshot. Called right before
 * voting opens on a performance; the performance references the snapshot it was scored with.
 */
export async function createConfigurationSnapshot(tx: Tx, eventId: string, createdBy?: string) {
  const config = await buildEngineConfig(eventId, tx);
  const issues = collectConfigIssues(config);
  if (issues.length) throw issues[0];
  const last = await tx.configurationSnapshot.findFirst({ where: { eventId }, orderBy: { version: "desc" } });
  const hash = hashCanonical(config);
  // Reuse the last snapshot when nothing changed so a night keeps one configuration version.
  if (last && last.hash === hash) return last;
  return tx.configurationSnapshot.create({
    data: {
      eventId,
      version: (last?.version ?? 0) + 1,
      payload: config as unknown as Prisma.InputJsonValue,
      hash,
      createdBy,
    },
  });
}

/** Creates the demo default configuration for a new event (config + groups + one shared scorecard). */
export async function seedDefaultConfiguration(tx: Tx | typeof db, eventId: string) {
  await tx.eventConfig.create({ data: { eventId } });
  const scorecard = await tx.scorecardTemplate.create({
    data: {
      eventId,
      name: "Guerra de Bandas",
      criteria: {
        create: DEFAULT_CRITERIA.map((c, i) => ({ ...c, order: i + 1 })),
      },
    },
  });
  for (const g of DEFAULT_GROUPS) {
    await tx.votingGroup.create({
      data: {
        eventId,
        kind: g.kind,
        name: g.name,
        weightBp: g.weightBp,
        scorecardId: scorecard.id,
        aggregation: g.kind === "PUBLIC" ? "TRIMMED_MEAN" : "MEAN",
        minSubmissions: g.kind === "PUBLIC" ? 10 : 1,
        minVotesPolicy: g.kind === "PUBLIC" ? "REDISTRIBUTE" : "BLOCK",
        requiredEvaluatorCount: g.kind === "JUDGE" ? 2 : 1,
      },
    });
  }
  return scorecard;
}
