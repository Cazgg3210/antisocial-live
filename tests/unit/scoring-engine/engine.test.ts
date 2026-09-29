import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { calculatePerformance, collectConfigIssues, ScoringError } from "@/modules/scoring-engine";
import { baseConfig, CRITERIA, PERF_A, sub } from "./fixtures";

function fullNight(perf = PERF_A) {
  return [
    sub(perf.performanceId, "PUBLIC", "v1", 8),
    sub(perf.performanceId, "PUBLIC", "v2", 9),
    sub(perf.performanceId, "PUBLIC", "v3", 7),
    sub(perf.performanceId, "STAFF", "s1", 8),
    sub(perf.performanceId, "STAFF", "s2", 6),
    sub(perf.performanceId, "JUDGE", "j1", 9),
    sub(perf.performanceId, "JUDGE", "j2", 8),
    sub(perf.performanceId, "JUDGE", "j3", 7),
  ];
}

describe("configuration validation", () => {
  it("accepts weights summing to 100", () => {
    expect(collectConfigIssues(baseConfig())).toEqual([]);
  });

  it("rejects group weights summing to 80", () => {
    const cfg = baseConfig();
    cfg.groups[0].weightBp = 2000;
    const issues = collectConfigIssues(cfg);
    expect(issues.map((i) => i.code)).toContain("WEIGHTS_NOT_100");
    expect(issues[0].message).toContain("80%");
  });

  it("rejects a criterion without weight and criteria not summing to 100", () => {
    const cfg = baseConfig();
    cfg.scorecards[0].criteria = CRITERIA.map((c) => (c.key === "global" ? { ...c, weightBp: 0 } : c));
    const codes = collectConfigIssues(cfg).map((i) => i.code);
    expect(codes).toContain("CRITERION_WITHOUT_WEIGHT");
    expect(codes).toContain("CRITERIA_WEIGHTS_NOT_100");
  });

  it("rejects a judge group without evaluators", () => {
    const cfg = baseConfig();
    cfg.groups[2].evaluators = [];
    expect(collectConfigIssues(cfg).map((i) => i.code)).toContain("GROUP_WITHOUT_EVALUATORS");
  });
});

describe("score validation", () => {
  it("rejects score 11 on a 1-10 scale", () => {
    const subs = fullNight();
    subs[0].items[0].value = 11;
    expect(() => calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: subs })).toThrowError(
      expect.objectContaining({ code: "SCORE_OUT_OF_RANGE" }),
    );
  });

  it("rejects score 0 on a 1-10 scale", () => {
    const subs = fullNight();
    subs[5].items[2].value = 0;
    expect(() => calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: subs })).toThrow(ScoringError);
  });

  it("rejects non-integer scores", () => {
    const subs = fullNight();
    subs[0].items[0].value = 7.5;
    expect(() => calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: subs })).toThrowError(
      expect.objectContaining({ code: "SCORE_NOT_INTEGER" }),
    );
  });

  it("rejects duplicate accepted submissions from the same actor", () => {
    const subs = [...fullNight(), sub("pA", "PUBLIC", "v1", 10)];
    expect(() => calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: subs })).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_SUBMISSION" }),
    );
  });
});

