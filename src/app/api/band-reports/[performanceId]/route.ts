import { json, route } from "@/lib/api";
import { requireRole } from "@/lib/auth/admin-session";
import { eventIdOfPerformance } from "@/modules/events/service";
import { db } from "@/lib/db";
import { buildBandReport, markReportSent } from "@/modules/band-reports/service";
import { sendMail } from "@/lib/mail";

/** Generates (and optionally emails) the band report for a performance. */
export const POST = route<{ performanceId: string }>(async ({ params, req }) => {
  const eventId = await eventIdOfPerformance(db, params.performanceId);
  const s = await requireRole("EVENT_MANAGER", eventId);
  const { send } = (await req.json().catch(() => ({}))) as { send?: boolean };
  const r = await buildBandReport({ userId: s.userId, name: s.name }, params.performanceId);
  let sent: string | null = null;
  if (send && r.contactEmail) {
    await sendMail({ to: r.contactEmail, subject: `Tu reporte — ${String((r.report.payload as { event: string }).event)}`, text: `Hola ${String((r.report.payload as { band: string }).band)},\n\nAquí está tu reporte de la noche: ${r.url}\n\nAntisocial Live` });
    await markReportSent(r.report.id, r.contactEmail);
    sent = r.contactEmail;
  }
  return json({ url: r.url, sent });
});
