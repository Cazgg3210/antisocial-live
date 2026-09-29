# BUSINESS RULES

Regla fundamental: **ninguna regla de negocio se inventa en silencio**. Todo lo que no está confirmado por el owner es configurable, tiene un default marcado como *demo* y queda documentado aquí. Cada PR que cambie una regla actualiza este archivo.

## 1. Decisiones confirmadas por el owner

| Regla | Valor | Dónde vive |
|---|---|---|
| Bandas por noche | 4 | Lineup del evento |
| Asistencia | 100–200 (pruebas a 5x = 1,000) | `EventEdition.expectedAttendance`, k6 |
| Duración por banda | 45 min, controlada manualmente; el sistema recuerda | `EventConfig.timerPlannedSeconds = 2700` |
| Clasificación | Por noche (ranking relativo dentro de la jornada) | `Round.qualifiersCount`, `Round.nextRoundId` |
| Temporada | 16 bandas → 4 noches → final | Seed demo: 4 ediciones + final, `nextRoundId` |
| Reveal parcial | Después de cada banda, hoy solo jurado o solo staff | `partialRevealPolicy` default `JUDGES_ONLY` |
| Reveal final | De menor a mayor | `finalRevealOrder = ASCENDING`, `finalRevealStyle = ONE_BY_ONE` |
| Jueces | ~3; sin regla si falta uno | `missingEvaluatorPolicy` default `REDISTRIBUTE` |
| Operadores | 2 | `OperatorLock` + roles STAGE_OPERATOR / EVENT_MANAGER |
| Cambiar voto | No (práctica actual), configurable | `allowVoteEdit = false` |
| Reporte a bandas | Configurable ON/OFF | `bandReportEnabled`, `bandReportLevel` |
| Idioma | es-MX default, en | Cookie `al_locale`, `Accept-Language` |
| Infraestructura | Droplet + Dokploy + Traefik; Postgres en Dokploy; Cloudflare opcional | `docker-compose.yml`, `TURNSTILE_ENABLED` |

## 2. Configuración de scoring (por evento)

### Grupos (`VotingGroup`)

| Campo | Default demo | Regla |
|---|---|---|
| `weightBp` | Público 4000 / Staff 2000 / Jurado 4000 | Deben sumar exactamente 10000 (100%). Nunca se corrige en silencio. |
| `aggregation` | Público TRIMMED_MEAN(10%), Staff/Jurado MEAN | Media, mediana o media recortada |
| `trimPercentBp` | 1000 | Con n < 3 no se recorta (documentado) |
| `minSubmissions` | Público 10 (seed: 5), evaluadores 1 | Mínimo de evaluaciones aceptadas |
| `minVotesPolicy` | Público REDISTRIBUTE, evaluadores BLOCK | BLOCK detiene el cálculo; REDISTRIBUTE / ZERO_WEIGHT excluyen el grupo y reparten su peso proporcionalmente |
| `missingEvaluatorPolicy` | REDISTRIBUTE | REQUIRE_MIN bloquea si hay menos de `requiredEvaluatorCount`; ZERO_WEIGHT anula el grupo |
| `requiredEvaluatorCount` | Jurado 2, Staff 1 | |

### Criterios (`Criterion`)

Escala 1–10 entera. Pesos por criterio deben sumar 100% entre los que `countsTowardScore`. "Evaluación global" puede ser estadístico (`countsTowardScore = false`, peso 0): nunca hay peso implícito. `includedInQuick` define el scorecard QUICK del público; los pesos se re-normalizan sobre los criterios respondidos.

Default demo: Calidad 20, Presencia 15, Imagen 10, Conexión 15, Originalidad 10, Repertorio 10, Global 20.

### Políticas (`EventConfig`)

| Política | Default | Efecto |
|---|---|---|
| `graceSeconds` | 5 | Votos en tránsito tras CLOSE se aceptan con `acceptedInGrace` |
| `screenCodeRequired` / `screenCodeRotationSec` | true / 60 | Código de 4 dígitos HMAC(eventId, ventana); válido ventana actual y anterior |
| `turnstileEnabled` | false | Cloudflare Turnstile en el primer acceso de la sesión |
| `publicScorecardVariant` | FULL | FULL (7 criterios) o QUICK (global + `includedInQuick`) |
| `voterNormalization` | NONE | Z_SCORE_PER_VOTER solo a votantes con ≥2 bandas |
| `multiBandVoterBoostBp` / `multiBandVoterMin` | 10000 (off) / 2 | Peso extra a quien evaluó ≥N bandas |
| `porraPatternFlag` | true | Máximo a una banda y mínimo al resto (≥3 bandas) → FLAGGED_FOR_REVIEW, nunca borrado |
| `bayesianPriorVotes` | 0 (off) | Suaviza hacia la media de la ronda con M votos previos |
| `judgeNormalization` | NONE | Z_SCORE_PER_JUDGE con ≥2 bandas |
| `decimalPrecision` / `roundingMode` | 2 / HALF_UP | Se redondea una sola vez, al final |
| `tieBreakers` | JUDGE_SCORE → PUBLIC_SCORE → CRITERION:conexion → MANUAL | MANUAL exige decisión con motivo registrada en `TieBreakDecision` |
| `overtimePolicy` / `overtimePenaltyBp` | NONE / 0 | TIE_BREAKER o PENALTY(bp del score); siempre se registra el overtime |
| `requireResultApproval` | false | Two-person control: quien aprueba ≠ quien calculó |
| `showVoteCountPublicly` | true | Se muestra "N votos"; nunca promedios con votación abierta |
| `timerReminderOffsets` | [600, 300, 120, 0, −120] s | Notificaciones a jurado/staff/control |
| `stageShowTimer` | false | El público no ve el reloj |
| Post-voto | perfil de banda, opt-in, reserva, sponsor: on | Cada bloque es independiente |

