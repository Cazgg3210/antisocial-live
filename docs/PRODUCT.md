# PRODUCT — Antisocial Live

**Módulo 1: Guerra de Bandas.** Un "Event Competition Operating System" para Antisocial Rooftop (CDMX): administra, opera, vota, calcula, audita, presenta, analiza y monetiza cada noche de competencia.

## Problema que reemplaza

| Antes | Ahora |
|---|---|
| QR a SurveyMars, un formulario por banda | Un solo QR por evento que siempre muestra la banda activa |
| Cálculo manual en hoja de cálculo | Scoring Engine determinista, snapshot inmutable con hash |
| PowerPoint para revelar | Stage Mode en tiempo real, reveal controlado por el operador |
| Datos aislados por noche | Temporada, bracket, analítica, audiencia y sponsors en una sola base |

## Usuarios y superficies

| Usuario | Superficie | Dispositivo |
|---|---|---|
| Público | `/vote/{evento}` (PWA, sin cuenta) | Teléfono |
| Jurado | `/j/{token}` → `/evaluate` | Teléfono / tablet |
| Staff | `/s/{token}` → `/evaluate` | Teléfono / tablet |
| Stage Operator + Event Manager (2 personas) | `/control/{eventId}` | Laptop |
| Pantalla del venue | `/stage/{evento}` | 16:9 |
| Administración | `/admin/*` | Desktop |
| Bandas | `/apply/{convocatoria}`, `/b/report/{token}` | Teléfono |
| Público (legal) | `/legal/aviso-de-privacidad`, `/legal/bases-del-concurso`, `/legal/publicidad` | Cualquiera |

## Flujo de una noche (4 bandas, ~45 min cada una)

1. **Antes**: el admin crea la edición (modo REHEARSAL), lineup de 4 bandas, asigna 3 jueces y 2 staff, emite sus links personales, verifica que la configuración no tenga errores (pesos = 100%), hace un ensayo, cambia a modo LIVE y marca READY.
2. **GO LIVE** desde el Control Room. Se congela la configuración en un `ConfigurationSnapshot`.
3. Por cada banda: **START BAND** (timer 45:00, recordatorios a jurado/staff a T-10, T-5, T-2, T-0 y overtime) → la banda termina → **OPEN VOTING** (Stage muestra QR + código rotativo; público vota en 20–40 s; jurado y staff evalúan desde su portal) → **CLOSE VOTING** (periodo de gracia 5 s) → **CALCULATE** (snapshot inmutable) → **PREVIEW** privado → **REVEAL PARCIAL** según política (default: solo jurado) → **NEXT BAND**.
4. Al terminar las 4: **FINAL REVEAL** → ranking con desempates → reveal de menor a mayor, uno por uno → LEADERBOARD → QUALIFIERS → WINNER. El clasificado entra automáticamente a la ronda siguiente del bracket.
5. **Después**: exportar CSV/PDF, enviar reportes a bandas (si está activado), revisar votos marcados, cerrar y archivar.

## Valor comercial (ver COMMERCIAL.md)

- Audiencia propia: opt-in post-voto independiente del voto, con consentimiento versionado.
- Sponsors: placements medibles (Stage, landing, thank-you, reporte a banda) con impresiones, clics y CTR.
- Reservas: CTA con UTM y atribución por evento y banda.
- Bandas como socios: reporte post-evento, link trackeable para traer a sus fans, convocatoria en línea.

## Fuera de alcance del MVP

Pagos, apps nativas, CRM avanzado, decisiones automáticas por IA, recompensas complejas, billing multi-tenant, integración real con CoverManager, WhatsApp API, contingencia offline.

## Criterios de aceptación

Ver `MasterPrompt_v2.md` §38. Todos están cubiertos por tests: `tests/unit` (motor), `tests/integration` (transacciones, triggers), `tests/e2e` (noche completa con Stage abierto), `tests/load` (k6, 5x asistencia).
