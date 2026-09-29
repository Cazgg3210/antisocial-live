#!/usr/bin/env node
/**
 * Drives a complete demo night against a running instance: for every SCHEDULED band it starts the
 * band, opens voting, simulates public voters + evaluators, closes, calculates and partially reveals;
 * then finalizes the round (ranking + qualification) and steps through the final reveal.
 *
 * Usage: node scripts/run-demo-night.mjs <eventId> [voters=40] [baseUrl=http://localhost:3000]
 * Env:   ADMIN_EMAIL / ADMIN_PASSWORD (defaults to the demo seed admin)
 */
import { execFileSync } from "node:child_process";

const [eventId, votersArg = "40", base = "http://localhost:3000"] = process.argv.slice(2);
if (!eventId) {
  console.error("usage: run-demo-night.mjs <eventId> [voters] [baseUrl]");
  process.exit(1);
}
const voters = Number(votersArg);
const email = process.env.ADMIN_EMAIL ?? "admin@antisocial.local";
const password = process.env.ADMIN_PASSWORD ?? "Antisocial!Demo2026";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const admin = (login.headers.get("set-cookie") ?? "").split(";")[0];
const act = async (payload) => {
  const r = await fetch(`${base}/api/control/${eventId}/action`, { method: "POST", headers: { "Content-Type": "application/json", cookie: admin }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${payload.action}: ${j.error?.message ?? r.status} ${JSON.stringify(j.error?.details ?? {})}`);
  return j;
};
const snapshot = async () => (await fetch(`${base}/api/control/${eventId}`, { headers: { cookie: admin } })).json();

await act({ action: "TAKE_CONTROL", force: true });
let snap = await snapshot();
if (snap.event.status !== "LIVE") {
  await act({ action: "EVENT_GO_LIVE" });
  snap = await snapshot();
}
console.log(`Event ${snap.event.name} is ${snap.event.status}; slug=${snap.event.slug}`);

// Evaluator sessions: reissue tokens (admin) and redeem them (one cookie per evaluator).
const evaluators = [];
for (const e of snap.evaluators) {
  const issued = await act({ action: "REISSUE_TOKEN", assignmentId: e.id });
  const raw = issued.url.split("/").pop();
  const red = await fetch(`${base}/api/evaluator/redeem`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: raw, confirm: true }) });
  if (!red.ok) throw new Error(`redeem failed for ${e.name}`);
  evaluators.push({ name: e.name, group: e.group, cookie: (red.headers.get("set-cookie") ?? "").split(";")[0] });
}
console.log(`Evaluators ready: ${evaluators.map((e) => e.name).join(", ")}`);

const round = snap.rounds.find((r) => r.status !== "PUBLISHED" && r.status !== "CLOSED") ?? snap.rounds[0];
for (const p of round.performances) {
  if (p.status === "FINALIZED" || p.status === "CANCELLED" || p.result) continue;
  console.log(`\n▶ ${p.band.name}`);
  const cur = (await snapshot()).active;
  if (!cur || cur.id !== p.id) await act({ action: "START_BAND", performanceId: p.id });
  await sleep(500);
  const st = (await snapshot()).active?.status;
  if (st === "ON_STAGE") await act({ action: "OPEN_VOTING", performanceId: p.id });

  // Public
  const out = execFileSync("node", ["scripts/simulate-voters.mjs", snap.event.slug, String(voters), base], { encoding: "utf8" });
  console.log("  public:", out.trim());

  // Evaluators (skip the last judge on band 1 to exercise the absent-judge policy)
  const me0 = await (await fetch(`${base}/api/evaluator/me`, { headers: { cookie: evaluators[0].cookie } })).json();
  for (const [i, e] of evaluators.entries()) {
    if (p.slotOrder === 1 && e.group === "JUDGE" && i === evaluators.findLastIndex((x) => x.group === "JUDGE")) continue;
    const bias = e.group === "JUDGE" ? 0 : 1;
    const items = me0.criteria.map((c, k) => ({ criterionId: c.id, value: Math.max(1, Math.min(10, 6 + bias + ((p.slotOrder + k + i) % 4))) }));
    const r = await fetch(`${base}/api/evaluator/submission`, { method: "POST", headers: { "Content-Type": "application/json", cookie: e.cookie }, body: JSON.stringify({ performanceId: p.id, submissionKey: crypto.randomUUID(), items, final: true }) });
    if (!r.ok) console.log(`  evaluator ${e.name} failed: ${(await r.json()).error?.message}`);
  }

  await act({ action: "CLOSE_VOTING", performanceId: p.id });
  let s;
  do {
    await sleep(1000);
    s = await snapshot();
  } while (s.active?.status === "GRACE_PERIOD");
  const calc = await act({ action: "CALCULATE", performanceId: p.id });
  console.log(`  result: ${calc.finalScore} · ${calc.payload.formula} · ${calc.payload.policiesApplied.join(",") || "no policies"}`);
  if (s.config.partialRevealPolicy !== "NONE" && s.config.partialRevealPolicy !== "FINAL_ONLY") await act({ action: "REVEAL_PARTIAL", performanceId: p.id });
}

const fin = await act({ action: "FINALIZE_ROUND", roundId: round.id });
console.log("\nRanking:");
for (const e of fin.ranking) console.log(`  #${e.position} ${e.bandName} ${e.finalScore}${e.tieBreakTrail.length ? ` (tie: ${e.tieBreakTrail.join(">")})` : ""}`);
for (let i = 0; i < fin.ranking.length; i++) {
  await act({ action: "REVEAL_NEXT", roundId: round.id });
  await sleep(300);
}
await act({ action: "SCENE", scene: "QUALIFIERS", payload: { roundId: round.id } });
const final = await snapshot();
console.log("\nQualification:", final.rounds.find((r) => r.id === round.id).performances.map((p) => `${p.band.name}=${p.qualification?.status}`).join(", "));
const next = final.rounds.find((r) => r.id === round.nextRoundId);
if (next) console.log("Next round lineup:", next.performances.map((p) => p.band.name).join(", "));
