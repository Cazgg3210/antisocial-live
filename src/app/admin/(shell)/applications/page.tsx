import { Badge, Card, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/admin/form-bits";
import { requireAdmin } from "@/lib/auth/admin-session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { reviewApplicationAction, saveCallAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";
const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "ACCEPTED", "REJECTED", "CONFIRMED"] as const;

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ call?: string; status?: string }> }) {
  const s = await requireAdmin();
  const { call, status } = await searchParams;
  const [calls, series] = await Promise.all([
    db.applicationCall.findMany({ where: { series: { organizationId: s.organizationId } }, include: { _count: { select: { applications: true } } }, orderBy: { createdAt: "desc" } }),
    db.eventSeries.findMany({ where: { organizationId: s.organizationId } }),
  ]);
  const current = call ? calls.find((c) => c.id === call) : calls[0];
  const apps = current
    ? await db.bandApplication.findMany({ where: { callId: current.id, ...(status ? { status: status as (typeof STATUSES)[number] } : {}) }, include: { reviews: true }, orderBy: { submittedAt: "desc" } })
    : [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Convocatoria</h1>
      <div className="flex flex-wrap gap-2">
        {calls.map((c) => (
          <a key={c.id} href={`?call=${c.id}`} className={`rounded-full border px-3 py-1 text-sm ${current?.id === c.id ? "border-accent text-accent" : "border-border text-fg-muted"}`}>{c.titleEs} <Badge tone={c.status === "OPEN" ? "success" : "neutral"}>{c.status}</Badge> · {c._count.applications}</a>
        ))}
      </div>
      {current && (
        <>
          <p className="text-xs text-fg-subtle">Formulario público: <code>{env().APP_URL}/apply/{current.slug}</code></p>
          <div className="flex flex-wrap gap-1 text-xs">
            <a href={`?call=${current.id}`} className={!status ? "text-accent" : "text-fg-muted"}>todas</a>
            {STATUSES.map((st) => <a key={st} href={`?call=${current.id}&status=${st}`} className={status === st ? "text-accent" : "text-fg-muted"}>· {st}</a>)}
          </div>
          <div className="space-y-3">
            {apps.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-64 flex-1 text-sm">
                    <h3 className="text-lg font-bold">{a.bandName} <Badge tone={a.status === "ACCEPTED" || a.status === "CONFIRMED" ? "acid" : a.status === "REJECTED" ? "danger" : "neutral"}>{a.status}</Badge> {a.isTribute && <Badge>tributo</Badge>}</h3>
                    <p className="text-fg-muted">{a.genre} · {a.city} · {a.contactName} · {a.email} · {a.phone}</p>
                    <p className="mt-2 whitespace-pre-wrap">{a.description}</p>
                    <p className="mt-2 space-x-3 text-xs">{a.videoUrl && <a className="text-cyan underline" href={a.videoUrl} target="_blank" rel="noreferrer">Video</a>}{a.instagram && <a className="text-cyan underline" href={a.instagram} target="_blank" rel="noreferrer">Instagram</a>}{a.spotify && <a className="text-cyan underline" href={a.spotify} target="_blank" rel="noreferrer">Spotify</a>}{a.youtube && <a className="text-cyan underline" href={a.youtube} target="_blank" rel="noreferrer">YouTube</a>}</p>
                    {a.membersJson ? <p className="mt-1 text-xs text-fg-subtle">Integrantes: {JSON.stringify(a.membersJson)}</p> : null}
                    {a.availability && <p className="text-xs text-fg-subtle">Disponibilidad: {a.availability}</p>}
                    {a.reviews.length > 0 && <p className="mt-2 text-xs">Revisiones: {a.reviews.map((r) => `${r.score ?? "—"}${r.notes ? ` (${r.notes})` : ""}`).join(" · ")}</p>}
                  </div>
                  <ActionForm action={reviewApplicationAction} submitLabel="Guardar" className="w-64">
                    <input type="hidden" name="id" value={a.id} />
                    <Field label="Estado"><Select name="status" defaultValue={a.status}>{STATUSES.map((st) => <option key={st}>{st}</option>)}</Select></Field>
                    <Field label="Puntaje interno (1-10)"><Input name="score" type="number" min={1} max={10} defaultValue={a.reviews.find((r) => r.reviewerId === s.userId)?.score ?? ""} /></Field>
                    <Field label="Notas"><Textarea name="notes" defaultValue={a.reviews.find((r) => r.reviewerId === s.userId)?.notes ?? ""} /></Field>
                  </ActionForm>
                </div>
              </Card>
            ))}
            {apps.length === 0 && <p className="text-sm text-fg-subtle">Sin aplicaciones.</p>}
          </div>
        </>
      )}
      <Card>
        <CardTitle>{current ? "Editar convocatoria" : "Nueva convocatoria"}</CardTitle>
        <ActionForm action={saveCallAction} key={current?.id ?? "new"}>
          {current && <input type="hidden" name="id" value={current.id} />}
          <div className="grid gap-2 md:grid-cols-3">
            <Field label="Temporada"><Select name="seriesId" defaultValue={current?.seriesId}>{series.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
            <Field label="Título ES"><Input name="titleEs" defaultValue={current?.titleEs} required /></Field>
            <Field label="Título EN"><Input name="titleEn" defaultValue={current?.titleEn} /></Field>
            <Field label="Estado"><Select name="status" defaultValue={current?.status ?? "DRAFT"}><option>DRAFT</option><option>OPEN</option><option>CLOSED</option></Select></Field>
            <Field label="Abre"><Input name="opensAt" type="date" defaultValue={current?.opensAt?.toISOString().slice(0, 10)} /></Field>
            <Field label="Cierra"><Input name="closesAt" type="date" defaultValue={current?.closesAt?.toISOString().slice(0, 10)} /></Field>
            <Field label="Versión de bases"><Input name="rulesVersion" defaultValue={current?.rulesVersion ?? "v1"} /></Field>
          </div>
          <Field label="Descripción ES"><Textarea name="descriptionEs" defaultValue={current?.descriptionEs ?? ""} /></Field>
          <Field label="Descripción EN"><Textarea name="descriptionEn" defaultValue={current?.descriptionEn ?? ""} /></Field>
        </ActionForm>
        {current && <p className="mt-2 text-xs text-fg-subtle"><a className="text-cyan underline" href="/admin/applications?call=new">+ nueva convocatoria</a></p>}
      </Card>
    </div>
  );
}
