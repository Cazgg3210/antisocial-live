import { route } from "@/lib/api";
import { getVoterSessionId } from "@/lib/auth/voter-session";
import { db } from "@/lib/db";

/** Trackable sponsor CTA: /api/go/{code} → records a click and redirects. */
export const GET = route<{ code: string }>(async ({ params, req }) => {
  const placement = await db.sponsorPlacement.findUnique({ where: { code: params.code }, include: { campaign: { include: { sponsor: true } } } });
  const fallback = new URL("/", process.env.APP_URL ?? "http://localhost:3000");
  if (!placement || !placement.isActive) return Response.redirect(fallback, 302);
  const url = new URL(req.url);
  const kind = url.searchParams.get("qr") ? "QR_SCAN" : "CLICK";
  await db.sponsorInteraction.create({ data: { placementId: placement.id, kind, eventId: placement.eventId, performanceId: url.searchParams.get("p"), voterSessionId: await getVoterSessionId() } });
  const target = placement.ctaUrl ?? placement.campaign.sponsor.websiteUrl;
  return Response.redirect(target ?? fallback.toString(), 302);
});
