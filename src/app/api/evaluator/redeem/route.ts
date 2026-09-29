import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { createEvaluatorSession } from "@/lib/auth/evaluator-session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { sha256 } from "@/lib/hash";
import { peekEvaluatorToken, redeemEvaluatorToken } from "@/modules/identity/service";

const schema = z.object({ token: z.string().min(10), pin: z.string().max(8).optional().nullable(), confirm: z.boolean().default(false) });

export const POST = route(async ({ req, requestId }) => {
  const ip = await clientIp();
  rateLimit(`redeem:${ip ?? "unknown"}`, { capacity: 10, refillPerSec: 0.1 });
  const body = await parseBody(req, schema);
  if (!body.confirm) {
    const peek = await peekEvaluatorToken(body.token);
    return json({ peek });
  }
  const session = await redeemEvaluatorToken(body.token, body.pin ?? null, { ipHash: ip ? sha256(ip).slice(0, 32) : null, requestId });
  await createEvaluatorSession({ assignmentId: session.assignmentId, eventId: session.eventId, group: session.group, personName: session.personName, deviceId: session.deviceId });
  return json({ ok: true, group: session.group });
});