describe("basic arithmetic", () => {
  it("computes weighted group combination exactly", () => {
    const r = calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: fullNight() });
    // PUBLIC mean 8, STAFF mean 7, JUDGE mean 8 → 8*.4 + 7*.2 + 8*.4 = 7.8
    expect(r.groups.map((g) => [g.kind, g.score])).toEqual([
      ["PUBLIC", "8"],
      ["STAFF", "7"],
      ["JUDGE", "8"],
    ]);
    expect(r.finalScore).toBe("7.80");
    expect(r.acceptedVotes).toBe(8);
    expect(r.formula).toContain("PUBLIC(8) × 40.00%");
  });

  it("weights criteria within a submission", () => {
    // Only 'calidad' (20%) = 10, rest = 5 → 10*.2 + 5*.8 = 6
    const subs = [
      sub("pA", "PUBLIC", "v1", [10, 5, 5, 5, 5, 5, 5]),
      sub("pA", "STAFF", "s1", [10, 5, 5, 5, 5, 5, 5]),
      sub("pA", "JUDGE", "j1", [10, 5, 5, 5, 5, 5, 5]),
      sub("pA", "JUDGE", "j2", [10, 5, 5, 5, 5, 5, 5]),
    ];
    const r = calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: subs });
    expect(r.finalScore).toBe("6.00");
  });

  it("does not round intermediate values", () => {
    const cfg = baseConfig({ decimalPrecision: 2 });
    const subs = [
      sub("pA", "PUBLIC", "v1", 7),
      sub("pA", "PUBLIC", "v2", 8),
      sub("pA", "PUBLIC", "v3", 8),
      sub("pA", "STAFF", "s1", 7),
      sub("pA", "JUDGE", "j1", 7),
      sub("pA", "JUDGE", "j2", 8),
    ];
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
    // PUBLIC 7.6667, STAFF 7, JUDGE 7.5 → 3.06667 + 1.4 + 3 = 7.46667 → 7.47
    expect(r.finalScore).toBe("7.47");
    expect(r.rawScore.startsWith("7.4666")).toBe(true);
  });

  it("supports HALF_EVEN rounding", () => {
    const cfg = baseConfig({ decimalPrecision: 0, roundingMode: "HALF_EVEN" });
    cfg.groups = [{ ...cfg.groups[0], weightBp: 10000 }];
    const subs = [sub("pA", "PUBLIC", "v1", 8), sub("pA", "PUBLIC", "v2", 9)];
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
    expect(r.finalScore).toBe("8"); // 8.5 → 8 (even)
  });
});

describe("variants and global criterion", () => {
  it("QUICK variant re-normalizes over answered criteria", () => {
    const cfg = baseConfig();
    cfg.groups = [{ ...cfg.groups[0], weightBp: 10000 }];
    const subs = [sub("pA", "PUBLIC", "v1", 9, { variant: "QUICK" })];
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
    expect(r.finalScore).toBe("9.00");
  });

  it("global criterion as statistic only does not affect the score", () => {
    const cfg = baseConfig();
    cfg.groups = [{ ...cfg.groups[0], weightBp: 10000 }];
    cfg.scorecards[0].criteria = CRITERIA.map((c) =>
      c.key === "global" ? { ...c, countsTowardScore: false, weightBp: 0 } : { ...c, weightBp: c.key === "calidad" ? 4000 : c.weightBp },
    );
    const subs = [sub("pA", "PUBLIC", "v1", [8, 8, 8, 8, 8, 8, 1])];
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
    expect(r.finalScore).toBe("8.00");
    expect(r.groups[0].criteria.find((c) => c.key === "global")?.mean).toBe("1");
  });
});

