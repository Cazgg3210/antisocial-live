import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { getOrCreateVoterSession, getVoterSessionId } from "@/lib/auth/voter-session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, userAgent } from "@/lib/request";
import { resolveLocale } from "@/i18n/request";
import { getVoteContext, submitPublicVote } from "@/modules/voting/service";
import { verifyTurnstile } from "@/modules/voting/turnstile";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = route<{ slug: string }>(async ({ params, req }) => {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  const locale = await resolveLocale();
  const session = await getOrCreateVoterSession(locale, await userAgent());
  const ctx = await getVoteContext(params.slug, session.id);
  // Fan attribution: ?ref=band_<slug> from a band's own promo link. Never affects the vote.
  if (ref?.startsWith("band_")) {
    const band = await db.band.findFirst({ where: { slug: ref.slice(5) }, select: { id: true } });
    if (band) {
      await db.voterEventState.upsert({
        where: { voterSessionId_eventId: { voterSessionId: session.id, eventId: ctx.event.id } },
        create: { voterSessionId: session.id, eventId: ctx.event.id, refBandId: band.id },
        update: {},
      });
    }
  }
  return json({ ...ctx, voter: { isNew: session.isNew } });
});

const submitSchema = z.object({
  submissionKey: z.string().uuid(),
  performanceId: z.string().min(1),
  items: z.array(z.object({ criterionId: z.string().min(1), value: z.number().int() })).min(1),
  comment: z.string().max(500).optional().nullable(),
  screenCode: z.string().max(8).optional().nullable(),
  clientDurationMs: z.number().int().nonnegative().optional().nullable(),
  turnstileToken: z.string().optional().nullable(),
});

export const POST = route<{ slug: string }>(async ({ req, params, requestId }) => {
  const voterSessionId = await getVoterSessionId();
  if (!voterSessionId) return json({ error: { code: "UNAUTHORIZED", message: "No voter session; reload the page." } }, { status: 401 });
  rateLimit(`vote:${voterSessionId}`, { capacity: 6, refillPerSec: 0.2 });
  const body = await parseBody(req, submitSchema);
  const ip = await clientIp();
  const locale = await resolveLocale();

  const ctx = await getVoteContext(params.slug, voterSessionId);
  if (ctx.config.turnstileEnabled) {
    const s = await db.voterSession.findUnique({ where: { id: voterSessionId }, select: { turnstileVerifiedAt: true } });
    if (!s?.turnstileVerifiedAt) {
      const ok = body.turnstileToken ? await verifyTurnstile(body.turnstileToken, ip) : false;
      if (!ok) return json({ error: { code: "VALIDATION", message: "Turnstile verification failed", details: { field: "turnstile" } } }, { status: 400 });
      await db.voterSession.update({ where: { id: voterSessionId }, data: { turnstileVerifiedAt: new Date() } });
    }
  }
  const state = await db.voterEventState.findUnique({ where: { voterSessionId_eventId: { voterSessionId, eventId: ctx.event.id } }, select: { refBandId: true } });
  const result = await submitPublicVote({ ...body, voterSessionId, locale, ip, refBandId: state?.refBandId, requestId });
  return json(result, { status: result.duplicate ? 200 : 201 });
});
