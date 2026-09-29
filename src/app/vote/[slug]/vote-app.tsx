"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Input, Textarea, cn } from "@/components/ui";
import { ScoreSelector } from "@/components/score-selector";
import { api, ApiError, newKey, useLiveState } from "@/lib/client";
import type { VoteContext } from "@/modules/voting/service";

type Ctx = VoteContext & { voter: { isNew: boolean } };
type Live = { performanceId: string | null; status?: string; version?: number; votesReceived?: number };
type Step = "landing" | "rate" | "review" | "done";

export function VoteApp({ slug }: { slug: string }) {
  const t = useTranslations("vote");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("landing");
  const [values, setValues] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [screenCode, setScreenCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ confirmation: string; status: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const startedAt = useRef<number>(0);
  const submissionKey = useRef<string>(newKey());
  const { state: live } = useLiveState<Live>(`/api/vote/${slug}/stream`, null);

  // Loads the context; when the voter already has a submission, prefill values/comment (async callback, not in render).
  const load = useCallback(async () => {
    try {
      const data = await api<Ctx>(`/api/vote/${slug}${typeof window !== "undefined" ? window.location.search : ""}`);
      setCtx(data);
      setError(null);
      if (data.existing) {
        setValues(Object.fromEntries(data.existing.items.map((i) => [i.criterionId, i.value])));
        setComment(data.existing.comment ?? "");
      }
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? t("notFound") : t("notFound"));
    }
  }, [slug, t]);

  // Initial load + reload whenever the live state changes band or status.
  const liveKey = `${live?.performanceId ?? ""}:${live?.status ?? ""}`;
  useEffect(() => {
    // Deferred so state updates happen in the async continuation, never in the effect body.
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load, liveKey]);

  const perf = ctx?.performance ?? null;
  const votingOpen = perf?.status === "VOTING_OPEN" || perf?.status === "GRACE_PERIOD";
  const criteria = ctx?.criteria ?? [];
  const name = (c: { nameEs: string; nameEn: string }) => (locale === "en" ? c.nameEn : c.nameEs);
  const anchors = useMemo(() => ({ "1": t("anchors.1"), "5": t("anchors.5"), "8": t("anchors.8"), "10": t("anchors.10") }), [t]);
  const complete = criteria.length > 0 && criteria.every((c) => values[c.id] !== undefined);
  const alreadyVoted = !!ctx?.existing && !result;

  useEffect(() => {
    if (ctx?.sponsor) void api("/api/sponsors/impression", { method: "POST", json: { placementId: ctx.sponsor.placementId, eventId: ctx.event.id, performanceId: perf?.id ?? null } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.sponsor?.placementId]);

  async function submit() {
    if (!perf) return;
    setSubmitting(true);
    setFieldError(null);
    try {
      const r = await api<{ confirmation: string; status: string }>(`/api/vote/${slug}`, {
        method: "POST",
        json: {
          submissionKey: submissionKey.current,
          performanceId: perf.id,
          items: criteria.map((c) => ({ criterionId: c.id, value: values[c.id] })),
          comment: comment || null,
          screenCode: ctx?.config.screenCodeRequired ? screenCode : null,
          clientDurationMs: Date.now() - startedAt.current,
        },
      });
      setResult(r);
      setStep("done");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.details.field === "screenCode") setFieldError(t("screenCodeInvalid"));
        else if (e.code === "CONFLICT") {
          setFieldError(t("alreadyVoted"));
          await load();
        } else if (e.code === "INVALID_TRANSITION") {
          setFieldError(t("votingClosed"));
          await load();
        } else setFieldError(e.message);
      } else setFieldError(tc("error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <Shell><Alert tone="danger">{error}</Alert></Shell>;
  if (!ctx) return <Shell><p className="text-fg-muted">…</p></Shell>;

  const header = (
    <header className="mb-6 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-fg-subtle">Antisocial Rooftop</p>
      <h1 className="text-gradient text-3xl font-black">{t("title")}</h1>
      {ctx.sponsor && (
        <a href={`/api/go/${ctx.sponsor.code}?p=${perf?.id ?? ""}`} className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-fg-muted" rel="sponsored">
          <span>{t("presentedBy")}</span>
          <strong className="text-fg">{ctx.sponsor.sponsorName}</strong>
        </a>
      )}
      {ctx.event.mode === "REHEARSAL" && <Badge tone="warning" className="mt-2">REHEARSAL</Badge>}
    </header>
  );

  // ───── DONE ─────
  if (step === "done" && result) {
    return (
      <Shell>
        {header}
        <Card className="anim-rise text-center">
          <div className="text-5xl">🤘</div>
          <h2 className="mt-2 text-2xl font-bold">{t("thanks")}</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {t("confirmation")}: <span className="font-mono text-cyan">{result.confirmation}</span>
          </p>
        </Card>
        <PostVote ctx={ctx} slug={slug} />
      </Shell>
    );
  }

  // ───── NO ACTIVE BAND / CLOSED ─────
  if (!perf || !votingOpen) {
    return (
      <Shell>
        {header}
        <Card className="text-center">
          {perf ? (
            <>
              <p className="text-xs uppercase tracking-wider text-fg-subtle">{t("nowPlaying")}</p>
              <h2 className="text-2xl font-bold">{perf.band.name}</h2>
              <p className="mt-3 text-fg-muted">{perf.status === "ON_STAGE" ? t("waiting") : t("votingClosed")}</p>
              {ctx.existing && <p className="mt-2 text-sm text-success">{t("alreadyVoted")}</p>}
            </>
          ) : (
            <p className="text-fg-muted">{t("waiting")}</p>
          )}
        </Card>
        <PrivacyFooter />
      </Shell>
    );
  }

  // ───── ALREADY VOTED (not editable) ─────
  if (alreadyVoted && !ctx.config.allowVoteEdit) {
    return (
      <Shell>
        {header}
        <Card className="text-center">
          <h2 className="text-xl font-bold">{perf.band.name}</h2>
          <p className="mt-3 text-success">{t("alreadyVoted")}</p>
        </Card>
        <PostVote ctx={ctx} slug={slug} />
      </Shell>
    );
  }

  // ───── LANDING ─────
  if (step === "landing") {
    return (
      <Shell>
        {header}
        <Card className="text-center">
          <p className="text-xs uppercase tracking-wider text-fg-subtle">{t("nowPlaying")}</p>
          {perf.band.imageUrl && <img src={perf.band.imageUrl} alt="" className="mx-auto my-3 h-28 w-28 rounded-full object-cover" />}
          <h2 className="text-3xl font-black">{perf.band.name}</h2>
          {perf.band.genre && <p className="text-sm text-fg-muted">{perf.band.genre}</p>}
          <Badge tone="acid" className="mt-3">{t("votingOpen")}</Badge>
          {ctx.config.showVoteCount && <p className="mt-3 text-sm text-fg-muted">{t("votesReceived", { count: perf.votesReceived })}</p>}
          {alreadyVoted && <p className="mt-2 text-sm text-cyan">{t("alreadyVotedEditable")}</p>}
          <Button size="xl" className="mt-5 w-full" onClick={() => { startedAt.current = Date.now(); setStep("rate"); }}>
            {alreadyVoted ? t("changeVote") : t("rateBand", { band: perf.band.name })}
          </Button>
        </Card>
        <PrivacyFooter />
      </Shell>
    );
  }

  // ───── RATE ─────
  if (step === "rate") {
    return (
      <Shell>
        {header}
        <h2 className="text-xl font-bold">{t("rateBand", { band: perf.band.name })}</h2>
        <p className="mb-4 text-sm text-fg-muted">{t("instructions")}</p>
        <div className="space-y-6">
          {criteria.map((c, i) => (
            <Card key={c.id} className={cn(values[c.id] !== undefined && "border-cyan/40")}>
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="font-semibold">
                  <span className="mr-2 text-fg-subtle">{i + 1}.</span>
                  {name(c)}
                </h3>
                {values[c.id] !== undefined && <span className="text-2xl font-black text-accent tabular-nums">{values[c.id]}</span>}
              </div>
              <ScoreSelector label={name(c)} value={values[c.id] ?? null} onChange={(v) => setValues((s) => ({ ...s, [c.id]: v }))} min={c.scaleMin} max={c.scaleMax} anchors={anchors} />
            </Card>
          ))}
          <Card>
            <label className="mb-2 block text-sm font-medium text-fg-muted">{t("comment")}</label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
          </Card>
        </div>
        {!complete && <p className="mt-3 text-center text-sm text-warning">{t("incomplete")}</p>}
        <div className="sticky bottom-0 mt-4 bg-gradient-to-t from-bg via-bg to-transparent pb-4 pt-6">
          <Button size="xl" className="w-full" disabled={!complete} onClick={() => setStep("review")}>
            {tc("continue")}
          </Button>
        </div>
      </Shell>
    );
  }

  // ───── REVIEW ─────
  return (
    <Shell>
      {header}
      <h2 className="text-xl font-bold">{t("review")}</h2>
      <p className="mb-4 text-sm text-fg-muted">{perf.band.name}</p>
      <Card>
        <ul className="divide-y divide-border">
          {criteria.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span>{name(c)}</span>
              <span className="text-xl font-bold text-accent tabular-nums">{values[c.id]}</span>
            </li>
          ))}
        </ul>
      </Card>
      {ctx.config.screenCodeRequired && (
        <Card className="mt-4">
          <label className="mb-1 block text-sm font-semibold">{t("screenCode")}</label>
          <p className="mb-2 text-xs text-fg-muted">{t("screenCodeHelp")}</p>
          <Input inputMode="numeric" pattern="[0-9]*" maxLength={4} value={screenCode} onChange={(e) => setScreenCode(e.target.value.replace(/\D/g, ""))} className="text-center text-2xl tracking-[0.5em]" autoFocus />
        </Card>
      )}
      {fieldError && <div className="mt-3"><Alert tone="danger">{fieldError}</Alert></div>}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Button variant="secondary" size="xl" onClick={() => setStep("rate")}>{tc("back")}</Button>
        <Button size="xl" className="col-span-2" loading={submitting} disabled={ctx.config.screenCodeRequired && screenCode.length !== 4} onClick={submit}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </div>
      <PrivacyFooter />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-md px-4 pb-10 pt-6">{children}</main>;
}

function PrivacyFooter() {
  const t = useTranslations("vote");
  return (
    <p className="mt-8 text-center text-xs text-fg-subtle">
      {t.rich("privacyShort", { link: (chunks) => <a className="underline" href="/legal/aviso-de-privacidad" target="_blank" rel="noreferrer">{chunks}</a> })}
    </p>
  );
}

function PostVote({ ctx, slug }: { ctx: Ctx; slug: string }) {
  const t = useTranslations("vote");
  const tc = useTranslations("common");
  const locale = useLocale();
  const band = ctx.performance?.band;
  const pv = ctx.config.postVote;
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [follow, setFollow] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function optIn() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/vote/${slug}/opt-in`, { method: "POST", json: { email: email || null, phone: phone || null, marketing: consent, followBandId: follow && band ? band.id : null, privacyVersion: "v1" } });
      setSent(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {pv.bandProfile && band && (
        <Card>
          <h3 className="font-bold">{band.name}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {band.instagram && <a className="rounded-full border border-border px-3 py-1 text-sm" href={band.instagram} target="_blank" rel="noreferrer">Instagram</a>}
            {band.spotify && <a className="rounded-full border border-border px-3 py-1 text-sm" href={band.spotify} target="_blank" rel="noreferrer">Spotify</a>}
            {band.youtube && <a className="rounded-full border border-border px-3 py-1 text-sm" href={band.youtube} target="_blank" rel="noreferrer">YouTube</a>}
            {band.tiktok && <a className="rounded-full border border-border px-3 py-1 text-sm" href={band.tiktok} target="_blank" rel="noreferrer">TikTok</a>}
          </div>
        </Card>
      )}
      {pv.optIn && !sent && (
        <Card>
          <h3 className="font-bold">{t("optInTitle")}</h3>
          <p className="mb-3 text-sm text-fg-muted">{t("optInBody")}</p>
          <div className="space-y-2">
            <Input type="email" placeholder={t("optInEmail")} value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="tel" placeholder={t("optInPhone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t("optInConsent")}</span>
            </label>
            {band && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                <span>{t("followBand", { band: band.name })}</span>
              </label>
            )}
          </div>
          {err && <p className="mt-2 text-sm text-danger">{err}</p>}
          <Button className="mt-3 w-full" variant="outline" loading={busy} disabled={(!email && !phone) || (!consent && !follow)} onClick={optIn}>
            {t("optInSubmit")}
          </Button>
        </Card>
      )}
      {sent && <Alert tone="success">{t("optInDone")}</Alert>}
      {pv.reservation && pv.reservationUrl && (
        <a href={`/api/vote/${slug}/reserve`} className="block">
          <Button size="lg" className="w-full">{t("reserve")}</Button>
        </a>
      )}
      {pv.sponsor && ctx.sponsor && (
        <a href={`/api/go/${ctx.sponsor.code}`} rel="sponsored" className="block rounded-lg border border-border bg-bg-panel p-4 text-center">
          <p className="text-xs uppercase tracking-wider text-fg-subtle">{t("presentedBy")} {ctx.sponsor.sponsorName}</p>
          <p className="mt-1 font-semibold">{locale === "en" ? ctx.sponsor.headlineEn : ctx.sponsor.headlineEs}</p>
          {(locale === "en" ? ctx.sponsor.ctaLabelEn : ctx.sponsor.ctaLabelEs) && <span className="mt-2 inline-block text-sm text-cyan underline">{locale === "en" ? ctx.sponsor.ctaLabelEn : ctx.sponsor.ctaLabelEs}</span>}
        </a>
      )}
      <PrivacyFooter />
    </div>
  );
}
