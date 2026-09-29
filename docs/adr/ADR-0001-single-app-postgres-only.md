# ADR-0001 — Una sola app Next.js y PostgreSQL como único almacén

**Estado:** aceptado (2026-09-29)

## Contexto
El MasterPrompt v1 proponía Redis/Valkey, BullMQ, un worker y 10 paquetes. La carga real es de 100–200 asistentes por noche (bursts de ~1,000 votos/min en pruebas). La prioridad #1 es fiabilidad en vivo, operada por una persona.

## Decisión
Una aplicación Next.js (App Router) y PostgreSQL 17. Realtime con `LISTEN/NOTIFY` → SSE. Jobs en proceso (`setInterval`, idempotentes). Rate limiting en memoria (y Cloudflare si se activa). `JobRunner` y `RealtimeBus` son interfaces internas para introducir Redis/colas si se mide la necesidad.

## Consecuencias
+ Un solo punto de falla (Postgres) con backups; menos operación; despliegue simple en Dokploy.
+ Varias réplicas funcionan (cada una escucha NOTIFY).
− El rate limit en memoria no es compartido entre réplicas (aceptable; Cloudflare lo cubre en perímetro).
− Jobs pesados (PDF masivo) corren en el mismo proceso; hoy son triviales.
