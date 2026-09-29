import type { Prisma } from "@/generated/prisma/client";
import type { EventStatus, PerformanceStatus, StageSceneType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, invalidTransition, notFound } from "@/lib/errors";
import { randomToken } from "@/lib/hash";
import { createConfigurationSnapshot, seedDefaultConfiguration } from "@/modules/scoring-config/service";

export interface Actor {
  userId: string;
  name: string;
  requestId?: string;
}

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// ───────────────────────── creation ─────────────────────────

export async function createEvent(
  actor: Actor,
  input: { seriesId: string; venueId: string; name: string; scheduledAt: Date; mode?: "REHEARSAL" | "LIVE" },
) {
  return db.$transaction(async (tx) => {
    const base = slugify(input.name);
    let slug = base;
    for (let i = 2; await tx.eventEdition.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    const event = await tx.eventEdition.create({
      data: {
        seriesId: input.seriesId,
        venueId: input.venueId,
        name: input.name,
        slug,
        scheduledAt: input.scheduledAt,
        mode: input.mode ?? "REHEARSAL",
        status: "CONFIGURING",
        createdBy: actor.userId,
        stageScene: { create: { type: "WELCOME" } },
        securitySalt: { create: { salt: randomToken(32) } },
        rounds: { create: { name: "Ronda 1", order: 1, qualifiersCount: 1 } },
      },
    });
    await seedDefaultConfiguration(tx, event.id);
    await audit(tx, { action: "EVENT_CREATED", actorType: "USER", actorId: actor.userId, eventId: event.id, entityType: "EventEdition", entityId: event.id });
    return event;
  });
}

export async function addPerformance(actor: Actor, roundId: string, bandId: string) {
  return db.$transaction(async (tx) => {
    const round = await tx.round.findUnique({ where: { id: roundId }, include: { performances: true } });
    if (!round) throw notFound("Round");
    const slotOrder = (Math.max(0, ...round.performances.map((p) => p.slotOrder)) || 0) + 1;
    const p = await tx.performance.create({ data: { roundId, bandId, slotOrder } });
    await audit(tx, { action: "PERFORMANCE_ADDED", actorType: "USER", actorId: actor.userId, eventId: round.eventId, entityType: "Performance", entityId: p.id, payload: { bandId, slotOrder } });
    return p;
  });
}

export async function reorderPerformances(actor: Actor, roundId: string, orderedIds: string[]) {
  return db.$transaction(async (tx) => {
    const round = await tx.round.findUniqueOrThrow({ where: { id: roundId } });
    // Two-phase update avoids unique(roundId, slotOrder) collisions.
    for (let i = 0; i < orderedIds.length; i++) await tx.performance.update({ where: { id: orderedIds[i] }, data: { slotOrder: 1000 + i } });
    for (let i = 0; i < orderedIds.length; i++) await tx.performance.update({ where: { id: orderedIds[i] }, data: { slotOrder: i + 1 } });
    await audit(tx, { action: "PERFORMANCES_REORDERED", actorType: "USER", actorId: actor.userId, eventId: round.eventId, payload: { orderedIds } });
  });
}

// ───────────────────────── event lifecycle ─────────────────────────

const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ["CONFIGURING", "ARCHIVED"],
  CONFIGURING: ["READY", "ARCHIVED"],
  READY: ["LIVE", "CONFIGURING", "ARCHIVED"],
  LIVE: ["CLOSING"],
  CLOSING: ["COMPLETED", "LIVE"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};

export async function transitionEvent(actor: Actor, eventId: string, to: EventStatus, expectedVersion?: number) {
  return db.$transaction(async (tx) => {
    const ev = await lockEvent(tx, eventId);
    if (expectedVersion !== undefined && ev.version !== expectedVersion) throw new AppError("CONFLICT", "Event was modified by someone else; refresh and retry.");
    if (!EVENT_TRANSITIONS[ev.status].includes(to)) throw invalidTransition(`Cannot move event from ${ev.status} to ${to}`);
    if (to === "READY" || to === "LIVE") {
      const { configIssues } = await import("@/modules/scoring-config/service");
      const issues = await configIssues(eventId);
      if (issues.length) throw issues[0];
      const perfCount = await tx.performance.count({ where: { round: { eventId }, status: { not: "CANCELLED" } } });
      if (perfCount === 0) throw invalidTransition("The event has no bands scheduled.");
    }
    if (to === "LIVE" && env().DEPLOYMENT_FREEZE === false) {
      // Going LIVE is the natural moment to freeze the configuration.
      await createConfigurationSnapshot(tx, eventId, actor.userId);
    }
    const updated = await tx.eventEdition.update({
      where: { id: eventId },
      data: {
        status: to,
        version: { increment: 1 },
        startedAt: to === "LIVE" && !ev.startedAt ? new Date() : undefined,
        completedAt: to === "COMPLETED" ? new Date() : undefined,
      },
    });
    await audit(tx, { action: `EVENT_${to}`, actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId, requestId: actor.requestId, payload: { from: ev.status, to } });
    return updated;
  });
}

export async function setEventMode(actor: Actor, eventId: string, mode: "REHEARSAL" | "LIVE") {
  return db.$transaction(async (tx) => {
    const ev = await tx.eventEdition.update({ where: { id: eventId }, data: { mode, version: { increment: 1 } } });
    await audit(tx, { action: "EVENT_MODE_CHANGED", actorType: "USER", actorId: actor.userId, eventId, payload: { mode } });
    return ev;
  });
}

// ───────────────────────── performance lifecycle ─────────────────────────

const PERF_TRANSITIONS: Record<PerformanceStatus, PerformanceStatus[]> = {
  SCHEDULED: ["ON_STAGE", "CANCELLED"],
  ON_STAGE: ["VOTING_OPEN", "SCHEDULED"],
  VOTING_OPEN: ["GRACE_PERIOD", "VOTING_CLOSED"],
  GRACE_PERIOD: ["VOTING_CLOSED"],
  VOTING_CLOSED: ["CALCULATING", "VOTING_OPEN"],
  CALCULATING: ["RESULT_READY", "VOTING_CLOSED"],
  RESULT_READY: ["PARTIAL_REVEALED", "FINALIZED", "CALCULATING"],
  PARTIAL_REVEALED: ["FINALIZED", "CALCULATING"],
  FINALIZED: [],
  CANCELLED: ["SCHEDULED"],
};

async function lockEvent(tx: Tx, eventId: string) {
  const rows = await tx.$queryRaw<{ id: string; status: EventStatus; version: number; startedAt: Date | null; mode: string }[]>`
    SELECT id, status, version, "startedAt", mode FROM "EventEdition" WHERE id = ${eventId} FOR UPDATE`;
  if (!rows[0]) throw notFound("Event");
  return rows[0];
}

export async function lockPerformance(tx: Tx, performanceId: string) {
  const rows = await tx.$queryRaw<{ id: string; status: PerformanceStatus; version: number; roundId: string; bandId: string; graceUntil: Date | null }[]>`
    SELECT id, status, version, "roundId", "bandId", "graceUntil" FROM "Performance" WHERE id = ${performanceId} FOR UPDATE`;
  if (!rows[0]) throw notFound("Performance");
  return rows[0];
}

export async function eventIdOfPerformance(tx: Tx | typeof db, performanceId: string): Promise<string> {
  const p = await tx.performance.findUnique({ where: { id: performanceId }, select: { round: { select: { eventId: true } } } });
  if (!p) throw notFound("Performance");
  return p.round.eventId;
}

async function movePerformance(
  tx: Tx,
  actor: Actor,
  performanceId: string,
  to: PerformanceStatus,
  extra: Prisma.PerformanceUpdateInput = {},
  action?: string,
) {
  const p = await lockPerformance(tx, performanceId);
  if (!PERF_TRANSITIONS[p.status].includes(to)) throw invalidTransition(`Cannot move performance from ${p.status} to ${to}`, { from: p.status, to });
  const eventId = await eventIdOfPerformance(tx, performanceId);
  const updated = await tx.performance.update({ where: { id: performanceId }, data: { status: to, version: { increment: 1 }, ...extra } });
  await audit(tx, {
    action: action ?? `PERFORMANCE_${to}`,
    actorType: "USER",
    actorId: actor.userId,
    actorLabel: actor.name,
    eventId,
    performanceId,
    requestId: actor.requestId,
    payload: { from: p.status, to },
  });
  return { updated, eventId };
}

/** START BAND: puts the band on stage and starts its timer. Any other ON_STAGE band is not allowed. */
export async function startBand(actor: Actor, performanceId: string) {
  return db.$transaction(async (tx) => {
    const eventId = await eventIdOfPerformance(tx, performanceId);
    const ev = await lockEvent(tx, eventId);
    if (ev.status !== "LIVE") throw invalidTransition("Event is not LIVE.");
    const onStage = await tx.performance.findFirst({ where: { round: { eventId }, status: { in: ["ON_STAGE", "VOTING_OPEN", "GRACE_PERIOD"] } } });
    if (onStage && onStage.id !== performanceId) throw invalidTransition("Another band is already on stage or being voted.", { performanceId: onStage.id });
    const cfg = await tx.eventConfig.findUniqueOrThrow({ where: { eventId } });
    const { updated } = await movePerformance(tx, actor, performanceId, "ON_STAGE", { onStageAt: new Date() }, "PERFORMANCE_STARTED");
    await tx.performanceTimer.upsert({
      where: { performanceId },
      create: { performanceId, status: "RUNNING", plannedSeconds: cfg.timerPlannedSeconds, startedAt: new Date() },
      update: { status: "RUNNING", plannedSeconds: cfg.timerPlannedSeconds, startedAt: new Date(), pausedAt: null, pausedTotalSeconds: 0, stoppedAt: null, remindersSent: [] },
    });
    await audit(tx, { action: "TIMER_STARTED", actorType: "USER", actorId: actor.userId, eventId, performanceId });
    await setSceneTx(tx, eventId, "BAND_PLAYING", { performanceId }, actor.userId);
    return updated;
  });
}

/** OPEN VOTING: requires a valid configuration snapshot and the band ON_STAGE. Idempotent on repeat. */
export async function openVoting(actor: Actor, performanceId: string) {
  return db.$transaction(async (tx) => {
    const p = await lockPerformance(tx, performanceId);
    if (p.status === "VOTING_OPEN") return tx.performance.findUniqueOrThrow({ where: { id: performanceId } });
    const eventId = await eventIdOfPerformance(tx, performanceId);
    const ev = await lockEvent(tx, eventId);
    if (ev.status !== "LIVE") throw invalidTransition("Event is not LIVE.");
    const snapshot = await createConfigurationSnapshot(tx, eventId, actor.userId);
    const { updated } = await movePerformance(
      tx,
      actor,
      performanceId,
      "VOTING_OPEN",
      { votingOpenedAt: new Date(), snapshot: { connect: { id: snapshot.id } } },
      "VOTING_OPENED",
    );
    // Stop the timer if it is still running: the band finished playing.
    const timer = await tx.performanceTimer.findUnique({ where: { performanceId } });
    if (timer && (timer.status === "RUNNING" || timer.status === "OVERTIME" || timer.status === "PAUSED")) {
      await stopTimerTx(tx, actor, performanceId, eventId);
    }
    await setSceneTx(tx, eventId, "VOTE_NOW", { performanceId }, actor.userId);
    return updated;
  });
}

/**
 * CLOSE VOTING: enters GRACE_PERIOD (configurable seconds) so in-flight submissions land, then
 * VOTING_CLOSED. Votes are accepted only while the row status is VOTING_OPEN/GRACE_PERIOD, and
 * the submit path locks the row, so the close is deterministic under a race.
 */
export async function closeVoting(actor: Actor, performanceId: string) {
  return db.$transaction(async (tx) => {
    const p = await lockPerformance(tx, performanceId);
    if (p.status === "VOTING_CLOSED" || p.status === "GRACE_PERIOD") return tx.performance.findUniqueOrThrow({ where: { id: performanceId } });
    const eventId = await eventIdOfPerformance(tx, performanceId);
    const cfg = await tx.eventConfig.findUniqueOrThrow({ where: { eventId } });
    const now = new Date();
    if (cfg.graceSeconds > 0) {
      const graceUntil = new Date(now.getTime() + cfg.graceSeconds * 1000);
      const { updated } = await movePerformance(tx, actor, performanceId, "GRACE_PERIOD", { votingClosedAt: now, graceUntil }, "VOTING_CLOSED");
      await setSceneTx(tx, eventId, "VOTING_CLOSED", { performanceId }, actor.userId);
      return updated;
    }
    const { updated } = await movePerformance(tx, actor, performanceId, "VOTING_CLOSED", { votingClosedAt: now, graceUntil: now }, "VOTING_CLOSED");
    await setSceneTx(tx, eventId, "VOTING_CLOSED", { performanceId }, actor.userId);
    return updated;
  });
}

/** Called by the job runner: promotes GRACE_PERIOD → VOTING_CLOSED once graceUntil passed. */
export async function settleGracePeriods(): Promise<number> {
  const due = await db.performance.findMany({ where: { status: "GRACE_PERIOD", graceUntil: { lte: new Date() } }, select: { id: true } });
  for (const p of due) {
    await db.$transaction(async (tx) => {
      const locked = await lockPerformance(tx, p.id);
      if (locked.status !== "GRACE_PERIOD") return;
      await tx.performance.update({ where: { id: p.id }, data: { status: "VOTING_CLOSED", version: { increment: 1 } } });
      await audit(tx, { action: "GRACE_PERIOD_ENDED", actorType: "SYSTEM", eventId: await eventIdOfPerformance(tx, p.id), performanceId: p.id });
    });
  }
  return due.length;
}

export async function reopenVoting(actor: Actor, performanceId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const { updated, eventId } = await movePerformance(tx, actor, performanceId, "VOTING_OPEN", { votingClosedAt: null, graceUntil: null }, "VOTING_REOPENED");
    await audit(tx, { action: "VOTING_REOPENED_REASON", actorType: "USER", actorId: actor.userId, eventId, performanceId, payload: { reason } });
    await setSceneTx(tx, eventId, "VOTE_NOW", { performanceId }, actor.userId);
    return updated;
  });
}

