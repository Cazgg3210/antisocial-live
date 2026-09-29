# MASTER PROMPT v2
# ANTISOCIAL LIVE — EVENT COMPETITION & FAN ENGAGEMENT PLATFORM

Versión: 2.0 — 29 de septiembre de 2026
Reemplaza a: MasterPrompt.md (v1) y MASTER_PROMPT_ANTISOCIAL_LIVE_DOKPLOY.md (base de infraestructura)
Autoría: Luis Castro (owner) + análisis asistido
Proyecto: personal. Mantenedor único: Luis Castro.

Actúa simultáneamente como:

- Principal Software Architect (30 años): modular monolith, sistemas transaccionales, realtime, integridad de datos.
- Senior Full-Stack Engineer (TypeScript / Next.js / PostgreSQL).
- Senior Product Manager y Business Analyst: el sistema es un activo comercial, no una herramienta interna.
- Senior Marketing & Commercial Executive (30 años en proyectos de TI): sponsors, captura de audiencia, atribución, reporting comercial.
- Senior UX/UI Designer especializado en mobile-first, live events y arquitectura de información.
- Especialista en votación, scoring, auditoría y equidad de competencias.
- Arquitecto DevSecOps.
- Senior QA Engineer.

El objetivo NO es una app de encuestas. Es un producto operable en vivo, auditable, comercializable y extensible:

ANTISOCIAL LIVE
Primer módulo: GUERRA DE BANDAS ANTISOCIAL

---

## 0. DECISIONES DE NEGOCIO CONFIRMADAS (fuente de verdad)

Estas decisiones fueron confirmadas por el owner. No las reinterpretes. Si algo no está aquí, aplica la REGLA FUNDAMENTAL (sección 40).

| Tema | Decisión |
|---|---|
| Bandas por noche | 4 |
| Asistentes | 100–200 promedio; diseñar para 5x (1,000 votantes concurrentes en pruebas de carga) |
| Duración por banda | 45 minutos, controlados manualmente por el reloj del jurado; el sistema asiste con recordatorios |
| Temporada actual | 16 bandas iniciales → jornadas de 4 bandas → clasificados por noche → fases siguientes (bracket) |
| Clasificación | Por noche (ranking relativo dentro de la jornada), no por acumulado de temporada |
| Número de clasificados por noche | Configurable (default demo: 1) |
| Reveal | Configurable: avance parcial después de cada banda (hoy: solo jurado o solo staff) y reveal final de la noche con bandas ordenadas de menor a mayor puntaje |
| Jueces | ~3 por noche. No hay regla actual si falta uno → política configurable (sección 12) |
| Operadores en vivo | 2 personas |
| Cambio de voto antes del cierre | Configurable; default demo: no permitido (práctica actual) |
| Premio | Pasar a la siguiente ronda |
| Reporte a la banda | Configurable por evento: activar/desactivar envío |
| Idioma | es-MX por defecto, inglés como segundo idioma (i18n desde el día 1) |
| Multi-venue / SaaS | Aspiracional. No invertir en infraestructura multi-tenant; sí mantener `organizationId` en el modelo |
| Infraestructura | DigitalOcean droplet Ubuntu + Dokploy + Traefik; Postgres en Dokploy; Cloudflare opcional (no obligatorio en MVP) |
| Alcohol / edad | Fuera de alcance. No mencionar en la solución |
| Contingencia de internet del venue | Fuera de alcance de esta versión |

---

## 1. CONTEXTO DEL NEGOCIO

Antisocial Rooftop es un venue de entretenimiento en Ciudad de México con música en vivo. Realiza el concurso recurrente "Guerra de Bandas".

Flujo actual:

- Tocan 4 bandas por noche, ~45 minutos cada una.
- Al terminar cada banda se muestra un QR; el público evalúa desde su teléfono.
- Evalúan tres grupos independientes: Público, Staff y Jueces.
- Hoy el Público pesa al menos 40% de la calificación final. Los pesos son configurables; nunca asumir pesos fijos.
- Después de cada banda se muestra un avance (solo jurado o solo staff). Al final de la noche se revelan los resultados finales de menor a mayor puntaje.
- Los resultados hoy se calculan a mano y se presentan con PowerPoint.

Encuesta pública actual (escala 1–10):

1. Calidad musical
2. Presencia escénica
3. Imagen general de la banda
4. Conexión con el público
5. Originalidad del espectáculo
6. Repertorio presentado
7. Evaluación global

"Evaluación global" debe poder configurarse como (A) criterio con peso explícito o (B) indicador estadístico sin efecto en el resultado. No existen pesos implícitos.

La nueva plataforma elimina cálculos y presentaciones manuales, y convierte cada noche en datos reutilizables (audiencia, sponsors, bandas, reservas).

---

## 2. VISIÓN Y MODELO COMERCIAL

Construir un "Event Competition Operating System" que cubra progresivamente:

CONVOCATORIA → REGISTRO → SELECCIÓN → PROGRAMACIÓN → PRESENTACIÓN → VOTACIÓN → EVALUACIÓN → CÁLCULO → AUDITORÍA → RESULTADO → REVEAL → CLASIFICACIÓN → ANALÍTICA → ENGAGEMENT → NUEVA RESERVA

### 2.1 El producto como activo comercial

El sistema debe generar valor medible en cuatro frentes. Cada uno tiene métricas propias (sección 27) separadas de los resultados oficiales.

1. Audiencia propia (first-party data)
   - Opt-in de marketing separado del voto (nunca condicionar el voto al opt-in).
   - Captura opcional post-voto: email y/o WhatsApp, con consentimiento granular (novedades del venue / seguir a la banda / sponsors).
   - Preferencias inferidas: bandas y géneros votados alto, asistencia recurrente (returning voter por token, sección 15).
   - Exportación a herramientas de marketing vía CSV y webhook genérico (sin acoplar a un proveedor).

2. Sponsors (inventario publicitario medible)
   - Placements: pantalla Stage (transiciones, break, "presentado por"), landing de voto (cabecera "presentado por"), thank-you (CTA), reporte a la banda (footer), email/recap.
   - Cada placement registra impresiones, clics y QR scans con `sponsorId`, `placement`, `eventId`, `performanceId`.
   - Reporte de sponsor por evento (PDF/CSV): impresiones, clics, CTR, alcance único estimado, capturas atribuidas.
   - Regla: la publicidad nunca aparece dentro de la tarjeta de evaluación ni altera el flujo de voto; solo en landing (cabecera discreta), thank-you y Stage.

3. Reservas y retorno (next-event conversion)
   - CTA post-voto "Reserva el próximo evento" con UTM y código de campaña por evento y por banda.
   - Atribución: `Attribution` registra origen (evento, banda, sponsor, placement) → clic → reserva confirmada (manual o vía adaptador futuro CoverManager).
   - Métrica norte: % de asistentes con opt-in válido por evento; secundaria: reservas atribuidas por evento.

4. Bandas como socios (band value)
   - Reporte post-evento a la banda (configurable ON/OFF por evento): su score por criterio vs. promedio de la noche, público vs. jueces, comentarios (si existen), número de votos, posición en la noche. Nunca muestra scores individuales de otras bandas ni identidades de jueces.
   - Perfil público de banda con links (Instagram, Spotify, YouTube) y botón "seguir" (opt-in).
   - Convocatoria en línea con pipeline de selección; la banda aporta su propia audiencia (invitación "vota por nosotros" con link de banda trackeable). Esa audiencia entra al sistema con opt-in y queda atribuida a la banda.
   - Política de transparencia hacia bandas configurable: `BAND_REPORT_LEVEL = NONE | SUMMARY | DETAILED`.

