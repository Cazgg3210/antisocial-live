import { createTransport } from "nodemailer";
import { env } from "./env";
import { logger } from "./logger";

/** Minimal SMTP sender (Mailpit in dev). Silently logs when SMTP is not configured. */
export async function sendMail(msg: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const e = env();
  if (!e.SMTP_HOST) {
    logger.warn({ to: msg.to, subject: msg.subject }, "SMTP not configured; mail not sent");
    return;
  }
  const transport = createTransport({ host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_PORT === 465, auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined });
  await transport.sendMail({ from: e.SMTP_FROM, ...msg });
}