describe("policies", () => {
  it("excludes flagged and rejected votes from computation but counts them", () => {
    const subs = [...fullNight(), sub("pA", "PUBLIC", "v9", 1, { status: "FLAGGED_FOR_REVIEW" }), sub("pA", "PUBLIC", "v8", 1, { status: "REJECTED" })];
    const r = calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: subs });
    expect(r.finalScore).toBe("7.80");
    expect(r.flaggedVotes).toBe(1);
    expect(r.rejectedVotes).toBe(1);
  });

  it("BLOCK when public minimum is not met", () => {
    const cfg = baseConfig();
    cfg.groups[0].minSubmissions = 10;
    expect(() => calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: fullNight() })).toThrowError(
      expect.objectContaining({ code: "MIN_SUBMISSIONS_NOT_MET" }),
    );
  });

  it("REDISTRIBUTE public weight when minimum not met keeps applied weights at 100", () => {
    const cfg = baseConfig();
    cfg.groups[0].minSubmissions = 10;
    cfg.groups[0].minVotesPolicy = "REDISTRIBUTE";
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: fullNight() });
    const applied = r.groups.map((g) => g.appliedWeightBp);
    expect(applied[0]).toBe(0);
    expect(applied[1] + applied[2]).toBeCloseTo(10000, 3);
    // STAFF 7 * 1/3 + JUDGE 8 * 2/3 = 7.6667
    expect(r.finalScore).toBe("7.67");
    expect(r.policiesApplied).toContain("GROUP_WEIGHT_REDISTRIBUTION");
  });

  it("absent judge with REDISTRIBUTE averages present judges and records the absence", () => {
    const subs = fullNight().filter((s) => s.actorId !== "j3");
    const r = calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: subs });
    const judge = r.groups.find((g) => g.kind === "JUDGE")!;
    expect(judge.score).toBe("8.5");
    expect(judge.evaluatorsAbsent).toEqual(["j3"]);
    expect(r.policiesApplied).toContain("MISSING_EVALUATOR(JUDGE:REDISTRIBUTE)");
  });

  it("absent judge with REQUIRE_MIN blocks when below required count", () => {
    const cfg = baseConfig();
    cfg.groups[2].missingEvaluatorPolicy = "REQUIRE_MIN";
    cfg.groups[2].requiredEvaluatorCount = 3;
    const subs = fullNight().filter((s) => s.actorId !== "j3");
    expect(() => calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs })).toThrowError(
      expect.objectContaining({ code: "MIN_EVALUATORS_NOT_MET" }),
    );
  });

  it("individual judge weights apply", () => {
    const cfg = baseConfig();
    cfg.groups[2].evaluators = [
      { assignmentId: "j1", individualWeightBp: 20000 },
      { assignmentId: "j2", individualWeightBp: 10000 },
      { assignmentId: "j3", individualWeightBp: 10000 },
    ];
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: fullNight() });
    // (9*2 + 8 + 7)/4 = 8.25
    expect(r.groups.find((g) => g.kind === "JUDGE")!.score).toBe("8.25");
  });

  it("conflict of interest excuses a judge without counting as absent", () => {
    const cfg = baseConfig();
    cfg.groups[2].evaluators![2].conflictBandIds = ["bA"];
    const subs = fullNight().filter((s) => s.actorId !== "j3");
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
    const judge = r.groups.find((g) => g.kind === "JUDGE")!;
    expect(judge.evaluatorsExcused).toEqual(["j3"]);
    expect(judge.evaluatorsAbsent).toEqual([]);
  });

  it("MEDIAN and TRIMMED_MEAN aggregation", () => {
    const cfg = baseConfig();
    cfg.groups = [{ ...cfg.groups[0], weightBp: 10000, aggregation: "MEDIAN" }];
    const subs = [1, 9, 9, 10, 2].map((v, i) => sub("pA", "PUBLIC", `v${i}`, v));
    expect(calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs }).finalScore).toBe("9.00");

    cfg.groups[0].aggregation = "TRIMMED_MEAN";
    cfg.groups[0].trimPercentBp = 2000; // trim 1 from each end of 5
    // sorted 1,2,9,9,10 → keep 2,9,9 → 6.6667
    expect(calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs }).finalScore).toBe("6.67");
  });

  it("trimmed mean with n<3 trims nothing", () => {
    const cfg = baseConfig();
    cfg.groups = [{ ...cfg.groups[0], weightBp: 10000, aggregation: "TRIMMED_MEAN", trimPercentBp: 2000 }];
    const subs = [sub("pA", "PUBLIC", "v1", 2), sub("pA", "PUBLIC", "v2", 10)];
    expect(calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs }).finalScore).toBe("6.00");
  });

  it("z-score voter normalization only applies to voters with >= 2 bands", () => {
    const cfg = baseConfig({ voterNormalization: "Z_SCORE_PER_VOTER" });
    cfg.groups = [{ ...cfg.groups[0], weightBp: 10000 }];
    // v1 is a harsh voter across both bands; v2 voted once.
    const subs = [sub("pA", "PUBLIC", "v1", 3), sub("pB", "PUBLIC", "v1", 5), sub("pA", "PUBLIC", "v2", 8), sub("pB", "PUBLIC", "v2", 8)];
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
    expect(r.policiesApplied).toContain("VOTER_NORMALIZATION(Z_SCORE)");
    expect(r.groups[0].notes.join(" ")).toContain("normalized");
  });

  it("multi-band voter boost increases weight of voters who evaluated >= N bands", () => {
    const cfg = baseConfig({ multiBandVoterBoostBp: 20000, multiBandVoterMin: 2 });
    cfg.groups = [{ ...cfg.groups[0], weightBp: 10000 }];
    const subs = [sub("pA", "PUBLIC", "v1", 10), sub("pB", "PUBLIC", "v1", 6), sub("pA", "PUBLIC", "v2", 4)];
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
    // (10*2 + 4*1)/3 = 8
    expect(r.finalScore).toBe("8.00");
  });

  it("bayesian shrinkage pulls low-count scores toward the round mean", () => {
    const cfg = baseConfig({ bayesianPriorVotes: 2 });
    cfg.groups = [{ ...cfg.groups[0], weightBp: 10000 }];
    const subs = [sub("pA", "PUBLIC", "v1", 10), sub("pB", "PUBLIC", "v2", 6), sub("pB", "PUBLIC", "v3", 6), sub("pB", "PUBLIC", "v4", 6)];
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
    // prior mean = 7, n=1, M=2 → (10*1 + 7*2)/3 = 8
    expect(r.finalScore).toBe("8.00");
  });

  it("overtime PENALTY deducts basis points from the final score", () => {
    const cfg = baseConfig({ overtimePolicy: "PENALTY", overtimePenaltyBp: 500 });
    const r = calculatePerformance({ config: cfg, performance: { ...PERF_A, overtimeSeconds: 90 }, roundSubmissions: fullNight() });
    expect(r.finalScore).toBe("7.41"); // 7.8 * 0.95
    expect(r.policiesApplied).toContain("OVERTIME_PENALTY(500bp)");
  });

  it("overtime NONE leaves score untouched but records seconds", () => {
    const r = calculatePerformance({ config: baseConfig(), performance: { ...PERF_A, overtimeSeconds: 90 }, roundSubmissions: fullNight() });
    expect(r.finalScore).toBe("7.80");
    expect(r.overtimeSeconds).toBe(90);
  });

  it("ZERO_WEIGHT missing evaluator drops the group and redistributes", () => {
    const cfg = baseConfig();
    cfg.groups[1].missingEvaluatorPolicy = "ZERO_WEIGHT";
    cfg.groups[1].requiredEvaluatorCount = 2;
    const subs = fullNight().filter((s) => s.actorId !== "s2");
    const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
    expect(r.groups[1].appliedWeightBp).toBe(0);
    expect(r.finalScore).toBe("8.00");
  });

  it("throws when no group contributes", () => {
    const cfg = baseConfig();
    cfg.groups.forEach((g) => {
      g.minVotesPolicy = "ZERO_WEIGHT";
      g.minSubmissions = 99;
    });
    expect(() => calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: fullNight() })).toThrowError(
      expect.objectContaining({ code: "NO_CONTRIBUTING_GROUPS" }),
    );
  });
});

