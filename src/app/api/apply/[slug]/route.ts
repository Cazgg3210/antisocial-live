import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/hash";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { PRIVACY_VERSION } from "@/modules/legal/documents";

const schema = z.object({
  bandName: z.string().min(2).max(120),
  contactName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(30).optional().default(""),
  genre: z.string().max(80).optional().default(""),
  city: z.string().max(80).optional().default(""),
  isTribute: z.boolean().default(false),
  description: z.string().min(10).max(3000),
  videoUrl: z.string().max(500).optional().default(""),
  instagram: z.string().max(200).optional().default(""),
  tiktok: z.string().max(200).optional().default(""),
  spotify: z.string().max(200).optional().default(""),
  youtube: z.string().max(200).optional().default(""),
  members: z.string().max(2000).optional().default(""),
  riderUrl: z.string().max(500).optional().default(""),
  stagePlotUrl: z.string().max(500).optional().default(""),
  availability: z.string().max(500).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  acceptRules: z.boolean(),
  acceptPrivacy: z.boolean(),
  rulesVersion: z.string().default("v1"),
});

export const POST = route<{ slug: string }>(async ({ req, params }) => {
  const ip = await clientIp();
  rateLimit(`apply:${ip ?? "unknown"}`, { capacity: 5, refillPerSec: 0.02 });
  const body = await parseBody(req, schema);
  if (!body.acceptRules || !body.acceptPrivacy) throw new AppError("VALIDATION", "Rules and privacy notice must be accepted.");
  const call = await db.applicationCall.findUnique({ where: { slug: params.slug } });
  if (!call || call.status !== "OPEN") throw new AppError("NOT_FOUND", "Open call not found or closed.");
  const editToken = randomToken(16);
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
  const app = await db.$transaction(async (tx) => {
    const a = await tx.bandApplication.create({
      data: {
        callId: call.id,
        bandName: body.bandName,
        contactName: body.contactName,
        email: body.email.toLowerCase(),
        phone: orNull(body.phone),
        genre: orNull(body.genre),
        city: orNull(body.city),
        isTribute: body.isTribute,
        description: body.description,
        videoUrl: orNull(body.videoUrl),
        instagram: orNull(body.instagram),
        tiktok: orNull(body.tiktok),
        spotify: orNull(body.spotify),
        youtube: orNull(body.youtube),
        membersJson: body.members ? body.members.split("\n").map((l) => l.trim()).filter(Boolean) : undefined,
        riderUrl: orNull(body.riderUrl),
        stagePlotUrl: orNull(body.stagePlotUrl),
        availability: orNull(body.availability),
        notes: orNull(body.notes),
        editTokenHash: sha256(editToken),
      },
    });
    const ipHash = ip ? sha256(ip).slice(0, 32) : null;
    await tx.consent.createMany({
      data: [
        { kind: "CONTEST_RULES", documentVersion: body.rulesVersion, textShown: "Acepto las bases del concurso.", source: "APPLICATION", applicationId: a.id, ipHash },
        { kind: "IMAGE_RIGHTS", documentVersion: body.rulesVersion, textShown: "Autorizo el uso de nombre, imagen, audio y video de la presentación.", source: "APPLICATION", applicationId: a.id, ipHash },
        { kind: "PRIVACY_NOTICE", documentVersion: PRIVACY_VERSION, textShown: "He leído el aviso de privacidad.", source: "APPLICATION", applicationId: a.id, ipHash },
      ],
    });
    await audit(tx, { action: "APPLICATION_SUBMITTED", actorType: "BAND_MANAGER", actorLabel: body.bandName, entityType: "BandApplication", entityId: a.id, ipHash });
    return a;
  });
  return json({ id: app.id }, { status: 201 });
});