## 3. Seguridad e integridad del voto

- Un voto por sesión anónima por presentación (constraint único). La sesión es una cookie firmada de larga duración; no identifica a la persona.
- Idempotencia por `submissionKey` (UUID de cliente): reintentos devuelven la misma confirmación.
- Validez de cierre: el voto es válido solo si su transacción confirma con la performance en `VOTING_OPEN` o `GRACE_PERIOD` (fila bloqueada `FOR UPDATE`). Determinista bajo carrera.
- IP: nunca en claro. `HMAC(ip, salt del evento)`; la sal se puede destruir tras el evento. La IP es señal débil (>150 sesiones por IP), nunca bloqueo: todo el venue comparte IP.
- Señales de riesgo (bp): TOO_FAST 2500, IP_CLUSTER 1000, PORRA_PATTERN 6000. `riskScore ≥ 5000` → FLAGGED_FOR_REVIEW. Revisión manual desde Control Room con motivo, auditada.
- Rate limiting en memoria por sesión (6 votos/30 s) y por IP en login/redeem (generoso: el jurado comparte IP).

## 4. Jurado y staff

- Identidad: `Person` + `EvaluatorAssignment` por evento y grupo. Acceso por token de un solo uso (192 bits, hash SHA-256 en DB, expira), confirmación "¿Eres tú?", PIN opcional, ligado al primer dispositivo. Reemitir invalida el anterior y libera el dispositivo.
- Peso individual `individualWeightBp` (default 1.0×) dentro del peso del grupo.
- Borrador autosave; envío final → LOCKED. Desbloqueo solo por manager con motivo (`SUBMISSION_UNLOCKED`), conservando la revisión anterior.
- Conflicto de interés autodeclarado: el evaluador queda excusado para esa banda (no cuenta como ausente).
- Un evaluador no ve puntuaciones de otros.

## 5. Eventos, rondas y bracket

- Estados separados: `EventEdition` (DRAFT → CONFIGURING → READY → LIVE → CLOSING → COMPLETED → ARCHIVED), `Round`, `Performance` (SCHEDULED → ON_STAGE → VOTING_OPEN → GRACE_PERIOD → VOTING_CLOSED → CALCULATING → RESULT_READY → PARTIAL_REVEALED → FINALIZED), `StageScene`, `PerformanceTimer`.
- READY/LIVE exigen configuración válida y lineup no vacío. Al pasar a LIVE y al abrir cada votación se crea/reutiliza un `ConfigurationSnapshot` (se reutiliza si el hash no cambió).
- La configuración se bloquea en cuanto se abre la primera votación del evento.
- `mode = REHEARSAL` conserva los datos pero los marca; analítica y bases los excluyen o etiquetan.
- Finalizar ronda exige resultado (y aprobación, si aplica) en todas las bandas no canceladas; genera `Ranking` (hash), `Qualification` y crea las performances de la siguiente ronda para los clasificados.
- Empate no resuelto: `PENDING` si cruza la línea de corte; el manager decide con `manualOrder` y queda `TieBreakDecision`.

## 6. Comercial y privacidad

- El opt-in nunca condiciona el voto ni lo referencia. `Consent` guarda tipo, versión del documento, texto mostrado, origen y hash de IP.
- Sponsors solo en landing (cabecera), thank-you y Stage; nunca dentro de la tarjeta de evaluación. Impresiones/clics/QR por placement y evento.
- Reporte a banda: nunca incluye scores individuales de otras bandas ni identidades del jurado. Nivel SUMMARY o DETAILED.
- ARCO: `DataRequest`; CANCELACIÓN completada borra correo/teléfono/nombre y revoca consentimientos; resultados y audit no se alteran.
- Retención: señales de seguridad 30 días (configurable), contactos hasta revocación, resultados/audit indefinidos.

## 7. Supuestos pendientes de confirmar

- Pesos reales de producción (hoy demo 40/20/40).
- Si el público usa FULL o QUICK (se recomienda medir abandono por criterio).
- Política final ante juez ausente en la final (sugerido REQUIRE_MIN=3 + two-person control).
- Textos legales: son plantillas; revisar con asesoría legal antes del primer evento en modo LIVE.
