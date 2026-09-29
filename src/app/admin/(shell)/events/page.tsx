import Link from "next/link";
import { Badge, Card, CardTitle, Field, Input, Select } from "@/components/ui";
import { ActionForm } from "@/components/admin/form-bits";
import { db } from "@/lib/db";
import { createEventAction } from "@/modules/admin/actions";

export default async function EventsPage() {
  const [events, series, venues] = await Promise.all([
    db.eventEdition.findMany({ orderBy: { scheduledAt: "desc" }, include: { series: true, rounds: { include: { _count: { select: { performances: true } } } } } }),
    db.eventSeries.findMany({ orderBy: { name: "asc" } }),
    db.venue.findMany(),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Eventos</h1>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-fg-subtle">
            <tr><th className="py-2">Evento</th><th>Temporada</th><th>Fecha</th><th>Bandas</th><th>Modo</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((e) => (
              <tr key={e.id}>
                <td className="py-2 font-semibold"><Link className="hover:underline" href={`/admin/events/${e.id}`}>{e.name}</Link><div className="font-mono text-xs text-fg-subtle">{e.slug}</div></td>
                <td>{e.series.name}</td>
                <td>{e.scheduledAt.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</td>
                <td>{e.rounds.reduce((s, r) => s + r._count.performances, 0)}</td>
                <td><Badge tone={e.mode === "LIVE" ? "acid" : "warning"}>{e.mode}</Badge></td>
                <td><Badge tone={e.status === "LIVE" ? "success" : "neutral"}>{e.status}</Badge></td>
                <td className="text-right"><Link className="text-cyan underline" href={`/control/${e.id}`}>Control</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <CardTitle>Nuevo evento</CardTitle>
        <ActionForm action={createEventAction} submitLabel="Crear">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Nombre"><Input name="name" required placeholder="Guerra de Bandas — Noche 5" /></Field>
            <Field label="Fecha y hora"><Input name="scheduledAt" type="datetime-local" required /></Field>
            <Field label="Temporada"><Select name="seriesId">{series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Venue"><Select name="venueId">{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
          </div>
          <p className="text-xs text-fg-subtle">Se crea en modo REHEARSAL con la configuración demo (pesos 40/20/40, 7 criterios). Ajusta todo antes de pasar a LIVE.</p>
        </ActionForm>
      </Card>
    </div>
  );
}
