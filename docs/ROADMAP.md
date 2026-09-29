# ROADMAP

## Entregado (MVP, v0.1)

- Fase 1 completa: auth/RBAC, eventos/temporadas/rondas/bracket, bandas, configuración de scoring y políticas, tokens de evaluador, voto público PWA (código de pantalla, Turnstile opcional), portal jurado/staff, timer con recordatorios, Scoring Engine puro, ciclo de votación con gracia, Stage Mode con reveal parcial y final configurables, snapshots inmutables con hash encadenado, audit append-only, exportación CSV, i18n es-MX/en, plantillas legales y consentimientos, seguridad, pruebas (unit, integración, E2E, k6), Docker/Dokploy.
- Fase 2: Control Room completo (lock de operador, revisión de flagged, reemisión de tokens, aprobación de dos personas), clasificación y brackets, PDF oficial, analítica operativa y comercial.
- Fase 3: sponsors (modelo, placements, tracking, reportes), convocatoria (formulario, pipeline, alta de banda), audiencia y atribución (opt-ins, seguidores, reservas con UTM), reporte a bandas.

## Siguiente (antes del primer evento LIVE)

1. Confirmar pesos reales y política de juez ausente; revisar plantillas legales con abogado.
2. Ensayo general con jurado real en staging; prueba de restauración de backup.
3. Assets de marca (logo, tipografía) y fotos de bandas en Spaces.
4. Definir `reservationUrl` real y sponsors de la temporada.

## Después

- Recap por correo/WhatsApp a opt-ins (plantillas ES/EN, `RECAP_EMAIL` placement).
- Adaptador CoverManager (`ReservationProvider`): reserva → check-in → token de asistente → `RESERVATION_CONFIRMED`.
- WhatsApp Business para links de jurado y recordatorios.
- Web push para el coordinador de staff (recordatorios del timer).
- Passkeys/MFA para administradores.
- Cloudflare: WAF + rate limit perimetral + Turnstile en producción.
- Storage de uploads (video/rider de convocatoria) en Spaces con URLs firmadas.
- Insights con IA (resúmenes de comentarios, explicación de anomalías) — nunca alteran resultados.
- Multi-venue / white-label / SaaS (aspiracional): `organizationId` ya está en las entidades raíz.
