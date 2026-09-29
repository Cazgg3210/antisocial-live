"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Textarea, cn } from "@/components/ui";
import { ScoreSelector } from "@/components/score-selector";
import { api, ApiError, fmtClock, newKey, useLiveState, useNow } from "@/lib/client";
import type { getEvaluatorContext } from "@/modules/evaluation/service";

type Ctx = Awaited<ReturnType<typeof getEvaluatorContext>>;

export function EvaluateApp() {
  const t = useTranslations("evaluator");
  const tv = useTranslations("vote");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { state: ctx, connected } = useLiveState<Ctx>("/api/evaluator/stream", "/api/evaluator/me", 4000);
  const now = useNow();
  const [values, setValues] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seenNotif, setSeenNotif] = useState<string | null>(null);
  const key = useRef(newKey());
  const loadedFor = useRef<string | null>(null);
  const dirty = useRef(false);

  const active = ctx?.active ?? null;
  const locked = active?.mine?.status === "ACCEPTED";
  const criteria = ctx?.criteria ?? [];
  const anchors = useMemo(() => ({ "1": tv("anchors.1"), "5": tv("anchors.5"), "8": tv("anchors.8"), "10": tv("anchors.10") }), [tv]);
  const name = (c: { nameEs: string; nameEn: string }) => (locale === "en" ? c.nameEn : c.nameEs);

  // Load my draft when the active band changes.
  useEffect(() => {
    if (!active) return;
    if (loadedFor.current !== active.id) {
      loadedFor.current = active.id;
      key.current = newKey();
      dirty.current = false;
      setValues(Object.fromEntries((active.mine?.items ?? []).map((i) => [i.criterionId, i.value])));
      setComment(active.mine?.comment ?? "");
      setErr(null);
    }
  }, [active]);

  // Autosave draft (debounced) while unlocked.
  useEffect(() => {
    if (!active || locked || !dirty.current) return;
    const id = setTimeout(() => {
      void api("/api/evaluator/submission", { method: "POST", json: { performanceId: active.id, submissionKey: key.current, items: Object.entries(values).map(([criterionId, value]) => ({ criterionId, value })), comment, final: false } })
        .then(() => setSavedAt(Date.now()))
        .catch(() => {});
    }, 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, comment]);

  // Timer reminders: vibrate/beep when a new notification arrives.
  const latest = ctx?.notifications[0];
  useEffect(() => {
    if (latest && latest.id !== seenNotif) {
      setSeenNotif(latest.id);
      if (seenNotif !== null && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  const complete = criteria.length > 0 && criteria.every((c) => values[c.id] !== undefined);

  async function submitFinal() {
    if (!active) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/evaluator/submission", { method: "POST", json: { performanceId: active.id, submissionKey: key.current, items: criteria.map((c) => ({ criterionId: c.id, value: values[c.id] })), comment: comment || null, final: true } });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function declareConflict() {
    if (!active) return;
    if (!confirm(t("conflictHelp"))) return;
    await api("/api/evaluator/conflict", { method: "POST", json: { bandId: active.band.id } }).catch(() => {});
  }

  const remaining = active?.timer?.startedAt
    ? active.timer.plannedSeconds - (active.timer.actualSeconds ?? Math.round((now - new Date(active.timer.startedAt).getTime()) / 1000) - active.timer.pausedTotalSeconds - (active.timer.status === "PAUSED" && active.timer.pausedAt ? Math.round((now - new Date(active.timer.pausedAt).getTime()) / 1000) : 0))
    : null;

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-12 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-fg-subtle">{ctx?.assignment.group === "JUDGE" ? t("judgePortal") : t("staffPortal")}</p>
          <h1 className="text-lg font-bold">{ctx ? t("welcome", { name: ctx.assignment.personName }) : "…"}</h1>
          <p className="text-xs text-fg-muted">{ctx?.event.name}</p>
        </div>
        <span className={cn("h-2.5 w-2.5 rounded-full", connected ? "bg-success" : "bg-warning")} aria-label={connected ? "online" : "offline"} />
      </header>

      {latest && (
        <div className="mb-4">
          <Alert tone={latest.kind === "TIMER_OVERTIME" ? "danger" : "info"}>
            <strong>{t("reminder")}:</strong> {locale === "en" ? latest.titleEn : latest.titleEs}
          </Alert>
        </div>
      )}

      {!active && <Card className="text-center text-fg-muted">{t("noActive")}</Card>}

      {active && (
        <>
          <Card className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-fg-subtle">{tv("nowPlaying")}</p>
                <h2 className="text-2xl font-black">{active.band.name}</h2>
                {active.band.genre && <p className="text-sm text-fg-muted">{active.band.genre}</p>}
              </div>
              {active.timer && remaining !== null && (
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-fg-subtle">{remaining < 0 ? t("overtime") : t("remaining")}</p>
                  <p className={cn("font-mono text-3xl font-bold tabular-nums", remaining < 0 ? "text-danger" : remaining < 300 ? "text-warning" : "text-fg")}>{fmtClock(remaining)}</p>
                  {active.timer.status === "PAUSED" && <Badge tone="warning">PAUSE</Badge>}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={active.status === "VOTING_OPEN" ? "acid" : "neutral"}>{active.status}</Badge>
              {locked && <Badge tone="success">{t("locked")}</Badge>}
              {active.conflict && <Badge tone="warning">{t("conflictDeclared")}</Badge>}
            </div>
          </Card>

          {active.conflict ? (
            <Alert tone="warning">{t("conflictDeclared")}</Alert>
          ) : (
            <>
              <div className="space-y-5">
                {criteria.map((c, i) => (
                  <Card key={c.id} className={cn(values[c.id] !== undefined && "border-cyan/40")}>
                    <div className="mb-3 flex items-baseline justify-between">
                      <h3 className="font-semibold"><span className="mr-2 text-fg-subtle">{i + 1}.</span>{name(c)}</h3>
                      {values[c.id] !== undefined && <span className="text-2xl font-black text-accent tabular-nums">{values[c.id]}</span>}
                    </div>
                    {(locale === "en" ? c.descriptionEn : c.descriptionEs) && <p className="mb-2 text-xs text-fg-muted">{locale === "en" ? c.descriptionEn : c.descriptionEs}</p>}
                    <ScoreSelector label={name(c)} value={values[c.id] ?? null} disabled={locked} min={c.scaleMin} max={c.scaleMax} anchors={anchors} onChange={(v) => { dirty.current = true; setValues((s) => ({ ...s, [c.id]: v })); }} />
                  </Card>
                ))}
                <Card>
                  <label className="mb-2 block text-sm font-medium text-fg-muted">{tv("comment")}</label>
                  <Textarea value={comment} disabled={locked} onChange={(e) => { dirty.current = true; setComment(e.target.value); }} maxLength={1000} />
                </Card>
              </div>
              {savedAt && !locked && <p className="mt-2 text-right text-xs text-fg-subtle">{t("draftSaved")}</p>}
              {err && <div className="mt-3"><Alert tone="danger">{err}</Alert></div>}
              {locked ? (
                <Alert tone="success">{t("locked")} — {t("lockedHelp")}</Alert>
              ) : (
                <div className="sticky bottom-0 mt-4 bg-gradient-to-t from-bg via-bg to-transparent pb-4 pt-6">
                  <Button size="xl" className="w-full" disabled={!complete} loading={busy} onClick={submitFinal}>{t("submitFinal")}</Button>
                  <button type="button" className="mt-3 w-full text-center text-xs text-fg-subtle underline" onClick={declareConflict}>{t("conflict")}</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {ctx && ctx.history.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-2 text-xs uppercase tracking-wider text-fg-subtle">{t("history")}</h3>
          <ul className="space-y-1 text-sm text-fg-muted">
            {ctx.history.map((h) => (
              <li key={h.performanceId} className="flex justify-between"><span>{h.band}</span><span className="text-success">✓</span></li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
