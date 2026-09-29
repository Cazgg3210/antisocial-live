import { route } from "@/lib/api";
import { requireRole } from "@/lib/auth/admin-session";
import { sponsorRows, toCsv } from "@/modules/exports/service";

export const dynamic = "force-dynamic";

export const GET = route<{ sponsorId: string }>(async ({ params }) => {
  await requireRole("EVENT_MANAGER");
  return new Response(toCsv(await sponsorRows(null, params.sponsorId)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sponsor-${params.sponsorId}.csv"` } });
});
