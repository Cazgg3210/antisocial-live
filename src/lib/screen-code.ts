import { hmacSha256 } from "./hash";
import { env } from "./env";

/**
 * Rotating 4-digit code shown on the Stage screen. Proves physical presence without
 * penalising shared IPs. Valid for the current and the previous window.
 */
export function screenCode(eventId: string, rotationSec: number, at = Date.now()): { code: string; window: number; expiresInSec: number } {
  const window = Math.floor(at / 1000 / rotationSec);
  return { code: codeFor(eventId, window), window, expiresInSec: rotationSec - (Math.floor(at / 1000) % rotationSec) };
}

export function isValidScreenCode(eventId: string, rotationSec: number, code: string, at = Date.now()): boolean {
  const window = Math.floor(at / 1000 / rotationSec);
  return [window, window - 1].some((w) => codeFor(eventId, w) === code.trim());
}

function codeFor(eventId: string, window: number): string {
  const h = hmacSha256(`${eventId}:${window}`, env().SCREEN_CODE_SECRET);
  return String(parseInt(h.slice(0, 8), 16) % 10000).padStart(4, "0");
}
