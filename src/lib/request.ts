import { headers } from "next/headers";
import { hmacSha256 } from "./hash";

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

/** Per-event salted hash. Once the event salt is destroyed the hash is irreversible. */
export function hashIp(ip: string | null, eventSalt: string | null): string | null {
  if (!ip || !eventSalt) return null;
  return hmacSha256(ip, eventSalt).slice(0, 32);
}
