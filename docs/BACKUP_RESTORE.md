# BACKUP & RESTORE

## Qué se respalda

Solo PostgreSQL (toda la verdad vive ahí). Los assets (logos, imágenes de bandas) son URLs externas o Spaces (con su propio versionado).

## Automático (Dokploy)

Postgres → Backups → S3 compatible (Spaces): bucket `antisocial-backups`, cron `0 4 * * *`, retención 30. Verificar mensualmente que el archivo existe y pesa lo esperado.

## Manual pre-evento

```bash
# desde el droplet
scripts/backup-pre-event.sh            # usa $POSTGRES_CONTAINER y $BACKUP_DIR (default /var/backups/antisocial)
```

Produce `antisocial-YYYYmmdd-HHMM.dump` (formato custom, comprimido). Copiarlo a Spaces: `s3cmd put …` o desde Dokploy.

## Restore

```bash
docker exec -i <postgres> pg_restore -U antisocial -d antisocial --clean --if-exists < antisocial-YYYYmmdd-HHMM.dump
```

Después: `docker restart <app>` y verificar `/api/ready`. Los triggers de inmutabilidad se restauran con el dump (son parte del esquema).

## Prueba de restauración (obligatoria antes del primer evento LIVE)

1. Restaurar el dump de producción en **staging**.
2. Abrir `/admin/audit?event=…` y confirmar "Cadena de hashes íntegra".
3. Verificar un resultado (botón "verificar") → `hashMatches: true`.

## Retención de datos personales

Independiente del backup: `RetentionPolicy` (30 días para señales de seguridad). Los dumps antiguos contienen contactos: aplicar la misma retención (30 días) a los backups o cifrarlos en reposo.
