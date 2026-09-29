import { env } from "@/lib/env";

/** Cloudflare Turnstile server-side verification. Disabled unless TURNSTILE_ENABLED. */
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!env().TURNSTILE_ENABLED) return true;
  const body = new URLSearchParams({ secret: env().TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body }).catch(() => null);
  if (!res) return false;
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  return data.success === true;
}
