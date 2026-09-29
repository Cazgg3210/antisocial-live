# DEPLOYMENT — DigitalOcean + Dokploy

## Requisitos

- Droplet Ubuntu LTS (2 vCPU / 4 GB es suficiente para 1,000 votantes concurrentes) con Dokploy instalado.
- Dominio apuntando al droplet (A/AAAA). Cloudflare opcional (proxy naranja) — si se usa, desactivar caché en `/api/*`, `/stage/*`, `/vote/*`.
- Repositorio en GitHub con acceso desde Dokploy.

## Proyectos en Dokploy

Crear dos proyectos: **antisocial-staging** y **antisocial-production**. En cada uno:

### Opción A — Compose (recomendada para MVP)

1. Servicio **Compose** → fuente Git (rama `develop` en staging, `main` en producción) → archivo `docker-compose.yml`.
2. Variables de entorno (Dokploy → Environment): todas las de `.env.example` sin `DATABASE_URL` (la compone el compose con `POSTGRES_PASSWORD`). Generar secretos con `openssl rand -base64 48`.
3. Dominio: asignarlo al servicio `app`, puerto 3000, HTTPS (Let's Encrypt vía Traefik).
4. Deploy. El entrypoint ejecuta `prisma migrate deploy` y arranca `node server.js`.
5. Primer arranque: `docker exec -it <app> node node_modules/prisma/build/index.js db seed -- --minimal` **o** desde el host `pnpm seed:minimal` apuntando al Postgres (crea organización, venue, admin con `SEED_ADMIN_EMAIL/PASSWORD`, políticas de retención). Cambiar la contraseña del admin al entrar.

### Opción B — Application + Postgres separado

1. Servicio **Postgres** en Dokploy (imagen `postgres:17`, volumen, backups programados).
2. Servicio **Application** → Dockerfile → variable `DATABASE_URL=postgresql://user:pass@<postgres-service>:5432/antisocial`.

## Backups (`BACKUP_RESTORE.md`)

- Dokploy → Postgres → Backups: destino S3 (DigitalOcean Spaces), diario 04:00, retención 30 días.
- Antes de cada evento: backup manual (botón en Dokploy o `scripts/backup-pre-event.sh`).
- Probar una restauración en staging antes del primer evento real.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`): lint → typecheck → unit → integración (Postgres service) → build → E2E (Playwright contra el build) → build de imagen Docker. Dokploy despliega con **Auto Deploy** (webhook de GitHub) al hacer push a la rama del proyecto; conviene requerir CI verde en la rama protegida.

## Freeze de despliegue

Variable `DEPLOYMENT_FREEZE=true` en producción el día del evento: el contenedor no migra al reiniciar y el Control Room lo indica. Desactivar Auto Deploy en Dokploy ese día.

## Rollback

Dokploy → Deployments → elegir el despliegue anterior → **Redeploy**. Las migraciones son aditivas; nunca se ejecutan migraciones destructivas en producción durante un evento.

## Health

- `GET /api/health` (proceso), `GET /api/ready` (DB), `GET /api/metrics` (Prometheus). Traefik healthcheck usa `/api/health`.

## Escalado

Si una noche supera ~1,000 votantes concurrentes: subir el droplet (vertical). Varias réplicas de `app` funcionan sin cambios (LISTEN/NOTIFY por instancia, rate limit en memoria por instancia → mover a Cloudflare).
