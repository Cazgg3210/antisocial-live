import Decimal from "decimal.js";
import { ScoringError } from "./errors";
import type {
  CalculateInput,
  CriterionStat,
  EngineConfig,
  EngineCriterion,
  EngineGroup,
  EngineScorecard,
  EngineSubmission,
  GroupResult,
  PerformanceResult,
} from "./types";
import { assertValidConfig, BP_100 } from "./validate";

export const ENGINE_VERSION = "1.0.0";

// All intermediate math runs at 20 significant digits; rounding happens once at the end.
const D = Decimal.clone({ precision: 20, rounding: Decimal.ROUND_HALF_UP });
type Dec = InstanceType<typeof D>;
const dec = (v: number | string | Dec) => new D(v);

interface ScoredSubmission {
  id: string;
  actorId: string;
  score: Dec;
  weight: Dec;
  criterionValues: Map<string, number>;
}

/**
 * Computes the official result of one performance. Deterministic: the same input always
 * produces the same output (submissions are sorted by id, no randomness, no clock).
 */
export function calculatePerformance(input: CalculateInput): PerformanceResult {
  const { config, performance } = input;
  assertValidConfig(config);

  const policies: string[] = [];
  const own = input.roundSubmissions
    .filter((s) => s.performanceId === performance.performanceId)
    .sort((a, b) => a.id.localeCompare(b.id));
  assertNoDuplicates(own);

  const groupResults: GroupResult[] = [];
  for (const group of config.groups) {
    const scorecard = mustScorecard(config, group);
    groupResults.push(computeGroup(group, scorecard, own, input, policies));
  }

  const { finalRaw, applied } = combineGroups(groupResults, policies);
  for (const g of groupResults) g.appliedWeightBp = applied.get(g.kind) ?? 0;

  const scale = scaleOf(config);
  let final = finalRaw;
  const overtime = performance.overtimeSeconds ?? 0;
  if (config.overtimePolicy === "PENALTY" && overtime > 0 && config.overtimePenaltyBp > 0) {
    final = final.minus(final.times(config.overtimePenaltyBp).div(BP_100));
    if (final.lt(scale.min)) final = dec(scale.min);
    policies.push(`OVERTIME_PENALTY(${config.overtimePenaltyBp}bp)`);
  }

  const rounded = roundTo(final, config);
  const accepted = own.filter((s) => s.status === "ACCEPTED").length;
  const rejected = own.filter((s) => s.status === "REJECTED").length;
  const flagged = own.filter((s) => s.status === "FLAGGED_FOR_REVIEW").length;

  return {
    engineVersion: ENGINE_VERSION,
    performanceId: performance.performanceId,
    bandId: performance.bandId,
    bandName: performance.bandName,
    groups: groupResults,
    finalScore: rounded.toFixed(config.decimalPrecision),
    rawScore: final.toString(),
    scaleMin: scale.min,
    scaleMax: scale.max,
    acceptedVotes: accepted,
    rejectedVotes: rejected,
    flaggedVotes: flagged,
    policiesApplied: policies,
    overtimeSeconds: overtime,
    formula: buildFormula(groupResults),
  };
}

// ───────────────────────── group computation ─────────────────────────

