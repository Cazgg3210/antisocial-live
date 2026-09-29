import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env().LOG_LEVEL,
  base: { service: "antisocial-live" },
  redact: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.passwordHash", "*.token"],
  ...(env().NODE_ENV === "development" ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
});

export type Logger = typeof logger;

export function requestLogger(ctx: { requestId?: string; eventId?: string; performanceId?: string; actorId?: string }) {
  return logger.child(ctx);
}
