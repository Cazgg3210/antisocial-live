# COMMERCIAL

Antisocial Live es un activo comercial, no solo una herramienta de votación. Cuatro frentes, cada uno con datos propios y métricas separadas de los resultados oficiales.

## 1. Audiencia propia

- **Opt-in post-voto** (`/vote/{slug}` → thank-you): correo y/o WhatsApp, consentimiento granular (novedades / seguir banda). Independiente del voto: el voto nunca referencia al contacto.
- **Fan attribution**: cada banda tiene un link `/vote/{slug}?ref=band_{bandSlug}`; la sesión queda atribuida a la banda (`VoterEventState.refBandId`) y el contacto captado cuenta como "fan aportado por la banda".
- **Returning voters**: la cookie anónima de larga duración permite medir recurrencia entre eventos sin identificar personas.
- **Exportación**: `/api/export/audience.csv` (solo contactos con consentimiento activo; auditado). Webhook genérico: pendiente (interfaz `Integration`).
- **Métrica norte**: `% de votantes únicos con opt-in` por evento (Analítica → Comercial).

## 2. Sponsors

Modelo: `Sponsor` → `Campaign` (fechas, prioridad) → `SponsorPlacement` (tipo × evento × creatividad × CTA con código `/api/go/{code}`).

| Placement | Dónde | Métrica |
|---|---|---|
| STAGE_PRESENTED_BY | Esquina inferior del Stage en todas las escenas | Impresión por escena mostrada |
| STAGE_TRANSITION / STAGE_BREAK | Escenas SPONSOR / BREAK | Impresión por escena |
| VOTE_LANDING_HEADER | Cabecera discreta "Presentado por" | Impresión por render, clic |
| THANK_YOU_CTA | Tarjeta CTA tras votar | Impresión, clic |
| BAND_REPORT_FOOTER | Pie del reporte a la banda | Clic |
| RECAP_EMAIL | Recap post-evento (pendiente) | — |

Reportes: `/admin/sponsors` (impresiones, clics, QR, CTR por placement), `/api/export/{eventId}/sponsors.csv`, `/api/export/sponsor/{id}/report.csv`. Regla dura: nunca dentro de la tarjeta de evaluación; nunca altera el flujo.

## 3. Reservas y retorno

- CTA "Reserva el próximo evento" → `/api/vote/{slug}/reserve` → redirige a `reservationUrl` con UTM (`utm_source=antisocial-live&utm_medium=post-vote&utm_campaign={slug}`) y registra `Attribution(RESERVATION_CLICK)` con banda de referencia.
- `RESERVATION_CONFIRMED` queda preparado para el adaptador CoverManager (`ReservationProvider`), no implementado.

## 4. Bandas como socios

- **Convocatoria** `/apply/{call}`: formulario con consentimientos versionados (bases, derechos de imagen, privacidad). Pipeline en `/admin/applications` (SUBMITTED → UNDER_REVIEW → SHORTLISTED → ACCEPTED → CONFIRMED). Aceptar crea la `Band`.
- **Reporte post-evento** (`bandReportEnabled`, `bandReportLevel`): score final y por grupo vs. promedio de la noche, posición, público vs. jurado; DETAILED agrega criterios, comentarios anónimos y seguidores captados. Enviado por correo con link `/b/report/{token}`. Nunca muestra scores individuales de otras bandas.
- **Seguidores**: `Consent(FOLLOW_BAND)` por banda → `/admin/audience`.

## KPIs por evento (Analítica → Comercial)

opt-ins y tasa, contactos nuevos, clics a reserva, seguidores por banda, impresiones/clics/CTR por sponsor, aplicaciones recibidas y tasa de aceptación (convocatoria), comparativa por temporada.

## Ideas preparadas, no construidas

Recap por correo/WhatsApp, código promo del sponsor en thank-you (solo mostrar/registrar), badge "fan verificado", página pública "bandas de la temporada".