export async function cancelPerformance(actor: Actor, performanceId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const { updated, eventId } = await movePerformance(tx, actor, performanceId, "CANCELLED", {}, "PERFORMANCE_CANCELLED");
    await audit(tx, { action: "PERFORMANCE_CANCELLED_REASON", actorType: "USER", actorId: actor.userId, eventId, performanceId, payload: { reason } });
    return updated;
  });
}

// ───────────────────────── timer ─────────────────────────

export async function pauseTimer(actor: Actor, performanceId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const t = await tx.performanceTimer.findUniqueOrThrow({ where: { performanceId } });
    if (t.status !== "RUNNING" && t.status !== "OVERTIME") throw invalidTransition("Timer is not running.");
    const eventId = await eventIdOfPerformance(tx, performanceId);
    await tx.performanceTimer.update({ where: { performanceId }, data: { status: "PAUSED", pausedAt: new Date() } });
    await audit(tx, { action: "TIMER_PAUSED", actorType: "USER", actorId: actor.userId, eventId, performanceId, payload: { reason } });
  });
}

export async function resumeTimer(actor: Actor, performanceId: string) {
  return db.$transaction(async (tx) => {
    const t = await tx.performanceTimer.findUniqueOrThrow({ where: { performanceId } });
    if (t.status !== "PAUSED" || !t.pausedAt) throw invalidTransition("Timer is not paused.");
    const eventId = await eventIdOfPerformance(tx, performanceId);
    const pausedFor = Math.round((Date.now() - t.pausedAt.getTime()) / 1000);
    await tx.performanceTimer.update({
      where: { performanceId },
      data: { status: "RUNNING", pausedAt: null, pausedTotalSeconds: { increment: pausedFor } },
    });
    await audit(tx, { action: "TIMER_RESUMED", actorType: "USER", actorId: actor.userId, eventId, performanceId, payload: { pausedFor } });
  });
}