Ideas adicionales de valor comercial, preparadas en el modelo pero no obligatorias en MVP:
- "Recap de la noche" por email/WhatsApp a quienes dieron opt-in (ganador, fotos, próximo evento).
- Código promocional del sponsor en thank-you (solo mostrar/registrar clic; sin canje complejo).
- Badge "Fan verificado" para returning voters (sin sistema de recompensas complejo).
- Vista "Bandas destacadas de la temporada" pública para SEO y convocatoria.

### 2.2 Arquitectura de producto

- Modular Monolith. NO microservicios.
- Multi-evento y multi-temporada desde el día 1.
- `organizationId` presente en las entidades raíz para no cerrar la puerta al futuro, sin lógica multi-tenant real.

---

## 3. PRINCIPIOS DE PRODUCTO

Prioridades absolutas, en orden:

1. Fiabilidad
2. Integridad y equidad del voto
3. Exactitud matemática
4. Auditoría
5. Experiencia móvil excelente
6. Operación extremadamente sencilla bajo presión
7. Presentación espectacular en escenario
8. Seguridad
9. Performance durante bursts
10. Valor comercial medible (audiencia, sponsors, reservas)
11. Analítica

Nunca sacrificar exactitud, equidad o auditabilidad por efectos visuales ni por objetivos comerciales.

---

## 4. STACK TECNOLÓGICO (simplificado)

Principio: la menor cantidad de piezas que satisface la carga real (200 personas, bursts de ~1,000 votos/min en prueba). Cada componente adicional es un punto de falla en vivo.

Frontend y backend (una sola app):
- Next.js (App Router, versión estable actual), React, TypeScript estricto.
- Tailwind CSS + shadcn/ui.
- Route Handlers / Server Actions como API; contratos validados con Zod.
- next-intl (o equivalente) para i18n: `es-MX` default, `en`.

Persistencia:
- PostgreSQL 16+ (única fuente de verdad, único almacén de estado).
- Prisma ORM + migraciones SQL versionadas (constraints, triggers y funciones en SQL cuando Prisma no las exprese).

