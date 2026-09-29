import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { ApplyForm } from "./apply-form";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("apply");
  const call = await db.applicationCall.findUnique({ where: { slug } });
  if (!call) notFound();
  const open = call.status === "OPEN" && (!call.closesAt || call.closesAt > new Date()) && (!call.opensAt || call.opensAt <= new Date());
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <p className="text-xs uppercase tracking-[0.3em] text-fg-subtle">Antisocial Rooftop · {t("title")}</p>
      <h1 className="text-gradient text-3xl font-black">{locale === "en" ? call.titleEn : call.titleEs}</h1>
      <p className="mb-6 mt-2 text-sm text-fg-muted">{locale === "en" ? call.descriptionEn : call.descriptionEs}</p>
      {open ? <ApplyForm slug={slug} rulesVersion={call.rulesVersion} /> : <p className="rounded-md border border-border p-4 text-fg-muted">{t("closed")}</p>}
    </main>
  );
}
