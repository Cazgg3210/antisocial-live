import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { LEGAL_DOCS } from "@/modules/legal/documents";

export const dynamic = "force-dynamic";

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const locale = await getLocale();
  const t = await getTranslations("legal");
  const entry = LEGAL_DOCS[doc];
  if (!entry) notFound();
  const org = await db.organization.findFirst();
  // Contest rules read the live configuration of the next LIVE/READY event so they never drift from what is enforced.
  const event = doc === "bases-del-concurso" ? await db.eventEdition.findFirst({ where: { status: { in: ["LIVE", "READY", "CONFIGURING"] } }, orderBy: { scheduledAt: "asc" }, include: { config: true, groups: { include: { scorecard: { include: { criteria: { orderBy: { order: "asc" } } } } } }, rounds: { orderBy: { order: "asc" } } } }) : null;
  const vars = {
    orgName: org?.legalName ?? org?.name ?? "[Responsable]",
    orgAddress: org?.address ?? "[Domicilio]",
    contactEmail: org?.contactEmail ?? "[correo de privacidad]",
    version: entry.version,
    date: new Date().toLocaleDateString(locale === "en" ? "en-US" : "es-MX", { timeZone: "America/Mexico_City" }),
    rules: event
      ? {
          groups: event.groups.map((g) => `${g.name}: ${(g.weightBp / 100).toFixed(0)}%`).join(", "),
          criteria: [...new Set(event.groups.flatMap((g) => g.scorecard?.criteria.filter((c) => c.countsTowardScore).map((c) => `${locale === "en" ? c.nameEn : c.nameEs} (${(c.weightBp / 100).toFixed(0)}%)`) ?? []))].join(", "),
          tieBreakers: (event.config?.tieBreakers as { kind: string; criterionKey?: string }[]).map((tb) => (tb.criterionKey ? `${tb.kind}:${tb.criterionKey}` : tb.kind)).join(" → "),
          qualifiers: event.rounds.map((r) => `${r.name}: ${r.qualifiersCount}`).join("; "),
          eventName: event.name,
        }
      : null,
  };
  const body = entry.render(locale === "en" ? "en" : "es", vars);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="text-xs uppercase tracking-[0.3em] text-fg-subtle">Antisocial Rooftop</p>
      <h1 className="text-gradient mb-2 text-3xl font-black">{locale === "en" ? entry.titleEn : entry.titleEs}</h1>
      <p className="mb-6 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">{t("templateNotice")}</p>
      <article className="prose-invert space-y-4 text-sm leading-relaxed text-fg-muted [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-fg [&_ul]:list-disc [&_ul]:pl-5">
        {body.map((block, i) =>
          block.startsWith("## ") ? <h2 key={i}>{block.slice(3)}</h2> : block.startsWith("- ") ? <ul key={i}>{block.split("\n").map((l, j) => <li key={j}>{l.replace(/^- /, "")}</li>)}</ul> : <p key={i}>{block}</p>,
        )}
      </article>
      <p className="mt-8 text-xs text-fg-subtle">v{entry.version} · {vars.date}</p>
    </main>
  );
}
