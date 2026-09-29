import type { GroupKind } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, notFound, unauthorized } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/hash";

export async function loginWithPassword(email: string, password: string, meta: { ipHash?: string | null; requestId?: string }) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  const ok = user && user.isActive && (await verifyPassword(user.passwordHash, password));
  if (!ok || !user) {
    await audit(db, { action: "LOGIN_FAILED", actorType: "USER", actorLabel: email, ipHash: meta.ipHash, requestId: meta.requestId });
    throw unauthorized("Invalid credentials");
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(db, { action: "LOGIN", actorType: "USER", actorId: user.id, actorLabel: user.email, ipHash: meta.ipHash, requestId: meta.requestId });
  return user;
}

export async function createUser(input: { organizationId: string; email: string; name: string; password: string; roles: { role: "SUPER_ADMIN" | "ORGANIZATION_ADMIN" | "EVENT_MANAGER" | "STAGE_OPERATOR" | "STAFF_COORDINATOR"; eventId?: string | null }[] }) {
  return db.user.create({
    data: {
      organizationId: input.organizationId,
      email: input.email.toLowerCase().trim(),
      name: input.name,
      passwordHash: await hashPassword(input.password),
      roles: { create: input.roles.map((r) => ({ role: r.role, eventId: r.eventId ?? null })) },
    },
  });
}

// ───────────────────────── evaluator tokens ─────────────────────────

const TOKEN_TTL_HOURS = 36;

/** Issues (or reissues) a one-time personal link for a judge/staff assignment. Returns the raw token once. */
export async function issueEvaluatorToken(actor: { userId: string; name: string }, assignmentId: string) {
  return db.$transaction(async (tx) => {
    const a = await tx.evaluatorAssignment.findUnique({ where: { id: assignmentId }, include: { person: true, event: true } });
    if (!a) throw notFound("Assignment");
    await tx.accessToken.updateMany({ where: { assignmentId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
    // Reissue clears the device binding so the evaluator can switch phones.
    await tx.evaluatorAssignment.update({ where: { id: assignmentId }, data: { deviceId: null, status: "ACTIVE" } });
    const raw = randomToken(24);
    const expiresAt = new Date(Math.max(a.event.scheduledAt.getTime() + TOKEN_TTL_HOURS * 3600_000, Date.now() + TOKEN_TTL_HOURS * 3600_000));
    await tx.accessToken.create({ data: { tokenHash: sha256(raw), kind: a.group === "JUDGE" ? "JUDGE" : "STAFF", eventId: a.eventId, assignmentId, expiresAt, createdBy: actor.userId } });
    await audit(tx, { action: "EVALUATOR_TOKEN_ISSUED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId: a.eventId, entityType: "EvaluatorAssignment", entityId: assignmentId, payload: { group: a.group, person: a.person.name } });
    const path = a.group === "JUDGE" ? "j" : "s";
    return { raw, url: `${env().APP_URL}/${path}/${raw}`, expiresAt, personName: a.person.name };
  });
}

export async function revokeEvaluatorAccess(actor: { userId: string; name: string }, assignmentId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const a = await tx.evaluatorAssignment.update({ where: { id: assignmentId }, data: { status: "REVOKED" } });
    await tx.accessToken.updateMany({ where: { assignmentId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
    await audit(tx, { action: "EVALUATOR_TOKEN_REVOKED", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId: a.eventId, entityType: "EvaluatorAssignment", entityId: assignmentId, payload: { reason } });
  });
}

export interface RedeemedToken {
  assignmentId: string;
  eventId: string;
  group: GroupKind;
  personName: string;
  requiresPin: boolean;
  deviceId: string;
}

/** Looks up a token without consuming it (for the "Is this you?" screen). */
export async function peekEvaluatorToken(raw: string) {
  const t = await db.accessToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { assignment: { include: { person: true, event: true } } } });
  if (!t || !t.assignment || t.kind === "BAND_MANAGER") return null;
  if (t.status === "REVOKED" || t.expiresAt < new Date()) return null;
  if (t.status === "USED") {
    // A used token may re-enter only from the same device; the cookie handles that, so refuse here.
    return { reusable: false as const, personName: t.assignment.person.name, eventName: t.assignment.event.name };
  }
  return { reusable: true as const, personName: t.assignment.person.name, eventName: t.assignment.event.name, requiresPin: !!t.assignment.pinHash, group: t.assignment.group };
}

/** Consumes the token, binds the assignment to this device, returns session data. */
export async function redeemEvaluatorToken(raw: string, pin: string | null, meta: { ipHash?: string | null; requestId?: string }): Promise<RedeemedToken> {
  return db.$transaction(async (tx) => {
    const t = await tx.accessToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { assignment: { include: { person: true } } } });
    if (!t || !t.assignment || t.status !== "ACTIVE" || t.expiresAt < new Date()) throw unauthorized("Token invalid or expired");
    if (t.assignment.status !== "ACTIVE") throw unauthorized("Access revoked");
    if (t.assignment.pinHash) {
      if (!pin || !(await verifyPassword(t.assignment.pinHash, pin))) throw new AppError("UNAUTHORIZED", "PIN invalid", { field: "pin" });
    }
    const deviceId = randomToken(12);
    await tx.accessToken.update({ where: { id: t.id }, data: { status: "USED", usedAt: new Date() } });
    await tx.evaluatorAssignment.update({ where: { id: t.assignment.id }, data: { deviceId, lastSeenAt: new Date() } });
    await audit(tx, { action: "EVALUATOR_LOGIN", actorType: "EVALUATOR", actorId: t.assignment.id, actorLabel: t.assignment.person.name, eventId: t.eventId, ipHash: meta.ipHash, requestId: meta.requestId });
    return { assignmentId: t.assignment.id, eventId: t.eventId, group: t.assignment.group, personName: t.assignment.person.name, requiresPin: false, deviceId };
  });
}

export async function setEvaluatorPin(assignmentId: string, pin: string | null) {
  return db.evaluatorAssignment.update({ where: { id: assignmentId }, data: { pinHash: pin ? await hashPassword(pin) : null } });
}

/** Band manager token (to view the band report / edit profile). */
export async function issueBandToken(actor: { userId: string }, eventId: string, bandId: string) {
  const raw = randomToken(24);
  await db.accessToken.create({ data: { tokenHash: sha256(raw), kind: "BAND_MANAGER", eventId, bandId, expiresAt: new Date(Date.now() + 30 * 24 * 3600_000), createdBy: actor.userId } });
  return { raw, url: `${env().APP_URL}/b/${raw}` };
}
