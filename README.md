# Antisocial Live

Event Competition & Fan Engagement Platform para **Guerra de Bandas** (Antisocial Rooftop, CDMX). Vota, califica, calcula, audita, presenta en escenario, analiza y monetiza cada noche.

- Stack: Next.js 16 · React 19 · TypeScript · Tailwind 4 · Prisma 7 · PostgreSQL 17 · SSE (LISTEN/NOTIFY) · Docker · Dokploy.
- Sin Redis, sin workers: una app + una base de datos (ver `docs/adr/ADR-0001`).

## Desarrollo

```bash
cp .env.example .env            # ajusta secretos si quieres
pnpm install
pnpm docker:dev                 # Postgres 17 en :5480 + Mailpit en :8025 (en PowerShell 5.1 separa los comandos con ; no con &&)
pnpm db:migrate                 # aplica migraciones (con triggers de inmutabilidad y NOTIFY)
pnpm seed                       # organización, 16 bandas, 4 noches + final, jurado/staff con links, sponsors, convocatoria
pnpm dev                        # http://localhost:3000
```

El seed imprime: usuarios admin (`admin@antisocial.local` / `Antisocial!Demo2026`), links de jurado/staff de la Noche 1, y las URLs de voto, stage y control room.

Demo de una noche completa sin tocar la UI (200 votantes simulados, jueces, resultados, reveal):

```bash
node scripts/run-demo-night.mjs <eventId> 50
```

## Rutas

| Ruta | Quién |
|---|---|
| `/vote/{slug}` | Público (PWA) |
| `/stage/{slug}` | Pantalla 16:9 |
| `/j/{token}` · `/s/{token}` → `/evaluate` | Jurado · Staff |
| `/control/{eventId}` | Operador + manager |
| `/admin` | Administración |
| `/apply/{call}` · `/b/report/{token}` | Bandas |
| `/legal/*` | Aviso de privacidad, bases, publicidad |

## Calidad

```bash
pnpm lint && pnpm typecheck
pnpm test:unit            # Scoring Engine (property-based)
pnpm test:integration     # Postgres real: transacciones, triggers, políticas
pnpm test:e2e             # Playwright: noche completa con Stage abierto + seguridad del voto
k6 run -e SLUG=<slug> -e VOTERS=1000 tests/load/vote-burst.js   # con votación abierta
```

## Documentación

`docs/PRODUCT.md` · `BUSINESS_RULES.md` · `ARCHITECTURE.md` · `SCORING_ENGINE.md` · `COMMERCIAL.md` · `OPERATIONS.md` (runbook) · `DEPLOYMENT_DOKPLOY.md` · `BACKUP_RESTORE.md` · `docs/adr/` · `docs/legal/` (las plantillas legales viven en `src/modules/legal/documents.ts` y se sirven en `/legal/*`).

## Producción

Ver `docs/DEPLOYMENT_DOKPLOY.md`. Resumen: Dokploy Compose con `docker-compose.yml`, variables de `.env.example`, dominio en el servicio `app`, backups de Postgres a Spaces, `DEPLOYMENT_FREEZE=true` el día del evento.
