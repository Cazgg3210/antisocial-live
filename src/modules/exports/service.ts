import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import type { PerformanceResult, RankingEntry } from "@/modules/scoring-engine";

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return (columns ?? []).join(",") + "\n";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export async function resultsRows(eventId: string) {
  const event = await db.eventEdition.findUnique({ where: { id: eventId }, include: { rounds: { include: { performances: { include: { band: true, currentResult: true, qualification: true, timer: true }, orderBy: { slotOrder: "asc" } }, rankings: { where: { isFinal: true }, orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { order: "asc" } } } });
  if (!event) throw notFound("Event");
  const rows: Record<string, unknown>[] = [];
  for (const r of event.rounds) {
    for (const p of r.performances) {
      const res = p.currentResult?.payload as unknown as PerformanceResult | undefined;
      const g = (k: string) => res?.groups.find((x) => x.kind === k);
      rows.push({
        event: event.name,
        date: event.scheduledAt.toISOString().slice(0, 10),
        mode: event.mode,
        round: r.name,
        slot: p.slotOrder,
        band: p.band.name,
        status: p.status,
        public_score: g("PUBLIC")?.score ?? "",
        public_votes: g("PUBLIC")?.acceptedCount ?? "",
        staff_score: g("STAFF")?.score ?? "",
        judge_score: g("JUDGE")?.score ?? "",
        final_score: res?.finalScore ?? "",
        ranking: p.qualification?.position ?? "",
        qualification: p.qualification?.status ?? "",
        accepted_votes: res?.acceptedVotes ?? "",
        flagged_votes: res?.flaggedVotes ?? "",
        rejected_votes: res?.rejectedVotes ?? "",
        policies: res?.policiesApplied.join("|") ?? "",
        formula: res?.formula ?? "",
        overtime_seconds: p.timer?.overtimeSeconds ?? "",
        result_hash: p.currentResult?.hash ?? "",
        calculated_at: p.currentResult?.calculatedAt ?? "",
        published_at: p.currentResult?.publishedAt ?? "",
      });
    }
  }
  return { event, rows };
}

export async function submissionsRows(eventId: string) {
  const subs = await db.scoreSubmission.findMany({ where: { eventId, status: { not: "DRAFT" } }, include: { items: { include: { criterion: true } }, performance: { include: { band: true } } }, orderBy: { submittedAt: "asc" } });
  // Anonymous: voter session ids are hashed short; evaluator ids are stable pseudonyms per event.
  return subs.map((s) => ({
    band: s.performance.band.name,
    group: s.group,
    actor: s.assignmentId ? `EVAL-${s.assignmentId.slice(-6)}` : `VOTER-${s.voterSessionId?.slice(-6)}`,
    status: s.status,
    submitted_at: s.submittedAt,
    in_grace: s.acceptedInGrace,
    risk_bp: s.riskScoreBp,
    variant: s.scorecardVariant,
    ...Object.fromEntries(s.items.map((i) => [i.criterion.key, i.value])),
    comment: s.comment ?? "",
  }));
}

export async function auditRows(eventId: string) {
  const rows = await db.auditEvent.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
  return rows.map((a) => ({ created_at: a.createdAt, action: a.action, actor_type: a.actorType, actor: a.actorLabel ?? a.actorId ?? "", entity: `${a.entityType ?? ""}:${a.entityId ?? ""}`, performance: a.performanceId ?? "", payload: JSON.stringify(a.payload), previous_hash: a.previousHash ?? "", hash: a.hash }));
}

export async function sponsorRows(eventId: string | null, sponsorId: string | null) {
  const placements = await db.sponsorPlacement.findMany({ where: { ...(eventId ? { eventId } : {}), ...(sponsorId ? { campaign: { sponsorId } } : {}) }, include: { campaign: { include: { sponsor: true } }, event: true, interactions: true } });
  return placements.map((p) => ({
    sponsor: p.campaign.sponsor.name,
    campaign: p.campaign.name,
    event: p.event?.name ?? "all",
    placement: p.kind,
    code: p.code,
    impressions: p.interactions.filter((i) => i.kind === "IMPRESSION").length,
    clicks: p.interactions.filter((i) => i.kind === "CLICK").length,
    qr_scans: p.interactions.filter((i) => i.kind === "QR_SCAN").length,
    unique_sessions: new Set(p.interactions.map((i) => i.voterSessionId).filter(Boolean)).size,
  }));
}

export async function audienceRows(organizationId: string) {
  const contacts = await db.audienceContact.findMany({ where: { organizationId, status: "ACTIVE" }, include: { consents: { where: { revokedAt: null } }, refBand: true, event: true } });
  return contacts
    .filter((c) => c.consents.some((k) => k.kind === "MARKETING_EMAIL" || k.kind === "MARKETING_WHATSAPP"))
    .map((c) => ({ email: c.email ?? "", phone: c.phone ?? "", name: c.name ?? "", locale: c.locale, source: c.source, event: c.event?.name ?? "", fan_of: c.refBand?.name ?? "", consents: c.consents.map((k) => `${k.kind}@${k.documentVersion}`).join("|"), created_at: c.createdAt }));
}

/** Official result report. Buffered so the route can return it with Content-Length. */
export async function resultsPdf(eventId: string): Promise<Buffer> {
  const { event, rows } = await resultsRows(eventId);
  const cfg = await db.eventConfig.findUniqueOrThrow({ where: { eventId } });
  const groups = await db.votingGroup.findMany({ where: { eventId }, include: { scorecard: { include: { criteria: { orderBy: { order: "asc" } } } } } });
  const rankings = await db.ranking.findMany({ where: { round: { eventId }, isFinal: true }, orderBy: { createdAt: "desc" } });

  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Resultados — ${event.name}`, Author: "Antisocial Live" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  doc.fillColor("#ff2d95").fontSize(10).text("ANTISOCIAL LIVE · GUERRA DE BANDAS", { characterSpacing: 2 });
  doc.moveDown(0.3).fillColor("#000").fontSize(22).text(event.name);
  doc.fontSize(10).fillColor("#444").text(`Fecha: ${event.scheduledAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })} · Modo: ${event.mode} · Estado: ${event.status}`);
  doc.text(`Generado: ${new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`);
  if (event.mode === "REHEARSAL") doc.fillColor("#b00").text("DATOS DE ENSAYO — NO OFICIALES");
  doc.moveDown();

  doc.fillColor("#000").fontSize(14).text("Reglas de scoring");
  doc.fontSize(9).fillColor("#222");
  for (const g of groups) {
    doc.text(`• ${g.name} (${g.kind}): peso ${(g.weightBp / 100).toFixed(2)}% · agregación ${g.aggregation}${g.aggregation === "TRIMMED_MEAN" ? ` (${g.trimPercentBp / 100}%)` : ""} · mínimo ${g.minSubmissions} (${g.minVotesPolicy})${g.kind !== "PUBLIC" ? ` · ausencia: ${g.missingEvaluatorPolicy}` : ""}`);
    const crit = g.scorecard?.criteria ?? [];
    doc.text(`   Criterios: ${crit.map((c) => `${c.nameEs} ${(c.weightBp / 100).toFixed(0)}%${c.countsTowardScore ? "" : " (estadístico)"}`).join(" · ")}`);
  }
  doc.text(`• Redondeo: ${cfg.decimalPrecision} decimales (${cfg.roundingMode}) · Normalización votante: ${cfg.voterNormalization} · Boost multi-banda: ${cfg.multiBandVoterBoostBp / 10000}x · Patrón porra: ${cfg.porraPatternFlag ? "flag" : "off"} · Bayes M=${cfg.bayesianPriorVotes}`);
  doc.text(`• Desempates: ${JSON.stringify(cfg.tieBreakers)} · Overtime: ${cfg.overtimePolicy}`);
  doc.moveDown();

  for (const r of event.rounds) {
    doc.fillColor("#000").fontSize(14).text(`${r.name} — clasifican ${r.qualifiersCount}`);
    doc.moveDown(0.3);
    const cols = [
      ["Pos", 30],
      ["Banda", 140],
      ["Público", 55],
      ["Staff", 45],
      ["Jurado", 50],
      ["Final", 45],
      ["Votos", 40],
      ["Estado", 90],
    ] as const;
    let x = doc.x;
    const y0 = doc.y;
    doc.fontSize(8).fillColor("#666");
    for (const [label, w] of cols) {
      doc.text(label, x, y0, { width: w });
      x += w;
    }
    doc.moveDown(0.6);
    const sorted = rows.filter((row) => row.round === r.name).sort((a, b) => (Number(a.ranking) || 99) - (Number(b.ranking) || 99));
    for (const row of sorted) {
      x = 48;
      const y = doc.y;
      const vals = [row.ranking ? `#${row.ranking}` : "—", String(row.band), fmt(row.public_score), fmt(row.staff_score), fmt(row.judge_score), String(row.final_score || "—"), String(row.accepted_votes ?? ""), String(row.qualification || row.status)];
      doc.fontSize(9).fillColor("#000");
      vals.forEach((v, i) => {
        doc.text(v, x, y, { width: cols[i][1] });
        x += cols[i][1];
      });
      doc.moveDown(0.4);
      doc.fontSize(7).fillColor("#777").text(`hash ${String(row.result_hash).slice(0, 32)}… · ${row.formula} · ${row.policies || "sin políticas"}`, 48, doc.y, { width: 500 });
      doc.moveDown(0.5);
    }
    const rk = rankings.find((k) => k.roundId === r.id);
    if (rk) {
      const entries = rk.payload as unknown as RankingEntry[];
      const ties = entries.filter((e) => e.tieBreakTrail.length);
      if (ties.length) doc.fontSize(8).fillColor("#444").text(`Desempates aplicados: ${ties.map((e) => `${e.bandName} (${e.tieBreakTrail.join(">")})`).join("; ")}`);
      doc.fontSize(7).fillColor("#777").text(`Ranking hash: ${rk.hash}`);
    }
    doc.moveDown();
  }
  doc.fontSize(8).fillColor("#444").text("Cada resultado es un snapshot inmutable calculado por el Scoring Engine a partir de la configuración congelada al abrir la votación. El hash (SHA-256 sobre JSON canónico RFC 8785) permite verificar que el resultado no fue alterado; la cadena previousHash enlaza los resultados de la noche en orden.", { width: 500 });
  doc.end();
  return done;
}

function fmt(v: unknown): string {
  if (v === "" || v === null || v === undefined) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : String(v);
}
