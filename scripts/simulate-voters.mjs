#!/usr/bin/env node
/**
 * Simulates N distinct public voters against a running instance (each with its own cookie jar).
 * Usage: node scripts/simulate-voters.mjs <eventSlug> [count=50] [baseUrl=http://localhost:3000] [--porra]
 * Reads the current screen code from the public stage endpoint.
 */
const [slug, countArg = "50", base = "http://localhost:3000", ...flags] = process.argv.slice(2);
if (!slug) {
  console.error("usage: simulate-voters.mjs <eventSlug> [count] [baseUrl] [--porra]");
  process.exit(1);
}
const count = Number(countArg);
const porra = flags.includes("--porra");

const stage = await (await fetch(`${base}/api/stage/${slug}`)).json();
const code = stage.screenCode?.code ?? null;
const perfId = stage.active?.id;
if (!perfId) {
  console.error("No active performance");
  process.exit(1);
}

let ok = 0, flagged = 0, rejected = 0, dup = 0;
const started = Date.now();
await Promise.all(
  Array.from({ length: count }, async (_, i) => {
    const first = await fetch(`${base}/api/vote/${slug}`);
    const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0];
    const ctx = await first.json();
    const key = crypto.randomUUID();
    const seed = (i * 7919) % 11;
    const items = ctx.criteria.map((c, k) => ({ criterionId: c.id, value: porra ? (i % 2 ? 10 : 1) : Math.max(c.scaleMin, Math.min(c.scaleMax, 5 + ((seed + k) % 6))) }));
    const body = JSON.stringify({ submissionKey: key, performanceId: perfId, items, screenCode: code, clientDurationMs: 8000 + (i % 20) * 1000 });
    const send = () => fetch(`${base}/api/vote/${slug}`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body });
    const r1 = await send();
    const j1 = await r1.json();
    if (r1.ok) {
      if (j1.status === "ACCEPTED") ok++;
      else if (j1.status === "FLAGGED_FOR_REVIEW") flagged++;
    } else rejected++;
    // Retry with same key must be idempotent.
    if (i % 5 === 0) {
      const r2 = await send();
      const j2 = await r2.json();
      if (j2.duplicate) dup++;
    }
  }),
);
console.log(JSON.stringify({ count, ok, flagged, rejected, idempotentRetries: dup, ms: Date.now() - started }));
