export type ScoringErrorCode =
  | "WEIGHTS_NOT_100"
  | "CRITERION_WITHOUT_WEIGHT"
  | "CRITERIA_WEIGHTS_NOT_100"
  | "NO_CRITERIA"
  | "GROUP_WITHOUT_EVALUATORS"
  | "GROUP_WITHOUT_SCORECARD"
  | "SCORE_OUT_OF_RANGE"
  | "SCORE_NOT_INTEGER"
  | "UNKNOWN_CRITERION"
  | "MIN_SUBMISSIONS_NOT_MET"
  | "MIN_EVALUATORS_NOT_MET"
  | "NO_CONTRIBUTING_GROUPS"
  | "DUPLICATE_SUBMISSION"
  | "INVALID_CONFIG";

export class ScoringError extends Error {
  constructor(
    public readonly code: ScoringErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ScoringError";
  }
}
