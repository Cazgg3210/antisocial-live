#!/bin/sh
# Applies pending migrations (never `db push`) and then starts the server.
# Refuses to migrate while DEPLOYMENT_FREEZE=true so a redeploy during a live event cannot alter the schema.
set -e

if [ "$DEPLOYMENT_FREEZE" = "true" ]; then
  echo "[entrypoint] DEPLOYMENT_FREEZE=true — skipping migrations"
else
  echo "[entrypoint] applying migrations"
  node node_modules/prisma/build/index.js migrate deploy
fi

exec "$@"