function computeGroup(
  group: EngineGroup,
  scorecard: EngineScorecard,
  own: EngineSubmission[],
  input: CalculateInput,
  policies: string[],
): GroupResult {
  const { config, performance } = input;
  const notes: string[] = [];
  const all = own.filter((s) => s.group === group.kind);
  const accepted = all.filter((s) => s.status === "ACCEPTED");
  const base: GroupResult = {
    kind: group.kind,
    configuredWeightBp: group.weightBp,
    appliedWeightBp: group.weightBp,
    score: null,
    acceptedCount: accepted.length,
    flaggedCount: all.filter((s) => s.status === "FLAGGED_FOR_REVIEW").length,
    rejectedCount: all.filter((s) => s.status === "REJECTED").length,
    criteria: [],
    notes,
  };

  let scored = accepted.map((s) => scoreSubmission(s, scorecard));
  base.criteria = criterionStats(scored, scorecard);

  if (group.kind === "PUBLIC") {
    scored = applyPublicPolicies(scored, group, scorecard, input, notes, policies);
    if (scored.length < group.minSubmissions) {
      return handleMinNotMet(group, base, scored.length, notes, policies);
    }
    base.score = aggregate(scored, group).toString();
    if (config.bayesianPriorVotes > 0) {
      base.score = bayesianShrink(dec(base.score), scored.length, config, input, scorecard, group).toString();
      policies.push(`BAYESIAN_SHRINKAGE(M=${config.bayesianPriorVotes})`);
    }
    return base;
  }

  // JUDGE / STAFF
  const evaluators = group.evaluators ?? [];
  const excused = evaluators.filter((e) => e.conflictBandIds?.includes(performance.bandId)).map((e) => e.assignmentId);
  const expected = evaluators.filter((e) => !excused.includes(e.assignmentId));
  const presentIds = new Set(scored.map((s) => s.actorId));
  const present = expected.filter((e) => presentIds.has(e.assignmentId));
  const absent = expected.filter((e) => !presentIds.has(e.assignmentId));
  base.evaluatorsPresent = present.map((e) => e.assignmentId);
  base.evaluatorsAbsent = absent.map((e) => e.assignmentId);
  base.evaluatorsExcused = excused;
  if (excused.length) policies.push(`CONFLICT_EXCUSED(${group.kind}:${excused.length})`);

  // Individual weights among present evaluators.
  const weightOf = new Map(expected.map((e) => [e.assignmentId, dec(e.individualWeightBp)]));
  scored = scored
    .filter((s) => weightOf.has(s.actorId))
    .map((s) => ({ ...s, weight: weightOf.get(s.actorId)! }));

  if (config.judgeNormalization === "Z_SCORE_PER_JUDGE" && group.kind === "JUDGE") {
    scored = zScoreNormalize(scored, group, scorecard, input, notes);
    policies.push("JUDGE_NORMALIZATION(Z_SCORE)");
  }

  if (absent.length > 0) {
    switch (group.missingEvaluatorPolicy) {
      case "REDISTRIBUTE":
        notes.push(`${absent.length} evaluator(s) absent; weight redistributed among present.`);
        policies.push(`MISSING_EVALUATOR(${group.kind}:REDISTRIBUTE)`);
        break;
      case "REQUIRE_MIN":
        if (present.length < group.requiredEvaluatorCount) {
          throw new ScoringError(
            "MIN_EVALUATORS_NOT_MET",
            `Group ${group.kind} requires ${group.requiredEvaluatorCount} evaluators; ${present.length} submitted.`,
            { group: group.kind, present: present.length, required: group.requiredEvaluatorCount },
          );
        }
        break;
      case "ZERO_WEIGHT":
        if (present.length < group.requiredEvaluatorCount) {
          notes.push(`Below required evaluators; group weight set to zero.`);
          policies.push(`MISSING_EVALUATOR(${group.kind}:ZERO_WEIGHT)`);
          base.appliedWeightBp = 0;
          return base;
        }
    }
  }
  if (scored.length === 0 || scored.length < group.minSubmissions) {
    return handleMinNotMet(group, base, scored.length, notes, policies);
  }
  base.score = aggregate(scored, group).toString();
  return base;
}

function handleMinNotMet(
  group: EngineGroup,
  base: GroupResult,
  count: number,
  notes: string[],
  policies: string[],
): GroupResult {
  switch (group.minVotesPolicy) {
    case "BLOCK":
      throw new ScoringError(
        "MIN_SUBMISSIONS_NOT_MET",
        `Group ${group.kind} has ${count} accepted submissions; minimum is ${group.minSubmissions}.`,
        { group: group.kind, count, minimum: group.minSubmissions },
      );
    case "REDISTRIBUTE":
    case "ZERO_WEIGHT":
      notes.push(`Minimum submissions not met (${count} < ${group.minSubmissions}); group excluded.`);
      policies.push(`MIN_VOTES(${group.kind}:${group.minVotesPolicy})`);
      base.appliedWeightBp = 0;
      base.score = null;
      return base;
  }
}

// ───────────────────────── per-submission score ─────────────────────────

function scoreSubmission(sub: EngineSubmission, scorecard: EngineScorecard): ScoredSubmission {
  const byId = new Map(scorecard.criteria.map((c) => [c.id, c]));
  const values = new Map<string, number>();
  let weighted = dec(0);
  let weightSum = dec(0);
  for (const item of sub.items) {
    const c = byId.get(item.criterionId);
    if (!c) throw new ScoringError("UNKNOWN_CRITERION", `Unknown criterion ${item.criterionId}`, { submission: sub.id });
    if (!Number.isInteger(item.value)) {
      throw new ScoringError("SCORE_NOT_INTEGER", `Score for "${c.key}" must be an integer.`, { submission: sub.id });
    }
    if (item.value < c.scaleMin || item.value > c.scaleMax) {
      throw new ScoringError("SCORE_OUT_OF_RANGE", `Score ${item.value} for "${c.key}" is outside ${c.scaleMin}-${c.scaleMax}.`, {
        submission: sub.id,
        criterion: c.key,
      });
    }
    values.set(c.id, item.value);
    if (!c.countsTowardScore) continue;
    if (sub.scorecardVariant === "QUICK" && !c.includedInQuick) continue;
    weighted = weighted.plus(dec(item.value).times(c.weightBp));
    weightSum = weightSum.plus(c.weightBp);
  }
  if (weightSum.isZero()) {
    throw new ScoringError("NO_CRITERIA", `Submission ${sub.id} has no scoring criteria.`, { submission: sub.id });
  }
  // Weights are re-normalized over the criteria actually answered (QUICK variant).
  return { id: sub.id, actorId: sub.actorId, score: weighted.div(weightSum), weight: dec(1), criterionValues: values };
}

