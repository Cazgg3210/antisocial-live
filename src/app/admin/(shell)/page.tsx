import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge, Button, Card, CardTitle, Stat } from "@/components/ui";
import { db, pgPool } from "@/lib/db";
import { env } from "@/lib/env";
import { configIssues } from "@/modules/scoring-config/service";

export default async function AdminHome() {
  const t = await getTranslations("admin");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  const tonight =
    (await db.eventEdition.findFirst({ where: { status: "LIVE" }, include: { rounds: { include: { performances: { include: { band: true }, orderBy: { slotOrder: "asc" } } } }, assignments: true } })) ??
    (await db.eventEdition.findFirst({ where: { scheduledAt: { gte: start, lt: end }, status: { notIn: ["ARCHIVED", "COMPLETED"] } }, include: { rounds: { include: { performances: { include: { band: true }, orderBy: { slotOrder: "asc" } } } }, assignments: true } })) ??
    (await db.eventEdition.findFirst({ where: { status: { in: ["READY", "CONFIGURING"] } }, orderBy: { scheduledAt: "asc" }, include: { rounds: { include: { performances: { include: { band: true }, orderBy: { slotOrder: "asc" } } } }, assignments: true } }));
  const dbOk = await pgPool().query("select 1").then(() => true).catch(() => false);
  const issues = tonight ? await configIssues(tonight.id).catch(() => []) : [];
  const perfs = tonight?.rounds.flatMap((r) => r.performances) ?? [];
  const active = perfs.find((p) => !["SCHEDULED", "FINALIZED", "CANCELLED"].includes(p.status));
  const votes = tonight ? await db.scoreSubmission.count({ where: { eventId: tonight.id, group: "PUBLIC", status: { in: ["ACCEPTED", "FLAGGED_FOR_REVIEW"] } } }) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">{t("dashboard")}</h1>
        <div className="flex gap-2">
          <Badge tone={dbOk ? "success" : "danger"}>DB {dbOk ? "OK" : "DOWN"}</Badge>
          {env().DEPLOYMENT_FREEZE && <Badge tone="warning">{t("freezeActive")}</Badge>}
        </div>
      </div>
      <Card className="glow">
        <CardTitle>{t("eventTonight")}</CardTitle>
        {!tonight ? (
          <p className="text-fg-muted">{t("noEventTonight")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">{tonight.name}</h2>
                <p className="text-sm text-fg-muted">{tonight.scheduledAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</p>
                <div className="mt-2 flex gap-2"><Badge tone={tonight.status === "LIVE" ? "success" : "neutral"}>{tonight.status}</Badge><Badge tone={tonight.mode === "LIVE" ? "acid" : "warning"}>{tonight.mode}</Badge></div>
              </div>
              <div className="flex gap-2">
                <Link href={`/control/${tonight.id}`}><Button size="lg">{t("controlRoom")}</Button></Link>
                <Link href={`/admin/events/${tonight.id}`}><Button size="lg" variant="secondary">{t("settings")}</Button></Link>
              </div>
            </div>
            {issues.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-danger">{issues.map((i) => <li key={i.code}>{i.message}</li>)}</ul>}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Bandas" value={perfs.length} />
              <Stat label="Banda actual" value={active?.band.name ?? "—"} />
              <Stat label="Votos" value={votes} />
              <Stat label="Jurado / Staff" value={`${tonight.assignments.filter((a) => a.group === "JUDGE").length} / ${tonight.assignments.filter((a) => a.group === "STAFF").length}`} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
