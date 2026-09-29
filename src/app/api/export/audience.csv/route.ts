import { route } from "@/lib/api";
import { requireRole } from "@/lib/auth/admin-session";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { audienceRows, toCsv } from "@/modules/exports/service";

export const dynamic = "force-dynamic";

/** Only contacts with an active marketing consent are exported; the export itself is audited. */
export const GET = route(async () => {
  const s = await requireRole("ORGANIZATION_ADMIN");
  await audit(db, { action: "EXPORT_GENERATED", actorType: "USER", actorId: s.userId, actorLabel: s.name, payload: { file: "audience.csv" } });
  return new Response(toCsv(await audienceRows(s.organizationId)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="audience.csv"' } });
});
