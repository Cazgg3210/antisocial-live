import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env, isProd } from "@/lib/env";
import { hmacSha256, randomToken, sha256 } from "@/lib/hash";

export const VOTER_COOKIE = "al_voter";
const TTL = 60 * 60 * 24 * 365; // long-lived so returning voters can be recognised (anonymously)

/**
 * Anonymous, signed voter session. The cookie holds `id.secret`; only sha256(secret) is stored.
 * No identity is inferred from it: it exists to enforce one submission per performance and to
 * measure returning voters.
 */
export async function getOrCreateVoterSession(locale: string, ua?: string | null): Promise<{ id: string; isNew: boolean }> {
  const store = await cookies();
  const raw = store.get(VOTER_COOKIE)?.value;
  if (raw) {
    const existing = await resolveVoterSession(raw);
    if (existing) {
      await db.voterSession.update({ where: { id: existing }, data: { lastSeenAt: new Date() } });
      return { id: existing, isNew: false };
    }
  }
  const secret = randomToken(24);
  const session = await db.voterSession.create({
    data: { secretHash: sha256(secret), locale, uaSummary: summarizeUa(ua) },
  });
  const value = `${session.id}.${secret}.${hmacSha256(`${session.id}.${secret}`, env().VOTER_SESSION_SECRET).slice(0, 16)}`;
  store.set(VOTER_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: isProd(), path: "/", maxAge: TTL });
  return { id: session.id, isNew: true };
}

export async function getVoterSessionId(): Promise<string | null> {
  const raw = (await cookies()).get(VOTER_COOKIE)?.value;
  return raw ? resolveVoterSession(raw) : null;
}

async function resolveVoterSession(raw: string): Promise<string | null> {
  const [id, secret, sig] = raw.split(".");
  if (!id || !secret || !sig) return null;
  if (hmacSha256(`${id}.${secret}`, env().VOTER_SESSION_SECRET).slice(0, 16) !== sig) return null;
  const s = await db.voterSession.findUnique({ where: { id }, select: { secretHash: true } });
  if (!s || s.secretHash !== sha256(secret)) return null;
  return id;
}

/** Coarse, non-identifying UA summary for risk signals (browser family + OS family only). */
export function summarizeUa(ua?: string | null): string | undefined {
  if (!ua) return undefined;
  const browser = /Chrome|Safari|Firefox|Edg|SamsungBrowser|Instagram|FBAN/.exec(ua)?.[0] ?? "other";
  const os = /Android|iPhone|iPad|Windows|Mac OS|Linux/.exec(ua)?.[0] ?? "other";
  return `${browser}/${os}`;
}
