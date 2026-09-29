import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { getVoterSessionId } from "@/lib/auth/voter-session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ placementId: z.string().min(1), eventId: z.string().optional().nullable(), performanceId: z.string().optional().nullable() });

/** Records a sponsor impression (Stage scene shown / landing rendered). */
export const POST = route(async ({ req }) => {
  const body = await parseBody(req, schema);
  const voterSessionId = await getVoterSessionId();
  rateLimit(`imp:${voterSessionId ?? "stage"}:${body.placementId}`, { capacity: 3, refillPerSec: 0.02 });
  await db.sponsorInteraction.create({ data: { placementId: body.placementId, kind: "IMPRESSION", eventId: body.eventId ?? null, performanceId: body.performanceId ?? null, voterSessionId } });
  return json({ ok: true });
});
