# ADR-0004 — Máquinas de estado separadas por entidad

**Estado:** aceptado

## Contexto
El v1 mezclaba `LIVE`, `VOTING_OPEN` y `RESULT_REVIEW` en un solo enum de evento. En la realidad la banda B sube al escenario mientras el jurado termina con la banda A.

## Decisión
Enums independientes: `EventStatus`, `RoundStatus`, `PerformanceStatus` (incluye `GRACE_PERIOD`), `StageSceneType` (solo presentación), `TimerStatus`. Transiciones validadas server-side con la fila bloqueada (`FOR UPDATE`) y `version` incremental. "Banda activa" = la performance en vuelo iniciada más recientemente.

## Consecuencias
+ Solapamiento real entre bandas; el Stage puede mostrar cualquier escena sin tocar el estado de negocio.
− Más estados que documentar (ver BUSINESS_RULES.md §5).
