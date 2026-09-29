import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const live = await db.eventEdition.findFirst({ where: { status: "LIVE" }, orderBy: { scheduledAt: "desc" } });
  const calls = await db.applicationCall.findMany({ where: { status: "OPEN" }, take: 3 });
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-xs uppercase tracking-[0.4em] text-fg-subtle">Antisocial Rooftop</p>
      <h1 className="text-gradient mt-2 text-5xl font-black">Antisocial Live</h1>
      {live ? (
        <Link href={`/vote/${live.slug}`} className="mt-8 w-full rounded-lg bg-accent px-6 py-4 text-lg font-bold text-black">
          Votar · {live.name}
        </Link>
      ) : (
        <p className="mt-8 text-fg-muted">No hay evento en curso.</p>
      )}
      {calls.map((c) => (
        <Link key={c.id} href={`/apply/${c.slug}`} className="mt-4 w-full rounded-lg border border-border px-6 py-3 text-fg-muted">
          {c.titleEs}
        </Link>
      ))}
      <div className="mt-12 flex gap-4 text-xs text-fg-subtle">
        <Link href="/legal/aviso-de-privacidad">Aviso de privacidad</Link>
        <Link href="/legal/bases-del-concurso">Bases</Link>
        <Link href="/admin">Admin</Link>
      </div>
    </main>
  );
}
