import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";

const minimal = process.argv.includes("--minimal");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(24).toString("base64url");
const pw = (s: string) => hash(s, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

const CRITERIA = [
  { key: "calidad", nameEs: "Calidad musical", nameEn: "Musical quality", weightBp: 2000, includedInQuick: true },
  { key: "presencia", nameEs: "Presencia escénica", nameEn: "Stage presence", weightBp: 1500, includedInQuick: true },
  { key: "imagen", nameEs: "Imagen general de la banda", nameEn: "Overall band image", weightBp: 1000, includedInQuick: false },
  { key: "conexion", nameEs: "Conexión con el público", nameEn: "Audience connection", weightBp: 1500, includedInQuick: true },
  { key: "originalidad", nameEs: "Originalidad del espectáculo", nameEn: "Show originality", weightBp: 1000, includedInQuick: false },
  { key: "repertorio", nameEs: "Repertorio presentado", nameEn: "Repertoire", weightBp: 1000, includedInQuick: false },
  { key: "global", nameEs: "Evaluación global", nameEn: "Overall evaluation", weightBp: 2000, includedInQuick: true },
];

const BANDS = [
  ["Belladona", "Rock alternativo", false],
  ["Zephyr", "Indie rock", false],
  ["Los Vándalos del Sur", "Punk", false],
  ["Neón Caníbal", "Synth rock", false],
  ["Ruido Blanco", "Grunge", false],
  ["La Otra Mitad", "Pop rock", false],
  ["Volt", "Hard rock", false],
  ["Marea Negra", "Metal", false],
  ["Sombra Eléctrica", "Post-punk", false],
  ["Kilómetro Cero", "Ska", false],
  ["Ácido Lunar", "Psych rock", false],
  ["Fauna Nocturna", "Indie pop", false],
  ["Réplica", "Tributo Soda Stereo", true],
  ["Cuarto Menguante", "Rock en español", false],
  ["Delirio Urbano", "Rap rock", false],
  ["Tinta Roja", "Blues rock", false],
] as const;

async function main() {
  console.log(`Seeding (${minimal ? "minimal" : "demo"})…`);

  const org = await db.organization.upsert({
    where: { slug: "antisocial-rooftop" },
    create: { name: "Antisocial Rooftop", slug: "antisocial-rooftop", legalName: "Antisocial Rooftop (razón social pendiente)", address: "Oso 73, Actipan, Ciudad de México", contactEmail: "privacidad@antisocialrooftop.mx" },
    update: {},
  });
  const venue = await db.venue.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "rooftop" } },
    create: { organizationId: org.id, name: "Antisocial Rooftop", slug: "rooftop", address: "Galerías Insurgentes, 2do piso" },
    update: {},
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@antisocial.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "change-me";
  // SEED_RESET_ADMIN_PASSWORD=true forces the password from SEED_ADMIN_PASSWORD onto an existing admin (recovery path).
  const resetPassword = process.env.SEED_RESET_ADMIN_PASSWORD === "true";
  const admin = await db.user.upsert({
    where: { email: adminEmail },
    create: { organizationId: org.id, email: adminEmail, name: "Admin", passwordHash: await pw(adminPassword), roles: { create: [{ role: "SUPER_ADMIN" }] } },
    update: resetPassword ? { passwordHash: await pw(adminPassword), isActive: true } : {},
  });
  if (resetPassword) console.log(`Admin password reset for ${adminEmail}`);

  for (const kind of ["SECURITY_SIGNALS", "AUDIENCE_CONTACTS", "RESULTS", "AUDIT"]) {
    await db.retentionPolicy.upsert({
      where: { organizationId_dataKind: { organizationId: org.id, dataKind: kind } },
      create: { organizationId: org.id, dataKind: kind, retentionDays: kind === "SECURITY_SIGNALS" ? 30 : null },
      update: {},
    });
  }

  if (minimal) {
    console.log(`Admin: ${adminEmail}`);
    return;
  }

  const operator = await db.user.upsert({
    where: { email: "operador@antisocial.local" },
    create: { organizationId: org.id, email: "operador@antisocial.local", name: "Operador Stage", passwordHash: await pw("Antisocial!Demo2026"), roles: { create: [{ role: "STAGE_OPERATOR" }] } },
    update: {},
  });
  const manager = await db.user.upsert({
    where: { email: "manager@antisocial.local" },
    create: { organizationId: org.id, email: "manager@antisocial.local", name: "Event Manager", passwordHash: await pw("Antisocial!Demo2026"), roles: { create: [{ role: "EVENT_MANAGER" }] } },
    update: {},
  });

  const series = await db.eventSeries.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "guerra-de-bandas-2026" } },
    create: { organizationId: org.id, name: "Guerra de Bandas 2026", slug: "guerra-de-bandas-2026", description: "Temporada demo: 16 bandas, 4 noches, una final." },
    update: {},
  });

  const bands = [] as { id: string; name: string }[];
  for (const [name, genre, isTribute] of BANDS) {
    const b = await db.band.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: slug(name) } },
      create: { organizationId: org.id, name, slug: slug(name), genre, isTribute, city: "CDMX", instagram: `https://instagram.com/${slug(name)}`, spotify: `https://open.spotify.com/search/${encodeURIComponent(name)}`, description: `${name} — ${genre}. Banda demo.` },
      update: {},
    });
    bands.push({ id: b.id, name });
  }

  // Judges & staff
  const people = [
    ["Mariana Ríos", "JUDGE"],
    ["Diego Salcedo", "JUDGE"],
    ["Pau Ortega", "JUDGE"],
    ["Rodrigo (Staff)", "STAFF"],
    ["Karla (Staff)", "STAFF"],
  ] as const;

  // 4 nights + final
  const base = new Date();
  base.setHours(20, 0, 0, 0);
  const finalEdition = await createEdition("Final — Guerra de Bandas 2026", addDays(base, 35), "final-gdb-2026", 1);
  const finalRound = (await db.round.findFirst({ where: { eventId: finalEdition.id } }))!;

  const tokens: string[] = [];
  for (let night = 1; night <= 4; night++) {
    const ed = await createEdition(`Guerra de Bandas — Noche ${night}`, addDays(base, (night - 1) * 7), `gdb-2026-noche-${night}`, 1, night === 1);
    const round = (await db.round.findFirst({ where: { eventId: ed.id } }))!;
    await db.round.update({ where: { id: round.id }, data: { nextRoundId: finalRound.id, name: `Jornada ${night}` } });
    const lineup = bands.slice((night - 1) * 4, night * 4);
    for (let i = 0; i < lineup.length; i++) {
      await db.performance.upsert({ where: { roundId_bandId: { roundId: round.id, bandId: lineup[i].id } }, create: { roundId: round.id, bandId: lineup[i].id, slotOrder: i + 1 }, update: {} });
    }
    for (const [name, group] of people) {
      const person = await db.person.upsert({ where: { id: `seed-${slug(name)}` }, create: { id: `seed-${slug(name)}`, organizationId: org.id, name, email: `${slug(name)}@example.com` }, update: {} });
      const a = await db.evaluatorAssignment.upsert({ where: { personId_eventId_group: { personId: person.id, eventId: ed.id, group } }, create: { personId: person.id, eventId: ed.id, group }, update: {} });
      if (night === 1) {
        const raw = token();
        await db.accessToken.create({ data: { tokenHash: sha256(raw), kind: group, eventId: ed.id, assignmentId: a.id, expiresAt: addDays(new Date(), 30), createdBy: admin.id } });
        tokens.push(`${group.padEnd(5)} ${name.padEnd(16)} ${process.env.APP_URL ?? "http://localhost:3000"}/${group === "JUDGE" ? "j" : "s"}/${raw}`);
      }
    }
    await db.roleAssignment.upsert({ where: { userId_role_eventId: { userId: operator.id, role: "STAGE_OPERATOR", eventId: ed.id } }, create: { userId: operator.id, role: "STAGE_OPERATOR", eventId: ed.id }, update: {} });
    await db.roleAssignment.upsert({ where: { userId_role_eventId: { userId: manager.id, role: "EVENT_MANAGER", eventId: ed.id } }, create: { userId: manager.id, role: "EVENT_MANAGER", eventId: ed.id }, update: {} });
  }

  // Sponsors
  const sponsor1 = await db.sponsor.upsert({ where: { organizationId_slug: { organizationId: org.id, slug: "cerveza-demo" } }, create: { organizationId: org.id, name: "Cerveza Demo", slug: "cerveza-demo", websiteUrl: "https://example.com/cerveza", logoUrl: null }, update: {} });
  const sponsor2 = await db.sponsor.upsert({ where: { organizationId_slug: { organizationId: org.id, slug: "audio-pro-demo" } }, create: { organizationId: org.id, name: "AudioPro Demo", slug: "audio-pro-demo", websiteUrl: "https://example.com/audiopro" }, update: {} });
  const night1 = await db.eventEdition.findUniqueOrThrow({ where: { slug: "gdb-2026-noche-1" } });
  const camp1 = await db.campaign.create({ data: { sponsorId: sponsor1.id, name: "Temporada 2026", priority: 10 } });
  const camp2 = await db.campaign.create({ data: { sponsorId: sponsor2.id, name: "Backline 2026", priority: 5 } });
  for (const [campaignId, kind, code, headlineEs, headlineEn, ctaEs, ctaEn] of [
    [camp1.id, "STAGE_PRESENTED_BY", "cd-stage", "Presentado por Cerveza Demo", "Presented by Cerveza Demo", null, null],
    [camp1.id, "VOTE_LANDING_HEADER", "cd-vote", "Cerveza Demo apoya a las bandas", "Cerveza Demo supports the bands", "Conoce más", "Learn more"],
    [camp1.id, "THANK_YOU_CTA", "cd-thanks", "2x1 en Cerveza Demo hoy", "2x1 Cerveza Demo tonight", "Ver promo", "See promo"],
    [camp1.id, "STAGE_BREAK", "cd-break", "Cerveza Demo — la oficial de la Guerra de Bandas", "Cerveza Demo — official beer of the Battle", null, null],
    [camp2.id, "STAGE_TRANSITION", "ap-trans", "Backline por AudioPro", "Backline by AudioPro", null, null],
  ] as const) {
    await db.sponsorPlacement.upsert({ where: { code }, create: { campaignId, eventId: night1.id, kind, code, headlineEs, headlineEn, ctaLabelEs: ctaEs, ctaLabelEn: ctaEn, ctaUrl: "https://example.com/promo" }, update: {} });
  }

  // Open call
  await db.applicationCall.upsert({
    where: { slug: "convocatoria-2027" },
    create: { seriesId: series.id, slug: "convocatoria-2027", titleEs: "Convocatoria Guerra de Bandas 2027", titleEn: "Battle of the Bands 2027 — Open call", descriptionEs: "Buscamos 16 bandas para la próxima temporada.", descriptionEn: "We are looking for 16 bands for next season.", status: "OPEN", opensAt: new Date(), closesAt: addDays(new Date(), 60) },
    update: {},
  });

  console.log("\nAdmin users (password: Antisocial!Demo2026 unless SEED_ADMIN_PASSWORD set):");
  console.log(`  ${adminEmail} (SUPER_ADMIN)\n  operador@antisocial.local (STAGE_OPERATOR)\n  manager@antisocial.local (EVENT_MANAGER)`);
  console.log("\nEvaluator links for Noche 1:");
  for (const t of tokens) console.log("  " + t);
  console.log(`\nVote:  ${process.env.APP_URL ?? "http://localhost:3000"}/vote/gdb-2026-noche-1`);
  console.log(`Stage: ${process.env.APP_URL ?? "http://localhost:3000"}/stage/gdb-2026-noche-1`);
  console.log(`Control: ${process.env.APP_URL ?? "http://localhost:3000"}/control/${night1.id}`);

  async function createEdition(name: string, scheduledAt: Date, editionSlug: string, qualifiers: number, live = false) {
    const existing = await db.eventEdition.findUnique({ where: { slug: editionSlug } });
    if (existing) return existing;
    const ed = await db.eventEdition.create({
      data: {
        seriesId: series.id,
        venueId: venue.id,
        name,
        slug: editionSlug,
        scheduledAt,
        mode: "REHEARSAL",
        status: live ? "READY" : "CONFIGURING",
        expectedAttendance: 150,
        createdBy: admin.id,
        stageScene: { create: { type: "WELCOME" } },
        securitySalt: { create: { salt: token() } },
        rounds: { create: { name: "Ronda", order: 1, qualifiersCount: qualifiers } },
        config: { create: { reservationUrl: "https://www.antisocialrooftop.mx/", bandReportEnabled: true } },
      },
    });
    const sc = await db.scorecardTemplate.create({ data: { eventId: ed.id, name: "Guerra de Bandas", criteria: { create: CRITERIA.map((c, i) => ({ ...c, order: i + 1 })) } } });
    for (const g of [
      { kind: "PUBLIC", name: "Público", weightBp: 4000 },
      { kind: "STAFF", name: "Staff", weightBp: 2000 },
      { kind: "JUDGE", name: "Jurado", weightBp: 4000 },
    ] as const) {
      await db.votingGroup.create({
        data: { eventId: ed.id, kind: g.kind, name: g.name, weightBp: g.weightBp, scorecardId: sc.id, aggregation: g.kind === "PUBLIC" ? "TRIMMED_MEAN" : "MEAN", minSubmissions: g.kind === "PUBLIC" ? 5 : 1, minVotesPolicy: g.kind === "PUBLIC" ? "REDISTRIBUTE" : "BLOCK", requiredEvaluatorCount: g.kind === "JUDGE" ? 2 : 1 },
      });
    }
    return ed;
  }
}

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    await pool.end();
  });