function criterionStats(scored: ScoredSubmission[], scorecard: EngineScorecard): CriterionStat[] {
  return scorecard.criteria.map((c) => {
    const vals = scored.map((s) => s.criterionValues.get(c.id)).filter((v): v is number => v !== undefined);
    const mean = vals.length ? vals.reduce((a, b) => a.plus(b), dec(0)).div(vals.length) : dec(0);
    return { criterionId: c.id, key: c.key, mean: mean.toDecimalPlaces(4).toString(), count: vals.length };
  });
}

// ───────────────────────── public fairness policies ─────────────────────────

function applyPublicPolicies(
  scored: ScoredSubmission[],
  group: EngineGroup,
  scorecard: EngineScorecard,
  input: CalculateInput,
  notes: string[],
  policies: string[],
): ScoredSubmission[] {
  const { config } = input;
  let out = scored;
  const roundByActor = actorRoundScores(input, group, scorecard);

  if (config.voterNormalization === "Z_SCORE_PER_VOTER") {
    out = zScoreNormalize(out, group, scorecard, input, notes);
    policies.push("VOTER_NORMALIZATION(Z_SCORE)");
  }
  if (config.multiBandVoterBoostBp > BP_100) {
    let boosted = 0;
    out = out.map((s) => {
      const count = roundByActor.get(s.actorId)?.length ?? 1;
      if (count >= config.multiBandVoterMin) {
        boosted++;
        return { ...s, weight: dec(config.multiBandVoterBoostBp).div(BP_100) };
      }
      return s;
    });
    if (boosted) notes.push(`${boosted} multi-band voter(s) boosted.`);
    policies.push(`MULTI_BAND_VOTER_BOOST(${config.multiBandVoterBoostBp}bp,min=${config.multiBandVoterMin})`);
  }
  return out;
}

/** Map actorId -> all their ACCEPTED scores across the round (for normalization/boost). */
function actorRoundScores(input: CalculateInput, group: EngineGroup, scorecard: EngineScorecard): Map<string, Dec[]> {
  const map = new Map<string, Dec[]>();
  for (const s of input.roundSubmissions) {
    if (s.group !== group.kind || s.status !== "ACCEPTED") continue;
    const scoreVal = scoreSubmission(s, scorecard).score;
    const list = map.get(s.actorId) ?? [];
    list.push(scoreVal);
    map.set(s.actorId, list);
  }
  return map;
}

/**
 * Z-score normalization per actor, mapped back onto the group's scale using the group's
 * global mean/stdev across the round. Only applies to actors with >= 2 scored bands; others are untouched.
 */
function zScoreNormalize(
  scored: ScoredSubmission[],
  group: EngineGroup,
  scorecard: EngineScorecard,
  input: CalculateInput,
  notes: string[],
): ScoredSubmission[] {
  const byActor = actorRoundScores(input, group, scorecard);
  const allScores = [...byActor.values()].flat();
  if (allScores.length < 2) return scored;
  const globalMean = mean(allScores);
  const globalSd = stdev(allScores, globalMean);
  let normalized = 0;
  const out = scored.map((s) => {
    const mine = byActor.get(s.actorId) ?? [];
    if (mine.length < 2) return s;
    const m = mean(mine);
    const sd = stdev(mine, m);
    if (sd.isZero() || globalSd.isZero()) return s;
    const z = s.score.minus(m).div(sd);
    let mapped = globalMean.plus(z.times(globalSd));
    const scale = scaleOf(input.config);
    if (mapped.lt(scale.min)) mapped = dec(scale.min);
    if (mapped.gt(scale.max)) mapped = dec(scale.max);
    normalized++;
    return { ...s, score: mapped };
  });
  if (normalized) notes.push(`${normalized} submission(s) normalized by actor.`);
  return out;
}

function bayesianShrink(
  score: Dec,
  n: number,
  config: EngineConfig,
  input: CalculateInput,
  scorecard: EngineScorecard,
  group: EngineGroup,
): Dec {
  const all = [...actorRoundScores(input, group, scorecard).values()].flat();
  const prior = all.length ? mean(all) : dec(scaleOf(config).min + scaleOf(config).max).div(2);
  const m = dec(config.bayesianPriorVotes);
  return score.times(n).plus(prior.times(m)).div(m.plus(n));
}