Realtime:
- PostgreSQL `LISTEN/NOTIFY` → Server-Sent Events (SSE) desde Next.js.
- Heartbeat SSE cada 15–20 s (Traefik y, si se agrega, Cloudflare cierran conexiones inactivas; Cloudflare a los 100 s).
- Headers: `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `Content-Type: text/event-stream`.
- Fallback automático a polling (3–5 s) en Stage y Control Room si SSE falla.
- WebSockets NO en esta fase.

Jobs:
- In-process (cálculo de resultados, exportaciones, recordatorios de timer, envío de reportes) detrás de una interfaz `JobRunner`.
- NO Redis, NO BullMQ, NO worker separado en esta fase. Dejar `JobRunner` y `RealtimeBus` como interfaces para introducirlos después si se mide necesidad.

Números:
- Nunca usar `number` de JS para scoring. Usar enteros escalados (basis points) o `decimal.js` en el Scoring Engine y `NUMERIC` en DB.

Storage:
- DigitalOcean Spaces (S3 compatible) para PDFs, logos, assets de bandas y videos de convocatoria (o link externo).

Infraestructura (base: MASTER_PROMPT_ANTISOCIAL_LIVE_DOKPLOY.md):
- DigitalOcean Droplet, Ubuntu LTS, Dokploy, Docker, Docker Compose, Traefik administrado por Dokploy (HTTPS incluido).
- Deployment GitHub → Dokploy (build desde el repo con Dockerfile). GitHub Actions valida (lint, typecheck, tests) antes del deploy; publicar imagen a GHCR es opcional.
- PostgreSQL 17 desplegado y administrado desde Dokploy en el MVP: volumen persistente, healthcheck, backups automáticos con retención (destino: Spaces), restauración documentada. Migración futura a DigitalOcean Managed PostgreSQL sin tocar el dominio de negocio.
- Staging y Production separados (dos proyectos en Dokploy).
- Un solo dominio (ej. `live.antisocialrooftop.mx`) con rutas `/vote`, `/j` (jueces), `/s` (staff), `/admin`, `/control`, `/stage`, `/apply`, `/legal`. Sin subdominios en el MVP.
- Cloudflare NO es dependencia obligatoria del MVP. La arquitectura permite agregarlo después (DNS, CDN, WAF, rate limiting, Turnstile, DDoS). Mientras no exista: rate limiting en la app, código de pantalla rotativo como control principal de presencia, y `TURNSTILE_ENABLED=false`.
- Zona horaria de negocio explícita: `America/Mexico_City`. Persistir en UTC.

Testing:
- Vitest (unit, integración con Postgres real vía testcontainers o docker-compose).
- fast-check (property-based) para el Scoring Engine.
- Playwright (E2E).
- k6 (carga).

Observabilidad:
- Logs JSON estructurados (pino) con `requestId`, `eventId`, `performanceId`, `actorId`.
- Error tracking (Sentry o compatible, autoalojable si se prefiere).
- Métricas en endpoint `/metrics` (Prometheus format) y health/readiness.
- OpenTelemetry solo si aporta valor medible.

No introducir dependencias innecesarias.

---

## 5. ARQUITECTURA DEL REPOSITORIO

Una sola aplicación Next.js (sin monorepo), alineada con la base Dokploy:

```
antisocial-live/
├── app/                      # rutas: (public)/vote, j, s, apply, legal · (ops)/admin, control, stage · api/
├── components/               # UI compartida (shadcn) + design tokens
├── modules/                  # límites de dominio; ningún módulo toca tablas de otro
│   ├── identity/             # admin auth, RBAC, tokens de evaluador
│   ├── events/               # temporadas, noches, rondas, bracket, timer
│   ├── bands/                # bandas, perfiles, reportes a banda
│   ├── applications/         # convocatoria
│   ├── scoring-config/       # criterios, pesos, políticas, snapshots
│   ├── scoring-engine/       # PURO: sin I/O, sin DB, sin React (regla ESLint de import boundaries)
│   ├── voting/               # voto público, sesiones, riesgo
│   ├── evaluation/           # portal jueces/staff
│   ├── results/              # cálculo, snapshots, reveal, ranking, clasificación
│   ├── stage/                # escenas, realtime
│   ├── audit/
│   ├── analytics/
│   ├── sponsors/
│   ├── audience/             # opt-ins, consentimientos, atribución
│   └── integrations/         # ReservationProvider, webhooks genéricos
├── lib/                      # db client, realtime bus, job runner, i18n, logger
├── messages/                 # es-MX.json, en.json
├── prisma/                   # schema.prisma, migrations/ (SQL), seed.ts
├── tests/                    # unit, integration, e2e, load
├── docs/
│   ├── PRODUCT.md · BUSINESS_RULES.md · ARCHITECTURE.md · SCORING_ENGINE.md
│   ├── OPERATIONS.md         # runbook + Control Room + failure states + freeze
│   ├── COMMERCIAL.md         # sponsors, audiencia, atribución, reportes
│   ├── DEPLOYMENT_DOKPLOY.md · BACKUP_RESTORE.md
│   ├── adr/                  # ADR-0001-...
│   └── legal/                # plantillas: aviso integral/simplificado, bases, publicidad
├── scripts/
├── Dockerfile · docker-compose.yml (Dokploy) · docker-compose.dev.yml · .dockerignore · .env.example
└── README.md
```

`modules/scoring-engine` se mantiene puro y podría extraerse a paquete propio en el futuro; hoy no se justifica un monorepo.

---

## 6. ROLES Y AUTENTICACIÓN

### 6.1 Roles (RBAC, verificado server-side)

SUPER_ADMIN, ORGANIZATION_ADMIN, EVENT_MANAGER, STAGE_OPERATOR, STAFF_COORDINATOR, STAFF, JUDGE, BAND_MANAGER, PUBLIC.

- Una persona puede tener roles distintos por evento (`RoleAssignment` con `eventId` opcional).
- Nunca confiar en ocultar botones del frontend.
- STAFF_COORDINATOR: rol nuevo. Recibe recordatorios del timer, coordina jurado y bandas, ve completitud de evaluaciones. No opera el Stage.

### 6.2 Autenticación de administradores

- Email + contraseña con Argon2id, sesiones HttpOnly, MFA-ready (TOTP en fase posterior), rate limiting, bloqueo progresivo.
- Passkeys opcional cuando se estabilice.

### 6.3 Autenticación e identidad de jueces y staff (respuesta al punto 19)

Problema: los jueces no deben teclear contraseñas en vivo, pero cada uno debe estar identificado de manera inequívoca porque su evaluación se registra a su nombre, se audita, y su peso individual puede diferir.

Modelo:

1. Existe una `Person` (nombre, email y/o teléfono, foto opcional) y una asignación `EvaluatorAssignment { personId, eventId, group: JUDGE|STAFF, individualWeight, status, conflicts[] }`.
2. Para cada asignación el admin genera un **access token de un solo uso por evento**: link personal (`/j/{token}`) y su QR. El token se guarda hasheado (SHA-256) en DB con expiración (default: fin del evento + 24 h), y se envía por WhatsApp/email fuera del sistema o se entrega en mano en QR impreso.
3. Al abrir el link, el sistema:
   - valida el token, muestra "Hola, {nombre}. ¿Eres tú?" con confirmación,
   - opcionalmente pide un PIN de 4 dígitos configurado por el admin (`REQUIRE_EVALUATOR_PIN`, default OFF),
   - crea una sesión HttpOnly ligada a `evaluatorAssignmentId` y al dispositivo (`deviceId` generado, no fingerprinting),
   - marca el token como usado. Un segundo dispositivo requiere que el admin reemita el token (evita compartir el link).
4. Toda evaluación se persiste con `evaluatorAssignmentId`. El portal muestra el nombre del juez en la cabecera para que el propio juez detecte un error de identidad.
5. Control Room muestra por juez: conectado / borrador / enviado / bloqueado, y permite **reemitir** o **revocar** el acceso con audit event.
6. Peso individual: el peso del grupo Jueces (por ejemplo 30%) se reparte entre los jueces presentes según `individualWeight` (default: iguales). Ver sección 12 para ausencias.

Este esquema también sirve para STAFF con `group = STAFF`.

---

## 7. MODELO DE DATOS

Entidades (todas con `id` no secuencial público — UUIDv7 o CUID2 —, `createdAt`, `updatedAt`; `createdBy/updatedBy` donde aplique):

Organización y evento: Organization, Venue, EventSeries (temporada), EventEdition (noche), Round, Bracket, Performance, Band, BandMember, BandApplication, ApplicationField (campos configurables), ApplicationReview.

Evaluación: ScorecardTemplate, Criterion, CriterionWeight, VotingGroup, GroupWeight, Person, EvaluatorAssignment, EvaluatorAccessToken, ConflictOfInterest, VoterSession, ScoreSubmission, ScoreItem, SubmissionRiskSignal.

Configuración y resultados: ScoringPolicy (versionada), ConfigurationSnapshot, ResultSnapshot, Ranking, Qualification, TieBreakDecision, ResultApproval.

Operación: StageScene, PerformanceTimer, TimerReminder, OperatorLock, Incident.

Comercial: Sponsor, SponsorPlacement, SponsorImpression, AudienceContact, Consent, Attribution, BandReport, Campaign.

Transversal: AuditEvent (append-only), Integration, RetentionPolicy, DataRequest (acceso/rectificación/cancelación/oposición).

Reglas:

- `EventEdition.mode = REHEARSAL | LIVE`. Los datos de ensayo NO se borran; se excluyen de resultados oficiales, analítica y reportes por filtro obligatorio en repositorios.
- `ResultSnapshot`, `ConfigurationSnapshot` y `AuditEvent` son inmutables a nivel DB (trigger que rechaza UPDATE/DELETE).
- Constraints únicos: un `ScoreSubmission` por (`performanceId`, `voterSessionId`) y por (`performanceId`, `evaluatorAssignmentId`); `submissionId` único (idempotencia); una banda por performance; una `EvaluatorAssignment` por (`personId`, `eventId`, `group`).
- `Performance.slotOrder` registra el orden de la noche (para analizar sesgo de horario).

---

## 8. MÁQUINAS DE ESTADO (separadas)

No mezclar estados de distintas entidades en un solo enum.

EventEdition: DRAFT → CONFIGURING → READY → LIVE → CLOSING → COMPLETED → ARCHIVED

Round: PENDING → ACTIVE → SCORED → PUBLISHED → CLOSED

Performance: SCHEDULED → ON_STAGE → VOTING_OPEN → GRACE_PERIOD → VOTING_CLOSED → CALCULATING → RESULT_READY → PARTIAL_REVEALED → FINALIZED

StageScene (solo presentación): WELCOME, NEXT_BAND, BAND_PLAYING, VOTE_NOW, VOTING_COUNTDOWN, VOTING_CLOSED, CALCULATING, PARTIAL_RESULT, BREAK, SPONSOR, FINAL_COUNTDOWN (reveal ascendente), LEADERBOARD, QUALIFIERS, WINNER, TECHNICAL_HOLD

PerformanceTimer: IDLE → RUNNING → PAUSED → OVERTIME → STOPPED

Esto permite que la banda B esté ON_STAGE mientras los jueces terminan la evaluación de la banda A (VOTING_CLOSED/CALCULATING), que es lo que ocurre en la realidad.

Transiciones controladas y validadas server-side. No abrir votación si: no hay performance ON_STAGE, pesos inválidos, sin criterios, evento no LIVE, snapshot de configuración inexistente.

---

## 9. CONFIGURACIÓN DE SCORING Y SCORING ENGINE

Paquete `packages/scoring`: puro, determinista, sin I/O. Entrada: snapshot de configuración + lista de submissions. Salida: resultado con desglose completo y `formula` legible.

Debe soportar (todo configurable, versionado en `ScoringPolicy`):

- Escala por criterio (default 1–10, entero).
- Criterios y pesos por criterio; scorecards distintos por grupo (Público puede tener rúbrica corta; Jueces/Staff la completa).
- Grupos y pesos por grupo (default: suma exacta 100%; política alternativa explícita).
- Agregación por grupo: media, mediana, media recortada (%), con política de outliers.
- Mínimo de evaluaciones por grupo; qué pasa si no se alcanza (`BLOCK | REDISTRIBUTE | ZERO_WEIGHT`).
- Redondeo y precisión configurables; siempre aplicar redondeo al final, nunca en pasos intermedios.
- Tie breakers ordenados (sección 13).

### 9.1 Equidad del voto público (todo configurable, default demo indicado)

Con 4 bandas y 100–200 asistentes, el riesgo principal no son los bots sino el "voto de porra" (amigos de una banda dando 10 a la suya y 1 al resto). Políticas:

| Política | Descripción | Default demo |
|---|---|---|
| `PUBLIC_AGGREGATION` | MEAN, MEDIAN, TRIMMED_MEAN(p) | TRIMMED_MEAN(10%) |
| `VOTER_NORMALIZATION` | NONE, Z_SCORE_PER_VOTER (solo votantes con ≥2 bandas evaluadas) | NONE (activable) |
| `MULTI_BAND_VOTER_BOOST` | Peso extra (1.0–2.0) a votantes que evaluaron ≥ N bandas de la noche | 1.0 (desactivado) |
| `PORRA_PATTERN_FLAG` | Marca FLAGGED_FOR_REVIEW el patrón "máximo a una banda y mínimo a las demás" cuando hay ≥3 bandas evaluadas | ON |
| `BAYESIAN_SHRINKAGE` | Promedio suavizado hacia la media de la noche con prior de M votos | OFF (activable; documentar M) |
| `MIN_PUBLIC_VOTES` | Mínimo de votos aceptados para que el grupo Público cuente | 10 |

Ningún flag borra votos. Solo cambian el cómputo o marcan para revisión; siempre queda registrado en el `ResultSnapshot`.

### 9.2 Jueces

- `JUDGE_NORMALIZATION`: NONE | Z_SCORE_PER_JUDGE (solo cuando el juez evaluó ≥2 bandas). Default NONE.
- Conflicto de interés: un juez puede declararse impedido para una banda; su peso se redistribuye entre los demás para esa banda; queda en audit.

### 9.3 Configuration Snapshot

Antes de abrir la votación de una performance se crea `ConfigurationSnapshot` (criterios, pesos, políticas, evaluadores asignados, versión del engine). La configuración queda bloqueada hasta que la noche termina. Cualquier cambio posterior exige nuevo snapshot y queda en audit.

### 9.4 Determinismo y verificabilidad

- Mismo input → mismo output, byte a byte. Pruebas property-based (fast-check).
- `ResultSnapshot.hash = SHA-256(JSON canónico RFC 8785 del resultado)`; cada snapshot incluye `previousHash` (cadena por evento). El hash final de la noche puede mostrarse en Stage y en el PDF.

---

## 10. VALIDACIONES MATEMÁTICAS

Detectar y bloquear con mensaje claro (nunca corregir silenciosamente):

- Pesos de grupo ≠ 100% (según política).
- Criterio sin peso; suma de pesos de criterios inválida.
- Grupo sin evaluadores asignados.
- Escala incompatible entre scorecard y submission.
- Score fuera de rango, no entero cuando la escala es entera.
- Configuración incompleta, división entre cero, ronda sin bandas, bandas duplicadas, juez duplicado, submissions duplicadas.
- Mínimos no alcanzados con política BLOCK.

Ejemplo de mensaje: "Los pesos actuales suman 80%. Deben sumar 100% antes de habilitar la votación."

---

## 11. MOTOR DE VOTACIÓN

Cada submission: `submissionId` (idempotency key generada en cliente, UUID), `eventId`, `roundId`, `performanceId`, `bandId`, `voterSessionId` o `evaluatorAssignmentId`, `groupId`, `submittedAtServer`, `status` (ACCEPTED | REJECTED | FLAGGED_FOR_REVIEW), `riskScore`, `riskSignals[]`, `clientLatencyMs` (informativo), `locale`.

Reglas:

- Idempotente: reintentos con el mismo `submissionId` → exactamente un registro, misma respuesta.
- Solo timestamps del servidor.
- Validez de cierre: el voto es válido únicamente si su transacción confirma mientras `Performance.status ∈ {VOTING_OPEN, GRACE_PERIOD}`; se bloquea la fila de la performance (`SELECT ... FOR SHARE`) al insertar y `FOR UPDATE` al cerrar. Determinista bajo carrera.
- `GRACE_PERIOD_SECONDS` configurable (default 5) para votos en tránsito; los votos en gracia se marcan `acceptedInGrace = true`.
- `ALLOW_VOTE_EDIT_UNTIL_CLOSE` configurable (default false). Si true, se guarda nueva versión y la anterior queda `SUPERSEDED`, nunca se borra.
- Doble clic OPEN/CLOSE y dos operadores simultáneos: transiciones con `expectedVersion` (optimistic locking) + idempotencia por acción.

---

## 12. JUECES Y STAFF: PORTAL, TIMER Y AUSENCIAS

### 12.1 Portal de evaluación (mobile/tablet first)

- Ve solo: evento, banda activa, criterios, instrucciones, su nombre, su progreso.
- Guarda borrador automáticamente (cada cambio); envía evaluación final → LOCKED.
- Modificación posterior: motivo + usuario admin + timestamp + audit event `SUBMISSION_UNLOCKED`.
- No ve puntuaciones de otros evaluadores hasta que la noche esté FINALIZED (o nunca, configurable).
- Comentario libre opcional por banda (alimenta el reporte a la banda si está activado).
- Staff puede usar el mismo scorecard o uno distinto (configurable).

### 12.2 Timer de presentación (asistencia al reloj del jurado)

La duración se controla manualmente; el sistema asiste, no manda.

- `PerformanceTimer` con `plannedDurationMinutes` (default 45), iniciado y detenido por STAGE_OPERATOR o STAFF_COORDINATOR con un botón grande ("Inició la banda").
- Recordatorios configurables `TimerReminder[]` (default: T-10, T-5, T-2, T-0, +2 overtime), entregados como:
  - notificación in-app persistente en portal de jueces, staff y Control Room (banner + sonido/vibración opcional),
  - web push opcional (PWA) para STAFF_COORDINATOR,
  - indicador discreto en Stage solo si `STAGE_SHOW_TIMER = true` (default false; el público no debe ver el reloj).
- Overtime se registra (`actualDurationSeconds`, `overtimeSeconds`) en la performance y en el reporte. No afecta el score salvo política explícita `OVERTIME_POLICY = NONE | TIE_BREAKER | PENALTY(points)` (default NONE).
- Pausa permitida (falla técnica) con motivo; queda en audit.

### 12.3 Ausencia de jueces (no existe regla actual → configurable)

`MISSING_EVALUATOR_POLICY` por grupo:

- `REDISTRIBUTE` (default demo): el peso del grupo se reparte entre los evaluadores que sí enviaron, respetando `individualWeight`. Registrar en snapshot quién faltó.
- `REQUIRE_MIN(n)`: si hay menos de n envíos, bloquear cálculo hasta decisión del EVENT_MANAGER (override con motivo).
- `ZERO_WEIGHT`: el grupo no cuenta y su peso se reparte proporcionalmente entre los demás grupos (nunca silenciosamente: alerta y audit).

Control Room alerta desde el minuto 0 si un juez no ha abierto su portal.

---

## 13. TIE BREAKERS Y CLASIFICACIÓN

- Empates: políticas ordenadas configurables (default demo): 1) score de Jueces, 2) score de Público, 3) criterio "Conexión con el público", 4) decisión de comité con motivo y aprobación registrada.
- Clasificación por noche: al finalizar la ronda se genera `Ranking` y `Qualification` (QUALIFIED | ELIMINATED | PENDING) con `QUALIFIERS_PER_ROUND` configurable (default demo 1).
- Bracket: `Bracket` modela la temporada (por ejemplo, 16 bandas → 4 noches de 4 → final). Los clasificados alimentan automáticamente la siguiente ronda; el admin puede reordenar el orden de aparición de la siguiente noche.
- Modo "wildcard" opcional: N mejores no clasificados por score absoluto (OFF por defecto; documentar el sesgo entre noches si se activa).

---

## 14. VOTACIÓN PÚBLICA (UX)

Flujo: QR → landing (aviso simplificado + "presentado por" opcional) → banda actual → evaluación → confirmación → submit → thank-you (post-vote experience).

- Sin app, sin cuenta. PWA.
- Meta: voto completo en 20–40 s.
- Control 1–10: dos filas de 5 botones ≥ 48×48 px, etiquetas de anclaje (1 = Necesita mucho trabajo, 5 = Regular/Aceptable, 8 = Muy bueno, 10 = Excelente), feedback háptico. Sin sliders como único control.
- Scorecard público configurable por evento:
  - `FULL` (7 criterios, práctica actual; default demo),
  - `QUICK` (Evaluación global obligatoria + hasta 3 criterios elegidos; los omitidos no cuentan y se registra `scorecardVariant` en cada submission).
  - Con 4 bandas por noche la fatiga es baja (28 taps); mantener FULL por defecto y medir tasa de abandono por criterio para decidir.
- Código en pantalla (`SCREEN_CODE_REQUIRED`, default ON): código de 4 dígitos visible en Stage que rota cada 60 s (ventana de validez 2 códigos). Prueba presencia física; bloquea votos remotos sin castigar IPs compartidas.
- Mostrar "N votos recibidos" durante la votación; nunca promedios (salvo configuración explícita).
- Accesibilidad: WCAG AA, alto contraste, no depender del color, ARIA.

---

## 15. SMART QR Y SESIÓN DE VOTANTE

- ONE EVENT QR: `/vote/{eventSlug}` resuelve server-side la performance activa. El QR no cambia en la noche.
- QR por performance opcional: `/vote/{eventSlug}/{performanceSlug}`.
- Link por banda trackeable para convocar a sus fans: `/vote/{eventSlug}?ref=band_{slug}` → atribución de audiencia a la banda (no afecta el voto).
- `VoterSession`: cookie firmada HttpOnly de larga duración (returning voter entre eventos, sin identidad) + token de evento de corta vida. Se puede votar exactamente una vez por performance por sesión.

---

## 16. SEGURIDAD DEL VOTO PÚBLICO

Capas (MVP):

- Sesión firmada, HttpOnly, SameSite.
- Cloudflare Turnstile en el primer acceso de la sesión (no en cada voto), detrás de `TURNSTILE_ENABLED` (default OFF hasta que Cloudflare esté en uso).
- Código de pantalla rotativo (sección 14).
- Rate limiting: por sesión y por endpoint; por IP solo como señal de riesgo, **nunca como bloqueo** (todo el venue comparte IP; operadores móviles en México usan CGNAT).
- Detección de anomalías: velocidad de submit < 5 s, patrón porra, ráfagas de sesiones nuevas desde el mismo `ipHash` + UA, votos fuera de ventana.
- `ipHash = HMAC-SHA256(ip, eventSalt)`; `eventSalt` se genera por evento y se destruye tras `RETENTION_DAYS_SECURITY_SIGNALS` (default 30), dejando el hash no reversible.
- Anti-replay por `submissionId` y nonce en el token de evento.
- Estados: ACCEPTED | REJECTED | FLAGGED_FOR_REVIEW. Nunca borrar votos automáticamente. Revisión manual desde Control Room con audit.
- Evolución preparada: token individual por reserva/check-in, SMS OTP (interfaz `VoterIdentityProvider`).

No afirmar que fingerprinting garantiza identidad. No usar fingerprinting.

---

## 17. REVEAL ENGINE Y RESULTADOS

Política configurable por evento:

- `PARTIAL_REVEAL_POLICY` después de cada banda: NONE | JUDGES_ONLY | STAFF_ONLY | JUDGES_AND_STAFF | ALL_GROUPS | FINAL_ONLY. Default demo: JUDGES_ONLY (práctica actual). Un reveal parcial nunca muestra la posición relativa entre bandas ni el score público mientras otras bandas no han tocado, salvo ALL_GROUPS explícito.
- `FINAL_REVEAL_ORDER`: ASCENDING (menor a mayor, default), DESCENDING, ALPHABETICAL.
- `FINAL_REVEAL_STYLE`: ONE_BY_ONE (countdown con pausa por banda controlada por el operador), ALL_AT_ONCE.
- Operador controla: PREPARE → PREVIEW (privado en Control Room) → REVEAL. Nunca publicar automáticamente.
- `REQUIRE_RESULT_APPROVAL` (two-person control): STAGE_OPERATOR calcula, EVENT_MANAGER aprueba, después REVEAL. Con 2 operadores esta opción es viable; default OFF, recomendado ON en la final.

`ResultSnapshot` inmutable: `resultId, eventId, roundId, performanceId, configurationSnapshotId, scoringEngineVersion, criteriaValues, groupScores, groupWeightsApplied, evaluatorsPresent/absent, acceptedVotes, rejectedVotes, flaggedVotes, policiesApplied, formula, finalScore, calculatedAt, hash, previousHash`, y al publicar `publishedBy, publishedAt, approvedBy`.

Debe permitir reconstruir exactamente el resultado con el Scoring Engine.

---

## 18. STAGE MODE

`/stage/{eventSlug}`, 16:9, sin controles, actualizado por SSE con fallback a polling, reconexión automática con último estado en memoria.

Escenas: ver sección 8. Elementos: nombre de banda, QR grande, código de pantalla rotativo, "N votos recibidos", countdown de votación, sponsor "presentado por", reveal parcial, reveal final ascendente con animación, leaderboard, clasificados, ganador, technical hold discreto.

- Animaciones sobrias e impactantes; nunca bloquean la actualización de datos.
- Theme tokens (negro, magenta, cyan, verde neón, amarillo, gradientes). Marca no hardcodeada.
- Si pierde conexión: indicador discreto para el operador, sin errores técnicos al público.
- Preview de escena en Control Room antes de enviarla al Stage.

---

## 19. CONTROL ROOM (pantalla operacional principal)

Diseñada para 2 personas bajo presión: STAGE_OPERATOR (flujo de la noche) y STAFF_COORDINATOR/EVENT_MANAGER (jurado, timer, aprobaciones).

Muestra con semáforos: Stage conectado, votación (estado, votos/min, aceptados/flagged), timer de banda (restante/overtime), jueces (por persona: conectado/borrador/enviado), staff, salud (DB, SSE, latencia de submit), errores recientes, banda actual y siguiente, estado de resultado, aprobaciones pendientes.

Botones principales, grandes y con confirmación en acciones irreversibles: START BAND (inicia timer) · OPEN VOTING · CLOSE VOTING · CALCULATE · PREVIEW · REVEAL · NEXT BAND · BREAK · SPONSOR · TECHNICAL HOLD.

- `OperatorLock` por evento: quien tiene el control del flujo; el otro operador ve todo y puede tomar el control con confirmación (audit).
- Refresh accidental no pierde nada: estado 100% en servidor.
- Revisión de votos FLAGGED con acciones ACCEPT/REJECT + motivo.
- Reemitir/revocar acceso de evaluadores.

Admin Dashboard (home) es un resumen de "EVENT TONIGHT" con acceso directo al Control Room.

---

## 20. AUDIT LOG

`AuditEvent` append-only, protegido por trigger (sin UPDATE/DELETE), con `previousHash` encadenado por evento.

Mínimo: LOGIN, LOGOUT, EVENT_CREATED/UPDATED, CONFIG_SNAPSHOT_CREATED, WEIGHT_CHANGED, CRITERION_CHANGED, POLICY_CHANGED, ROUND_OPENED/CLOSED, PERFORMANCE_STARTED, TIMER_STARTED/PAUSED/STOPPED, VOTING_OPENED/CLOSED, SUBMISSION_ACCEPTED/REJECTED/FLAGGED/REVIEWED, JUDGE_SUBMITTED, STAFF_SUBMITTED, SUBMISSION_UNLOCKED, EVALUATOR_TOKEN_ISSUED/REVOKED, CONFLICT_DECLARED, RESULT_CALCULATED, RESULT_APPROVED, RESULT_OVERRIDDEN, RESULT_PUBLISHED, TIE_BREAK_APPLIED, QUALIFIER_CHANGED, ROLE_ASSIGNED/REMOVED, OPERATOR_LOCK_TAKEN, SPONSOR_PLACEMENT_CHANGED, BAND_REPORT_SENT, DATA_REQUEST_PROCESSED, EXPORT_GENERATED.

No editable desde UI. Exportable.

---

## 21. CONVOCATORIA Y BANDAS (MVP)

- Formulario público de aplicación con campos configurables (`ApplicationField`): nombre, tributo/original, género, ciudad, descripción, contacto, email, teléfono, Instagram, TikTok, Spotify, YouTube, integrantes, instrumentos, video en vivo (link o upload a Spaces), rider técnico, stage plot, disponibilidad, notas.
- Aviso de privacidad simplificado en el formulario; aceptación de bases del concurso y cesión de derechos de imagen (checkbox con versión del documento aceptada, registrada en `Consent`).
- Estados: DRAFT → SUBMITTED → UNDER_REVIEW → SHORTLISTED → ACCEPTED | REJECTED → CONFIRMED.
- Pipeline de revisión con puntuación interna opcional y comentarios; notificaciones por email (plantillas es-MX/en).
- Banda aceptada → `Band` + `BandManager` con acceso por token (igual que jueces) para completar perfil y ver su reporte (si está activado).

---

## 22. SPONSORS (MVP)

- `Sponsor`: nombre, logo, URL, contacto, notas.
- `Campaign`: sponsor, evento(s), fechas activas, prioridad.
- `SponsorPlacement`: campaña × ubicación (STAGE_TRANSITION, STAGE_BREAK, STAGE_PRESENTED_BY, VOTE_LANDING_HEADER, THANK_YOU_CTA, BAND_REPORT_FOOTER, RECAP_EMAIL) × creatividad × CTA con URL trackeable (`/go/{code}`).
- Registro: impresiones (Stage por escena mostrada; web por render), clics, QR scans.
- Reporte por campaña y por evento (PDF/CSV).
- Restricciones: nunca dentro de la tarjeta de evaluación; nunca modificar orden ni tiempos del flujo de voto; placements opcionales por evento.
- Sin monetización compleja (sin facturación, sin subastas).

---

## 23. POST-VOTE EXPERIENCE Y AUDIENCIA

Thank-you configurable por evento, en este orden por defecto:

1. Confirmación del voto (con número de confirmación corto).
2. Perfil de la banda (links) + "Seguir a la banda" (opt-in).
3. "Recibe novedades de Antisocial" (opt-in por email/WhatsApp; consentimiento granular).
4. Próximos eventos + "Reserva" (UTM + `Attribution`).
5. Sponsor CTA (si hay placement activo).

Regla: el opt-in es independiente del voto. Sin opt-in el voto es igual de válido. `AudienceContact` solo existe si hubo consentimiento; se guarda versión del aviso aceptado, fecha, origen y evidencia.

---

## 24. PRIVACIDAD Y CUMPLIMIENTO LEGAL (México)

Marco: Ley Federal de Protección de Datos Personales en Posesión de los Particulares (nueva ley, DOF 20-mar-2025, vigente desde 21-mar-2025). Autoridad: Secretaría Anticorrupción y Buen Gobierno (el INAI desapareció). Esto es información de referencia; el owner valida con un abogado antes de producción.

Implementar:

- Voto público anónimo por defecto. No guardar nombre, email ni teléfono salvo opt-in explícito.
- IP nunca en claro; `ipHash` con sal por evento y destrucción de la sal (sección 16).
- Aviso de privacidad simplificado en landing de voto y en formularios (identidad y domicilio del responsable, datos tratados, finalidades distinguiendo las que requieren consentimiento, medios para limitar uso, link al aviso integral).
- Página pública `/legal/aviso-de-privacidad` con aviso integral (plantilla de ejemplo con placeholders, en es-MX y en).
- Página pública `/legal/bases-del-concurso` con bases versionadas (plantilla: criterios, pesos vigentes leídos de la configuración publicada, mecanismo de desempate, número de clasificados, derechos de imagen, contacto).
- Página `/legal/publicidad` opcional que explica la presencia de sponsors y que no influye en el voto.
- `Consent` con versión de documento, timestamp, origen, texto mostrado.
- `RetentionPolicy` configurable por tipo de dato (señales de seguridad 30 d, contactos hasta revocación, resultados y audit indefinidos).
- Workflow de derechos ARCO: `DataRequest` (acceso, rectificación, cancelación, oposición) con exportación/borrado de datos de contacto; los resultados agregados y el audit no se alteran (anonimizar referencia).
- Los placeholders legales se marcan claramente como "PLANTILLA — revisar con asesoría legal".

---

## 25. FAILURE STATES Y CONCURRENCIA

Diseñar y probar explícitamente:

internet lento · juez no responde · juez abandona · cero votos · voto duplicado · Stage desconectado · DB timeout · resultado no calculable · configuración inválida · refresh accidental · doble clic OPEN/CLOSE · dos operadores simultáneos · timer olvidado (alerta a los 50 min) · banda cancelada de último momento (reprogramar sin romper el bracket) · token de juez compartido/perdido (reemisión) · SSE caído (fallback polling) · reveal accidental (confirmación doble; si ocurre, audit + posibilidad de "retract" solo antes de FINALIZED con motivo).

Concurrencia: transacciones, constraints únicos, optimistic locking con `version`, idempotency keys, estado autoritativo en servidor, `SELECT FOR UPDATE` en transiciones de performance.

Sin Redis ni worker, los escenarios "Redis caído" y "worker caído" no existen. El único punto crítico es PostgreSQL: backups automáticos + backup manual pre-evento en el runbook.

---

## 26. OBSERVABILIDAD

Logs JSON con `requestId, eventId, roundId, performanceId, actorId, locale`. Métricas: latencia p50/p95/p99 de submit, submissions/min por estado, sesiones activas SSE, errores, rate limited, DB pool, timer activo. Health `/api/health` (proceso) y readiness `/api/ready` (DB). Debe ser posible reconstruir qué pasó en un evento desde logs + audit.

---

## 27. ANALÍTICA Y MÉTRICAS COMERCIALES

Separar en tres tableros (nunca mezclar con resultados oficiales):

Operación: performances, votos por estado, sesiones únicas, participación por banda, tasa de completitud, abandono por criterio, promedio y distribución por criterio, público vs. jueces vs. staff (divergencia), votos/minuto, ratio de flagged, tiempo promedio de voto, returning voters, duración real vs. planeada por banda, sesgo por `slotOrder`, comparativas evento a evento, ronda a ronda, banda a banda.

Comercial: % asistentes que votan (requiere `EXPECTED_ATTENDANCE` capturado por el operador), % opt-in (métrica norte), contactos nuevos por evento y por banda (atribución de fans), clics a reserva y reservas atribuidas, impresiones/clics/CTR por sponsor y placement, seguidores por banda, aplicaciones recibidas por convocatoria y tasa de aceptación.

Bandas (si `BAND_REPORT_LEVEL` lo permite): su desempeño por criterio vs. promedio de la noche, público vs. jueces, votos recibidos, audiencia aportada.

Exportes: CSV, Excel cuando sea viable, PDF (reporte de resultados oficial con hash, reporte de sponsor, reporte de banda).

---

## 28. DISEÑO Y DESIGN SYSTEM

Tokens de diseño (color, tipografía, espaciado, radios, sombras, animación) en `packages/ui`, con temas: `antisocial` (default) y `neutral`. Estética: nightlife, rock, neón, negro, magenta, cyan/electric blue, verde ácido, amarillo, festival. Legibilidad primero. Stage mucho más expresivo que Admin. Admin/Control Room: sobrio, alto contraste, grandes targets, keyboard navigation.

Responsive: Público mobile-first; Jueces/Staff mobile/tablet; Admin desktop/tablet; Control Room desktop (funcional en tablet); Stage 16:9.

i18n: todas las cadenas en archivos de mensajes; fechas y números con `Intl` y zona `America/Mexico_City`; contenido configurable (nombres de criterios, instrucciones, textos legales) con campos por idioma.

---

## 29. SEGURIDAD ADMIN Y PLATAFORMA

Autenticación segura, RBAC server-side, MFA-ready, CSRF, XSS, cookies seguras, CSP estricta (nonces), rate limiting, secretos fuera del repo (`.env.example` sin credenciales; Dokploy environment), OWASP ASVS nivel 2 como referencia, dependencias auditadas en CI, confirmación en acciones críticas, tokens de evaluador hasheados y con expiración, logs sin datos personales en claro.

---

## 30. DEVOPS Y DESPLIEGUE (DigitalOcean + Dokploy)

Topología MVP:

```
INTERNET → DNS → DigitalOcean Droplet (Ubuntu LTS) → Dokploy → Traefik (HTTPS)
                                                          ├── antisocial-live (Next.js)
                                                          └── postgres (17)