export async function stopTimer(actor: Actor, performanceId: string) {
  return db.$transaction(async (tx) => stopTimerTx(tx, actor, performanceId, await eventIdOfPerformance(tx, performanceId)));
}

async function stopTimerTx(tx: Tx, actor: Actor, performanceId: string, eventId: string) {
  const t = await tx.performanceTimer.findUniqueOrThrow({ where: { performanceId } });
  if (t.status === "STOPPED" || !t.startedAt) return t;
  const now = new Date();
  const pausedExtra = t.status === "PAUSED" && t.pausedAt ? Math.round((now.getTime() - t.pausedAt.getTime()) / 1000) : 0;
  const elapsed = Math.round((now.getTime() - t.startedAt.getTime()) / 1000) - t.pausedTotalSeconds - pausedExtra;
  const overtime = Math.max(0, elapsed - t.plannedSeconds);
  const updated = await tx.performanceTimer.update({
    where: { performanceId },
    data: { status: "STOPPED", stoppedAt: now, actualSeconds: elapsed, overtimeSeconds: overtime, pausedAt: null, pausedTotalSeconds: t.pausedTotalSeconds + pausedExtra },
  });
  await audit(tx, { action: "TIMER_STOPPED", actorType: "USER", actorId: actor.userId, eventId, performanceId, payload: { actualSeconds: elapsed, overtimeSeconds: overtime } });
  return updated;
}

