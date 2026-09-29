import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { getVoterSessionId } from "@/lib/auth/voter-session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { resolveLocale } from "@/i18n/request";
import { recordOptIn } from "@/modules/audience/service";

const schema = z.object({
  email: z.string().email().optional().nullable(),
  phone: z.string().min(8).max(20).optional().nullable(),
  name: z.string().max(80).optional().nullable(),
  followBandId: z.string().optional().nullable(),
  marketing: z.boolean().default(false),
  privacyVersion: z.string().default("v1"),
});

export const POST = route<{ slug: string }>(async ({ req, params }) => {
  const voterSessionId = await getVoterSessionId();
  if (!voterSessionId) return json({ error: { code: "UNAUTHORIZED", message: "No voter session" } }, { status: 401 });
  rateLimit(`optin:${voterSessionId}`, { capacity: 5, refillPerSec: 0.05 });
  const body = await parseBody(req, schema);
  const result = await recordOptIn({ ...body, eventSlug: params.slug, voterSessionId, locale: await resolveLocale(), ip: await clientIp() });
  return json(result, { status: 201 });
});
