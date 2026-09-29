import Decimal from "decimal.js";
import type { PerformanceResult, RankingEntry, TieBreaker } from "./types";

interface Resolution {
  /** <0 a before b, >0 b before a, 0 unresolved (needs MANUAL or chain exhausted). */
  order: number;
  trail: string[];
}

/**
 * Orders performance results and resolves ties with the configured tie-breaker chain.
 * A tie that reaches MANUAL (or exhausts the chain) is left marked `unresolvedTie` and
 * keeps a deterministic order (band name) so the UI can show it and request a decision.
 */
export function rankResults(results: PerformanceResult[], tieBreakers: TieBreaker[]): RankingEntry[] {
  const sorted = [...results].sort((a, b) => {
    const r = resolve(a, b, tieBreakers);
    return r.order !== 0 ? r.order : a.bandName.localeCompare(b.bandName);
  });

  const entries: RankingEntry[] = sorted.map((r) => ({
    performanceId: r.performanceId,
    bandId: r.bandId,
    bandName: r.bandName,
    finalScore: r.finalScore,
    position: 0,
    tieBreakTrail: [],
    unresolvedTie: false,
  }));

  let position = 0;
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if (!prev) {
      position = 1;
      entries[i].position = position;
      continue;
    }
    const res = resolve(prev, sorted[i], tieBreakers);
    const sameFinal = new Decimal(prev.finalScore).eq(new Decimal(sorted[i].finalScore));
    if (res.order === 0) {
      // Exact unresolved tie: share position.
      entries[i].position = position;
      entries[i - 1].unresolvedTie = true;
      entries[i].unresolvedTie = true;
    } else {
      position = i + 1;
      entries[i].position = position;
      if (sameFinal) {
        // Tie on final score resolved by the chain; record how on both sides.
        entries[i - 1].tieBreakTrail = mergeTrail(entries[i - 1].tieBreakTrail, res.trail);
        entries[i].tieBreakTrail = mergeTrail(entries[i].tieBreakTrail, res.trail);
      }
    }
  }
  return entries;
}

function mergeTrail(existing: string[], add: string[]): string[] {
  return [...existing, ...add.filter((t) => !existing.includes(t))];
}

function resolve(a: PerformanceResult, b: PerformanceResult, tieBreakers: TieBreaker[]): Resolution {
  const byFinal = new Decimal(b.finalScore).cmp(new Decimal(a.finalScore));
  if (byFinal !== 0) return { order: byFinal, trail: [] };

  for (const tb of tieBreakers) {
    const cmp = applyTieBreaker(tb, a, b);
    if (cmp === null) return { order: 0, trail: [] };
    if (cmp !== 0) return { order: cmp, trail: [describe(tb)] };
  }
  return { order: 0, trail: [] };
}

function applyTieBreaker(tb: TieBreaker, a: PerformanceResult, b: PerformanceResult): number | null {
  switch (tb.kind) {
    case "JUDGE_SCORE":
      return cmpGroup("JUDGE", a, b);
    case "PUBLIC_SCORE":
      return cmpGroup("PUBLIC", a, b);
    case "STAFF_SCORE":
      return cmpGroup("STAFF", a, b);
    case "CRITERION":
      return criterionMean(b, tb.criterionKey).cmp(criterionMean(a, tb.criterionKey));
    case "OVERTIME":
      return a.overtimeSeconds - b.overtimeSeconds;
    case "MANUAL":
      return null;
  }
}

function cmpGroup(kind: string, a: PerformanceResult, b: PerformanceResult): number {
  const ga = a.groups.find((g) => g.kind === kind)?.score;
  const gb = b.groups.find((g) => g.kind === kind)?.score;
  if (ga == null && gb == null) return 0;
  if (ga == null) return 1;
  if (gb == null) return -1;
  return new Decimal(gb).cmp(new Decimal(ga));
}

/** Count-weighted mean of a criterion across all groups. */
function criterionMean(r: PerformanceResult, key: string): Decimal {
  let num = new Decimal(0);
  let den = 0;
  for (const g of r.groups) {
    const c = g.criteria.find((x) => x.key === key);
    if (!c || c.count === 0) continue;
    num = num.plus(new Decimal(c.mean).times(c.count));
    den += c.count;
  }
  return den === 0 ? new Decimal(0) : num.div(den);
}

function describe(tb: TieBreaker): string {
  return tb.kind === "CRITERION" ? `CRITERION:${tb.criterionKey}` : tb.kind;
}

/** Marks the top `qualifiersCount` as QUALIFIED unless an unresolved tie straddles the cut line. */
export function qualify(
  ranking: RankingEntry[],
  qualifiersCount: number,
): { performanceId: string; status: "QUALIFIED" | "ELIMINATED" | "PENDING" }[] {
  return ranking.map((e) => {
    if (e.unresolvedTie) {
      const samePos = ranking.filter((x) => x.position === e.position);
      const straddles = e.position <= qualifiersCount && e.position + samePos.length - 1 > qualifiersCount;
      if (straddles) return { performanceId: e.performanceId, status: "PENDING" };
    }
    return { performanceId: e.performanceId, status: e.position <= qualifiersCount ? "QUALIFIED" : "ELIMINATED" };
  });
}
