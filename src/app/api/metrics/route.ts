import { db } from "@/lib/db";
import { realtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/** Prometheus-style text metrics; scrape-friendly, no auth (no personal data inside). */
export async function GET() {
  const since = new Date(Date.now() - 60_000);
  const [votesLastMinute, flagged, liveEvents, openVotings] = await Promise.all([
    db.scoreSubmission.count({ where: { group: "PUBLIC", submittedAt: { gte: since } } }),
    db.scoreSubmission.count({ where: { status: "FLAGGED_FOR_REVIEW", submittedAt: { gte: since } } }),
    db.eventEdition.count({ where: { status: "LIVE" } }),
    db.performance.count({ where: { status: { in: ["VOTING_OPEN", "GRACE_PERIOD"] } } }),
  ]);
  const sse = realtime.listenerCount("change") + realtime.eventNames().filter((n) => String(n).startsWith("event:")).reduce((s, n) => s + realtime.listenerCount(n), 0);
  const lines = [
    "# TYPE antisocial_votes_last_minute gauge",
    `antisocial_votes_last_minute ${votesLastMinute}`,
    "# TYPE antisocial_flagged_last_minute gauge",
    `antisocial_flagged_last_minute ${flagged}`,
    "# TYPE antisocial_live_events gauge",
    `antisocial_live_events ${liveEvents}`,
    "# TYPE antisocial_open_votings gauge",
    `antisocial_open_votings ${openVotings}`,
    "# TYPE antisocial_sse_subscribers gauge",
    `antisocial_sse_subscribers ${sse}`,
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${Math.round(process.uptime())}`,
  ];
  return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain; version=0.0.4" } });
}