// ───────────────────────── aggregation ─────────────────────────

function aggregate(scored: ScoredSubmission[], group: EngineGroup): Dec {
  const sorted = [...scored].sort((a, b) => a.score.cmp(b.score) || a.id.localeCompare(b.id));
  switch (group.aggregation) {
    case "MEAN":
      return weightedMean(sorted);
    case "MEDIAN":
      return median(sorted.map((s) => s.score));
    case "TRIMMED_MEAN": {
      // Trim floor(n * p) from each end; with n < 3 nothing is trimmed (documented policy).
      const n = sorted.length;
      const k = Math.floor((n * group.trimPercentBp) / BP_100);
      const kept = n >= 3 && k > 0 ? sorted.slice(k, n - k) : sorted;
      return weightedMean(kept);
    }
  }
}

function weightedMean(items: ScoredSubmission[]): Dec {
  let num = dec(0);
  let den = dec(0);
  for (const s of items) {
    num = num.plus(s.score.times(s.weight));
    den = den.plus(s.weight);
  }
  return den.isZero() ? dec(0) : num.div(den);
}

function median(values: Dec[]): Dec {
  const n = values.length;
  if (n === 0) return dec(0);
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? values[mid] : values[mid - 1].plus(values[mid]).div(2);
}

function mean(values: Dec[]): Dec {
  return values.reduce((a, b) => a.plus(b), dec(0)).div(values.length);
}

function stdev(values: Dec[], m: Dec): Dec {
  if (values.length < 2) return dec(0);
  const variance = values.reduce((acc, v) => acc.plus(v.minus(m).pow(2)), dec(0)).div(values.length);
  return variance.sqrt();
}

// ───────────────────────── combination ─────────────────────────

function combineGroups(groups: GroupResult[], policies: string[]): { finalRaw: Dec; applied: Map<string, number> } {
  const contributing = groups.filter((g) => g.score !== null && g.appliedWeightBp > 0);
  if (contributing.length === 0) {
    throw new ScoringError("NO_CONTRIBUTING_GROUPS", "No group produced a score; result cannot be calculated.");
  }
  const total = contributing.reduce((s, g) => s + g.configuredWeightBp, 0);
  const applied = new Map<string, number>();
  if (total !== BP_100) policies.push("GROUP_WEIGHT_REDISTRIBUTION");
  let num = dec(0);
  for (const g of contributing) {
    // Redistribute proportionally so applied weights always sum to exactly 100%.
    const w = dec(g.configuredWeightBp).times(BP_100).div(total);
    applied.set(g.kind, Number(w.toDecimalPlaces(4).toString()));
    num = num.plus(dec(g.score!).times(w));
  }
  return { finalRaw: num.div(BP_100), applied };
}

function buildFormula(groups: GroupResult[]): string {
  const parts = groups
    .filter((g) => g.score !== null && g.appliedWeightBp > 0)
    .map((g) => `${g.kind}(${dec(g.score!).toDecimalPlaces(4)}) × ${(g.appliedWeightBp / 100).toFixed(2)}%`);
  return parts.join(" + ");
}

// ───────────────────────── helpers ─────────────────────────

function roundTo(value: Dec, config: EngineConfig): Dec {
  const mode = config.roundingMode === "HALF_EVEN" ? Decimal.ROUND_HALF_EVEN : Decimal.ROUND_HALF_UP;
  return value.toDecimalPlaces(config.decimalPrecision, mode);
}

function scaleOf(config: EngineConfig): { min: number; max: number } {
  const all = config.scorecards.flatMap((s) => s.criteria.filter((c) => c.countsTowardScore));
  const min = Math.min(...all.map((c) => c.scaleMin));
  const max = Math.max(...all.map((c) => c.scaleMax));
  return { min, max };
}

function mustScorecard(config: EngineConfig, group: EngineGroup): EngineScorecard {
  const sc = config.scorecards.find((s) => s.id === group.scorecardId);
  if (!sc) throw new ScoringError("GROUP_WITHOUT_SCORECARD", `Group ${group.kind} has no scorecard.`);
  return sc;
}

function assertNoDuplicates(subs: EngineSubmission[]): void {
  const seen = new Set<string>();
  for (const s of subs) {
    if (s.status !== "ACCEPTED") continue;
    const key = `${s.group}:${s.actorId}`;
    if (seen.has(key)) throw new ScoringError("DUPLICATE_SUBMISSION", `Duplicate accepted submission for ${key}.`);
    seen.add(key);
  }
}

export const _internal = { median, weightedMean, mean, stdev };
export type { EngineCriterion };
