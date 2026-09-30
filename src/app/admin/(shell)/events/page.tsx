import Link from "next/link";
import { Badge, Card, CardTitle, Field, Input, Select } from "@/components/ui";
import { ActionForm } from "@/components/admin/form-bits";
import { db } from "@/lib/db";
import { createEventAction, createSeriesAction } from "@/modules/admin/actions";

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
                <td className="py-2 font-semibold"><Link className="text-cyan underline" href={`/admin/events/${e.id}`}>{e.name}</Link><div className="font-mono text-xs text-fg-subtle">{e.slug}</div></td>
                <td>{e.series.name}</td>
                <td>{e.scheduledAt.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</td>
                <td>{e.rounds.reduce((s, r) => s + r._count.performances, 0)}</td>
                <td><Badge tone={e.mode === "LIVE" ? "acid" : "warning"}>{e.mode}</Badge></td>
                <td><Badge tone={e.status === "LIVE" ? "success" : "neutral"}>{e.status}</Badge></td>
                <td className="space-x-3 text-right whitespace-nowrap"><Link className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-black" href={`/admin/events/${e.id}?tab=lineup`}>Configurar</Link><Link className="text-cyan underline" href={`/control/${e.id}`}>Control</Link></td>
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
      <Card>
        <CardTitle>Temporadas ({series.length})</CardTitle>
        {series.length > 0 && <p className="mb-3 text-sm text-fg-muted">{series.map((s) => s.name).join(" · ")}</p>}
        <ActionForm action={createSeriesAction} submitLabel="Crear temporada">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre"><Input name="name" required placeholder="Guerra de Bandas 2027" /></Field>
            <Field label="Descripción (opcional)"><Input name="description" /></Field>
          </div>
          <p className="text-xs text-fg-subtle">Una temporada agrupa las noches y la final de un mismo concurso (bracket).</p>
        </ActionForm>
      </Card>
    </div>
  );
}
