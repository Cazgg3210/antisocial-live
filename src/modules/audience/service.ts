import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { hashIp } from "@/lib/request";

const PRIVACY_TEXT_ES = "Acepto recibir comunicaciones de Antisocial Rooftop y he leído el aviso de privacidad.";
const FOLLOW_TEXT_ES = "Quiero seguir a esta banda y recibir sus novedades a través de Antisocial.";

/**
 * Records a marketing opt-in and/or band follow. Completely independent from the vote: the
 * vote never references the contact and the contact never references the submission.
 */
export async function recordOptIn(input: {
  eventSlug: string;
  voterSessionId: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  followBandId?: string | null;
  marketing: boolean;
  privacyVersion: string;
  locale: string;
  ip: string | null;
}) {
  const event = await db.eventEdition.findUnique({ where: { slug: input.eventSlug }, include: { securitySalt: true, series: true } });
  if (!event) throw notFound("Event");
  if (!input.email && !input.phone) throw new AppError("VALIDATION", "Email or phone is required.");
  if (!input.marketing && !input.followBandId) throw new AppError("VALIDATION", "Consent is required.");
  const ipHash = hashIp(input.ip, event.securitySalt?.salt ?? null);
  const state = await db.voterEventState.findUnique({ where: { voterSessionId_eventId: { voterSessionId: input.voterSessionId, eventId: event.id } } });

  return db.$transaction(async (tx) => {
    const orgId = event.series.organizationId;
    const existing = await tx.audienceContact.findFirst({
      where: { organizationId: orgId, OR: [input.email ? { email: input.email.toLowerCase() } : {}, input.phone ? { phone: input.phone } : {}].filter((x) => Object.keys(x).length) },
    });
    const contact =
      existing ??
      (await tx.audienceContact.create({
        data: {
          organizationId: orgId,
          email: input.email?.toLowerCase() ?? null,
          phone: input.phone ?? null,
          name: input.name ?? null,
          locale: input.locale,
          source: "POST_VOTE",
          eventId: event.id,
          refBandId: state?.refBandId ?? input.followBandId ?? null,
          voterSessionId: input.voterSessionId,
        },
      }));
    if (input.marketing) {
      await tx.consent.create({
        data: { kind: input.email ? "MARKETING_EMAIL" : "MARKETING_WHATSAPP", documentVersion: input.privacyVersion, textShown: PRIVACY_TEXT_ES, source: "POST_VOTE", contactId: contact.id, voterSessionId: input.voterSessionId, ipHash },
      });
      await tx.attribution.create({ data: { kind: "OPT_IN", eventId: event.id, bandId: state?.refBandId ?? null, voterSessionId: input.voterSessionId, contactId: contact.id } });
    }
    if (input.followBandId) {
      await tx.consent.create({
        data: { kind: "FOLLOW_BAND", documentVersion: input.privacyVersion, textShown: FOLLOW_TEXT_ES, source: "POST_VOTE", contactId: contact.id, voterSessionId: input.voterSessionId, bandId: input.followBandId, ipHash },
      });
      await tx.attribution.create({ data: { kind: "BAND_FOLLOW", eventId: event.id, bandId: input.followBandId, voterSessionId: input.voterSessionId, contactId: contact.id } });
    }
    await audit(tx, { action: "CONSENT_RECORDED", actorType: "VOTER", actorId: input.voterSessionId, eventId: event.id, entityType: "AudienceContact", entityId: contact.id, ipHash, payload: { marketing: input.marketing, follow: !!input.followBandId } });
    return { contactId: contact.id };
  });
}

export async function recordReservationClick(eventSlug: string, voterSessionId: string | null, url: string) {
  const event = await db.eventEdition.findUnique({ where: { slug: eventSlug }, select: { id: true } });
  if (!event) return;
  const state = voterSessionId ? await db.voterEventState.findUnique({ where: { voterSessionId_eventId: { voterSessionId, eventId: event.id } } }) : null;
  await db.attribution.create({ data: { kind: "RESERVATION_CLICK", eventId: event.id, bandId: state?.refBandId ?? null, voterSessionId, url } });
}
