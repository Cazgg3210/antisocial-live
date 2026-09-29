# SCORING ENGINE

`src/modules/scoring-engine` — puro, determinista, versión `1.0.0`. Entrada: `EngineConfig` (del `ConfigurationSnapshot`) + todas las submissions de la ronda. Salida: `PerformanceResult` con desglose completo y `formula` legible.

## Pipeline por presentación

1. **Validar configuración** (`collectConfigIssues`): pesos de grupo = 100%, cada scorecard con criterios que cuentan y pesos = 100%, grupos JUDGE/STAFF con evaluadores, escalas válidas.
2. **Filtrar** submissions de la performance con `status = ACCEPTED` (FLAGGED y REJECTED se cuentan pero no computan). Duplicado por actor → error.
3. **Score por submission**: `Σ(valor × pesoCriterio) / Σ(pesoCriterio)` sobre los criterios que cuentan y, en QUICK, solo los respondidos. Valores fuera de rango o no enteros → error. Resultado en la escala original (1–10).
4. **Grupo PUBLIC**: normalización por votante (z-score, ≥2 bandas) → boost multi-banda (peso) → mínimo (BLOCK / REDISTRIBUTE / ZERO_WEIGHT) → agregación (MEAN ponderada / MEDIAN / TRIMMED_MEAN con `floor(n·p)` por lado, sin recorte si n<3) → suavizado bayesiano opcional `(score·n + prior·M)/(n+M)` con prior = media de la ronda.
5. **Grupos JUDGE/STAFF**: excusados por conflicto no cuentan como ausentes; peso individual `individualWeightBp`; normalización por juez opcional; política de ausencia (REDISTRIBUTE reparte entre presentes; REQUIRE_MIN bloquea; ZERO_WEIGHT anula el grupo).
6. **Combinación**: solo grupos con score y peso aplicado > 0; los pesos configurados se re-escalan proporcionalmente para sumar exactamente 100% (`GROUP_WEIGHT_REDISTRIBUTION`). Sin grupos → error.
7. **Overtime** PENALTY: `final − final·bp/10000`, acotado al mínimo de escala.
8. **Redondeo** una sola vez: `decimalPrecision` con HALF_UP o HALF_EVEN. `rawScore` conserva 20 dígitos.

## Ejemplo verificable

Pesos 40/20/40. Público {8, 9, 7} → 8; Staff {8, 6} → 7; Jurado {9, 8, 7} → 8.
`8·0.40 + 7·0.20 + 8·0.40 = 7.80`. Fórmula registrada: `PUBLIC(8) × 40.00% + STAFF(7) × 20.00% + JUDGE(8) × 40.00%`.

Juez ausente con REDISTRIBUTE: Jurado {9, 8} → 8.5; política `MISSING_EVALUATOR(JUDGE:REDISTRIBUTE)`; `evaluatorsAbsent` lista el id.

## Ranking y desempates

`rankResults`: orden por `finalScore` desc; empates por la cadena `tieBreakers` (JUDGE_SCORE, PUBLIC_SCORE, STAFF_SCORE, CRITERION:key (media ponderada por conteo entre grupos), OVERTIME, MANUAL). Se registra `tieBreakTrail`. Si se llega a MANUAL o se agota la cadena → `unresolvedTie` con orden determinista (nombre). `qualify(top N)` marca PENDING cuando un empate no resuelto cruza la línea de corte.

## Determinismo y verificación

- Sin reloj, sin aleatoriedad; submissions ordenadas por id. Property tests (fast-check) garantizan que el orden de entrada no cambia el resultado y que los pesos aplicados suman 100%.
- `ResultSnapshot.hash = SHA-256(JSON canónico {result, configurationSnapshotId, engineVersion, calculatedAt, previousHash})`. `verifyResult()` recalcula desde el snapshot y compara.
- Cambiar el engine exige subir `ENGINE_VERSION`; los snapshots antiguos conservan la versión con la que se calcularon.

## Errores (`ScoringError.code`)

WEIGHTS_NOT_100, CRITERION_WITHOUT_WEIGHT, CRITERIA_WEIGHTS_NOT_100, NO_CRITERIA, GROUP_WITHOUT_EVALUATORS, GROUP_WITHOUT_SCORECARD, SCORE_OUT_OF_RANGE, SCORE_NOT_INTEGER, UNKNOWN_CRITERION, MIN_SUBMISSIONS_NOT_MET, MIN_EVALUATORS_NOT_MET, NO_CONTRIBUTING_GROUPS, DUPLICATE_SUBMISSION, INVALID_CONFIG. La API los devuelve con HTTP 422 y mensaje claro para el admin.

Tests: `tests/unit/scoring-engine/*.test.ts` (38 casos).
