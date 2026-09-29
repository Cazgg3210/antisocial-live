import { ScoringError } from "./errors";
import type { EngineConfig, EngineGroup, EngineScorecard } from "./types";

export const BP_100 = 10000;

/**
 * Validates a configuration before voting can open. Throws the first blocking error;
 * `collectConfigIssues` returns all of them for the admin UI.
 */
export function assertValidConfig(config: EngineConfig): void {
  const issues = collectConfigIssues(config);
  if (issues.length > 0) throw issues[0];
}

export function collectConfigIssues(config: EngineConfig): ScoringError[] {
  const issues: ScoringError[] = [];

  if (config.groups.length === 0) {
    issues.push(new ScoringError("INVALID_CONFIG", "No voting groups configured."));
    return issues;
  }

  const groupTotal = config.groups.reduce((sum, g) => sum + g.weightBp, 0);
  if (groupTotal !== BP_100) {
    issues.push(
      new ScoringError("WEIGHTS_NOT_100", `Group weights sum to ${groupTotal / 100}%. They must sum to 100%.`, {
        totalBp: groupTotal,
      }),
    );
  }

  for (const group of config.groups) {
    const scorecard = config.scorecards.find((s) => s.id === group.scorecardId);
    if (!scorecard) {
      issues.push(
        new ScoringError("GROUP_WITHOUT_SCORECARD", `Group ${group.kind} has no scorecard.`, { group: group.kind }),
      );
      continue;
    }
    issues.push(...scorecardIssues(scorecard, group));
    if (group.kind !== "PUBLIC" && (!group.evaluators || group.evaluators.length === 0)) {
      issues.push(
        new ScoringError("GROUP_WITHOUT_EVALUATORS", `Group ${group.kind} has no evaluators assigned.`, {
          group: group.kind,
        }),
      );
    }
  }

  if (config.decimalPrecision < 0 || config.decimalPrecision > 6) {
    issues.push(new ScoringError("INVALID_CONFIG", "decimalPrecision must be between 0 and 6."));
  }
  if (config.multiBandVoterBoostBp < BP_100) {
    issues.push(new ScoringError("INVALID_CONFIG", "multiBandVoterBoostBp must be >= 10000 (1.0x)."));
  }
  return issues;
}

function scorecardIssues(scorecard: EngineScorecard, group: EngineGroup): ScoringError[] {
  const issues: ScoringError[] = [];
  const scoring = scorecard.criteria.filter((c) => c.countsTowardScore);
  if (scoring.length === 0) {
    issues.push(
      new ScoringError("NO_CRITERIA", `Scorecard for ${group.kind} has no criteria that count toward the score.`, {
        group: group.kind,
      }),
    );
    return issues;
  }
  for (const c of scoring) {
    if (c.weightBp <= 0) {
      issues.push(
        new ScoringError("CRITERION_WITHOUT_WEIGHT", `Criterion "${c.key}" has no weight.`, {
          group: group.kind,
          criterion: c.key,
        }),
      );
    }
    if (c.scaleMin >= c.scaleMax) {
      issues.push(new ScoringError("INVALID_CONFIG", `Criterion "${c.key}" has an invalid scale.`));
    }
  }
  const total = scoring.reduce((s, c) => s + c.weightBp, 0);
  if (total !== BP_100) {
    issues.push(
      new ScoringError(
        "CRITERIA_WEIGHTS_NOT_100",
        `Criteria weights for ${group.kind} sum to ${total / 100}%. They must sum to 100%.`,
        { group: group.kind, totalBp: total },
      ),
    );
  }
  return issues;
}
