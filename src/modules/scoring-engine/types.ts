// Pure input/output contracts for the Scoring Engine. No Prisma types here on purpose:
// the engine must be runnable from a ConfigurationSnapshot payload alone.

export type GroupKind = "PUBLIC" | "STAFF" | "JUDGE";
export type AggregationMethod = "MEAN" | "MEDIAN" | "TRIMMED_MEAN";
export type MissingEvaluatorPolicy = "REDISTRIBUTE" | "REQUIRE_MIN" | "ZERO_WEIGHT";
export type MinVotesPolicy = "BLOCK" | "REDISTRIBUTE" | "ZERO_WEIGHT";
export type VoterNormalization = "NONE" | "Z_SCORE_PER_VOTER";
export type JudgeNormalization = "NONE" | "Z_SCORE_PER_JUDGE";
export type RoundingMode = "HALF_UP" | "HALF_EVEN";
export type ScorecardVariant = "FULL" | "QUICK";
export type OvertimePolicy = "NONE" | "TIE_BREAKER" | "PENALTY";
export type SubmissionStatus = "DRAFT" | "ACCEPTED" | "REJECTED" | "FLAGGED_FOR_REVIEW";

export interface EngineCriterion {
  id: string;
  key: string;
  weightBp: number;
  scaleMin: number;
  scaleMax: number;
  countsTowardScore: boolean;
  includedInQuick: boolean;
}

export interface EngineScorecard {
  id: string;
  criteria: EngineCriterion[];
}

export interface EngineEvaluator {
  assignmentId: string;
  individualWeightBp: number;
  /** Band ids this evaluator declared a conflict of interest for. */
  conflictBandIds?: string[];
}

export interface EngineGroup {
  kind: GroupKind;
  weightBp: number;
  aggregation: AggregationMethod;
  trimPercentBp: number;
  minSubmissions: number;
  minVotesPolicy: MinVotesPolicy;
  missingEvaluatorPolicy: MissingEvaluatorPolicy;
  requiredEvaluatorCount: number;
  scorecardId: string;
  /** Assigned evaluators (JUDGE/STAFF only). */
  evaluators?: EngineEvaluator[];
}

export type TieBreaker =
  | { kind: "JUDGE_SCORE" }
  | { kind: "PUBLIC_SCORE" }
  | { kind: "STAFF_SCORE" }
  | { kind: "CRITERION"; criterionKey: string }
  | { kind: "OVERTIME" }
  | { kind: "MANUAL" };

export interface EngineConfig {
  groups: EngineGroup[];
  scorecards: EngineScorecard[];
  decimalPrecision: number;
  roundingMode: RoundingMode;
  voterNormalization: VoterNormalization;
  multiBandVoterBoostBp: number;
  multiBandVoterMin: number;
  porraPatternFlag: boolean;
  bayesianPriorVotes: number;
  judgeNormalization: JudgeNormalization;
  tieBreakers: TieBreaker[];
  overtimePolicy: OvertimePolicy;
  overtimePenaltyBp: number;
}

export interface EngineSubmission {
  id: string;
  performanceId: string;
  group: GroupKind;
  /** voterSessionId for PUBLIC, assignmentId otherwise. */
  actorId: string;
  scorecardVariant: ScorecardVariant;
  status: SubmissionStatus;
  items: { criterionId: string; value: number }[];
}

export interface PerformanceInput {
  performanceId: string;
  bandId: string;
  bandName: string;
  overtimeSeconds?: number;
}

export interface CalculateInput {
  config: EngineConfig;
  performance: PerformanceInput;
  /** All submissions of the round (needed for cross-band normalization). */
  roundSubmissions: EngineSubmission[];
}

export interface CriterionStat {
  criterionId: string;
  key: string;
  mean: string;
  count: number;
}

export interface GroupResult {
  kind: GroupKind;
  configuredWeightBp: number;
  appliedWeightBp: number;
  score: string | null;
  acceptedCount: number;
  flaggedCount: number;
  rejectedCount: number;
  evaluatorsPresent?: string[];
  evaluatorsAbsent?: string[];
  evaluatorsExcused?: string[];
  criteria: CriterionStat[];
  notes: string[];
}

export interface PerformanceResult {
  engineVersion: string;
  performanceId: string;
  bandId: string;
  bandName: string;
  groups: GroupResult[];
  finalScore: string;
  rawScore: string;
  scaleMin: number;
  scaleMax: number;
  acceptedVotes: number;
  rejectedVotes: number;
  flaggedVotes: number;
  policiesApplied: string[];
  overtimeSeconds: number;
  formula: string;
}

export interface RankingEntry {
  performanceId: string;
  bandId: string;
  bandName: string;
  finalScore: string;
  position: number;
  tieBreakTrail: string[];
  /** True when a MANUAL decision is still required to order this entry. */
  unresolvedTie: boolean;
}
