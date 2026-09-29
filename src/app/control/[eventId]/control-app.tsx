"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, CardTitle, Stat, Traffic, cn } from "@/components/ui";
import { api, ApiError, fmtClock, useLiveState, useNow } from "@/lib/client";
import type { ControlSnapshot } from "@/modules/control/service";

type Me = { userId: string; name: string; canManage: boolean; canOperate: boolean };
type Perf = ControlSnapshot["rounds"][number]["performances"][number];

export function ControlApp({ eventId, me }: { eventId: string; me: Me }) {
  const t = useTranslations("control");
  const locale = useLocale();
  const { state, connected } = useLiveState<ControlSnapshot>(`/api/control/${eventId}/stream`, `/api/control/${eventId}`, 3000);
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tokenModal, setTokenModal] = useState<{ name: string; url: string } | null>(null);

  const isMine = state?.lock?.isMine ?? false;

  // Heartbeat while I hold the lock.
  useEffect(() => {
    if (!isMine) return;
    const id = setInterval(() => void api(`/api/control/${eventId}/action`, { method: "POST", json: { action: "HEARTBEAT" } }).catch(() => {}), 20_000);
    return () => clearInterval(id);
  }, [isMine, eventId]);

  async function act(payload: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(String(payload.action));
    setErr(null);
    try {
      const r = await api<Record<string, unknown>>(`/api/control/${eventId}/action`, { method: "POST", json: payload });
      if (payload.action === "REISSUE_TOKEN" && typeof r.url === "string") setTokenModal({ name: String(r.personName), url: r.url });
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}${e.details.missing ? ` (${JSON.stringify(e.details.missing)})` : ""}` : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!state) return <main className="p-8 text-fg-muted">…</main>;

  const active = state.active;
  const round = state.rounds.find((r) => r.id === (active?.roundId ?? state.rounds.find((x) => x.status !== "PUBLISHED")?.id)) ?? state.rounds[0];
  const roundDone = round && round.performances.filter((p) => p.status !== "CANCELLED").every((p) => p.result);
  const graceLeft = active?.graceUntil ? Math.max(0, Math.ceil((new Date(active.graceUntil).getTime() - now) / 1000)) : 0;
  const needsApproval = state.config.requireResultApproval && active?.result && !active.result.approvedAt;
  const canPartial = state.config.partialRevealPolicy !== "NONE" && state.config.partialRevealPolicy !== "FINAL_ONLY";
  const judges = state.evaluators.filter((e) => e.group === "JUDGE");
  const staff = state.evaluators.filter((e) => e.group === "STAFF");

  const primary = (() => {
    if (state.event.status !== "LIVE") return { label: "GO LIVE", action: { action: "EVENT_GO_LIVE" }, variant: "success" as const, disabled: !me.canManage };
    if (!active) {
      const next = state.next ?? round?.performances.find((p) => p.status === "SCHEDULED");
      return next ? { label: `${t("startBand")} · ${next.band.name}`, action: { action: "START_BAND", performanceId: next.id }, variant: "primary" as const } : null;
    }
    switch (active.status) {
      case "ON_STAGE":
        return { label: t("openVoting"), action: { action: "OPEN_VOTING", performanceId: active.id }, variant: "success" as const, confirm: true };
      case "VOTING_OPEN":
        return { label: t("closeVoting"), action: { action: "CLOSE_VOTING", performanceId: active.id }, variant: "danger" as const, confirm: true };
      case "GRACE_PERIOD":
        return { label: `${t("closeVoting")} (${graceLeft}s)`, action: {}, variant: "danger" as const, disabled: true };
      case "VOTING_CLOSED":
        return { label: t("calculate"), action: { action: "CALCULATE", performanceId: active.id }, variant: "primary" as const };
      case "CALCULATING":
        return { label: t("calculate"), action: {}, variant: "primary" as const, disabled: true };
      case "RESULT_READY":
        if (needsApproval) return { label: t("approve"), action: { action: "APPROVE", performanceId: active.id }, variant: "success" as const, disabled: !me.canManage || active.result?.calculatedBy === me.userId };
        if (canPartial) return { label: t("revealPartial"), action: { action: "REVEAL_PARTIAL", performanceId: active.id }, variant: "primary" as const, confirm: true };
        return state.next ? { label: `${t("nextBand")} · ${state.next.band.name}`, action: { action: "START_BAND", performanceId: state.next.id }, variant: "primary" as const } : null;
      case "PARTIAL_REVEALED":
        return state.next ? { label: `${t("nextBand")} · ${state.next.band.name}`, action: { action: "START_BAND", performanceId: state.next.id }, variant: "primary" as const } : null;
      default:
        return null;
    }
  })();

  const revealEntries = state.scene.type === "FINAL_COUNTDOWN" || state.scene.type === "LEADERBOARD";
  const revealedCount = typeof state.scene.payload.revealedCount === "number" ? state.scene.payload.revealedCount : 0;

  return (
    <main className="min-h-screen bg-bg p-4 text-fg lg:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-fg-subtle">{t("title")}</p>
          <h1 className="text-2xl font-black">{state.event.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={state.event.mode === "LIVE" ? "acid" : "warning"}>{state.event.mode}</Badge>
          <Badge tone={state.event.status === "LIVE" ? "success" : "neutral"}>{state.event.status}</Badge>
          <Traffic state={connected ? "ok" : "bad"} label={connected ? t("connected") : t("disconnected")} />
          <Traffic state={state.health.db ? "ok" : "bad"} label="DB" />
          {state.health.freeze && <Badge tone="warning">FREEZE</Badge>}
          {state.lock ? (
            state.lock.isMine ? (
              <Badge tone="success">{t("youControl")}</Badge>
            ) : (
              <>
                <Badge tone={state.lock.stale ? "warning" : "cyan"}>{t("controlledBy", { name: state.lock.name })}</Badge>
                {me.canOperate && <Button size="sm" variant="outline" onClick={() => act({ action: "TAKE_CONTROL", force: true }, t("confirmAction", { action: t("takeControl") }))}>{t("takeControl")}</Button>}
              </>
            )
          ) : (
            me.canOperate && <Button size="sm" onClick={() => act({ action: "TAKE_CONTROL" })}>{t("takeControl")}</Button>
          )}
          <a href={`/stage/${state.event.slug}`} target="_blank" rel="noreferrer" className="text-sm text-cyan underline">Stage ↗</a>
          <a href={`/vote/${state.event.slug}`} target="_blank" rel="noreferrer" className="text-sm text-cyan underline">Vote ↗</a>
        </div>
      </header>

      {state.health.configIssues.length > 0 && (
        <div className="mb-4"><Alert tone="danger">{state.health.configIssues.map((i) => i.message).join(" · ")}</Alert></div>
      )}
      {err && <div className="mb-4"><Alert tone="danger">{err}</Alert></div>}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* ─── Flow ─── */}
        <section className="space-y-4">
          <Card className="glow">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>{t("currentBand")}</CardTitle>
                <h2 className="text-4xl font-black">{active ? active.band.name : "—"}</h2>
                {active && <Badge tone="cyan" className="mt-2">{active.status}</Badge>}
              </div>
              {active?.timer && (
                <div className="text-right">
                  <CardTitle>{t("timer")}</CardTitle>
                  <TimerClock timer={active.timer} now={now} />
                  <div className="mt-2 flex justify-end gap-2">
                    {(active.timer.status === "RUNNING" || active.timer.status === "OVERTIME") && <Button size="sm" variant="secondary" disabled={!isMine} onClick={() => act({ action: "TIMER_PAUSE", performanceId: active.id, reason: "manual" })}>{t("pauseTimer")}</Button>}
                    {active.timer.status === "PAUSED" && <Button size="sm" variant="secondary" disabled={!isMine} onClick={() => act({ action: "TIMER_RESUME", performanceId: active.id })}>{t("resumeTimer")}</Button>}
                    {active.timer.status !== "STOPPED" && <Button size="sm" variant="ghost" disabled={!isMine} onClick={() => act({ action: "TIMER_STOP", performanceId: active.id })}>{t("stopTimer")}</Button>}
                  </div>
                </div>
              )}
            </div>
            {active && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Stat label={t("public")} value={active.votes.accepted} />
                <Stat label={t("flagged")} value={active.votes.flagged} tone={active.votes.flagged ? "warning" : undefined} />
                <Stat label={t("votesPerMinute")} value={state.votesPerMinute} />
              </div>
            )}
            {active?.result && (
              <div className="mt-4 rounded-md border border-border bg-bg-panel p-3">
                <CardTitle>{t("preview")} — {t("resultStatus")}</CardTitle>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-gradient text-4xl font-black tabular-nums">{active.result.finalScore}</span>
                  {active.result.payload.groups.map((g) => (
                    <span key={g.kind} className="text-sm text-fg-muted">{g.kind}: <strong className="text-fg">{g.score ? Number(g.score).toFixed(2) : "—"}</strong> ({g.acceptedCount})</span>
                  ))}
                  {active.result.approvedAt && <Badge tone="success">APPROVED</Badge>}
                  {active.result.partialRevealedAt && <Badge tone="cyan">REVEALED</Badge>}
                </div>
                <p className="mt-1 font-mono text-[10px] text-fg-subtle">hash {active.result.hash.slice(0, 16)}… · {active.result.payload.policiesApplied.join(", ") || "no policies"}</p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              {primary && (
                <Button size="xl" variant={primary.variant} className="flex-1" disabled={primary.disabled || !isMine && primary.action.action !== "EVENT_GO_LIVE" && primary.action.action !== "APPROVE"} loading={busy === primary.action.action} onClick={() => act(primary.action, "confirm" in primary && primary.confirm ? t("confirmAction", { action: primary.label }) : undefined)}>
                  {primary.label}
                </Button>
              )}
              {active?.status === "VOTING_CLOSED" && isMine && <Button size="lg" variant="ghost" onClick={() => { const reason = prompt("Reason?"); if (reason) void act({ action: "REOPEN_VOTING", performanceId: active.id, reason }); }}>REOPEN</Button>}
            </div>
            {roundDone && round && round.status !== "PUBLISHED" && (
              <Button size="xl" variant="success" className="mt-3 w-full" disabled={!isMine} loading={busy === "FINALIZE_ROUND"} onClick={() => act({ action: "FINALIZE_ROUND", roundId: round.id }, t("confirmAction", { action: t("finalReveal") }))}>
                {t("finalReveal")}
              </Button>
            )}
            {round?.status === "PUBLISHED" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" disabled={!isMine} onClick={() => act({ action: "REVEAL_NEXT", roundId: round.id })}>REVEAL NEXT ({revealEntries ? revealedCount : 0}/{round.performances.filter((p) => p.qualification).length})</Button>
                <Button variant="secondary" disabled={!isMine} onClick={() => act({ action: "SCENE", scene: "LEADERBOARD", payload: { roundId: round.id } })}>LEADERBOARD</Button>
                <Button variant="secondary" disabled={!isMine} onClick={() => act({ action: "SCENE", scene: "QUALIFIERS", payload: { roundId: round.id } })}>QUALIFIERS</Button>
                <Button variant="secondary" disabled={!isMine} onClick={() => act({ action: "SCENE", scene: "WINNER", payload: { roundId: round.id } })}>WINNER</Button>
                {me.canManage && state.event.status === "LIVE" && <Button variant="ghost" onClick={() => act({ action: "EVENT_CLOSE" }, t("confirmAction", { action: "CLOSE EVENT" }))}>CLOSE EVENT</Button>}
                {me.canManage && state.event.status === "CLOSING" && <Button variant="ghost" onClick={() => act({ action: "EVENT_COMPLETE" }, t("confirmAction", { action: "COMPLETE EVENT" }))}>COMPLETE EVENT</Button>}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>{t("scene")}: <span className="text-cyan">{state.scene.type}</span></CardTitle>
            <div className="flex flex-wrap gap-2">
              {(["WELCOME", "NEXT_BAND", "BAND_PLAYING", "VOTE_NOW", "VOTING_CLOSED", "BREAK", "SPONSOR", "TECHNICAL_HOLD"] as const).map((s) => (
                <Button key={s} size="sm" variant={state.scene.type === s ? "primary" : "secondary"} disabled={!isMine} onClick={() => act({ action: "SCENE", scene: s, payload: active ? { performanceId: active.id } : {} })}>
                  {s === "BREAK" ? t("break") : s === "SPONSOR" ? t("sponsor") : s === "TECHNICAL_HOLD" ? t("hold") : s}
                </Button>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Lineup</CardTitle>
            {state.rounds.map((r) => (
              <div key={r.id} className="mb-3">
                <p className="mb-1 text-sm font-semibold text-fg-muted">{r.name} · <Badge>{r.status}</Badge> · top {r.qualifiersCount}</p>
                <ul className="divide-y divide-border">
                  {r.performances.map((p) => (
                    <PerfRow key={p.id} p={p} isMine={isMine} canManage={me.canManage} act={act} activeId={active?.id ?? null} />
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        </section>

        {/* ─── Monitoring ─── */}
        <section className="space-y-4">
          <Card>
            <CardTitle>{t("judges")} ({judges.filter((j) => j.state === "SUBMITTED").length}/{judges.length})</CardTitle>
            <EvaluatorList list={judges} canManage={me.canManage} act={act} t={t} />
          </Card>
          <Card>
            <CardTitle>{t("staff")} ({staff.filter((j) => j.state === "SUBMITTED").length}/{staff.length})</CardTitle>
            <EvaluatorList list={staff} canManage={me.canManage} act={act} t={t} />
          </Card>
          <Card>
            <CardTitle>{t("notifications")}</CardTitle>
            <ul className="space-y-1 text-sm">
              {state.notifications.slice(0, 5).map((n) => (
                <li key={n.id} className="flex justify-between gap-2"><span>{locale === "en" ? n.titleEn : n.titleEs}</span><span className="text-xs text-fg-subtle">{new Date(n.createdAt).toLocaleTimeString()}</span></li>
              ))}
              {state.notifications.length === 0 && <li className="text-fg-subtle">—</li>}
            </ul>
          </Card>
          <Card>
            <CardTitle>{t("incidents")}</CardTitle>
            <ul className="space-y-1 text-sm">
              {state.incidents.map((i) => (
                <li key={i.id}><Badge tone={i.severity === "CRITICAL" ? "danger" : i.severity === "WARNING" ? "warning" : "neutral"}>{i.kind}</Badge> {i.description}</li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => { const d = prompt("Incident description"); if (d) void act({ action: "INCIDENT", kind: "MANUAL", description: d }); }}>+ incident</Button>
          </Card>
          <Card>
            <CardTitle>{t("health")}</CardTitle>
            <div className="space-y-1">
              <Traffic state={state.health.db ? "ok" : "bad"} label="PostgreSQL" />
              <Traffic state={connected ? "ok" : "warn"} label="Realtime (SSE)" />
              <Traffic state={state.health.configIssues.length ? "bad" : "ok"} label="Configuration" />
              <Traffic state={state.health.freeze ? "warn" : "ok"} label={state.health.freeze ? "Deployment freeze ON" : "Deployment freeze OFF"} />
            </div>
          </Card>
        </section>
      </div>

      {tokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setTokenModal(null)}>
          <Card className="max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardTitle>{tokenModal.name}</CardTitle>
            <p className="mb-2 text-sm text-fg-muted">Personal one-time link (share via WhatsApp / show QR):</p>
            <code className="block break-all rounded-md bg-bg p-3 text-xs">{tokenModal.url}</code>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => navigator.clipboard.writeText(tokenModal.url)}>Copy</Button>
              <Button size="sm" variant="secondary" onClick={() => setTokenModal(null)}>Close</Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

function TimerClock({ timer, now }: { timer: NonNullable<Perf["timer"]>; now: number }) {
  // elapsed is computed server-side at snapshot time; extrapolate locally.
  const [base] = useState(() => ({ elapsed: timer.elapsed, at: now, status: timer.status }));
  const extra = timer.status === "RUNNING" || timer.status === "OVERTIME" ? Math.round((now - base.at) / 1000) : 0;
  const elapsed = base.status === timer.status ? base.elapsed + extra : timer.elapsed;
  const remaining = timer.plannedSeconds - elapsed;
  return <p className={cn("font-mono text-4xl font-black tabular-nums", remaining < 0 ? "text-danger" : remaining < 300 ? "text-warning" : "text-fg")}>{fmtClock(remaining)}</p>;
}

function PerfRow({ p, isMine, canManage, act, activeId }: { p: Perf; isMine: boolean; canManage: boolean; act: (payload: Record<string, unknown>, c?: string) => Promise<void>; activeId: string | null }) {
  const tone = p.status === "FINALIZED" ? "success" : p.id === activeId ? "cyan" : p.status === "CANCELLED" ? "danger" : "neutral";
  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="w-5 text-fg-subtle">{p.slotOrder}</span>
        <span className={cn("font-semibold", p.id === activeId && "text-cyan")}>{p.band.name}</span>
        <Badge tone={tone}>{p.status}</Badge>
        {p.qualification && <Badge tone={p.qualification.status === "QUALIFIED" ? "acid" : p.qualification.status === "PENDING" ? "warning" : "neutral"}>#{p.qualification.position} {p.qualification.status}</Badge>}
      </div>
      <div className="flex items-center gap-2">
        {p.result && <span className="font-mono text-fg-muted">{p.result.finalScore}</span>}
        {p.status === "SCHEDULED" && isMine && !activeId && <Button size="sm" variant="secondary" onClick={() => act({ action: "START_BAND", performanceId: p.id })}>START</Button>}
        {p.status === "SCHEDULED" && canManage && <Button size="sm" variant="ghost" onClick={() => { const r = prompt("Reason?"); if (r) void act({ action: "CANCEL_PERFORMANCE", performanceId: p.id, reason: r }); }}>✕</Button>}
      </div>
    </li>
  );
}

function EvaluatorList({ list, canManage, act, t }: { list: ControlSnapshot["evaluators"]; canManage: boolean; act: (p: Record<string, unknown>, c?: string) => Promise<void>; t: ReturnType<typeof useTranslations> }) {
  return (
    <ul className="divide-y divide-border">
      {list.map((e) => (
        <li key={e.id} className="flex items-center justify-between py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", e.connected ? "bg-success" : "bg-fg-subtle")} />
            <span>{e.name}</span>
            {e.weightBp !== 10000 && <span className="text-xs text-fg-subtle">×{(e.weightBp / 10000).toFixed(2)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={e.state === "SUBMITTED" ? "success" : e.state === "DRAFT" ? "warning" : "neutral"}>{e.state === "SUBMITTED" ? t("submitted") : e.state === "DRAFT" ? t("draft") : t("pending")}</Badge>
            {canManage && <Button size="sm" variant="ghost" onClick={() => act({ action: "REISSUE_TOKEN", assignmentId: e.id })}>link</Button>}
          </div>
        </li>
      ))}
    </ul>
  );
}
