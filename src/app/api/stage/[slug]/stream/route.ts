import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { sseResponse } from "@/lib/realtime";
import { stageSnapshot } from "@/modules/stage/service";

export const dynamic = "force-dynamic";

export const GET = route<{ slug: string }>(async ({ params }) => {
  const event = await db.eventEdition.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!event) throw notFound("Event");
  return sseResponse(event.id, () => stageSnapshot(params.slug), { refreshMs: 10_000 });
});
