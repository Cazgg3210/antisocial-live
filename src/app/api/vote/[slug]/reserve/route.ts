import { route } from "@/lib/api";
import { getVoterSessionId } from "@/lib/auth/voter-session";
import { db } from "@/lib/db";
import { recordReservationClick } from "@/modules/audience/service";

/** Tracked redirect to the reservation URL (UTM-tagged). */
export const GET = route<{ slug: string }>(async ({ params }) => {
  const event = await db.eventEdition.findUnique({ where: { slug: params.slug }, include: { config: true } });
  const target = event?.config?.reservationUrl;
  if (!target) return Response.redirect(new URL("/", process.env.APP_URL ?? "http://localhost:3000"), 302);
  const url = new URL(target);
  url.searchParams.set("utm_source", "antisocial-live");
  url.searchParams.set("utm_medium", "post-vote");
  url.searchParams.set("utm_campaign", event!.slug);
  await recordReservationClick(params.slug, await getVoterSessionId(), url.toString());
  return Response.redirect(url.toString(), 302);
});
