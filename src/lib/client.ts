"use client";

import { useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
    public readonly status = 400,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; details?: Record<string, unknown> } } & T;
  if (!res.ok) throw new ApiError(data.error?.code ?? "ERROR", data.error?.message ?? res.statusText, data.error?.details ?? {}, res.status);
  return data;
}

/**
 * Subscribes to an SSE endpoint that emits `state` events; falls back to polling `pollUrl`
 * when the stream cannot be established or drops repeatedly. Reports connection state so the
 * UI can show a discreet indicator.
 */
export function useLiveState<T>(streamUrl: string | null, pollUrl: string | null, pollMs = 4000) {
  const [state, setState] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<"sse" | "poll" | "idle">("idle");
  const failures = useRef(0);

  useEffect(() => {
    if (!streamUrl) return;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const startPolling = () => {
      if (poll || !pollUrl) return;
      setMode("poll");
      const tick = async () => {
        try {
          const r = await fetch(pollUrl, { cache: "no-store" });
          if (r.ok) {
            setState((await r.json()) as T);
            setConnected(true);
          }
        } catch {
          setConnected(false);
        }
      };
      void tick();
      poll = setInterval(tick, pollMs);
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource(streamUrl);
      es.addEventListener("state", (ev) => {
        failures.current = 0;
        setConnected(true);
        setMode("sse");
        setState(JSON.parse((ev as MessageEvent).data) as T);
      });
      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
        failures.current += 1;
        if (failures.current >= 3) {
          es?.close();
          es = null;
          startPolling();
        }
      };
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [streamUrl, pollUrl, pollMs]);

  return { state, connected, mode, setState };
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function fmtClock(totalSeconds: number): string {
  const neg = totalSeconds < 0;
  const s = Math.abs(Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${neg ? "-" : ""}${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** UUID v4. crypto.randomUUID() only exists in secure contexts (HTTPS/localhost); phones on a LAN IP need the fallback. */
export function newKey(): string {
  const c = typeof crypto !== "undefined" ? (crypto as Partial<Crypto>) : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
