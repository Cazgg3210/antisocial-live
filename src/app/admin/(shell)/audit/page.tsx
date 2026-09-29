import { Badge, Card, CardTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/admin-session";
import { db } from "@/lib/db";
import { hashCanonical } from "@/lib/hash";
import { verifyResult } from "@/modules/results/service";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ event?: string; action?: string; page?: string; verify?: string }> }) {
  await requireAdmin();
  const { event, action, page = "1", verify } = await searchParams;
  const take = 100;
  const skip = (Number(page) - 1) * take;
  const where = { ...(event ? { eventId: event } : {}), ...(action ? { action: { contains: action.toUpperCase() } } : {}) };
  const [rows, total, events, results] = await Promise.all([
    db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    db.auditEvent.count({ where }),
    db.eventEdition.findMany({ orderBy: { scheduledAt: "desc" }, select: { id: true, name: true } }),
    event ? db.resultSnapshot.findMany({ where: { eventId: event }, include: { performance: { include: { band: true } } }, orderBy: { calculatedAt: "asc" } }) : [],
  ]);

  // Chain verification for the selected event: recompute each hash from its body and check links.
  let chain: { ok: boolean; checked: number; brokenAt?: string } | null = null;
  if (event) {
    const all = await db.auditEvent.findMany({ where: { eventId: event }, orderBy: { createdAt: "asc" } });
    let prev: string | null = null;
    chain = { ok: true, checked: all.length };
    for (const a of all) {
      const body = { action: a.action, actorType: a.actorType, actorId: a.actorId, eventId: a.eventId, performanceId: a.performanceId, entityType: a.entityType, entityId: a.entityId, payload: a.payload, createdAt: a.createdAt.toISOString(), previousHash: a.previousHash };
      if (a.previousHash !== prev || hashCanonical(body) !== a.hash) {
        chain = { ok: false, checked: all.length, brokenAt: a.id };
        break;
      }
      prev = a.hash;
    }
  }
  const verification = verify ? await verifyResult(verify).catch((e) => ({ error: String(e) })) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Auditoría</h1>
      <form className="flex flex-wrap gap-2 text-sm">
        <select name="event" defaultValue={event ?? ""} className="h-10 rounded-md border border-border bg-bg px-3"><option value="">todos los eventos</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <input name="action" defaultValue={action ?? ""} placeholder="acción (ej. RESULT)" className="h-10 rounded-md border border-border bg-bg px-3" />
        <button className="h-10 rounded-md border border-border px-3">Filtrar</button>
        {event && <a className="h-10 rounded-md border border-border px-3 leading-10" href={`/api/export/${event}/audit.csv`}>CSV</a>}
      </form>
      {chain && (
        <Badge tone={chain.ok ? "success" : "danger"}>{chain.ok ? `Cadena de hashes íntegra (${chain.checked} eventos)` : `CADENA ROTA en ${chain.brokenAt}`}</Badge>
      )}
      {results.length > 0 && (
        <Card>
          <CardTitle>Resultados del evento (snapshots inmutables)</CardTitle>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>Banda</th><th>Final</th><th>Hash</th><th>Prev</th><th>Calculado</th><th>Publicado</th><th></th></tr></thead>
            <tbody className="divide-y divide-border">
              {results.map((r) => (
                <tr key={r.id}><td className="py-1">{r.performance.band.name}</td><td className="font-bold">{r.finalScore.toString()}</td><td className="font-mono text-xs">{r.hash.slice(0, 16)}…</td><td className="font-mono text-xs">{r.previousHash?.slice(0, 8) ?? "root"}</td><td className="text-xs">{r.calculatedAt.toLocaleString("es-MX")}</td><td className="text-xs">{r.publishedAt?.toLocaleString("es-MX") ?? "—"}</td><td><a className="text-cyan underline" href={`?event=${event}&verify=${r.id}`}>verificar</a></td></tr>
              ))}
            </tbody>
          </table>
          {verification && (
            <pre className="mt-3 overflow-auto rounded-md bg-bg p-3 text-xs">{JSON.stringify(verification, null, 2)}</pre>
          )}
        </Card>
      )}
      <Card>
        <CardTitle>Eventos de auditoría ({total})</CardTitle>
        <table className="w-full text-xs">
          <thead className="text-left uppercase text-fg-subtle"><tr><th>Fecha</th><th>Acción</th><th>Actor</th><th>Entidad</th><th>Payload</th><th>Hash</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap py-1">{a.createdAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</td>
                <td><Badge>{a.action}</Badge></td>
                <td>{a.actorType} {a.actorLabel ?? a.actorId?.slice(0, 8)}</td>
                <td>{a.entityType} {a.entityId?.slice(0, 8)}</td>
                <td className="max-w-md truncate font-mono" title={JSON.stringify(a.payload)}>{JSON.stringify(a.payload)}</td>
                <td className="font-mono">{a.hash.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex gap-2 text-sm">{Number(page) > 1 && <a className="text-cyan underline" href={`?event=${event ?? ""}&action=${action ?? ""}&page=${Number(page) - 1}`}>← anterior</a>}{skip + take < total && <a className="text-cyan underline" href={`?event=${event ?? ""}&action=${action ?? ""}&page=${Number(page) + 1}`}>siguiente →</a>}</div>
      </Card>
    </div>
  );
}
