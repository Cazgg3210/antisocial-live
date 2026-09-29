import { route } from "@/lib/api";
import { requireRole } from "@/lib/auth/admin-session";
import { sseResponse } from "@/lib/realtime";
import { controlSnapshot } from "@/modules/control/service";

export const dynamic = "force-dynamic";

export const GET = route<{ eventId: string }>(async ({ params }) => {
  const s = await requireRole("STAFF_COORDINATOR", params.eventId);
  return sseResponse(params.eventId, () => controlSnapshot(params.eventId, s.userId), { heartbeatMs: 10000, refreshMs: 15_000 });
});
