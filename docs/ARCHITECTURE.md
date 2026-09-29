# ARCHITECTURE

## Principios

1. Menos piezas = menos fallas en vivo. Una app Next.js + PostgreSQL. Sin Redis, colas ni workers (interfaces `JobRunner` y `RealtimeBus` listas para introducirlos si se mide la necesidad).
2. El servidor es la única fuente de verdad: estados, timestamps, cierre de votación, cálculo.
3. Todo lo que afecta un resultado es inmutable y verificable: snapshots de configuración y resultado con hash canónico (RFC 8785) y cadena `previousHash`; audit append-only protegido por triggers.
4. Modular monolith: `src/modules/*` con límites de dominio; el Scoring Engine es puro (regla ESLint que prohíbe importar DB/React/Node).

## Topología (Dokploy)

```
Internet → DNS → Droplet Ubuntu → Dokploy → Traefik (HTTPS)
                                              ├── antisocial-live (Next.js, :3000)
                                              └── postgres:17 (volumen, backups)
```

Cloudflare es opcional; si se activa: WAF, rate limit perimetral en `/api/vote/*`, Turnstile, sin caché en `/api`, `/stage`, `/vote`.

## Estructura

```
src/app/            rutas: vote, stage, (evaluator) j|s|evaluate, control, admin, apply, legal, b/report, api/*
src/modules/
  scoring-engine/   PURO: validate → calculatePerformance → rankResults/qualify
  scoring-config/   EngineConfig desde DB, ConfigurationSnapshot, defaults
  events/           máquinas de estado, timer, escenas, operator lock, jobs (tick, grace)
  voting/           contexto público, submit idempotente, riesgo, revisión
  evaluation/       portal jurado/staff: draft, final, unlock, conflicto
  results/          calculate → snapshot → approve → partial → finalize → ranking/qualification, verify
  stage/ control/   proyecciones (pública y privilegiada) para SSE
  identity/         login admin, tokens de evaluador y banda
  audience/         opt-in, consentimientos, atribución
  band-reports/ exports/ analytics/ legal/ admin(actions)/
src/lib/            env, db (Prisma + pg pool), auth (JWT cookies), audit (hash chain), realtime (LISTEN/NOTIFY → SSE), screen-code, rate-limit, jobs, mail
prisma/             schema + migraciones SQL (triggers de inmutabilidad, NOTIFY, checks)
tests/              unit (vitest + fast-check), integration (Postgres real), e2e (Playwright), load (k6)
```

## Realtime

`Performance`, `StageScene`, `PerformanceTimer`, `ScoreSubmission`, `Notification`, `ResultSnapshot`, `EventEdition` → trigger `notify_realtime` → `pg_notify('antisocial_realtime')` → `RealtimeBus` (un LISTEN por instancia) → `sseResponse()` reenvía el snapshot (coalescido a 250 ms). Heartbeat 15 s; `refreshMs` para datos derivados del tiempo (código rotativo, timers). El cliente (`useLiveState`) cae a polling tras 3 fallos.

## Concurrencia

- Transiciones y submits: `SELECT … FOR UPDATE` sobre `Performance`/`EventEdition` + `version` incremental + constraints únicos.
- Idempotencia: `submissionKey` único; acciones repetidas (OPEN/CLOSE) devuelven el estado actual.
- `OperatorLock` por evento con heartbeat; tomar control es explícito y auditado.
- Jobs idempotentes (`grace.settle`, `timers.tick`) seguros con varias instancias.

## Seguridad

- Admin: Argon2id, JWT HS256 en cookie HttpOnly/SameSite=Lax, 12 h, RBAC server-side con jerarquía (SUPER_ADMIN > ORGANIZATION_ADMIN > EVENT_MANAGER > STAGE_OPERATOR > STAFF_COORDINATOR) y alcance por evento.
- Evaluadores: token único hasheado, sesión ligada a dispositivo, revocable.
- Votante: cookie firmada HMAC, sin identidad.
- Headers de seguridad en `next.config.ts`; sin secretos en el repo; `.env.example`.

## Observabilidad

Logs JSON (pino) con `requestId`; `/api/health`, `/api/ready` (DB), `/api/metrics` (Prometheus text). El audit + logs permiten reconstruir cualquier incidente de una noche.

## ADRs

Ver `docs/adr/`.
