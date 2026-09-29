import { Badge, Button, Card, CardTitle, Field, Input, Select, Stat, Textarea } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/admin/form-bits";
import { hasRole, requireAdmin } from "@/lib/auth/admin-session";
import { db } from "@/lib/db";
import { createDataRequestAction, processDataRequestAction, unsubscribeContactAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";

export default async function AudiencePage() {
  const s = await requireAdmin();
  const [contacts, requests, totals, byBand] = await Promise.all([
    db.audienceContact.findMany({ where: { organizationId: s.organizationId }, orderBy: { createdAt: "desc" }, take: 200, include: { consents: true, refBand: true, event: true } }),
    db.dataRequest.findMany({ where: { organizationId: s.organizationId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.audienceContact.groupBy({ by: ["status"], where: { organizationId: s.organizationId }, _count: { _all: true } }),
    db.consent.groupBy({ by: ["bandId"], where: { kind: "FOLLOW_BAND", revokedAt: null }, _count: { _all: true } }),
  ]);
  const bands = await db.band.findMany({ where: { id: { in: byBand.map((b) => b.bandId).filter((x): x is string => !!x) } } });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-black">Audiencia</h1><a href="/api/export/audience.csv"><Button variant="secondary">Exportar CSV (solo con consentimiento)</Button></a></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {totals.map((t) => <Stat key={t.status} label={t.status} value={t._count._all} />)}
        <Stat label="Seguidores de bandas" value={byBand.reduce((a, b) => a + b._count._all, 0)} />
      </div>
      <Card>
        <CardTitle>Seguidores por banda</CardTitle>
        <div className="flex flex-wrap gap-2">{byBand.map((b) => <Badge key={b.bandId} tone="cyan">{bands.find((x) => x.id === b.bandId)?.name ?? "?"}: {b._count._all}</Badge>)}</div>
      </Card>
      <Card>
        <CardTitle>Contactos (últimos 200)</CardTitle>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>Contacto</th><th>Origen</th><th>Consentimientos</th><th>Estado</th><th></th></tr></thead>
          <tbody className="divide-y divide-border">
            {contacts.map((c) => (
              <tr key={c.id}>
                <td className="py-2">{c.email ?? c.phone ?? "—"}<div className="text-xs text-fg-subtle">{c.createdAt.toLocaleDateString("es-MX")}</div></td>
                <td className="text-xs">{c.source} · {c.event?.name ?? ""} {c.refBand ? `· fan de ${c.refBand.name}` : ""}</td>
                <td>{c.consents.map((k) => <Badge key={k.id} tone={k.revokedAt ? "danger" : "success"} className="mr-1">{k.kind} {k.documentVersion}</Badge>)}</td>
                <td><Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{c.status}</Badge></td>
                <td className="text-right">{c.status === "ACTIVE" && <ActionButton action={unsubscribeContactAction.bind(null, c.id)} variant="ghost" confirm="¿Dar de baja?">baja</ActionButton>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardTitle>Solicitudes ARCO (acceso, rectificación, cancelación, oposición)</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-2">
                <div><Badge>{r.kind}</Badge> <Badge tone={r.status === "COMPLETED" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>{r.status}</Badge> {r.email}<div className="text-xs text-fg-subtle">{r.details} · {r.createdAt.toLocaleDateString("es-MX")}</div></div>
                {hasRole(s, "ORGANIZATION_ADMIN") && r.status !== "COMPLETED" && (
                  <ActionForm action={processDataRequestAction} submitLabel="Aplicar" className="flex items-end gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <Select name="status" defaultValue="IN_PROGRESS" className="w-40"><option>IN_PROGRESS</option><option>COMPLETED</option><option>REJECTED</option></Select>
                    <Input name="notes" placeholder="notas" className="w-40" />
                  </ActionForm>
                )}
              </li>
            ))}
            {requests.length === 0 && <li className="text-fg-subtle">Sin solicitudes.</li>}
          </ul>
          <p className="mt-2 text-xs text-fg-subtle">COMPLETED + CANCELACIÓN borra correo/teléfono/nombre del contacto y revoca consentimientos; los resultados agregados y el audit no se alteran.</p>
        </Card>
        <Card>
          <CardTitle>Registrar solicitud</CardTitle>
          <ActionForm action={createDataRequestAction} submitLabel="Registrar">
            <Field label="Tipo"><Select name="kind"><option>ACCESS</option><option>RECTIFICATION</option><option>CANCELLATION</option><option>OPPOSITION</option></Select></Field>
            <Field label="Correo del titular"><Input name="email" type="email" required /></Field>
            <Field label="Detalles"><Textarea name="details" /></Field>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
