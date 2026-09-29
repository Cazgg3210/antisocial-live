import { EventEmitter } from "node:events";
import type { Client } from "pg";
import { pgPool } from "./db";
import { logger } from "./logger";

export interface RealtimeMessage {
  table: string;
  op: string;
  eventId: string | null;
}

/**
 * In-process bus fed by PostgreSQL LISTEN/NOTIFY. Any app instance receives every change,
 * so SSE clients on any node stay in sync without Redis.
 */
class RealtimeBus extends EventEmitter {
  private client: (Client & { release?: () => void }) | null = null;
  private starting: Promise<void> | null = null;

  async ensureListening(): Promise<void> {
    if (this.client) return;
    if (!this.starting) this.starting = this.start();
    return this.starting;
  }

  private async start(): Promise<void> {
    try {
      const client = (await pgPool().connect()) as Client & { release: () => void };
      await client.query("LISTEN antisocial_realtime");
      client.on("notification", (msg) => {
        if (!msg.payload) return;
        try {
          const parsed = JSON.parse(msg.payload) as RealtimeMessage;
          this.emit("change", parsed);
          if (parsed.eventId) this.emit(`event:${parsed.eventId}`, parsed);
        } catch (err) {
          logger.warn({ err }, "bad realtime payload");
        }
      });
      client.on("error", (err) => {
        logger.error({ err }, "realtime listener error; reconnecting");
        this.client = null;
        this.starting = null;
        setTimeout(() => void this.ensureListening(), 2000);
      });
      this.client = client;
      logger.info("realtime listener attached");
    } catch (err) {
      this.starting = null;
      logger.error({ err }, "failed to attach realtime listener");
      throw err;
    }
  }

  subscribe(eventId: string, handler: (m: RealtimeMessage) => void): () => void {
    void this.ensureListening();
    const key = `event:${eventId}`;
    this.on(key, handler);
    return () => this.off(key, handler);
  }
}

const g = globalThis as unknown as { realtimeBus?: RealtimeBus };
export const realtime = g.realtimeBus ?? (g.realtimeBus = new RealtimeBus());
realtime.setMaxListeners(1000);

/**
 * Builds an SSE response that re-sends a snapshot whenever the event changes. Heartbeats every
 * 15 s keep Traefik/Cloudflare from closing idle connections.
 */
export function sseResponse<T>(eventId: string, snapshot: () => Promise<T>, opts: { heartbeatMs?: number; refreshMs?: number } = {}): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let refresh: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        if (closed) return;
        try {
          const data = await snapshot();
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (err) {
          logger.warn({ err, eventId }, "sse snapshot failed");
        }
      };
      await send();
      let pending: ReturnType<typeof setTimeout> | null = null;
      unsubscribe = realtime.subscribe(eventId, () => {
        // Coalesce bursts (e.g. 200 votes/s) into at most one snapshot per 250 ms.
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          void send();
        }, 250);
      });
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
      }, opts.heartbeatMs ?? 15000);
      // Time-derived data (rotating screen code, timers) needs a periodic push even without DB changes.
      if (opts.refreshMs) refresh = setInterval(() => void send(), opts.refreshMs);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (refresh) clearInterval(refresh);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
