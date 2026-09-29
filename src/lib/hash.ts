import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import canonicalize from "canonicalize";

/** SHA-256 over RFC 8785 canonical JSON — key order never changes the hash. */
export function hashCanonical(value: unknown): string {
  const canonical = canonicalize(value);
  if (canonical === undefined) throw new Error("Value cannot be canonicalized");
  return createHash("sha256").update(canonical).digest("hex");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
