"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/client";

export function ApplyForm({ slug, rulesVersion }: { slug: string; rulesVersion: string }) {
  const t = useTranslations("apply");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/apply/${slug}`, { method: "POST", json: { ...body, isTribute: fd.get("isTribute") === "on", acceptRules: fd.get("acceptRules") === "on", acceptPrivacy: fd.get("acceptPrivacy") === "on", rulesVersion } });
      setDone(true);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Alert tone="success">{t("done")}</Alert>;
  return (
    <form onSubmit={submit}>
      <Card>
        <Field label={t("bandName")}><Input name="bandName" required /></Field>
        <Field label={t("contactName")}><Input name="contactName" required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><Input name="email" type="email" required /></Field>
          <Field label="WhatsApp"><Input name="phone" /></Field>
          <Field label={t("genre")}><Input name="genre" /></Field>
          <Field label={t("city")}><Input name="city" /></Field>
        </div>
        <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" name="isTribute" /> {t("isTribute")}</label>
        <Field label={t("description")}><Textarea name="description" required /></Field>
        <Field label={t("videoUrl")}><Input name="videoUrl" type="url" placeholder="https://youtube.com/…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instagram"><Input name="instagram" /></Field>
          <Field label="TikTok"><Input name="tiktok" /></Field>
          <Field label="Spotify"><Input name="spotify" /></Field>
          <Field label="YouTube"><Input name="youtube" /></Field>
        </div>
        <Field label={t("members")}><Textarea name="members" placeholder="Nombre — instrumento, uno por línea" /></Field>
        <Field label="Rider técnico (URL)"><Input name="riderUrl" type="url" /></Field>
        <Field label="Stage plot (URL)"><Input name="stagePlotUrl" type="url" /></Field>
        <Field label={t("availability")}><Input name="availability" /></Field>
        <Field label={t("notes")}><Textarea name="notes" /></Field>
        <label className="mb-2 flex items-start gap-2 text-sm"><input type="checkbox" name="acceptRules" required className="mt-1" /><span>{t("acceptRules")} (<a className="underline" href="/legal/bases-del-concurso" target="_blank" rel="noreferrer">bases</a>)</span></label>
        <label className="mb-4 flex items-start gap-2 text-sm"><input type="checkbox" name="acceptPrivacy" required className="mt-1" /><span>{t("acceptPrivacy")} (<a className="underline" href="/legal/aviso-de-privacidad" target="_blank" rel="noreferrer">aviso</a>)</span></label>
        {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t("submit")}</Button>
      </Card>
    </form>
  );
}
