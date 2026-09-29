# ADR-0003 — Identidad de jueces y staff por token personal de un solo uso

**Estado:** aceptado

## Contexto
Los jueces no deben teclear contraseñas en vivo, pero cada evaluación debe quedar a nombre de una persona identificada, con peso individual y auditoría.

## Decisión
`Person` + `EvaluatorAssignment` (por evento y grupo) + `AccessToken` (192 bits aleatorios, SHA-256 en DB, expiración). Flujo: link/QR personal → "¿Eres tú, {nombre}?" → PIN opcional → sesión JWT HttpOnly ligada a `assignmentId` y a un `deviceId` generado. El token pasa a USED; otro dispositivo requiere reemisión (limpia el binding). Revocación inmediata desde Control Room. Toda evaluación guarda `assignmentId`; el portal muestra el nombre para que el propio juez detecte un error de identidad.

## Alternativas descartadas
Contraseñas (fricción en vivo), enlace compartido por grupo (sin identidad ni peso individual), SMS OTP (dependencia externa; queda como evolución).
