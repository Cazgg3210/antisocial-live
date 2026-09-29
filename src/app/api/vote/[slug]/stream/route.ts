import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { sseResponse } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/** Lightweight public stream: tells the voting page when the active band / status changes. */
export const GET = route<{ slug: string }>(async ({ params }) => {
  const event = await db.eventEdition.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!event) throw notFound("Event");
  return sseResponse(event.id, async () => {
    const active = await db.performance.findFirst({
      where: { round: { eventId: event.id }, status: { in: ["ON_STAGE", "VOTING_OPEN", "GRACE_PERIOD", "VOTING_CLOSED", "CALCULATING", "RESULT_READY", "PARTIAL_REVEALED"] } },
      orderBy: [{ onStageAt: "desc" }],
      select: { id: true, status: true, version: true, _count: { select: { submissions: { where: { group: "PUBLIC", status: { in: ["ACCEPTED", "FLAGGED_FOR_REVIEW"] } } } } } },
    });
    return active ? { performanceId: active.id, status: active.status, version: active.version, votesReceived: active._count.submissions } : { performanceId: null };
  });
});
