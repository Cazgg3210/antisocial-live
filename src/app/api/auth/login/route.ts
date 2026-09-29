import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { createAdminSession } from "@/lib/auth/admin-session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { sha256 } from "@/lib/hash";
import { loginWithPassword } from "@/modules/identity/service";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = route(async ({ req, requestId }) => {
  const ip = await clientIp();
  rateLimit(`login:${ip ?? "unknown"}`, { capacity: 20, refillPerSec: 0.2 });
  const body = await parseBody(req, schema);
  const user = await loginWithPassword(body.email, body.password, { ipHash: ip ? sha256(ip).slice(0, 32) : null, requestId });
  await createAdminSession(user.id);
  return json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
});
