import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env, isProd } from "@/lib/env";
import { unauthorized } from "@/lib/errors";
import type { GroupKind, TokenKind } from "@/generated/prisma/enums";
import { signToken, verifyToken } from "./jwt";

export const EVALUATOR_COOKIE = "al_eval";
const TTL = 60 * 60 * 24;

export interface EvaluatorSession {
  assignmentId: string;
  eventId: string;
  group: GroupKind;
  personName: string;
  deviceId: string;
}

export interface BandManagerSession {
  bandId: string;
  eventId: string;
}

export async function createEvaluatorSession(s: EvaluatorSession): Promise<void> {
  const token = await signToken({ kind: "EVALUATOR", ...s }, env().AUTH_SECRET, TTL);
  (await cookies()).set(EVALUATOR_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isProd(), path: "/", maxAge: TTL });
}

export async function createBandManagerSession(s: BandManagerSession): Promise<void> {
  const token = await signToken({ kind: "BAND_MANAGER" as TokenKind, ...s }, env().AUTH_SECRET, TTL);
  (await cookies()).set(EVALUATOR_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isProd(), path: "/", maxAge: TTL });
}

export async function getEvaluatorSession(): Promise<EvaluatorSession | null> {
  const token = (await cookies()).get(EVALUATOR_COOKIE)?.value;
  if (!token) return null;
  const p = await verifyToken<{ kind: string } & EvaluatorSession>(token, env().AUTH_SECRET);
  if (!p || p.kind !== "EVALUATOR") return null;
  return { assignmentId: p.assignmentId, eventId: p.eventId, group: p.group, personName: p.personName, deviceId: p.deviceId };
}

/** Validates the cookie AND that the assignment is still active and bound to this device. */
export async function requireEvaluator(expectedGroup?: GroupKind): Promise<EvaluatorSession> {
  const s = await getEvaluatorSession();
  if (!s) throw unauthorized("Evaluator session required");
  if (expectedGroup && s.group !== expectedGroup) throw unauthorized("Wrong portal for this role");
  const a = await db.evaluatorAssignment.findUnique({ where: { id: s.assignmentId }, select: { status: true, deviceId: true } });
  if (!a || a.status !== "ACTIVE" || (a.deviceId && a.deviceId !== s.deviceId)) throw unauthorized("Access revoked");
  await db.evaluatorAssignment.update({ where: { id: s.assignmentId }, data: { lastSeenAt: new Date() } });
  return s;
}

export async function getBandManagerSession(): Promise<BandManagerSession | null> {
  const token = (await cookies()).get(EVALUATOR_COOKIE)?.value;
  if (!token) return null;
  const p = await verifyToken<{ kind: string } & BandManagerSession>(token, env().AUTH_SECRET);
  if (!p || p.kind !== "BAND_MANAGER") return null;
  return { bandId: p.bandId, eventId: p.eventId };
}
