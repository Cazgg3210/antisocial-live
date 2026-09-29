import { describe, expect, it } from "vitest";
import { calculatePerformance, qualify, rankResults, type PerformanceResult } from "@/modules/scoring-engine";
import { baseConfig, PERF_A, PERF_B, sub } from "./fixtures";

function result(perf: typeof PERF_A, pub: number, judge: number, staff = 7): PerformanceResult {
  const subs = [
    sub(perf.performanceId, "PUBLIC", "v1", pub),
    sub(perf.performanceId, "STAFF", "s1", staff),
    sub(perf.performanceId, "JUDGE", "j1", judge),
  ];
  return calculatePerformance({ config: baseConfig(), performance: perf, roundSubmissions: subs });
}

describe("ranking", () => {
  it("orders by final score descending", () => {
    const r = rankResults([result(PERF_A, 7, 7), result(PERF_B, 9, 9)], baseConfig().tieBreakers);
    expect(r.map((e) => [e.bandName, e.position])).toEqual([
      ["Beta", 1],
      ["Alpha", 2],
    ]);
  });

  it("breaks a tie by judge score and records the trail", () => {
    // Same final: A pub 9 judge 7 → 3.6+1.4+2.8 = 7.8; B pub 7 judge 9 → 2.8+1.4+3.6 = 7.8
    const r = rankResults([result(PERF_A, 9, 7), result(PERF_B, 7, 9)], baseConfig().tieBreakers);
    expect(r[0].bandName).toBe("Beta");
    expect(r[0].tieBreakTrail).toEqual(["JUDGE_SCORE"]);
    expect(r[0].unresolvedTie).toBe(false);
  });

  it("falls through to a criterion tie-breaker", () => {
    const subsA = [sub("pA", "PUBLIC", "v1", [8, 8, 8, 9, 8, 8, 8]), sub("pA", "STAFF", "s1", 8), sub("pA", "JUDGE", "j1", 8)];
    const subsB = [sub("pB", "PUBLIC", "v1", [8, 9, 8, 8, 8, 8, 8]), sub("pB", "STAFF", "s1", 8), sub("pB", "JUDGE", "j1", 8)];
    const cfg = baseConfig();
    // weights of 'presencia' and 'conexion' are equal (15%) so final ties exactly
    const ra = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subsA });
    const rb = calculatePerformance({ config: cfg, performance: PERF_B, roundSubmissions: subsB });
    expect(ra.finalScore).toBe(rb.finalScore);
    const r = rankResults([rb, ra], cfg.tieBreakers);
    expect(r[0].bandName).toBe("Alpha");
    expect(r[0].tieBreakTrail).toEqual(["CRITERION:conexion"]);
  });

  it("leaves an exact tie unresolved when only MANUAL remains", () => {
    const r = rankResults([result(PERF_A, 8, 8), result(PERF_B, 8, 8)], baseConfig().tieBreakers);
    expect(r.every((e) => e.unresolvedTie)).toBe(true);
    expect(r.map((e) => e.position)).toEqual([1, 1]);
  });

  it("qualification marks straddling ties as PENDING", () => {
    const ranking = rankResults([result(PERF_A, 8, 8), result(PERF_B, 8, 8)], baseConfig().tieBreakers);
    expect(qualify(ranking, 1).map((q) => q.status)).toEqual(["PENDING", "PENDING"]);
    expect(qualify(ranking, 2).map((q) => q.status)).toEqual(["QUALIFIED", "QUALIFIED"]);
  });

  it("qualifies top N", () => {
    const ranking = rankResults([result(PERF_A, 7, 7), result(PERF_B, 9, 9)], baseConfig().tieBreakers);
    expect(qualify(ranking, 1)).toEqual([
      { performanceId: "pB", status: "QUALIFIED" },
      { performanceId: "pA", status: "ELIMINATED" },
    ]);
  });
});
