import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { requireRole } from "@/lib/auth/admin-session";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import {
  assertOperator,
  cancelPerformance,
  closeVoting,
  heartbeatOperatorLock,
  openVoting,
  pauseTimer,
  reopenVoting,
  resumeTimer,
  setScene,
  startBand,
  stopTimer,
  takeOperatorLock,
  transitionEvent,
  type Actor,
} from "@/modules/events/service";
import { approveResult, calculateResult, finalizeRound, overrideQualification, revealPartial } from "@/modules/results/service";
import { reviewSubmission } from "@/modules/voting/service";
import { unlockSubmission } from "@/modules/evaluation/service";
import { issueEvaluatorToken, revokeEvaluatorAccess } from "@/modules/identity/service";
import { db } from "@/lib/db";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("TAKE_CONTROL"), force: z.boolean().default(false) }),
  z.object({ action: z.literal("HEARTBEAT") }),
  z.object({ action: z.literal("EVENT_GO_LIVE"), expectedVersion: z.number().optional() }),
  z.object({ action: z.literal("EVENT_CLOSE") }),
  z.object({ action: z.literal("EVENT_COMPLETE") }),
  z.object({ action: z.literal("START_BAND"), performanceId: z.string() }),
  z.object({ action: z.literal("OPEN_VOTING"), performanceId: z.string() }),
  z.object({ action: z.literal("CLOSE_VOTING"), performanceId: z.string() }),
  z.object({ action: z.literal("REOPEN_VOTING"), performanceId: z.string(), reason: z.string().min(3) }),
  z.object({ action: z.literal("CALCULATE"), performanceId: z.string() }),
  z.object({ action: z.literal("APPROVE"), performanceId: z.string() }),
  z.object({ action: z.literal("REVEAL_PARTIAL"), performanceId: z.string() }),
  z.object({ action: z.literal("FINALIZE_ROUND"), roundId: z.string(), manualOrder: z.array(z.object({ performanceId: z.string(), position: z.number().int().positive() })).optional() }),
  z.object({ action: z.literal("REVEAL_NEXT"), roundId: z.string() }),
  z.object({ action: z.literal("SCENE"), scene: z.enum(["WELCOME", "NEXT_BAND", "BAND_PLAYING", "VOTE_NOW", "VOTING_COUNTDOWN", "VOTING_CLOSED", "CALCULATING", "PARTIAL_RESULT", "BREAK", "SPONSOR", "FINAL_COUNTDOWN", "LEADERBOARD", "QUALIFIERS", "WINNER", "TECHNICAL_HOLD"]), payload: z.record(z.string(), z.unknown()).optional() }),
  z.object({ action: z.literal("TIMER_PAUSE"), performanceId: z.string(), reason: z.string().default("") }),
  z.object({ action: z.literal("TIMER_RESUME"), performanceId: z.string() }),
  z.object({ action: z.literal("TIMER_STOP"), performanceId: z.string() }),
  z.object({ action: z.literal("CANCEL_PERFORMANCE"), performanceId: z.string(), reason: z.string().min(3) }),
  z.object({ action: z.literal("REVIEW_SUBMISSION"), submissionId: z.string(), decision: z.enum(["ACCEPTED", "REJECTED"]), reason: z.string().min(3) }),
  z.object({ action: z.literal("UNLOCK_SUBMISSION"), submissionId: z.string(), reason: z.string().min(3) }),
  z.object({ action: z.literal("REISSUE_TOKEN"), assignmentId: z.string() }),
  z.object({ action: z.literal("REVOKE_TOKEN"), assignmentId: z.string(), reason: z.string().min(3) }),
  z.object({ action: z.literal("OVERRIDE_QUALIFICATION"), performanceId: z.string(), status: z.enum(["QUALIFIED", "ELIMINATED"]), reason: z.string().min(3) }),
  z.object({ action: z.literal("INCIDENT"), kind: z.string().min(2), description: z.string().min(3), severity: z.enum(["INFO", "WARNING", "CRITICAL"]).default("WARNING") }),
]);

const FLOW_ACTIONS = new Set(["START_BAND", "OPEN_VOTING", "CLOSE_VOTING", "REOPEN_VOTING", "CALCULATE", "REVEAL_PARTIAL", "FINALIZE_ROUND", "REVEAL_NEXT", "SCENE", "TIMER_PAUSE", "TIMER_RESUME", "TIMER_STOP", "EVENT_GO_LIVE", "EVENT_CLOSE", "EVENT_COMPLETE"]);
const MANAGER_ACTIONS = new Set(["APPROVE", "REVIEW_SUBMISSION", "UNLOCK_SUBMISSION", "REISSUE_TOKEN", "REVOKE_TOKEN", "OVERRIDE_QUALIFICATION", "EVENT_GO_LIVE", "EVENT_COMPLETE", "CANCEL_PERFORMANCE"]);

