"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import QRCode from "qrcode";
import { cn } from "@/components/ui";
import { fmtClock, useLiveState, useNow } from "@/lib/client";
import type { StageSnapshot } from "@/modules/stage/service";

export function StageApp({ slug }: { slug: string }) {
  const t = useTranslations("stage");
  const locale = useLocale();
  const { state, connected } = useLiveState<StageSnapshot>(`/api/stage/${slug}/stream`, `/api/stage/${slug}`, 3000);
  const now = useNow(500);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (state?.voteUrl) void QRCode.toDataURL(state.voteUrl, { margin: 1, width: 640, color: { dark: "#000000", light: "#ffffff" } }).then(setQr);
  }, [state?.voteUrl]);

  // Sponsor impressions when a sponsor-bearing scene is shown.
  const sceneType = state?.scene.type;
  useEffect(() => {
    if (!state) return;
    const placements = sceneType === "SPONSOR" || sceneType === "BREAK" ? state.sponsor.scenes : state.sponsor.presentedBy ? [state.sponsor.presentedBy] : [];
    for (const p of placements) void fetch("/api/sponsors/impression", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placementId: p.placementId, eventId: state.event.id, performanceId: state.active?.id ?? null }) }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneType, state?.scene.version]);

  const graceLeft = useMemo(() => (state?.active?.graceUntil ? Math.max(0, (new Date(state.active.graceUntil).getTime() - now) / 1000) : 0), [state?.active?.graceUntil, now]);

  if (!state) return <Frame connected={connected}><h1 className="text-gradient text-7xl font-black">{t("welcome")}</h1></Frame>;

  const scene = state.scene.type;
  const active = state.active;
  const presented = state.sponsor.presentedBy;

  const content = (() => {
    switch (scene) {
      case "WELCOME":
        return (
          <Center>
            <p className="text-2xl uppercase tracking-[0.5em] text-fg-muted">Antisocial Rooftop</p>
            <h1 className="text-gradient mt-4 text-[9vw] font-black leading-none">{t("welcome")}</h1>
            <Lineup state={state} />
          </Center>
        );
      case "NEXT_BAND":
        return (
          <Center>
            <p className="text-3xl uppercase tracking-[0.4em] text-cyan">{t("nextBand")}</p>
            <h1 className="anim-rise mt-6 text-[10vw] font-black leading-none">{state.nextBand?.name ?? active?.band.name}</h1>
          </Center>
        );
      case "BAND_PLAYING":
        return (
          <Center>
            <p className="text-3xl uppercase tracking-[0.4em] text-magenta">{t("nowPlaying")}</p>
            <h1 className="anim-rise mt-6 text-[10vw] font-black leading-none">{active?.band.name}</h1>
            {active?.band.genre && <p className="mt-4 text-3xl text-fg-muted">{active.band.genre}</p>}
            {active?.timer && <p className="mt-8 font-mono text-4xl text-fg-subtle">{fmtClock(active.timer.remaining)}</p>}
          </Center>
        );
      case "VOTE_NOW":
      case "VOTING_COUNTDOWN":
        return (
          <div className="grid h-full grid-cols-[1.1fr_1fr] items-center gap-12 px-[5vw]">
            <div>
              <p className="text-3xl uppercase tracking-[0.4em] text-acid">{t("voteNow")}</p>
              <h1 className="anim-rise mt-4 text-[8vw] font-black leading-none">{active?.band.name}</h1>
              {state.screenCode && (
                <div className="mt-10">
                  <p className="text-2xl uppercase tracking-[0.3em] text-fg-muted">{t("code")}</p>
                  <p className="anim-pulse mt-2 inline-block rounded-2xl border-4 border-cyan px-10 py-4 font-mono text-[7vw] font-black tracking-[0.3em] text-cyan">{state.screenCode.code}</p>
                </div>
              )}
              {state.showVoteCount && active && (
                <p className="mt-10 text-4xl text-fg-muted">
                  <span className="text-6xl font-black text-fg tabular-nums">{active.votesReceived}</span> {t("votesReceived")}
                </p>
              )}
              {active?.status === "GRACE_PERIOD" && <p className="mt-4 text-3xl text-warning">{t("closesIn")} {Math.ceil(graceLeft)}s</p>}
            </div>
            <div className="flex flex-col items-center">
              {qr && <img src={qr} alt="QR" className="w-[34vw] max-w-[560px] rounded-3xl bg-white p-4" />}
              <p className="mt-6 text-3xl font-semibold">{t("scanToVote")}</p>
              <p className="mt-2 font-mono text-xl text-fg-muted">{state.voteUrl.replace(/^https?:\/\//, "")}</p>
            </div>
          </div>
        );
      case "VOTING_CLOSED":
        return (
          <Center>
            <h1 className="text-[8vw] font-black text-fg-muted">{t("votingClosed")}</h1>
            <p className="mt-6 text-5xl">{active?.band.name}</p>
            {state.showVoteCount && active && <p className="mt-6 text-3xl text-fg-subtle">{active.votesReceived} {t("votesReceived")}</p>}
          </Center>
        );
      case "CALCULATING":
        return (
          <Center>
            <div className="mx-auto h-24 w-24 animate-spin rounded-full border-8 border-border border-t-magenta" />
            <h1 className="mt-10 text-6xl font-bold text-fg-muted">{t("calculating")}</h1>
          </Center>
        );
      case "PARTIAL_RESULT":
        return (
          <Center>
            <p className="text-3xl uppercase tracking-[0.4em] text-cyan">{t("partialResult")}</p>
            <h1 className="mt-4 text-[7vw] font-black">{active?.band.name}</h1>
            <div className="mt-10 flex justify-center gap-16">
              {active?.partial?.groups.map((g) => (
                <div key={g.kind} className="anim-rise">
                  <p className="text-2xl uppercase tracking-widest text-fg-muted">{g.kind === "JUDGE" ? "Jurado" : g.kind === "STAFF" ? "Staff" : "Público"}</p>
                  <p className="text-gradient text-[8vw] font-black tabular-nums">{g.score ? Number(g.score).toFixed(2) : "—"}</p>
                </div>
              ))}
              {active?.partial?.final && (
                <div className="anim-rise">
                  <p className="text-2xl uppercase tracking-widest text-fg-muted">Final</p>
                  <p className="text-[8vw] font-black text-acid tabular-nums">{active.partial.final}</p>
                </div>
              )}
            </div>
          </Center>
        );
      case "BREAK":
      case "SPONSOR": {
        const s = state.sponsor.scenes[0];
        return (
          <Center>
            {s?.imageUrl && <img src={s.imageUrl} alt={s.name} className="mx-auto max-h-[40vh]" />}
            <h1 className="mt-6 text-6xl font-black">{s ? (locale === "en" ? s.headlineEn : s.headlineEs) ?? s.name : t("break")}</h1>
            {scene === "BREAK" && <p className="mt-6 text-3xl text-fg-muted">{t("break")}</p>}
          </Center>
        );
      }
      case "FINAL_COUNTDOWN":
      case "LEADERBOARD":
      case "QUALIFIERS":
      case "WINNER":
        return <Reveal state={state} scene={scene} />;
      case "TECHNICAL_HOLD":
        return (
          <Center>
            <h1 className="text-gradient text-[8vw] font-black">{t("technicalHold")}</h1>
          </Center>
        );
      default:
        return null;
    }
  })();

  return (
    <Frame connected={connected}>
      {content}
      {presented && scene !== "SPONSOR" && scene !== "BREAK" && (
        <div className="absolute bottom-6 right-8 flex items-center gap-3 text-fg-subtle">
          <span className="text-sm uppercase tracking-widest">{locale === "en" ? "Presented by" : "Presentado por"}</span>
          {presented.imageUrl ? <img src={presented.imageUrl} alt={presented.name} className="h-10" /> : <span className="text-lg font-bold text-fg-muted">{presented.name}</span>}
        </div>
      )}
      {state.event.mode === "REHEARSAL" && <div className="absolute left-6 top-6 rounded-md border border-warning px-3 py-1 text-sm font-bold uppercase text-warning">Rehearsal</div>}
    </Frame>
  );
}

function Frame({ children, connected }: { children: React.ReactNode; connected: boolean }) {
  const t = useTranslations("stage");
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg text-fg">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,45,149,0.18),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(25,230,255,0.14),transparent_50%)]" />
      <div className="relative h-full">{children}</div>
      <div className={cn("absolute bottom-3 left-4 h-2 w-2 rounded-full", connected ? "bg-success/40" : "bg-warning")} title={connected ? "" : t("reconnecting")} aria-hidden />
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center px-[6vw] text-center">{children}</div>;
}

function Lineup({ state }: { state: StageSnapshot }) {
  return (
    <div className="mt-12 flex flex-wrap justify-center gap-6">
      {state.lineup.map((p) => (
        <div key={p.id} className="rounded-2xl border border-border bg-bg-elevated/70 px-8 py-4 text-3xl font-bold">
          <span className="mr-3 text-fg-subtle">{p.slotOrder}</span>
          {p.band}
        </div>
      ))}
    </div>
  );
}

function Reveal({ state, scene }: { state: StageSnapshot; scene: string }) {
  const t = useTranslations("stage");
  const reveal = state.reveal;
  if (!reveal) return <Center><h1 className="text-6xl text-fg-muted">{t("calculating")}</h1></Center>;
  const entries = [...reveal.entries].sort((a, b) => a.position - b.position);
  // Ascending reveal: show from last place upward; revealedCount counts from the bottom.
  const ordered = reveal.order === "ASCENDING" ? [...entries].reverse() : reveal.order === "ALPHABETICAL" ? [...entries].sort((a, b) => a.bandName.localeCompare(b.bandName)) : entries;
  const revealed = scene === "FINAL_COUNTDOWN" ? ordered.slice(0, reveal.revealedCount) : ordered;
  const winner = entries[0];

  if (scene === "WINNER" && winner) {
    return (
      <Center>
        <p className="text-3xl uppercase tracking-[0.5em] text-acid">{t("winner")}</p>
        <h1 className="text-gradient anim-rise mt-6 text-[11vw] font-black leading-none">{winner.bandName}</h1>
        <p className="mt-6 text-6xl font-black tabular-nums">{winner.finalScore}</p>
      </Center>
    );
  }
  if (scene === "QUALIFIERS") {
    const q = entries.filter((e) => e.status === "QUALIFIED");
    return (
      <Center>
        <p className="text-3xl uppercase tracking-[0.5em] text-cyan">{t("qualifiers")}</p>
        <div className="mt-10 space-y-6">
          {q.map((e) => (
            <h2 key={e.performanceId} className="anim-rise text-[7vw] font-black">{e.bandName}</h2>
          ))}
        </div>
      </Center>
    );
  }
  return (
    <div className="flex h-full flex-col justify-center px-[8vw]">
      <p className="mb-8 text-3xl uppercase tracking-[0.4em] text-fg-muted">{t("leaderboard")}</p>
      <ol className="space-y-4">
        {entries.map((e) => {
          const shown = revealed.some((r) => r.performanceId === e.performanceId);
          return (
            <li key={e.performanceId} className={cn("flex items-center justify-between rounded-2xl border px-10 py-5 transition", shown ? "anim-rise border-border bg-bg-elevated" : "border-transparent opacity-0")}>
              <div className="flex items-center gap-8">
                <span className={cn("w-16 text-6xl font-black tabular-nums", e.position === 1 ? "text-acid" : "text-fg-subtle")}>{e.position}</span>
                <span className="text-5xl font-bold">{e.bandName}</span>
                {e.status === "QUALIFIED" && <span className="rounded-full border border-acid px-4 py-1 text-xl uppercase text-acid">{t("qualifiers")}</span>}
              </div>
              <span className="text-gradient text-6xl font-black tabular-nums">{e.finalScore}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
