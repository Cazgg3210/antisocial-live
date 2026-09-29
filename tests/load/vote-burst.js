/* global __ENV */
// k6 load test: a burst of distinct voters against an event with voting open.
// Usage: k6 run -e BASE=http://localhost:3000 -e SLUG=gdb-2026-noche-1 -e VOTERS=1000 tests/load/vote-burst.js
// Requires: voting OPEN on the event (start it from the Control Room first).
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE = __ENV.BASE || "http://localhost:3000";
const SLUG = __ENV.SLUG || "gdb-2026-noche-1";
const VOTERS = Number(__ENV.VOTERS || 1000); // 5x of a 200-person night

const submitLatency = new Trend("vote_submit_ms", true);
const accepted = new Counter("votes_accepted");
const rejected = new Counter("votes_rejected");

export const options = {
  scenarios: {
    burst: { executor: "shared-iterations", vus: 100, iterations: VOTERS, maxDuration: "3m" },
  },
  thresholds: {
    vote_submit_ms: ["p(95)<500", "p(99)<1500"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  const stage = http.get(`${BASE}/api/stage/${SLUG}`).json();
  if (!stage.active || (stage.active.status !== "VOTING_OPEN" && stage.active.status !== "GRACE_PERIOD")) {
    throw new Error("Voting is not open on " + SLUG);
  }
  return { performanceId: stage.active.id, code: stage.screenCode ? stage.screenCode.code : null };
}

export default function (data) {
  const jar = http.cookieJar();
  jar.clear(BASE);
  const ctxRes = http.get(`${BASE}/api/vote/${SLUG}`);
  check(ctxRes, { "context 200": (r) => r.status === 200 });
  const ctx = ctxRes.json();
  // The screen code rotates; refresh it from the stage endpoint every iteration (cheap, public).
  const code = data.code ? http.get(`${BASE}/api/stage/${SLUG}`).json().screenCode.code : null;
  const items = ctx.criteria.map((c, i) => ({ criterionId: c.id, value: 5 + ((__VU + i) % 6) }));
  const body = JSON.stringify({ submissionKey: uuidv4(), performanceId: data.performanceId, items, screenCode: code, clientDurationMs: 12000 });
  const res = http.post(`${BASE}/api/vote/${SLUG}`, body, { headers: { "Content-Type": "application/json" } });
  submitLatency.add(res.timings.duration);
  const ok = check(res, { "vote 201": (r) => r.status === 201 });
  if (ok) accepted.add(1);
  else rejected.add(1);
  sleep(0.1);
}
