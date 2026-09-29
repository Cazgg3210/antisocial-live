import { pgPool } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await pgPool().query("select 1");
    return Response.json({ ok: true, db: { ok: true, ms: Date.now() - started }, freeze: env().DEPLOYMENT_FREEZE });
  } catch (err) {
    return Response.json({ ok: false, db: { ok: false, error: String(err) } }, { status: 503 });
  }
}
