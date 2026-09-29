#!/bin/sh
# Applies pending migrations (never `db push`) and then starts the server.
# Refuses to migrate while DEPLOYMENT_FREEZE=true so a redeploy during a live event cannot alter the schema.
set -e

if [ "$DEPLOYMENT_FREEZE" = "true" ]; then
  echo "[entrypoint] DEPLOYMENT_FREEZE=true — skipping migrations"
else
  echo "[entrypoint] applying migrations"
  (cd /app/migrate && node node_modules/prisma/build/index.js migrate deploy)
fi

# First deploy: creates organization, venue, admin user (SEED_ADMIN_EMAIL/PASSWORD) and retention policies.
# Idempotent (upserts), so leaving it on is harmless; it never resets an existing admin password.
if [ "$SEED_MINIMAL_ON_BOOT" = "true" ]; then
  echo "[entrypoint] running minimal seed"
  (cd /app/migrate && node node_modules/tsx/dist/cli.mjs prisma/seed.ts --minimal)
fi

exec "$@"
