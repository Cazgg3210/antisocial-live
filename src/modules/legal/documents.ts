/**
 * Legal document templates (es/en). Placeholders are filled from the Organization record and,
 * for the contest rules, from the live event configuration. All texts are TEMPLATES to be reviewed
 * by legal counsel; the version string is what consent records reference.
 */
export interface LegalVars {
  orgName: string;
  orgAddress: string;
  contactEmail: string;
  version: string;
  date: string;
  rules: null | { groups: string; criteria: string; tieBreakers: string; qualifiers: string; eventName: string };
}

export interface LegalDoc {
  titleEs: string;
  titleEn: string;
  version: string;
  render: (locale: "es" | "en", v: LegalVars) => string[];
}

export const PRIVACY_VERSION = "v1";
export const RULES_VERSION = "v1";

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  "aviso-de-privacidad": {
    titleEs: "Aviso de privacidad integral",
    titleEn: "Privacy notice (full)",
    version: PRIVACY_VERSION,
    render: (l, v) =>
      l === "es"
        ? [
            `${v.orgName}, con domicilio en ${v.orgAddress} (en adelante "el Responsable"), es responsable del tratamiento de sus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares vigente y su Reglamento.`,
            "## Datos personales que tratamos",
            "- Votación pública: ninguno que lo identifique. Se genera un identificador anónimo de sesión, un resumen no identificable del navegador y un hash irreversible de la dirección IP con una sal que se destruye después del evento. No se solicitan nombre, correo ni teléfono para votar.",
            "- Opt-in voluntario (posterior al voto): correo electrónico y/o número de WhatsApp, nombre (opcional), idioma, banda que desea seguir.",
            "- Jurado y staff: nombre, correo o teléfono para entregarle su acceso personal, y sus evaluaciones.",
            "- Bandas (convocatoria): nombre de la banda, datos de contacto, redes sociales, video, integrantes y material técnico.",
            "No tratamos datos personales sensibles.",
            "## Finalidades",
            "- Finalidades primarias (no requieren su consentimiento): operar la votación y el concurso, calcular y auditar resultados, prevenir fraude en la votación, entregar accesos a jurado y staff, gestionar la convocatoria de bandas.",
            "- Finalidades secundarias (requieren su consentimiento expreso, que puede negar sin afectar su voto): enviarle información sobre eventos, bandas y promociones del Responsable y de sus patrocinadores; informarle sobre la banda que decidió seguir.",
            "## Transferencias",
            "No transferimos sus datos personales a terceros, salvo las remisiones a proveedores de infraestructura (alojamiento y envío de mensajes) que actúan por cuenta del Responsable y bajo confidencialidad, y las que exija la ley.",
            "## Medios para limitar el uso o divulgación",
            `Puede darse de baja de cualquier comunicación con el enlace incluido en cada mensaje o escribiendo a ${v.contactEmail}.`,
            "## Derechos ARCO",
            `Puede ejercer sus derechos de acceso, rectificación, cancelación y oposición, así como revocar su consentimiento, enviando una solicitud a ${v.contactEmail} indicando su nombre, un medio para responderle, los datos sobre los que ejerce el derecho y, en su caso, documentos que acrediten su identidad. Responderemos en los plazos que establece la ley.`,
            "## Conservación",
            "Las señales de seguridad de la votación (hash de IP, resumen del navegador) se conservan como máximo 30 días. Los datos de contacto se conservan hasta que revoque su consentimiento. Los resultados agregados y el registro de auditoría del concurso se conservan de forma indefinida sin datos que lo identifiquen.",
            "## Cambios al aviso",
            `Cualquier cambio se publicará en esta misma página. Versión ${v.version}, ${v.date}.`,
          ]
        : [
            `${v.orgName}, located at ${v.orgAddress} (the "Controller"), is responsible for processing your personal data in accordance with the Mexican Federal Law on the Protection of Personal Data Held by Private Parties.`,
            "## Data we process",
            "- Public voting: nothing that identifies you. An anonymous session id, a non-identifying browser summary and an irreversible hash of your IP address with a salt destroyed after the event. No name, email or phone is required to vote.",
            "- Voluntary opt-in (after voting): email and/or WhatsApp number, name (optional), language, band you want to follow.",
            "- Judges and staff: name and email or phone to deliver a personal access link, and their evaluations.",
            "- Bands (open call): band name, contact details, social links, video, members and technical material.",
            "We do not process sensitive personal data.",
            "## Purposes",
            "- Primary (no consent required): operating the vote and the contest, calculating and auditing results, preventing voting fraud, delivering judge/staff access, managing the open call.",
            "- Secondary (require your express consent, which you may decline without affecting your vote): sending information about events, bands and promotions from the Controller and its sponsors; updates about the band you chose to follow.",
            "## Transfers",
            "We do not transfer your data to third parties except to infrastructure providers acting on our behalf under confidentiality, and where required by law.",
            "## Limiting use or disclosure",
            `Unsubscribe with the link in every message or by writing to ${v.contactEmail}.`,
            "## ARCO rights",
            `You may exercise access, rectification, cancellation and opposition rights, and revoke consent, by writing to ${v.contactEmail}.`,
            "## Retention",
            "Voting security signals are kept at most 30 days. Contact data is kept until you revoke consent. Aggregated results and the contest audit log are kept indefinitely without identifying data.",
            "## Changes",
            `Changes will be published on this page. Version ${v.version}, ${v.date}.`,
          ],
  },
  "aviso-simplificado": {
    titleEs: "Aviso de privacidad simplificado",
    titleEn: "Privacy notice (short)",
    version: PRIVACY_VERSION,
    render: (l, v) =>
      l === "es"
        ? [
            `${v.orgName} (${v.orgAddress}) tratará los datos que usted proporcione voluntariamente después de votar (correo, WhatsApp, nombre) con la finalidad secundaria de enviarle información de eventos, bandas y promociones, previo consentimiento. Su voto es anónimo y no requiere datos personales. Puede limitar el uso de sus datos o ejercer sus derechos ARCO en ${v.contactEmail}. Consulte el aviso integral en /legal/aviso-de-privacidad.`,
          ]
        : [
            `${v.orgName} (${v.orgAddress}) will process the data you voluntarily provide after voting (email, WhatsApp, name) for the secondary purpose of sending event, band and promotional information, with your consent. Your vote is anonymous and requires no personal data. Limit use or exercise your rights at ${v.contactEmail}. Full notice at /legal/aviso-de-privacidad.`,
          ],
  },
  "bases-del-concurso": {
    titleEs: "Bases del concurso — Guerra de Bandas",
    titleEn: "Contest rules — Battle of the Bands",
    version: RULES_VERSION,
    render: (l, v) => {
      const r = v.rules;
      return l === "es"
        ? [
            `Organizador: ${v.orgName}. Estas bases aplican a la temporada vigente de Guerra de Bandas${r ? ` (próxima jornada: ${r.eventName})` : ""}.`,
            "## Mecánica",
            "- Cada jornada participan las bandas programadas; cada una cuenta con un tiempo de presentación definido por el organizador (referencia: 45 minutos), controlado por el jurado.",
            "- Al terminar cada presentación se abre la votación del público mediante código QR y código en pantalla. El voto es anónimo, uno por persona y por banda, y se cierra cuando lo indica el organizador.",
            "- Jurado y staff evalúan de forma independiente con los mismos criterios o una rúbrica específica.",
            "## Evaluación",
            r ? `- Grupos y pesos vigentes: ${r.groups}.` : "- Grupos y pesos: los publicados en la configuración del evento.",
            r ? `- Criterios y pesos vigentes: ${r.criteria}. Escala 1 a 10.` : "- Criterios: los publicados en la configuración del evento.",
            "- El resultado se calcula automáticamente y queda registrado en un snapshot inmutable con hash verificable. Ningún resultado se altera manualmente; cualquier corrección queda registrada con motivo y responsable.",
            "- Votos con patrones anómalos pueden marcarse para revisión sin eliminarse; el organizador decide su validez y la decisión queda auditada.",
            r ? `- Desempates, en orden: ${r.tieBreakers}.` : "- Desempates: según la política publicada del evento.",
            "## Clasificación",
            r ? `- Clasificados por ronda: ${r.qualifiers}. Los clasificados avanzan automáticamente a la siguiente fase.` : "- El número de clasificados por jornada se publica en la configuración del evento.",
            "- La clasificación es por jornada: las bandas compiten contra las bandas de su misma noche.",
            "## Derechos de imagen",
            "Al participar, las bandas autorizan al organizador a usar su nombre, imagen, audio y video de la presentación para la operación del concurso, pantallas del evento y comunicación del organizador y sus patrocinadores, sin contraprestación adicional.",
            "## Publicidad",
            "El concurso puede contar con patrocinadores. La publicidad no interviene en el flujo ni en el cálculo de la votación.",
            "## Datos personales",
            "El tratamiento de datos se rige por el aviso de privacidad publicado en /legal/aviso-de-privacidad.",
            `Versión ${v.version}, ${v.date}. El organizador puede actualizar estas bases; los cambios aplican a jornadas posteriores a su publicación.`,
          ]
        : [
            `Organizer: ${v.orgName}. These rules apply to the current Battle of the Bands season${r ? ` (next night: ${r.eventName})` : ""}.`,
            "## Format",
            "- Scheduled bands play each night for a set time (reference: 45 minutes) timed by the jury.",
            "- After each performance the public vote opens via QR and an on-screen code. The vote is anonymous, one per person per band, and closes when the organizer says so.",
            "- Judges and staff evaluate independently with the same or a specific rubric.",
            "## Scoring",
            r ? `- Groups and weights: ${r.groups}.` : "- Groups and weights: as published in the event configuration.",
            r ? `- Criteria and weights: ${r.criteria}. Scale 1–10.` : "- Criteria: as published in the event configuration.",
            "- Results are calculated automatically into an immutable, hash-verifiable snapshot. No result is edited by hand; corrections are recorded with reason and responsible person.",
            "- Anomalous votes may be flagged for review without deletion; the organizer's decision is audited.",
            r ? `- Tie-breakers, in order: ${r.tieBreakers}.` : "- Tie-breakers: per the published event policy.",
            "## Qualification",
            r ? `- Qualifiers per round: ${r.qualifiers}. Qualified bands advance automatically.` : "- Qualifiers per night are published in the event configuration.",
            "- Qualification is per night: bands compete against the bands of the same night.",
            "## Image rights",
            "By participating, bands authorize the organizer to use their name, image, audio and video for the contest, event screens and organizer/sponsor communications, without additional compensation.",
            "## Advertising",
            "The contest may have sponsors. Advertising never affects the voting flow or the calculation.",
            "## Personal data",
            "Processing is governed by the privacy notice at /legal/aviso-de-privacidad.",
            `Version ${v.version}, ${v.date}.`,
          ];
    },
  },
  publicidad: {
    titleEs: "Publicidad y patrocinios",
    titleEn: "Advertising and sponsors",
    version: "v1",
    render: (l, v) =>
      l === "es"
        ? [
            `${v.orgName} puede mostrar patrocinadores en la pantalla del escenario, en la página de votación y en la pantalla de agradecimiento.`,
            "- La publicidad nunca aparece dentro de la tarjeta de evaluación ni modifica el orden, los tiempos ni el cálculo de la votación.",
            "- Los enlaces de patrocinadores son medibles (impresiones y clics) de forma agregada y anónima; no se comparte información personal con los patrocinadores sin su consentimiento expreso.",
          ]
        : [
            `${v.orgName} may display sponsors on the stage screen, the voting page and the thank-you screen.`,
            "- Advertising never appears inside the rating card and never changes the order, timing or calculation of the vote.",
            "- Sponsor links are measured (impressions and clicks) in aggregate and anonymously; no personal data is shared with sponsors without your express consent.",
          ],
  },
};
