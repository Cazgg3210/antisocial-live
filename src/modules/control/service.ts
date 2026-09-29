import { db, pgPool } from "@/lib/db";
import { env } from "@/lib/env";
import { notFound } from "@/lib/errors";
import { timerElapsedSeconds } from "@/modules/events/service";
import type { PerformanceResult } from "@/modules/scoring-engine";
import { configIssues } from "@/modules/scoring-config/service";

/** Full operational snapshot for the Control Room (privileged). */
export async function controlSnapshot(eventId: string, viewerUserId: string) {
  const event = await db.eventEdition.findUnique({
    where: { id: eventId },
    include: {
      config: true,
      stageScene: true,
      operatorLock: { include: { user: true } },
      assignments: { where: { status: "ACTIVE" }, include: { person: true, tokens: { where: { status: { in: ["ACTIVE", "USED"] } }, orderBy: { createdAt: "desc" }, take: 1 } } },
      incidents: { where: { resolvedAt: null }, orderBy: { createdAt: "desc" }, take: 10 },
      notifications: { where: { audience: { in: ["CONTROL", "ALL_EVALUATORS"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: "desc" }, take: 8 },
      rounds: { orderBy: { order: "asc" }, include: { performances: { orderBy: { slotOrder: "asc" }, include: { band: true, timer: true, currentResult: true, qualification: true, submissions: { select: { group: true, status: true, assignmentId: true, submittedAt: true, lockedAt: true } } } } } },
    },
  });
  if (!event || !event.config) throw notFound("Event");
  const now = Date.now();
  // The active band is the most recently started one still in flight (a revealed band stays "active" until the next starts).
  const active =
    event.rounds
      .flatMap((r) => r.performances)
      .filter((p) => ["ON_STAGE", "VOTING_OPEN", "GRACE_PERIOD", "VOTING_CLOSED", "CALCULATING", "RESULT_READY", "PARTIAL_REVEALED"].includes(p.status))
      .sort((a, b) => (b.onStageAt?.getTime() ?? 0) - (a.onStageAt?.getTime() ?? 0))[0] ?? null;
  const activeRound = active ? event.rounds.find((r) => r.id === active.roundId)! : event.rounds.find((r) => r.status !== "PUBLISHED" && r.status !== "CLOSED") ?? event.rounds[0];
  const next = activeRound?.performances.find((p) => p.status === "SCHEDULED" && (!active || p.slotOrder > active.slotOrder)) ?? null;

  const recentVotes = active ? await db.scoreSubmission.count({ where: { performanceId: active.id, group: "PUBLIC", submittedAt: { gte: new Date(now - 60_000) } } }) : 0;
  const issues = await configIssues(eventId).catch(() => []);
  const dbOk = await pgPool().query("select 1").then(() => true).catch(() => false);

  const evaluators = event.assignments.map((a) => {
    const sub = active?.submissions.find((s) => s.assignmentId === a.id);
    const token = a.tokens[0];
    return {
      id: a.id,
      name: a.person.name,
      group: a.group,
      weightBp: a.individualWeightBp,
      connected: !!a.lastSeenAt && now - a.lastSeenAt.getTime() < 3 * 60_000,
      lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
      tokenStatus: token?.status ?? "NONE",
      state: !sub ? "PENDING" : sub.status === "DRAFT" ? "DRAFT" : "SUBMITTED",
    };
  });

  const perfView = (p: (typeof event.rounds)[number]["performances"][number]) => {
    const pub = p.submissions.filter((s) => s.group === "PUBLIC");
    return {
      id: p.id,
      roundId: p.roundId,
      band: { id: p.band.id, name: p.band.name, imageUrl: p.band.imageUrl },
      slotOrder: p.slotOrder,
      status: p.status,
      version: p.version,
      graceUntil: p.graceUntil?.toISOString() ?? null,
      votes: { accepted: pub.filter((s) => s.status === "ACCEPTED").length, flagged: pub.filter((s) => s.status === "FLAGGED_FOR_REVIEW").length, rejected: pub.filter((s) => s.status === "REJECTED").length },
      timer: p.timer ? { status: p.timer.status, plannedSeconds: p.timer.plannedSeconds, elapsed: timerElapsedSeconds(p.timer), overtimeSeconds: p.timer.overtimeSeconds } : null,
      result: p.currentResult
        ? { id: p.currentResult.id, finalScore: p.currentResult.finalScore.toString(), hash: p.currentResult.hash, approvedAt: p.currentResult.approvedAt?.toISOString() ?? null, partialRevealedAt: p.currentResult.partialRevealedAt?.toISOString() ?? null, publishedAt: p.currentResult.publishedAt?.toISOString() ?? null, calculatedBy: p.currentResult.calculatedBy, payload: p.currentResult.payload as unknown as PerformanceResult }
        : null,
      qualification: p.qualification ? { position: p.qualification.position, status: p.qualification.status } : null,
    };
  };

  return {
    event: { id: event.id, name: event.name, slug: event.slug, mode: event.mode, status: event.status, version: event.version, expectedAttendance: event.expectedAttendance },
    config: { partialRevealPolicy: event.config.partialRevealPolicy, requireResultApproval: event.config.requireResultApproval, graceSeconds: event.config.graceSeconds, finalRevealOrder: event.config.finalRevealOrder, finalRevealStyle: event.config.finalRevealStyle },
    lock: event.operatorLock ? { userId: event.operatorLock.userId, name: event.operatorLock.user.name, isMine: event.operatorLock.userId === viewerUserId, stale: now - event.operatorLock.heartbeatAt.getTime() > 60_000 } : null,
    scene: { type: event.stageScene?.type ?? "WELCOME", payload: (event.stageScene?.payload ?? {}) as Record<string, unknown>, version: event.stageScene?.version ?? 0 },
    health: { db: dbOk, freeze: env().DEPLOYMENT_FREEZE, configIssues: issues.map((i) => ({ code: i.code, message: i.message })) },
    active: active ? perfView(active) : null,
    next: next ? perfView(next) : null,
    rounds: event.rounds.map((r) => ({ id: r.id, name: r.name, order: r.order, status: r.status, qualifiersCount: r.qualifiersCount, nextRoundId: r.nextRoundId, performances: r.performances.map(perfView) })),
    votesPerMinute: recentVotes,
    evaluators,
    incidents: event.incidents.map((i) => ({ id: i.id, severity: i.severity, kind: i.kind, description: i.description, createdAt: i.createdAt.toISOString() })),
    notifications: event.notifications.map((n) => ({ id: n.id, kind: n.kind, titleEs: n.titleEs, titleEn: n.titleEn, createdAt: n.createdAt.toISOString() })),
    serverTime: new Date(now).toISOString(),
  };
}

export type ControlSnapshot = Awaited<ReturnType<typeof controlSnapshot>>;
