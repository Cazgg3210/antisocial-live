import { notFound } from "next/navigation";
import { Badge, Card, CardTitle, Stat } from "@/components/ui";
import { getReportByToken } from "@/modules/band-reports/service";

export const dynamic = "force-dynamic";

type Payload = {
  band: string; event: string; date: string; level: string; position: number | null; qualification: string | null; bandsInRound: number;
  finalScore: string; nightAverageFinal: string | null; groups: { kind: string; score: string | null; nightAverage: string | null; votes: number }[];
  publicVsJudge: string | null; criteria?: { key: string; mine: string; nightAverage: string | null; judge: string | null }[]; comments?: { group: string; text: string }[]; newFollowers?: number;
  sponsor: { name: string; imageUrl: string | null; code: string } | null;
};

export default async function BandReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await getReportByToken(token).catch(() => null);
  if (!r) notFound();
  const p = r.payload as unknown as Payload;
  const label: Record<string, string> = { PUBLIC: "Público", STAFF: "Staff", JUDGE: "Jurado" };
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="text-xs uppercase tracking-[0.3em] text-fg-subtle">Antisocial Live · Reporte para la banda</p>
      <h1 className="text-gradient text-3xl font-black">{p.band}</h1>
      <p className="mb-6 text-sm text-fg-muted">{p.event} · {new Date(p.date).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Score final" value={p.finalScore} tone="success" />
        <Stat label="Promedio de la noche" value={p.nightAverageFinal ?? "—"} />
        <Stat label="Posición" value={p.position ? `#${p.position} de ${p.bandsInRound}` : "—"} />
        <Stat label="Resultado" value={p.qualification === "QUALIFIED" ? "Clasificó" : p.qualification === "ELIMINATED" ? "No clasificó" : "—"} />
      </div>
      <Card className="mt-4">
        <CardTitle>Por grupo (tu score vs promedio de la noche)</CardTitle>
        <table className="w-full text-sm"><tbody className="divide-y divide-border">
          {p.groups.map((g) => <tr key={g.kind}><td className="py-2">{label[g.kind]} <span className="text-xs text-fg-subtle">({g.votes})</span></td><td className="text-right font-bold">{g.score ? Number(g.score).toFixed(2) : "—"}</td><td className="text-right text-fg-muted">{g.nightAverage ?? "—"}</td></tr>)}
        </tbody></table>
        {p.publicVsJudge && <p className="mt-2 text-xs text-fg-subtle">Público − Jurado: {p.publicVsJudge}</p>}
      </Card>
      {p.criteria && (
        <Card className="mt-4">
          <CardTitle>Por criterio (público)</CardTitle>
          <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>Criterio</th><th className="text-right">Tú</th><th className="text-right">Noche</th><th className="text-right">Jurado</th></tr></thead><tbody className="divide-y divide-border">
            {p.criteria.map((c) => <tr key={c.key}><td className="py-1">{c.key}</td><td className="text-right font-bold">{Number(c.mine).toFixed(2)}</td><td className="text-right text-fg-muted">{c.nightAverage ?? "—"}</td><td className="text-right text-fg-muted">{c.judge ? Number(c.judge).toFixed(2) : "—"}</td></tr>)}
          </tbody></table>
        </Card>
      )}
      {p.comments && p.comments.length > 0 && (
        <Card className="mt-4"><CardTitle>Comentarios (anónimos)</CardTitle><ul className="space-y-2 text-sm">{p.comments.map((c, i) => <li key={i}><Badge className="mr-2">{label[c.group]}</Badge>{c.text}</li>)}</ul></Card>
      )}
      {typeof p.newFollowers === "number" && <p className="mt-4 text-sm text-fg-muted">Nuevos seguidores captados en el evento: <strong className="text-fg">{p.newFollowers}</strong></p>}
      {p.sponsor && <p className="mt-8 text-center text-xs text-fg-subtle">Reporte presentado por <a className="underline" href={`/api/go/${p.sponsor.code}`}>{p.sponsor.name}</a></p>}
    </main>
  );
}