describe("determinism (property-based)", () => {
  const scoreArb = fc.integer({ min: 1, max: 10 });
  const itemsArb = fc.array(scoreArb, { minLength: 7, maxLength: 7 });

  it("same input → identical output regardless of submission order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom("v1", "v2", "v3", "v4", "v5", "v6"), itemsArb), { minLength: 1, maxLength: 6 }),
        fc.array(fc.tuple(fc.constantFrom("j1", "j2", "j3"), itemsArb), { minLength: 1, maxLength: 3 }),
        fc.array(fc.tuple(fc.constantFrom("s1", "s2"), itemsArb), { minLength: 1, maxLength: 2 }),
        (pub, judges, staff) => {
          const dedupe = <T extends [string, number[]]>(arr: T[]) => [...new Map(arr.map((x) => [x[0], x])).values()];
          const subs = [
            ...dedupe(pub).map(([a, v]) => sub("pA", "PUBLIC", a, v)),
            ...dedupe(judges).map(([a, v]) => sub("pA", "JUDGE", a, v)),
            ...dedupe(staff).map(([a, v]) => sub("pA", "STAFF", a, v)),
          ];
          const shuffled = [...subs].reverse();
          const a = calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: subs });
          const b = calculatePerformance({ config: baseConfig(), performance: PERF_A, roundSubmissions: shuffled });
          expect(a).toEqual(b);
          const v = Number(a.finalScore);
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(10);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("applied group weights always sum to 100%", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom("v1", "v2", "v3"), itemsArb), { minLength: 0, maxLength: 3 }), (pub) => {
        const cfg = baseConfig();
        cfg.groups[0].minVotesPolicy = "REDISTRIBUTE";
        const dedupe = [...new Map(pub.map((x) => [x[0], x])).values()];
        const subs = [
          ...dedupe.map(([a, v]) => sub("pA", "PUBLIC", a, v)),
          sub("pA", "JUDGE", "j1", 7),
          sub("pA", "STAFF", "s1", 7),
        ];
        const r = calculatePerformance({ config: cfg, performance: PERF_A, roundSubmissions: subs });
        const total = r.groups.reduce((s, g) => s + g.appliedWeightBp, 0);
        expect(Math.abs(total - 10000)).toBeLessThan(0.01);
      }),
      { numRuns: 100 },
    );
  });
});
