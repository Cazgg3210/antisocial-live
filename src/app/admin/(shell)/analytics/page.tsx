import { Badge, Card, CardTitle, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/admin-session";
import { db } from "@/lib/db";
import { eventAnalytics, seriesComparison } from "@/modules/analytics/service";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  await requireAdmin();
  const { event } = await searchParams;
  const events = await db.eventEdition.findMany({ orderBy: { scheduledAt: "desc" }, select: { id: true, name: true, seriesId: true, mode: true } });
  const current = events.find((e) => e.id === event) ?? events[0];
  if (!current) return <p className="text-fg-muted">Sin eventos.</p>;
  const [a, series] = await Promise.all([eventAnalytics(current.id), seriesComparison(current.seriesId)]);
  const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">Analítica</h1>
        <form><select name="event" defaultValue={current.id} className="h-10 rounded-md border border-border bg-bg px-3 text-sm" onChange={undefined}>{events.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.mode})</option>)}</select><button className="ml-2 h-10 rounded-md border border-border px-3 text-sm">Ver</button></form>
      </div>
      {a.event.mode === "REHEARSAL" && <Badge tone="warning">Datos de ensayo — no oficiales</Badge>}
      <section>
        <CardTitle>Operación</CardTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Bandas" value={a.operational.performances} />
          <Stat label="Votos aceptados" value={a.operational.accepted} />
          <Stat label="Marcados / rechazados" value={`${a.operational.flagged} / ${a.operational.rejected}`} tone={a.operational.flagged ? "warning" : undefined} />
          <Stat label="Votantes únicos" value={a.operational.uniqueSessions} />
          <Stat label="Participación" value={pct(a.operational.participationRate)} />
          <Stat label="Votantes multi-banda" value={a.operational.multiBandVoters} />
          <Stat label="Returning" value={a.operational.returningVoters} />
          <Stat label="Tiempo medio de voto" value={a.operational.avgVoteSeconds !== null ? `${a.operational.avgVoteSeconds}s` : "—"} />
          <Stat label="Jurado / Staff" value={`${a.operational.judgeSubmissions} / ${a.operational.staffSubmissions}`} />
        </div>
      </section>
      <Card>
        <CardTitle>Por banda (público vs jurado, orden de la noche)</CardTitle>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>#</th><th>Banda</th><th>Votos</th><th>Público</th><th>Staff</th><th>Jurado</th><th>Divergencia P−J</th><th>Final</th><th>Duración</th><th>Pos.</th></tr></thead>
          <tbody className="divide-y divide-border">
            {a.operational.bands.map((b) => (
              <tr key={b.performanceId}>
                <td className="py-1">{b.slotOrder}</td><td className="font-semibold">{b.band}</td><td>{b.votes}{b.flagged ? <span className="text-warning"> (+{b.flagged})</span> : null}</td>
                <td>{b.publicScore ? Number(b.publicScore).toFixed(2) : "—"}</td><td>{b.staffScore ? Number(b.staffScore).toFixed(2) : "—"}</td><td>{b.judgeScore ? Number(b.judgeScore).toFixed(2) : "—"}</td>
                <td className={b.divergence && Math.abs(Number(b.divergence)) > 1 ? "text-warning" : ""}>{b.divergence ?? "—"}</td>
                <td className="font-bold">{b.final ?? "—"}</td>
                <td>{b.actualSeconds !== null ? `${Math.round(b.actualSeconds / 60)} min${b.overtimeSeconds ? ` (+${Math.round(b.overtimeSeconds / 60)})` : ""}` : "—"}</td>
                <td>{b.position ? `#${b.position} ${b.qualification}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <CardTitle>Criterios (público): promedio y distribución 1–10</CardTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {a.operational.byCriterion.map((c) => {
            const max = Math.max(1, ...c.distribution);
            return (
              <div key={c.key} className="rounded-md border border-border p-3">
                <div className="flex justify-between text-sm"><span>{c.nameEs}</span><strong>{c.mean !== null ? c.mean.toFixed(2) : "—"}</strong></div>
                <div className="mt-2 flex h-12 items-end gap-1">{c.distribution.map((n, i) => <div key={i} title={`${i + 1}: ${n}`} className="flex-1 rounded-sm bg-cyan/60" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 2 : 0 }} />)}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <section>
        <CardTitle>Comercial</CardTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Opt-ins (métrica norte)" value={`${a.commercial.optIns} · ${pct(a.commercial.optInRate)}`} tone="success" />
          <Stat label="Contactos nuevos" value={a.commercial.contacts} />
          <Stat label="Clics a reserva" value={a.commercial.reservationClicks} />
          <Stat label="Seguidores ganados" value={a.commercial.follows.reduce((s, f) => s + f.count, 0)} />
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Card><CardTitle>Fans por banda</CardTitle><ul className="text-sm">{a.commercial.follows.map((f) => <li key={f.bandId} className="flex justify-between py-1"><span>{f.band}</span><strong>{f.count}</strong></li>)}{a.commercial.follows.length === 0 && <li className="text-fg-subtle">—</li>}</ul></Card>
          <Card><CardTitle>Sponsors</CardTitle><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>Sponsor</th><th>Placement</th><th>Impr.</th><th>Clics</th><th>CTR</th></tr></thead><tbody className="divide-y divide-border">{a.commercial.sponsors.map((s, i) => <tr key={i}><td className="py-1">{s.sponsor}</td><td className="text-xs">{s.kind}</td><td>{s.impressions}</td><td>{s.clicks + s.qr}</td><td>{s.impressions ? `${(((s.clicks + s.qr) / s.impressions) * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table></Card>
        </div>
      </section>
      <Card>
        <CardTitle>Comparativa de la temporada (solo eventos LIVE)</CardTitle>
        <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>Evento</th><th>Votos</th><th>Votantes</th><th>Participación</th><th>Opt-ins</th></tr></thead><tbody className="divide-y divide-border">{series.map((e) => <tr key={e.id}><td className="py-1">{e.name}</td><td>{e.votes}</td><td>{e.sessions}</td><td>{e.expectedAttendance ? `${((e.sessions / e.expectedAttendance) * 100).toFixed(0)}%` : "—"}</td><td>{e.optIns}</td></tr>)}{series.length === 0 && <tr><td className="text-fg-subtle" colSpan={5}>Aún no hay eventos LIVE.</td></tr>}</tbody></table>
      </Card>
    </div>
  );
}
