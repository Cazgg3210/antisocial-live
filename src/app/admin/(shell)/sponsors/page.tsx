import { Badge, Card, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/admin/form-bits";
import { requireAdmin } from "@/lib/auth/admin-session";
import { db } from "@/lib/db";
import { saveCampaignAction, savePlacementAction, saveSponsorAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";
const KINDS = ["STAGE_PRESENTED_BY", "STAGE_TRANSITION", "STAGE_BREAK", "VOTE_LANDING_HEADER", "THANK_YOU_CTA", "BAND_REPORT_FOOTER", "RECAP_EMAIL"];

export default async function SponsorsPage() {
  const s = await requireAdmin();
  const [sponsors, events] = await Promise.all([
    db.sponsor.findMany({ where: { organizationId: s.organizationId }, orderBy: { name: "asc" }, include: { campaigns: { include: { placements: { include: { _count: { select: { interactions: true } }, event: true } } } } } }),
    db.eventEdition.findMany({ orderBy: { scheduledAt: "desc" }, take: 20 }),
  ]);
  const stats = await db.sponsorInteraction.groupBy({ by: ["placementId", "kind"], _count: { _all: true } });
  const stat = (pid: string, kind: string) => stats.find((x) => x.placementId === pid && x.kind === kind)?._count._all ?? 0;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Sponsors</h1>
      {sponsors.map((sp) => (
        <Card key={sp.id}>
          <div className="flex items-center justify-between">
            <CardTitle>{sp.name} {!sp.isActive && <Badge tone="danger">inactivo</Badge>}</CardTitle>
            <a className="text-xs text-cyan underline" href={`/api/export/sponsor/${sp.id}/report.csv`}>Reporte CSV</a>
          </div>
          {sp.campaigns.map((c) => (
            <div key={c.id} className="mb-3 rounded-md border border-border p-3">
              <p className="mb-2 text-sm font-semibold">{c.name} <Badge>{c.isActive ? "activa" : "inactiva"}</Badge> · prioridad {c.priority}</p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>Placement</th><th>Evento</th><th>Impr.</th><th>Clics</th><th>QR</th><th>CTR</th><th>Link</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {c.placements.map((p) => {
                    const imp = stat(p.id, "IMPRESSION"), cl = stat(p.id, "CLICK"), qr = stat(p.id, "QR_SCAN");
                    return (
                      <tr key={p.id}><td className="py-1">{p.kind}{!p.isActive && " (off)"}</td><td>{p.event?.name ?? "todos"}</td><td>{imp}</td><td>{cl}</td><td>{qr}</td><td>{imp ? ((cl / imp) * 100).toFixed(1) + "%" : "—"}</td><td className="font-mono text-xs">/api/go/{p.code}</td></tr>
                    );
                  })}
                </tbody>
              </table>
              <details className="mt-2"><summary className="cursor-pointer text-xs text-cyan">+ placement</summary>
                <ActionForm action={savePlacementAction} submitLabel="Crear placement" className="mt-2">
                  <input type="hidden" name="campaignId" value={c.id} />
                  <div className="grid gap-2 md:grid-cols-4">
                    <Field label="Tipo"><Select name="kind">{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Field>
                    <Field label="Evento"><Select name="eventId" defaultValue=""><option value="">todos</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
                    <Field label="Imagen URL"><Input name="imageUrl" /></Field>
                    <Field label="CTA URL"><Input name="ctaUrl" /></Field>
                    <Field label="Headline ES"><Input name="headlineEs" /></Field>
                    <Field label="Headline EN"><Input name="headlineEn" /></Field>
                    <Field label="CTA ES"><Input name="ctaLabelEs" /></Field>
                    <Field label="CTA EN"><Input name="ctaLabelEn" /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> activo</label>
                </ActionForm>
              </details>
            </div>
          ))}
          <details><summary className="cursor-pointer text-xs text-cyan">+ campaña</summary>
            <ActionForm action={saveCampaignAction} submitLabel="Crear campaña" className="mt-2">
              <input type="hidden" name="sponsorId" value={sp.id} />
              <div className="grid gap-2 md:grid-cols-4"><Field label="Nombre"><Input name="name" required /></Field><Field label="Prioridad"><Input name="priority" type="number" defaultValue={0} /></Field><Field label="Inicio"><Input name="startsAt" type="date" /></Field><Field label="Fin"><Input name="endsAt" type="date" /></Field></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> activa</label>
            </ActionForm>
          </details>
        </Card>
      ))}
      <Card>
        <CardTitle>Nuevo sponsor</CardTitle>
        <ActionForm action={saveSponsorAction} submitLabel="Crear sponsor">
          <div className="grid gap-2 md:grid-cols-3"><Field label="Nombre"><Input name="name" required /></Field><Field label="Logo URL"><Input name="logoUrl" /></Field><Field label="Sitio web"><Input name="websiteUrl" /></Field><Field label="Contacto"><Input name="contactName" /></Field><Field label="Correo"><Input name="contactEmail" type="email" /></Field></div>
          <Field label="Notas"><Textarea name="notes" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> activo</label>
        </ActionForm>
      </Card>
    </div>
  );
}
