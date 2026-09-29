import { json, route } from "@/lib/api";
import { requireRole } from "@/lib/auth/admin-session";
import { controlSnapshot } from "@/modules/control/service";

export const dynamic = "force-dynamic";

export const GET = route<{ eventId: string }>(async ({ params }) => {
  const s = await requireRole("STAFF_COORDINATOR", params.eventId);
  return json(await controlSnapshot(params.eventId, s.userId));
});
