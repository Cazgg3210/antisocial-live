import type { EngineConfig, EngineSubmission, GroupKind, ScorecardVariant } from "@/modules/scoring-engine";

export const CRITERIA = [
  { id: "c1", key: "calidad", weightBp: 2000, includedInQuick: true },
  { id: "c2", key: "presencia", weightBp: 1500, includedInQuick: true },
  { id: "c3", key: "imagen", weightBp: 1000, includedInQuick: false },
  { id: "c4", key: "conexion", weightBp: 1500, includedInQuick: true },
  { id: "c5", key: "originalidad", weightBp: 1000, includedInQuick: false },
  { id: "c6", key: "repertorio", weightBp: 1000, includedInQuick: false },
  { id: "c7", key: "global", weightBp: 2000, includedInQuick: true },
].map((c) => ({ ...c, scaleMin: 1, scaleMax: 10, countsTowardScore: true }));

export function baseConfig(overrides: Partial<EngineConfig> = {}): EngineConfig {
  return {
    scorecards: [{ id: "sc", criteria: CRITERIA }],
    groups: [
      {
        kind: "PUBLIC",
        weightBp: 4000,
        aggregation: "MEAN",
        trimPercentBp: 1000,
        minSubmissions: 1,
        minVotesPolicy: "BLOCK",
        missingEvaluatorPolicy: "REDISTRIBUTE",
        requiredEvaluatorCount: 0,
        scorecardId: "sc",
      },
      {
        kind: "STAFF",
        weightBp: 2000,
        aggregation: "MEAN",
        trimPercentBp: 0,
        minSubmissions: 1,
        minVotesPolicy: "BLOCK",
        missingEvaluatorPolicy: "REDISTRIBUTE",
        requiredEvaluatorCount: 1,
        scorecardId: "sc",
        evaluators: [
          { assignmentId: "s1", individualWeightBp: 10000 },
          { assignmentId: "s2", individualWeightBp: 10000 },
        ],
      },
      {
        kind: "JUDGE",
        weightBp: 4000,
        aggregation: "MEAN",
        trimPercentBp: 0,
        minSubmissions: 1,
        minVotesPolicy: "BLOCK",
        missingEvaluatorPolicy: "REDISTRIBUTE",
        requiredEvaluatorCount: 2,
        scorecardId: "sc",
        evaluators: [
          { assignmentId: "j1", individualWeightBp: 10000 },
          { assignmentId: "j2", individualWeightBp: 10000 },
          { assignmentId: "j3", individualWeightBp: 10000 },
        ],
      },
    ],
    decimalPrecision: 2,
    roundingMode: "HALF_UP",
    voterNormalization: "NONE",
    multiBandVoterBoostBp: 10000,
    multiBandVoterMin: 2,
    porraPatternFlag: true,
    bayesianPriorVotes: 0,
    judgeNormalization: "NONE",
    tieBreakers: [{ kind: "JUDGE_SCORE" }, { kind: "PUBLIC_SCORE" }, { kind: "CRITERION", criterionKey: "conexion" }, { kind: "MANUAL" }],
    overtimePolicy: "NONE",
    overtimePenaltyBp: 0,
    ...overrides,
  };
}

let seq = 0;
export function sub(
  performanceId: string,
  group: GroupKind,
  actorId: string,
  value: number | number[],
  opts: { status?: EngineSubmission["status"]; variant?: ScorecardVariant } = {},
): EngineSubmission {
  const values = Array.isArray(value) ? value : CRITERIA.map(() => value);
  const criteria = opts.variant === "QUICK" ? CRITERIA.filter((c) => c.includedInQuick) : CRITERIA;
  return {
    id: `sub-${String(++seq).padStart(5, "0")}`,
    performanceId,
    group,
    actorId,
    scorecardVariant: opts.variant ?? "FULL",
    status: opts.status ?? "ACCEPTED",
    items: criteria.map((c, i) => ({ criterionId: c.id, value: values[i] ?? values[0] })),
  };
}

export const PERF_A = { performanceId: "pA", bandId: "bA", bandName: "Alpha" };
export const PERF_B = { performanceId: "pB", bandId: "bB", bandName: "Beta" };
