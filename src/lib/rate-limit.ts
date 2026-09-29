import { AppError } from "./errors";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * In-memory token bucket. Good enough for one app instance in front of Traefik; when Cloudflare
 * is enabled its perimeter rate limiting is the first line and this remains a backstop.
 */
export function rateLimit(key: string, opts: { capacity: number; refillPerSec: number }): void {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: opts.capacity, updatedAt: now };
  const elapsed = (now - b.updatedAt) / 1000;
  b.tokens = Math.min(opts.capacity, b.tokens + elapsed * opts.refillPerSec);
  b.updatedAt = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    throw new AppError("RATE_LIMITED", "Too many requests, slow down.");
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (now - v.updatedAt > 600_000) buckets.delete(k);
  }
}
