import { route } from "@/lib/api";
import { requireRole } from "@/lib/auth/admin-session";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { auditRows, resultsPdf, resultsRows, sponsorRows, submissionsRows, toCsv } from "@/modules/exports/service";

export const dynamic = "force-dynamic";

export const GET = route<{ eventId: string; file: string }>(async ({ params }) => {
  const s = await requireRole("EVENT_MANAGER", params.eventId);
  const { eventId, file } = params;
  const event = await db.eventEdition.findUnique({ where: { id: eventId }, select: { slug: true } });
  if (!event) throw new AppError("NOT_FOUND", "Event not found");
  await audit(db, { action: "EXPORT_GENERATED", actorType: "USER", actorId: s.userId, actorLabel: s.name, eventId, payload: { file } });
  const name = (ext: string) => `attachment; filename="${event.slug}-${file.replace(/\.\w+$/, "")}.${ext}"`;
  switch (file) {
    case "results.csv":
      return new Response(toCsv((await resultsRows(eventId)).rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": name("csv") } });
    case "submissions.csv":
      return new Response(toCsv(await submissionsRows(eventId)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": name("csv") } });
    case "audit.csv":
      return new Response(toCsv(await auditRows(eventId)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": name("csv") } });
    case "sponsors.csv":
      return new Response(toCsv(await sponsorRows(eventId, null)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": name("csv") } });
    case "results.pdf": {
      const pdf = await resultsPdf(eventId);
      return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": name("pdf"), "Content-Length": String(pdf.length) } });
    }
    default:
      throw new AppError("NOT_FOUND", "Unknown export");
  }
});
