# Changelog

## 0.1.0 — 2026-09-29

MVP completo de ANTISOCIAL LIVE / Guerra de Bandas (ver `docs/ROADMAP.md` para el alcance por fase).

- Scoring Engine puro con políticas configurables (agregación, normalización, boost multi-banda, patrón porra, bayes, ausencia de jueces, overtime), ranking con desempates y clasificación.
- Ciclo de votación con periodo de gracia, idempotencia, código de pantalla rotativo y señales de riesgo (nunca se borran votos).
- Portales de jurado/staff con token personal, borrador, bloqueo, conflicto de interés y timer con recordatorios.
- Control Room (lock de operador, revisión, aprobación de dos personas), Stage Mode realtime (SSE + polling) con reveal parcial y final configurables.
- Snapshots inmutables con hash canónico encadenado, audit append-only protegido por triggers, verificación desde el admin.
- Admin: eventos, lineup y bracket, scoring, políticas, evaluadores, bandas, personas/usuarios, sponsors, convocatoria, audiencia (ARCO), analítica, auditoría, exportaciones CSV/PDF.
- Comercial: opt-in post-voto con consentimientos versionados, atribución (fans por banda, reservas con UTM), placements de sponsors medibles, reporte a bandas.
- Legal: aviso integral/simplificado, bases dinámicas, publicidad (plantillas es/en).
- Infra: Dockerfile standalone, compose para Dokploy, entrypoint con migraciones y freeze, CI (lint, typecheck, unit, integración, E2E, docker), k6.
