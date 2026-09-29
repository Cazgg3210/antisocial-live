# OPERATIONS — Runbook de evento

## Roles en vivo (2 personas)

- **Stage Operator** (`STAGE_OPERATOR`): toma el control en `/control/{eventId}`, maneja START/OPEN/CLOSE/CALCULATE/REVEAL/NEXT y las escenas del Stage.
- **Event Manager / Staff Coordinator** (`EVENT_MANAGER`): vigila jurado/staff, reemite links, revisa votos marcados, aprueba resultados (si `requireResultApproval`), decide desempates manuales, cierra el evento.

Solo quien tiene el `OperatorLock` puede ejecutar acciones de flujo; el otro puede "Tomar control" (auditado).

## ANTES (día del evento, T-3 h)

1. `DEPLOYMENT_FREEZE=true` en Dokploy (o no desplegar). Verificar `/api/ready` y el semáforo del Control Room.
2. Backup manual: `scripts/backup-pre-event.sh` (o backup en Dokploy).
3. En `/admin/events/{id}`: lineup de 4 bandas en orden; jurado (3) y staff (2) asignados; **Emitir link** a cada uno y enviarlo por WhatsApp; pesos y políticas revisados; sin errores de configuración (banner rojo).
4. Capturar `Asistencia esperada`.
5. Ensayo en modo REHEARSAL: abrir Stage en la pantalla, votar desde un teléfono con el código de pantalla, que cada juez abra su link (queda "USED" y ligado al dispositivo).
6. Cambiar `Modo = LIVE`, marcar READY. **No borrar** los datos de ensayo: quedan marcados.
7. Stage: `/stage/{slug}` a pantalla completa (F11), escena WELCOME. Control Room abierto en la laptop del operador; segunda laptop/tablet para el manager.

## DURANTE (por banda)

| Paso | Acción | Verificar |
|---|---|---|
| Banda sube | **START BAND** | Stage BAND_PLAYING; timer 45:00 corriendo; jueces ven la banda |
| Recordatorios | automáticos T-10/5/2/0/+2 | Avisos en portal de jueces/staff y Control Room |
| Banda termina | **OPEN VOTING** | Stage VOTE_NOW con QR y código; contador de votos sube; timer detenido |
| ~3–4 min | vigilar votos/min, jurado (3/3), staff (2/2) | Reemitir link si un juez no conecta |
| Cierre | **CLOSE VOTING** | 5 s de gracia → VOTING_CLOSED |
| Resultado | **CALCULATE** → preview privado | Sin errores (mínimos, jueces); hash visible |
| (opcional) | **APROBAR** (manager) | Solo si `requireResultApproval` |
| Avance | **REVEAL PARCIAL** | Stage PARTIAL_RESULT (solo jurado por default) |
| Siguiente | **NEXT BAND** (= START BAND de la siguiente) | |

Escenas auxiliares: BREAK, SPONSOR, TECHNICAL HOLD, NEXT_BAND.

## FINAL DE LA NOCHE

1. **FINAL REVEAL** (finaliza la ronda): ranking, clasificación, snapshots publicados. Si hay empate no resuelto, el manager decide (motivo obligatorio).
2. **REVEAL NEXT** una vez por banda (de menor a mayor) → LEADERBOARD → QUALIFIERS → WINNER.
3. CLOSE EVENT → COMPLETE EVENT.

## DESPUÉS

Exportar CSV/PDF (`/admin/events/{id}?tab=exports`), generar/enviar reportes a bandas (`POST /api/band-reports/{performanceId}` con `{send:true}`), revisar votos FLAGGED e incidentes, backup, `DEPLOYMENT_FREEZE=false`, archivar.

## Failure states

| Situación | Qué hace el sistema | Qué haces tú |
|---|---|---|
| Juez no responde | Control Room lo muestra PENDING/desconectado; alerta | Reemitir link; si no llega, la política REDISTRIBUTE calcula con los presentes |
| Juez abandona | Igual | Revocar acceso |
| Cero votos / mínimo no alcanzado | CALCULATE falla con mensaje claro (BLOCK) o excluye al público (REDISTRIBUTE) | REOPEN (con motivo) o aceptar la política |
| Voto duplicado | Rechazado (409) o editado si `allowVoteEdit` | — |
| Doble clic OPEN/CLOSE | Idempotente | — |
| Dos operadores | OperatorLock; el segundo ve todo en solo lectura | Tomar control si el primero se fue (stale > 60 s) |
| Refresh accidental | Todo el estado vive en el servidor | Nada |
| Stage desconectado | Reconecta solo; cae a polling; punto ámbar discreto | Recargar la pantalla si pasa de 30 s |
| SSE caído | Polling automático cada 3–4 s | — |
| DB caída | `/api/ready` 503; semáforo rojo; todo falla explícitamente | Reiniciar Postgres en Dokploy; los votos confirmados nunca se pierden (transacciones) |
| Resultado no calculable | Error con código (p. ej. MIN_EVALUATORS_NOT_MET) | Corregir la causa o cambiar la política ANTES de abrir la siguiente votación no aplica (config bloqueada) → usar REOPEN / decisión del manager |
| Reveal accidental | Auditado | TECHNICAL HOLD y continuar; el resultado no cambia |
| Banda cancelada | CANCEL_PERFORMANCE (motivo) | El ranking la excluye |
| Timer olvidado | Overtime en rojo + aviso | STOP o dejar que OPEN VOTING lo detenga |

## Deployment freeze

Con `DEPLOYMENT_FREEZE=true` el entrypoint no ejecuta migraciones y el Control Room muestra FREEZE. Regla: sin despliegues desde las 17:00 del día del evento hasta cerrar.

## Rollback / restore

Ver `DEPLOYMENT_DOKPLOY.md` y `BACKUP_RESTORE.md`.
