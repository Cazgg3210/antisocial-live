import type { ActorType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "./db";
import { hashCanonical } from "./hash";

export interface AuditInput {
  action: string;
  actorType: ActorType;
  actorId?: string | null;
  actorLabel?: string | null;
  eventId?: string | null;
  performanceId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  ipHash?: string | null;
  requestId?: string | null;
}

/**
 * Appends an audit event with a per-event hash chain. Must run inside the same transaction as
 * the change it describes so the two can never diverge.
 */
export async function audit(tx: Tx | typeof db, input: AuditInput): Promise<string> {
  const prev = input.eventId
    ? await tx.auditEvent.findFirst({ where: { eventId: input.eventId }, orderBy: { createdAt: "desc" }, select: { hash: true } })
    : null;
  const previousHash = prev?.hash ?? null;
  const createdAt = new Date();
  const body = {
    action: input.action,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventId: input.eventId ?? null,
    performanceId: input.performanceId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    payload: input.payload ?? {},
    createdAt: createdAt.toISOString(),
    previousHash,
  };
  const hash = hashCanonical(body);
  const row = await tx.auditEvent.create({
    data: {
      ...body,
      payload: body.payload as Prisma.InputJsonValue,
      actorLabel: input.actorLabel ?? null,
      ipHash: input.ipHash ?? null,
      requestId: input.requestId ?? null,
      createdAt,
      hash,
    },
    select: { id: true },
  });
  return row.id;
}