export function timerElapsedSeconds(t: { startedAt: Date | null; pausedAt: Date | null; pausedTotalSeconds: number; status: string; actualSeconds: number | null }, now = Date.now()): number {
  if (t.actualSeconds !== null) return t.actualSeconds;
  if (!t.startedAt) return 0;
  const pausedExtra = t.status === "PAUSED" && t.pausedAt ? Math.round((now - t.pausedAt.getTime()) / 1000) : 0;
  return Math.round((now - t.startedAt.getTime()) / 1000) - t.pausedTotalSeconds - pausedExtra;
}

/**
 * Job: emits timer reminders (offsets in seconds before planned end; negative = overtime) as
 * Notifications for judges/staff/control, and flips RUNNING → OVERTIME.
 */
export async function tickTimers(): Promise<void> {
  const timers = await db.performanceTimer.findMany({
    where: { status: { in: ["RUNNING", "OVERTIME"] } },
    include: { performance: { include: { band: true, round: { include: { event: { include: { config: true } } } } } } },
  });
  for (const t of timers) {
    const cfg = t.performance.round.event.config;
    if (!cfg) continue;
    const elapsed = timerElapsedSeconds(t);
    const remaining = t.plannedSeconds - elapsed;
    const eventId = t.performance.round.eventId;
    const due = cfg.timerReminderOffsets.filter((offset) => remaining <= offset && !t.remindersSent.includes(offset));
    for (const offset of due) {
      const minutes = Math.abs(Math.round(offset / 60));
      const isOver = offset < 0;
      await db.$transaction(async (tx) => {
        await tx.notification.create({
          data: {
            eventId,
            performanceId: t.performanceId,
            audience: "ALL_EVALUATORS",
            kind: isOver ? "TIMER_OVERTIME" : offset === 0 ? "TIMER_END" : "TIMER_REMINDER",
            titleEs: isOver ? `${t.performance.band.name}: ${minutes} min de tiempo excedido` : offset === 0 ? `${t.performance.band.name}: tiempo cumplido` : `${t.performance.band.name}: quedan ${minutes} min`,
            titleEn: isOver ? `${t.performance.band.name}: ${minutes} min overtime` : offset === 0 ? `${t.performance.band.name}: time is up` : `${t.performance.band.name}: ${minutes} min left`,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        await tx.performanceTimer.update({ where: { id: t.id }, data: { remindersSent: { push: offset } } });
        await audit(tx, { action: "TIMER_REMINDER_SENT", actorType: "SYSTEM", eventId, performanceId: t.performanceId, payload: { offset } });
      });
    }
    if (remaining < 0 && t.status === "RUNNING") {
      await db.performanceTimer.update({ where: { id: t.id }, data: { status: "OVERTIME" } });
    }
  }
}

// ───────────────────────── stage scene ─────────────────────────

export async function setSceneTx(tx: Tx, eventId: string, type: StageSceneType, payload: Record<string, unknown> = {}, updatedBy?: string) {
  return tx.stageScene.upsert({
    where: { eventId },
    create: { eventId, type, payload: payload as Prisma.InputJsonValue, updatedBy },
    update: { type, payload: payload as Prisma.InputJsonValue, updatedBy, version: { increment: 1 } },
  });
}

export async function setScene(actor: Actor, eventId: string, type: StageSceneType, payload: Record<string, unknown> = {}) {
  return db.$transaction(async (tx) => {
    const scene = await setSceneTx(tx, eventId, type, payload, actor.userId);
    await audit(tx, { action: "STAGE_SCENE_CHANGED", actorType: "USER", actorId: actor.userId, eventId, payload: { type, ...payload } });
    return scene;
  });
}

// ───────────────────────── operator lock ─────────────────────────

export async function takeOperatorLock(actor: Actor, eventId: string, force = false) {
  return db.$transaction(async (tx) => {
    const existing = await tx.operatorLock.findUnique({ where: { eventId }, include: { user: true } });
    const stale = existing && Date.now() - existing.heartbeatAt.getTime() > 60_000;
    if (existing && existing.userId !== actor.userId && !force && !stale) {
      throw new AppError("CONFLICT", `Control is held by ${existing.user.name}`, { heldBy: existing.user.name });
    }
    const lock = await tx.operatorLock.upsert({
      where: { eventId },
      create: { eventId, userId: actor.userId },
      update: { userId: actor.userId, takenAt: new Date(), heartbeatAt: new Date() },
    });
    if (!existing || existing.userId !== actor.userId) {
      await audit(tx, { action: "OPERATOR_LOCK_TAKEN", actorType: "USER", actorId: actor.userId, actorLabel: actor.name, eventId, payload: { forced: force, previous: existing?.userId ?? null } });
    }
    return lock;
  });
}

export async function heartbeatOperatorLock(userId: string, eventId: string) {
  await db.operatorLock.updateMany({ where: { eventId, userId }, data: { heartbeatAt: new Date() } });
}

export async function assertOperator(userId: string, eventId: string) {
  const lock = await db.operatorLock.findUnique({ where: { eventId }, include: { user: true } });
  if (!lock || lock.userId !== userId) {
    throw new AppError("FORBIDDEN", lock ? `Control is held by ${lock.user.name}. Take control first.` : "Take control first.", { heldBy: lock?.user.name ?? null });
  }
}
