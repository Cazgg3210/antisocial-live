#!/usr/bin/env bash
# Manual PostgreSQL backup to run before every event (see docs/BACKUP_RESTORE.md).
# Usage: POSTGRES_CONTAINER=<name> BACKUP_DIR=/var/backups/antisocial scripts/backup-pre-event.sh
set -euo pipefail
CONTAINER="${POSTGRES_CONTAINER:-antisocial-postgres}"
DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$DIR"
FILE="$DIR/antisocial-$(date +%Y%m%d-%H%M).dump"
docker exec "$CONTAINER" pg_dump -U antisocial -d antisocial -Fc > "$FILE"
echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"
