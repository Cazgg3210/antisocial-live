import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Button, Card, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/admin/form-bits";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  addCriterionAction,
  addPerformanceAction,
  addRoundAction,
  assignEvaluatorAction,
  deleteCriterionAction,
  issueTokenAction,
  movePerformanceAction,
  removePerformanceAction,
  revokeEvaluatorAction,
  transitionEventAction,
  updateConfigAction,
  updateCriterionAction,
  updateEvaluatorAction,
  updateEventAction,
  updateGroupAction,
  updateRoundAction,
} from "@/modules/admin/actions";
import { configIssues } from "@/modules/scoring-config/service";

export const dynamic = "force-dynamic";

export default async function EventDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "general" } = await searchParams;
  const event = await db.eventEdition.findUnique({
    where: { id },
    include: {
      series: true,
      config: true,
      groups: { orderBy: { kind: "asc" } },
      scorecards: { include: { criteria: { orderBy: { order: "asc" } } } },
      rounds: { orderBy: { order: "asc" }, include: { performances: { orderBy: { slotOrder: "asc" }, include: { band: true, qualification: true, currentResult: true } } } },
      assignments: { include: { person: true, tokens: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { group: "asc" } },
      placements: { include: { campaign: { include: { sponsor: true } } } },
    },
  });
  if (!event || !event.config) notFound();
  const [issues, bands, people, allRounds] = await Promise.all([
    configIssues(id).catch(() => []),
    db.band.findMany({ where: { organizationId: event.series.organizationId }, orderBy: { name: "asc" } }),
    db.person.findMany({ where: { organizationId: event.series.organizationId }, orderBy: { name: "asc" } }),
    db.round.findMany({ where: { event: { seriesId: event.seriesId } }, include: { event: true }, orderBy: [{ event: { scheduledAt: "asc" } }, { order: "asc" }] }),
  ]);
  const locked = event.rounds.some((r) => r.performances.some((p) => !["SCHEDULED", "CANCELLED"].includes(p.status)));
  const cfg = event.config;
  const tabs = ["general", "lineup", "scoring", "policies", "evaluators", "sponsors", "exports"];
  const dt = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-fg-subtle">{event.series.name}</p>
          <h1 className="text-2xl font-black">{event.name}</h1>
          <div className="mt-1 flex gap-2"><Badge tone={event.mode === "LIVE" ? "acid" : "warning"}>{event.mode}</Badge><Badge tone={event.status === "LIVE" ? "success" : "neutral"}>{event.status}</Badge>{locked && <Badge tone="cyan">CONFIG LOCKED</Badge>}</div>
        </div>
        <div className="flex gap-2">
          <Link href={`/control/${id}`}><Button>Control Room</Button></Link>
          <a href={`/stage/${event.slug}`} target="_blank" rel="noreferrer"><Button variant="secondary">Stage ↗</Button></a>
          <a href={`/vote/${event.slug}`} target="_blank" rel="noreferrer"><Button variant="secondary">Vote ↗</Button></a>
        </div>
      </div>
      {issues.length > 0 && <Alert tone="danger"><ul className="list-disc pl-5">{issues.map((i) => <li key={i.code + i.message}>{i.message}</li>)}</ul></Alert>}
      <nav className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <Link key={t} href={`?tab=${t}`} className={`px-3 py-2 text-sm capitalize ${tab === t ? "border-b-2 border-accent text-fg" : "text-fg-muted"}`}>{t}</Link>
        ))}
      </nav>

      {tab === "general" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>General</CardTitle>
            <ActionForm action={updateEventAction}>
              <input type="hidden" name="eventId" value={id} />
              <Field label="Nombre"><Input name="name" defaultValue={event.name} /></Field>
              <Field label="Fecha y hora (hora local)"><Input name="scheduledAt" type="datetime-local" defaultValue={dt(event.scheduledAt)} /></Field>
              <Field label="Asistencia esperada" hint="Se usa para % de participación y pruebas de carga (5x)."><Input name="expectedAttendance" type="number" defaultValue={event.expectedAttendance ?? ""} /></Field>
              <Field label="Modo" hint="REHEARSAL: los datos se conservan pero se excluyen de resultados oficiales y analítica."><Select name="mode" defaultValue={event.mode}><option value="REHEARSAL">REHEARSAL</option><option value="LIVE">LIVE</option></Select></Field>
              <p className="text-xs text-fg-subtle">Slug público: <code>{event.slug}</code> · QR: <code>{env().APP_URL}/vote/{event.slug}</code></p>
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Estado</CardTitle>
            <p className="mb-3 text-sm text-fg-muted">Transiciones controladas. READY y LIVE validan configuración y lineup.</p>
            <div className="flex flex-wrap gap-2">
              {event.status === "CONFIGURING" && <ActionButton action={transitionEventAction.bind(null, id, "READY")} variant="primary">Marcar READY</ActionButton>}
              {event.status === "READY" && <ActionButton action={transitionEventAction.bind(null, id, "LIVE")} variant="success" confirm="¿Pasar a LIVE? Se congela la configuración.">GO LIVE</ActionButton>}
              {event.status === "READY" && <ActionButton action={transitionEventAction.bind(null, id, "CONFIGURING")}>Volver a CONFIGURING</ActionButton>}
              {event.status === "LIVE" && <ActionButton action={transitionEventAction.bind(null, id, "CLOSING")} variant="danger" confirm="¿Cerrar el evento?">CLOSING</ActionButton>}
              {event.status === "CLOSING" && <ActionButton action={transitionEventAction.bind(null, id, "COMPLETED")} variant="success">COMPLETED</ActionButton>}
              {(event.status === "COMPLETED" || event.status === "CONFIGURING" || event.status === "READY") && <ActionButton action={transitionEventAction.bind(null, id, "ARCHIVED")} variant="ghost" confirm="¿Archivar?">ARCHIVED</ActionButton>}
            </div>
          </Card>
        </div>
      )}

      {tab === "lineup" && (
        <div className="space-y-4">
          {event.rounds.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-64 flex-1">
                  <CardTitle>{r.name} <Badge>{r.status}</Badge></CardTitle>
                  <ul className="divide-y divide-border">
                    {r.performances.map((p, i) => (
                      <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                        <span><span className="mr-2 text-fg-subtle">{p.slotOrder}</span>{p.band.name} <Badge>{p.status}</Badge> {p.qualification && <Badge tone={p.qualification.status === "QUALIFIED" ? "acid" : "neutral"}>#{p.qualification.position} {p.qualification.status}</Badge>}</span>
                        {p.status === "SCHEDULED" && (
                          <span className="flex gap-1">
                            {i > 0 && <ActionButton action={movePerformanceAction.bind(null, id, r.id, p.id, -1)} variant="ghost">↑</ActionButton>}
                            {i < r.performances.length - 1 && <ActionButton action={movePerformanceAction.bind(null, id, r.id, p.id, 1)} variant="ghost">↓</ActionButton>}
                            <ActionButton action={removePerformanceAction.bind(null, id, p.id)} variant="ghost" confirm="¿Quitar banda?">✕</ActionButton>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <ActionForm action={addPerformanceAction} submitLabel="Agregar banda" className="mt-3">
                    <input type="hidden" name="eventId" value={id} /><input type="hidden" name="roundId" value={r.id} />
                    <Select name="bandId">{bands.filter((b) => !r.performances.some((p) => p.bandId === b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
                  </ActionForm>
                </div>
                <ActionForm action={updateRoundAction} className="w-72">
                  <input type="hidden" name="eventId" value={id} /><input type="hidden" name="roundId" value={r.id} />
                  <Field label="Nombre de ronda"><Input name="name" defaultValue={r.name} /></Field>
                  <Field label="Clasificados (top N)"><Input name="qualifiersCount" type="number" min={0} defaultValue={r.qualifiersCount} /></Field>
                  <Field label="Alimenta a la ronda" hint="Los clasificados se agregan automáticamente a esa ronda al publicar.">
                    <Select name="nextRoundId" defaultValue={r.nextRoundId ?? ""}>
                      <option value="">—</option>
                      {allRounds.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.event.name} · {x.name}</option>)}
                    </Select>
                  </Field>
                </ActionForm>
              </div>
            </Card>
          ))}
          <ActionButton action={addRoundAction.bind(null, id)}>+ Ronda</ActionButton>
        </div>
      )}

      {tab === "scoring" && (
        <div className="space-y-4">
          {locked && <Alert tone="warning">La configuración está bloqueada porque ya se abrió votación en este evento.</Alert>}
          <Card>
            <CardTitle>Grupos y pesos (deben sumar 100%)</CardTitle>
            <div className="grid gap-4 lg:grid-cols-3">
              {event.groups.map((g) => (
                <ActionForm key={g.id} action={updateGroupAction} className="rounded-md border border-border p-3">
                  <input type="hidden" name="eventId" value={id} /><input type="hidden" name="groupId" value={g.id} />
                  <h3 className="mb-2 font-bold">{g.name} <span className="text-xs text-fg-subtle">({g.kind})</span></h3>
                  <Field label="Peso %"><Input name="weightPct" type="number" step="0.01" defaultValue={g.weightBp / 100} disabled={locked} /></Field>
                  <Field label="Agregación"><Select name="aggregation" defaultValue={g.aggregation} disabled={locked}><option>MEAN</option><option>MEDIAN</option><option>TRIMMED_MEAN</option></Select></Field>
                  <Field label="Recorte % (trimmed)"><Input name="trimPct" type="number" step="1" defaultValue={g.trimPercentBp / 100} disabled={locked} /></Field>
                  <Field label="Mínimo de evaluaciones"><Input name="minSubmissions" type="number" defaultValue={g.minSubmissions} disabled={locked} /></Field>
                  <Field label="Si no se alcanza el mínimo"><Select name="minVotesPolicy" defaultValue={g.minVotesPolicy} disabled={locked}><option>BLOCK</option><option>REDISTRIBUTE</option><option>ZERO_WEIGHT</option></Select></Field>
                  {g.kind !== "PUBLIC" && (
                    <>
                      <Field label="Evaluador ausente"><Select name="missingEvaluatorPolicy" defaultValue={g.missingEvaluatorPolicy} disabled={locked}><option>REDISTRIBUTE</option><option>REQUIRE_MIN</option><option>ZERO_WEIGHT</option></Select></Field>
                      <Field label="Evaluadores requeridos"><Input name="requiredEvaluatorCount" type="number" defaultValue={g.requiredEvaluatorCount} disabled={locked} /></Field>
                    </>
                  )}
                  {g.kind === "PUBLIC" && <><input type="hidden" name="missingEvaluatorPolicy" value="REDISTRIBUTE" /><input type="hidden" name="requiredEvaluatorCount" value="0" /></>}
                  <Field label="Scorecard"><Select name="scorecardId" defaultValue={g.scorecardId ?? ""} disabled={locked}>{event.scorecards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                </ActionForm>
              ))}
            </div>
          </Card>
          {event.scorecards.map((sc) => (
            <Card key={sc.id}>
              <CardTitle>Scorecard: {sc.name} — criterios (pesos deben sumar 100%)</CardTitle>
              <div className="space-y-2">
                {sc.criteria.map((c) => (
                  <ActionForm key={c.id} action={updateCriterionAction} className="grid items-end gap-2 rounded-md border border-border p-2 md:grid-cols-[3rem_1fr_1fr_5rem_4rem_4rem_6rem_6rem_auto]">
                    <input type="hidden" name="eventId" value={id} /><input type="hidden" name="criterionId" value={c.id} />
                    <Field label="#"><Input name="order" type="number" defaultValue={c.order} disabled={locked} /></Field>
                    <Field label="Nombre ES"><Input name="nameEs" defaultValue={c.nameEs} disabled={locked} /></Field>
                    <Field label="Nombre EN"><Input name="nameEn" defaultValue={c.nameEn} disabled={locked} /></Field>
                    <Field label="Peso %"><Input name="weightPct" type="number" step="0.01" defaultValue={c.weightBp / 100} disabled={locked} /></Field>
                    <Field label="Min"><Input name="scaleMin" type="number" defaultValue={c.scaleMin} disabled={locked} /></Field>
                    <Field label="Max"><Input name="scaleMax" type="number" defaultValue={c.scaleMax} disabled={locked} /></Field>
                    <label className="mb-4 flex items-center gap-1 text-xs"><input type="checkbox" name="countsTowardScore" defaultChecked={c.countsTowardScore} disabled={locked} /> cuenta</label>
                    <label className="mb-4 flex items-center gap-1 text-xs"><input type="checkbox" name="includedInQuick" defaultChecked={c.includedInQuick} disabled={locked} /> QUICK</label>
                    <div className="mb-4">{!locked && <ActionButton action={deleteCriterionAction.bind(null, id, c.id)} variant="ghost" confirm="¿Eliminar criterio?">✕</ActionButton>}</div>
                    <input type="hidden" name="descriptionEs" value={c.descriptionEs ?? ""} /><input type="hidden" name="descriptionEn" value={c.descriptionEn ?? ""} />
                  </ActionForm>
                ))}
              </div>
              {!locked && (
                <ActionForm action={addCriterionAction} submitLabel="+ Criterio" className="mt-3">
                  <input type="hidden" name="eventId" value={id} /><input type="hidden" name="scorecardId" value={sc.id} />
                  <div className="grid gap-2 md:grid-cols-3"><Input name="key" placeholder="clave (ej. tecnica)" /><Input name="nameEs" placeholder="Nombre ES" /><Input name="nameEn" placeholder="Name EN" /></div>
                </ActionForm>
              )}
              <p className="mt-2 text-xs text-fg-subtle">&ldquo;Evaluación global&rdquo; puede desmarcarse como &ldquo;cuenta&rdquo; para conservarla como indicador estadístico sin peso. Nunca existe un peso implícito.</p>
            </Card>
          ))}
        </div>
      )}

      {tab === "policies" && (
        <ActionForm action={updateConfigAction} submitLabel="Guardar políticas">
          <input type="hidden" name="eventId" value={id} />
          {locked && <Alert tone="warning">Bloqueado: ya se abrió votación.</Alert>}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardTitle>Votación pública</CardTitle>
              <Field label="Periodo de gracia (s)"><Input name="graceSeconds" type="number" defaultValue={cfg.graceSeconds} /></Field>
              <Check name="allowVoteEdit" checked={cfg.allowVoteEdit} label="Permitir cambiar el voto antes del cierre" />
              <Check name="screenCodeRequired" checked={cfg.screenCodeRequired} label="Requerir código de pantalla" />
              <Field label="Rotación del código (s)"><Input name="screenCodeRotationSec" type="number" defaultValue={cfg.screenCodeRotationSec} /></Field>
              <Check name="turnstileEnabled" checked={cfg.turnstileEnabled} label="Cloudflare Turnstile (requiere llaves en .env)" />
              <Field label="Scorecard público"><Select name="publicScorecardVariant" defaultValue={cfg.publicScorecardVariant}><option>FULL</option><option>QUICK</option></Select></Field>
              <Check name="showVoteCountPublicly" checked={cfg.showVoteCountPublicly} label="Mostrar “N votos recibidos” (nunca promedios)" />
            </Card>
            <Card>
              <CardTitle>Equidad y precisión</CardTitle>
              <Field label="Normalización por votante"><Select name="voterNormalization" defaultValue={cfg.voterNormalization}><option>NONE</option><option>Z_SCORE_PER_VOTER</option></Select></Field>
              <Field label="Boost votante multi-banda (bp, 10000 = 1.0x)"><Input name="multiBandVoterBoostBp" type="number" defaultValue={cfg.multiBandVoterBoostBp} /></Field>
              <Field label="Mínimo de bandas para boost"><Input name="multiBandVoterMin" type="number" defaultValue={cfg.multiBandVoterMin} /></Field>
              <Check name="porraPatternFlag" checked={cfg.porraPatternFlag} label="Marcar patrón porra para revisión (nunca borra)" />
              <Field label="Suavizado bayesiano (M votos, 0 = off)"><Input name="bayesianPriorVotes" type="number" defaultValue={cfg.bayesianPriorVotes} /></Field>
              <Field label="Normalización por juez"><Select name="judgeNormalization" defaultValue={cfg.judgeNormalization}><option>NONE</option><option>Z_SCORE_PER_JUDGE</option></Select></Field>
              <Field label="Decimales"><Input name="decimalPrecision" type="number" defaultValue={cfg.decimalPrecision} /></Field>
              <Field label="Redondeo"><Select name="roundingMode" defaultValue={cfg.roundingMode}><option>HALF_UP</option><option>HALF_EVEN</option></Select></Field>
              <Field label="Tie breakers (JSON ordenado)"><Textarea name="tieBreakers" defaultValue={JSON.stringify(cfg.tieBreakers)} /></Field>
            </Card>
            <Card>
              <CardTitle>Reveal, timer y comercial</CardTitle>
              <Field label="Reveal parcial por banda"><Select name="partialRevealPolicy" defaultValue={cfg.partialRevealPolicy}>{["NONE", "JUDGES_ONLY", "STAFF_ONLY", "JUDGES_AND_STAFF", "ALL_GROUPS", "FINAL_ONLY"].map((o) => <option key={o}>{o}</option>)}</Select></Field>
              <Field label="Orden del reveal final"><Select name="finalRevealOrder" defaultValue={cfg.finalRevealOrder}><option>ASCENDING</option><option>DESCENDING</option><option>ALPHABETICAL</option></Select></Field>
              <Field label="Estilo del reveal final"><Select name="finalRevealStyle" defaultValue={cfg.finalRevealStyle}><option>ONE_BY_ONE</option><option>ALL_AT_ONCE</option></Select></Field>
              <Check name="requireResultApproval" checked={cfg.requireResultApproval} label="Control de dos personas (calcula operador, aprueba manager)" />
              <Field label="Duración planeada por banda (s)"><Input name="timerPlannedSeconds" type="number" defaultValue={cfg.timerPlannedSeconds} /></Field>
              <Field label="Recordatorios (minutos antes del fin, negativos = overtime)"><Input name="timerReminderOffsets" defaultValue={cfg.timerReminderOffsets.map((s) => s / 60).join(", ")} /></Field>
              <Check name="stageShowTimer" checked={cfg.stageShowTimer} label="Mostrar timer en Stage (público)" />
              <Field label="Política de overtime"><Select name="overtimePolicy" defaultValue={cfg.overtimePolicy}><option>NONE</option><option>TIE_BREAKER</option><option>PENALTY</option></Select></Field>
              <Field label="Penalización overtime (bp del score)"><Input name="overtimePenaltyBp" type="number" defaultValue={cfg.overtimePenaltyBp} /></Field>
              <Check name="bandReportEnabled" checked={cfg.bandReportEnabled} label="Enviar reporte a las bandas" />
              <Field label="Nivel del reporte a bandas"><Select name="bandReportLevel" defaultValue={cfg.bandReportLevel}><option>NONE</option><option>SUMMARY</option><option>DETAILED</option></Select></Field>
              <Check name="postVoteShowBandProfile" checked={cfg.postVoteShowBandProfile} label="Post-voto: perfil de la banda" />
              <Check name="postVoteShowOptIn" checked={cfg.postVoteShowOptIn} label="Post-voto: opt-in de marketing" />
              <Check name="postVoteShowReservation" checked={cfg.postVoteShowReservation} label="Post-voto: CTA de reserva" />
              <Field label="URL de reserva"><Input name="reservationUrl" defaultValue={cfg.reservationUrl ?? ""} /></Field>
              <Check name="postVoteShowSponsor" checked={cfg.postVoteShowSponsor} label="Post-voto: CTA de sponsor" />
            </Card>
          </div>
        </ActionForm>
      )}

      {tab === "evaluators" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card>
            <CardTitle>Jurado y staff asignados</CardTitle>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>Nombre</th><th>Grupo</th><th>Peso</th><th>Token</th><th>Estado</th><th></th></tr></thead>
              <tbody className="divide-y divide-border">
                {event.assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2">{a.person.name}<div className="text-xs text-fg-subtle">{a.person.email}</div></td>
                    <td><Badge tone={a.group === "JUDGE" ? "cyan" : "neutral"}>{a.group}</Badge></td>
                    <td>
                      <ActionForm action={updateEvaluatorAction} submitLabel="ok" className="flex items-end gap-1">
                        <input type="hidden" name="eventId" value={id} /><input type="hidden" name="assignmentId" value={a.id} />
                        <Input name="weight" type="number" step="0.1" defaultValue={a.individualWeightBp / 10000} className="w-20" />
                        <Input name="pin" placeholder={a.pinHash ? "PIN set" : "PIN"} className="w-24" />
                      </ActionForm>
                    </td>
                    <td><Badge tone={a.tokens[0]?.status === "USED" ? "success" : a.tokens[0]?.status === "ACTIVE" ? "warning" : "neutral"}>{a.tokens[0]?.status ?? "NONE"}</Badge></td>
                    <td><Badge tone={a.status === "ACTIVE" ? "success" : "danger"}>{a.status}</Badge></td>
                    <td className="space-x-1 text-right">
                      <ActionButton action={issueTokenAction.bind(null, id, a.id)} variant="primary">Emitir link</ActionButton>
                      <ActionButton action={revokeEvaluatorAction.bind(null, id, a.id)} variant="ghost" confirm="¿Revocar acceso?">Revocar</ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-fg-subtle">El link es de un solo uso y queda ligado al primer dispositivo. Reemitir invalida el anterior y libera el dispositivo.</p>
          </Card>
          <Card>
            <CardTitle>Asignar</CardTitle>
            <ActionForm action={assignEvaluatorAction} submitLabel="Asignar">
              <input type="hidden" name="eventId" value={id} />
              <Field label="Persona existente"><Select name="personId" defaultValue=""><option value="">— nueva —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="o nueva: nombre"><Input name="newName" /></Field>
              <Field label="correo"><Input name="newEmail" type="email" /></Field>
              <Field label="teléfono"><Input name="newPhone" /></Field>
              <Field label="Grupo"><Select name="group"><option>JUDGE</option><option>STAFF</option></Select></Field>
              <Field label="Peso individual (1.0 = normal)"><Input name="weight" type="number" step="0.1" defaultValue={1} /></Field>
              <Field label="PIN (opcional)"><Input name="pin" /></Field>
            </ActionForm>
          </Card>
        </div>
      )}

      {tab === "sponsors" && (
        <Card>
          <CardTitle>Placements en este evento</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {event.placements.map((p) => (
              <li key={p.id} className="flex justify-between py-2"><span><strong>{p.campaign.sponsor.name}</strong> · {p.kind} · {p.headlineEs}</span><span className="font-mono text-xs">/api/go/{p.code}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-sm"><Link className="text-cyan underline" href="/admin/sponsors">Administrar sponsors, campañas y placements →</Link></p>
        </Card>
      )}

      {tab === "exports" && (
        <Card>
          <CardTitle>Exportar</CardTitle>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/export/${id}/results.csv`}><Button variant="secondary">Resultados CSV</Button></a>
            <a href={`/api/export/${id}/submissions.csv`}><Button variant="secondary">Evaluaciones CSV (anónimas)</Button></a>
            <a href={`/api/export/${id}/results.pdf`}><Button>Reporte oficial PDF</Button></a>
            <a href={`/api/export/${id}/sponsors.csv`}><Button variant="secondary">Sponsors CSV</Button></a>
            <a href={`/api/export/${id}/audit.csv`}><Button variant="secondary">Audit CSV</Button></a>
          </div>
          <p className="mt-3 text-xs text-fg-subtle">El PDF incluye reglas de scoring, hash de cada resultado y timestamp; permite verificar el resultado con el snapshot.</p>
        </Card>
      )}
    </div>
  );
}

function Check({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  return (
    <label className="mb-3 flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1" />
      <span>{label}</span>
    </label>
  );
}
