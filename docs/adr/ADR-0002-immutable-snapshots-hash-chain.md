# ADR-0002 — Snapshots inmutables con hash canónico encadenado

**Estado:** aceptado

## Contexto
Los resultados deben ser auditables y reconstruibles exactamente; el audit no debe poder editarse.

## Decisión
- `ConfigurationSnapshot` (config del engine) y `ResultSnapshot` (resultado completo) son inmutables: triggers PostgreSQL rechazan UPDATE/DELETE (en `ResultSnapshot` solo cambian columnas de ciclo de vida: approved/published/partialRevealed).
- Hash = SHA-256 sobre JSON canónico RFC 8785 (`canonicalize`), para que el orden de llaves no altere el hash.
- Cadena: cada `ResultSnapshot` y cada `AuditEvent` guarda `previousHash` del anterior en el mismo evento. `/admin/audit` verifica la cadena completa y permite recalcular un resultado desde su snapshot.
- Ninguna corrección edita un snapshot: se recalcula (nuevo snapshot enlazado) y queda auditado.

## Consecuencias
+ Cualquier alteración se detecta; el PDF oficial incluye los hashes.
− El audit crece sin límite (aceptable; ~250 filas por noche).
