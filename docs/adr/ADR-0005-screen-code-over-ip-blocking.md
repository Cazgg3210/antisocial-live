# ADR-0005 — Código rotativo en pantalla en lugar de bloqueo por IP

**Estado:** aceptado

## Contexto
Todo el público del rooftop comparte la IP del Wi-Fi y los operadores móviles en México usan CGNAT. Un límite por IP bloquearía votantes legítimos; los bots no son el riesgo principal (lo es el "voto de porra").

## Decisión
- Código de 4 dígitos `HMAC(eventId, ventana de 60 s)` mostrado en el Stage, exigido en el submit (válido la ventana actual y la anterior). Prueba presencia física sin identificar a nadie.
- La IP solo aporta una señal débil (`IP_CLUSTER` a partir de 150 sesiones) y nunca bloquea; se guarda hasheada con sal por evento.
- Patrón porra (máximo a una banda, mínimo al resto, ≥3 bandas) → `FLAGGED_FOR_REVIEW` con revisión manual auditada; nunca se borra un voto.
- Turnstile opcional (`TURNSTILE_ENABLED`), solo en el primer acceso de la sesión.

## Consecuencias
+ Sin falsos positivos por IP compartida; barrera efectiva contra votos remotos.
− Quien está en el venue puede dictar el código a alguien remoto (riesgo aceptado y medible por `IP_CLUSTER`/tiempos).