export const POST = route<{ eventId: string }>(async ({ req, params, requestId }) => {
  const { eventId } = params;
  const body = await parseBody(req, schema);
  const session = await requireRole(MANAGER_ACTIONS.has(body.action) ? "EVENT_MANAGER" : "STAGE_OPERATOR", eventId);
  const actor: Actor = { userId: session.userId, name: session.name, requestId };

  if (body.action === "TAKE_CONTROL") return json(await takeOperatorLock(actor, eventId, body.force));
  if (body.action === "HEARTBEAT") {
    await heartbeatOperatorLock(session.userId, eventId);
    return json({ ok: true });
  }
  if (FLOW_ACTIONS.has(body.action)) await assertOperator(session.userId, eventId);

  switch (body.action) {
    case "EVENT_GO_LIVE": {
      const ev = await db.eventEdition.findUniqueOrThrow({ where: { id: eventId } });
      if (ev.status === "CONFIGURING") await transitionEvent(actor, eventId, "READY");
      return json(await transitionEvent(actor, eventId, "LIVE", body.expectedVersion));
    }
    case "EVENT_CLOSE":
      return json(await transitionEvent(actor, eventId, "CLOSING"));
    case "EVENT_COMPLETE":
      return json(await transitionEvent(actor, eventId, "COMPLETED"));
    case "START_BAND":
      return json(await startBand(actor, body.performanceId));
    case "OPEN_VOTING":
      return json(await openVoting(actor, body.performanceId));
    case "CLOSE_VOTING":
      return json(await closeVoting(actor, body.performanceId));
    case "REOPEN_VOTING":
      return json(await reopenVoting(actor, body.performanceId, body.reason));
    case "CALCULATE":
      return json(await calculateResult(actor, body.performanceId));
    case "APPROVE":
      return json(await approveResult(actor, body.performanceId));
    case "REVEAL_PARTIAL":
      await revealPartial(actor, body.performanceId);
      return json({ ok: true });
    case "FINALIZE_ROUND":
      return json(await finalizeRound(actor, body.roundId, body.manualOrder));
    case "REVEAL_NEXT": {
      // Advances the one-by-one final reveal; when everything is revealed, shows LEADERBOARD.
      const scene = await db.stageScene.findUniqueOrThrow({ where: { eventId } });
      const payload = (scene.payload ?? {}) as Record<string, unknown>;
      const ranking = await db.ranking.findFirst({ where: { roundId: body.roundId, isFinal: true }, orderBy: { createdAt: "desc" } });
      const total = Array.isArray(ranking?.payload) ? (ranking!.payload as unknown[]).length : 0;
      const revealed = Math.min(total, (typeof payload.revealedCount === "number" ? payload.revealedCount : 0) + 1);
      const nextScene = revealed >= total ? "LEADERBOARD" : "FINAL_COUNTDOWN";
      return json(await setScene(actor, eventId, nextScene, { roundId: body.roundId, revealedCount: revealed }));
    }
    case "SCENE":
      return json(await setScene(actor, eventId, body.scene, body.payload ?? {}));
    case "TIMER_PAUSE":
      await pauseTimer(actor, body.performanceId, body.reason);
      return json({ ok: true });
    case "TIMER_RESUME":
      await resumeTimer(actor, body.performanceId);
      return json({ ok: true });
    case "TIMER_STOP":
      return json(await stopTimer(actor, body.performanceId));
    case "CANCEL_PERFORMANCE":
      return json(await cancelPerformance(actor, body.performanceId, body.reason));
    case "REVIEW_SUBMISSION":
      return json(await reviewSubmission(actor, body.submissionId, body.decision, body.reason));
    case "UNLOCK_SUBMISSION":
      return json(await unlockSubmission(actor, body.submissionId, body.reason));
    case "REISSUE_TOKEN":
      return json(await issueEvaluatorToken(actor, body.assignmentId));
    case "REVOKE_TOKEN":
      await revokeEvaluatorAccess(actor, body.assignmentId, body.reason);
      return json({ ok: true });
    case "OVERRIDE_QUALIFICATION":
      return json(await overrideQualification(actor, body.performanceId, body.status, body.reason));
    case "INCIDENT":
      return json(await db.incident.create({ data: { eventId, kind: body.kind, description: body.description, severity: body.severity, createdBy: session.userId } }));
  }
  if (env().DEPLOYMENT_FREEZE) throw new AppError("FROZEN", "Unreachable");
  throw new AppError("VALIDATION", "Unknown action");
});
