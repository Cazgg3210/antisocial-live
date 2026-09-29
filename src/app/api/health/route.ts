export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, service: "antisocial-live", time: new Date().toISOString() });
}
