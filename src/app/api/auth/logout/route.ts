import { json, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { destroyAdminSession, getAdminSession } from "@/lib/auth/admin-session";
import { db } from "@/lib/db";

export const POST = route(async () => {
  const s = await getAdminSession();
  if (s) await audit(db, { action: "LOGOUT", actorType: "USER", actorId: s.userId, actorLabel: s.email });
  await destroyAdminSession();
  return json({ ok: true });
});