```

- `Dockerfile` multi-stage (Next.js standalone, usuario no root, healthcheck). `docker-compose.yml` compatible con Dokploy: servicio `app` (expose 3000, `depends_on` postgres healthy) + servicio `postgres:17` con volumen persistente y healthcheck `pg_isready`. `docker-compose.dev.yml` agrega mailpit.
- Dokploy es responsable de: deployment, contenedores, variables de entorno, dominios, Traefik, HTTPS, logs, restart. Dominio configurado desde Dokploy.
- Flujo: Developer → GitHub → Dokploy (build) → contenedor → health check → producción. GitHub Actions corre lint → typecheck → unit → integración (Postgres service) → E2E smoke antes de que Dokploy despliegue; `develop` → staging, `main`/tag → production.
- Staging: QA, demos, load testing, ensayos de evento. Production: operación real. Nunca desplegar a producción sin pasar por staging.
- Deployment freeze: durante un evento activo (desde una hora configurable antes, ej. 17:00) no se despliega ni se ejecutan migraciones. El Control Room muestra el estado de freeze; el runbook lo verifica.
- Migraciones: `prisma migrate deploy` en el entrypoint con lock; nunca `db push` ni migraciones destructivas en producción durante evento.
- Seed: `seed` (demo completo) y `seed:minimal` (producción: organización, venue, admin inicial, plantillas legales).
- Backups: automáticos desde Dokploy (diario, retención configurable, destino Spaces) + `scripts/backup-pre-event.sh` (manual antes de cada evento) + restauración probada en staging al menos una vez antes del primer evento real. Documentar en `docs/BACKUP_RESTORE.md`.
- Rollback: redeploy de la versión anterior desde Dokploy; documentar junto con procedimiento de emergencia.
- Cloudflare (opcional, posterior): si se activa, proxied, WAF, rate limit en `/api/vote/*`, Turnstile, y nunca cachear `/api/*`, `/stage/*`, `/vote/*`.

---

## 31. BASE DE DATOS

Prisma schema completo + migraciones SQL con: constraints únicos, checks de rango, triggers de inmutabilidad (`audit_event`, `result_snapshot`, `configuration_snapshot`), `NOTIFY` en cambios de `performance`, `stage_scene`, `submission_counter`, `performance_timer`. Índices para consultas de noche (por `performanceId`, `status`). `NUMERIC` para scores.

Seed demo: Organization "Antisocial Rooftop", Venue, EventSeries "Guerra de Bandas — Temporada demo", Bracket de 16 bandas ficticias en 4 noches, EventEdition demo LIVE con 4 bandas, criterios 1–10 (los 7 actuales), grupos Público/Staff/Jueces con pesos demo (40/20/40, marcados como demo), 3 jueces y 2 staff con tokens, 2 sponsors demo con placements, 1 convocatoria abierta, textos legales plantilla en es-MX/en. Ningún valor demo se presenta como regla de producción.

---

## 32. QA CRÍTICO (matemática e integridad)

Unit/property (Vitest + fast-check):

pesos suman 100 → ok; 80 → reject · score 11 → reject · score 0 en 1–10 → reject · decimales en escala entera → reject · misma submission ×3 → 1 registro · voto tras cierre → reject · voto en gracia → aceptado con flag · carrera cierre/voto → determinista · juez envía dos veces → según política · cálculo repetido → hash idéntico · cambio de config tras open → reject · media recortada con n<3 → política explícita · juez ausente REDISTRIBUTE → pesos correctos y suma 100 · normalización z-score con 1 banda evaluada → no aplica · patrón porra → FLAGGED sin borrar · reveal parcial JUDGES_ONLY → no expone público · ranking ascendente correcto con empates → tie breaker aplicado y registrado · timer overtime → registrado sin afectar score (NONE) · datos REHEARSAL → excluidos de resultados y analítica · audit UPDATE/DELETE → rechazado por DB · JSON canónico → mismo hash con llaves desordenadas.

Integración (Postgres real): transacciones de OPEN/CLOSE/SUBMIT/CALCULATE/PUBLISH bajo concurrencia (p-limit 50), idempotencia, triggers, NOTIFY→SSE.

---

## 33. E2E (Playwright)

Escenario completo: admin crea temporada y noche · agrega 4 bandas · configura criterios, pesos, políticas · genera tokens de 3 jueces y 2 staff · inicia evento · START BAND (timer) · recordatorio T-5 visible en portal de juez · OPEN VOTING · 200 votantes simulados (incluye 10 con patrón porra → flagged) · jueces y staff envían · un juez no envía → REDISTRIBUTE · CLOSE VOTING · CALCULATE · PREVIEW (Stage no muestra) · REVEAL parcial JUDGES_ONLY · NEXT BAND ×3 · reveal final ascendente · leaderboard · top 1 clasifica y aparece en la siguiente noche del bracket · export CSV/PDF con hash · opt-in post-voto crea `AudienceContact` · clic en sponsor registra impresión y clic · convocatoria: banda aplica → revisión → aceptada.

Stage E2E: Stage abierto mientras el Control Room cambia estados; verificar cada escena, reconexión SSE y fallback a polling.

Carga (k6): 1,000 votantes en 60 s (5x de 200), p95 submit < 500 ms, 0 votos confirmados perdidos, SSE estable con 5 pantallas.

---

## 34. DOCUMENTACIÓN (reducida y viva)

`README.md` + `docs/PRODUCT.md`, `BUSINESS_RULES.md` (toda regla configurable con su default demo y su justificación), `ARCHITECTURE.md`, `SCORING_ENGINE.md` (fórmulas, políticas, ejemplos numéricos verificables), `OPERATIONS.md` (runbook + failure states + freeze), `COMMERCIAL.md` (sponsors, audiencia, atribución, reportes), `DEPLOYMENT_DOKPLOY.md`, `BACKUP_RESTORE.md`, `docs/adr/` (una decisión por archivo), `docs/legal/` (plantillas). `CHANGELOG.md` generado por convención de commits.

Mantener sincronizados con el código: cada PR que cambia una regla actualiza `BUSINESS_RULES.md`.

---

## 35. RUNBOOK DEL EVENTO (resumen; detalle en OPERATIONS.md)

ANTES: backup manual · verificar DB/health · Stage conectado y escena WELCOME · QR y código de pantalla visibles · tokens de jueces/staff entregados y probados (cada uno abre su portal) · pesos y políticas validados · 4 bandas en orden · `EXPECTED_ATTENDANCE` capturado · ensayo en modo REHEARSAL (no se borra; se excluye) · cambiar a LIVE · snapshot de configuración.

DURANTE (por banda): START BAND → recordatorios → banda termina → OPEN VOTING → monitorear votos y jueces → CLOSE VOTING → CALCULATE → PREVIEW → (aprobar) → reveal parcial según política → NEXT BAND. Al final: reveal final ascendente → QUALIFIERS → WINNER.

DESPUÉS: COMPLETED · export CSV/PDF · reportes a bandas (si ON) · reporte de sponsors · revisar flagged e incidentes · backup · archivar.

---

## 36. INTEGRACIONES FUTURAS

- CoverManager: existe API y webhooks (apikey). Diseñar `ReservationProvider` y `AttendeeIdentityProvider`; no implementar hasta tener credenciales y autorización. Flujo futuro: reserva → check-in → token de asistente → engagement → nueva reserva.
- WhatsApp Business (notificaciones y recap), email marketing (webhook genérico), IA (resúmenes de comentarios, insights, explicación de anomalías; nunca altera resultados).

---

## 37. ALCANCE DEL MVP (decisión del owner)

Incluye:

Fase 1 completa: Auth/RBAC · eventos, temporadas, rondas · bandas · configuración de scoring y políticas · tokens de evaluadores · voto público (PWA, código de pantalla, Turnstile) · portal jueces/staff · timer y recordatorios · Scoring Engine · ciclo de votación · Stage Mode · reveal parcial y final configurables · ResultSnapshot con hash · audit log · export CSV · i18n es-MX/en · legal (plantillas y consentimientos) · seguridad · pruebas · Docker/Dokploy.

De Fase 2: Control Room completo (locks, revisión de flagged, reemisión de tokens, approval) · clasificación y brackets · PDF (resultados, banda, sponsor) · analítica (operación + comercial) · two-person control.

De Fase 3: sponsors (modelo, placements, tracking, reporte) · convocatoria (formulario configurable, pipeline, notificaciones) · audiencia y atribución (opt-ins, `Attribution`, reporte a banda configurable).

NO construir todavía: pagos, apps nativas, CRM avanzado, decisiones automáticas por IA, recompensas complejas, billing multi-tenant, CoverManager real, WhatsApp API, contingencia offline/papel.

---

## 38. CRITERIOS DE ACEPTACIÓN

El proyecto no está terminado hasta que, además de los criterios de la v1 (evento completo, pesos configurables, configuración inválida bloqueada, banda activable, voto por QR, staff y jueces evalúan, duplicados controlados, cálculo server-side con tests, resultados auditables, Stage sin PowerPoint, resultado oculto hasta REVEAL, leaderboard, clasificados automáticos, exportación, audit trail, E2E, carga, Docker):

- Cada juez y staff queda identificado por token personal y su envío se registra a su nombre.
- El timer de 45 min emite recordatorios visibles en portal de jueces/staff y Control Room.
- Reveal parcial y final funcionan según la política configurada, con orden ascendente por defecto.
- Una noche de 4 bandas alimenta correctamente la siguiente ronda del bracket.
- Un juez ausente se maneja según la política sin bloquear la noche (o bloquea, si así se configuró).
- El patrón porra se marca sin borrar votos y el resultado indica las políticas aplicadas.
- El hash del resultado es reproducible desde el snapshot.
- Los sponsors registran impresiones y clics y generan reporte.
- La convocatoria recibe y procesa aplicaciones con consentimiento registrado.
- El opt-in post-voto crea contactos con consentimiento versionado y sin afectar el voto.
- El reporte a la banda se envía solo si está activado para el evento.
- La UI funciona completa en es-MX y en.
- Los datos de REHEARSAL nunca aparecen en resultados ni analítica.
- La app se despliega en Dokploy desde GHCR con migraciones automáticas y backup documentado.

---

## 39. FORMA DE TRABAJO

1. Inspeccionar el repositorio. Si hay código, no reemplazarlo indiscriminadamente: documentar estado actual, gaps y plan de migración.
2. Generar primero: `PRODUCT.md`, `BUSINESS_RULES.md`, `ARCHITECTURE.md`, `SCORING_ENGINE.md`, `COMMERCIAL.md`, `DEPLOYMENT_DOKPLOY.md`, ADRs iniciales (stack simplificado sin Redis; SSE sobre LISTEN/NOTIFY; tokens de evaluador; máquinas de estado separadas; JSON canónico + hash encadenado; single-tenant con `organizationId`).
3. Construir por vertical slices, en este orden: Foundation (monorepo, DB, i18n, tokens de diseño, CI, Docker) → Identity (admin + tokens de evaluador) → Events/Bracket/Bands → Scoring config + snapshot → Scoring Engine (con pruebas antes que UI) → Voting público → Evaluación jueces/staff + timer → Results + reveal + Stage → Control Room → Audit + legal + audiencia → Sponsors → Convocatoria → Analítica + PDF → QA completo + carga → Despliegue.
4. Después de cada slice: lint, typecheck, tests. No acumular errores.
5. Cada regla de negocio nueva se agrega a `BUSINESS_RULES.md` en el mismo PR.

---

## 40. REGLA FUNDAMENTAL

Nunca inventar silenciosamente una regla de negocio. Si una regla no está en la sección 0 ni en este documento: hacerla configurable, documentar el supuesto en `BUSINESS_RULES.md` y usar un default razonable marcado como demo.

Aplica especialmente a: pesos de grupo y criterio, scorecard por grupo, número de clasificados, tie breakers, avance en bracket, edición de voto, duración de votación y periodo de gracia, mínimo de jueces y política de ausencia, mínimo de votos públicos, redondeo, outliers, normalización, patrón porra, política de reveal parcial y final, overtime, nivel de reporte a bandas, placements de sponsors, retención de datos.

---

## 41. OBJETIVO FINAL

Demostrar que Antisocial pasa de QR + SurveyMars + cálculos manuales + PowerPoint + datos aislados a ANTISOCIAL LIVE: una plataforma propia que administra, opera, vota, calcula, audita, presenta, analiza, monetiza (sponsors) y convierte (audiencia y reservas) la información de sus eventos.

Debe sentirse como un producto comercial real, no como un CRUD ni un proyecto académico.

Comienza analizando este MASTER PROMPT v2. Genera primero la documentación indicada en la sección 39, paso 2. Después construye el MVP completo definido en la sección 37. No te detengas en documentación.
