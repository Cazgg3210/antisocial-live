# Documentos legales

Las plantillas viven en código para que las bases del concurso lean la configuración real del evento (pesos, criterios, desempates, clasificados) y nunca se desincronicen:

- `src/modules/legal/documents.ts` — aviso de privacidad integral y simplificado, bases del concurso, publicidad (es/en), con `version` que referencian los consentimientos (`Consent.documentVersion`).
- Se sirven en `/legal/aviso-de-privacidad`, `/legal/aviso-simplificado`, `/legal/bases-del-concurso`, `/legal/publicidad`.

**Son plantillas.** Antes del primer evento en modo LIVE deben revisarse con asesoría legal (LFPDPPP vigente desde el 21 de marzo de 2025; autoridad: Secretaría Anticorrupción y Buen Gobierno). Al cambiar un texto, sube `PRIVACY_VERSION` / `RULES_VERSION` para que los nuevos consentimientos apunten a la versión correcta; los anteriores conservan la suya.

Datos del responsable (razón social, domicilio, correo de privacidad) se toman de `Organization` (`/admin` → seed).
