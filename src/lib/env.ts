import { z } from "zod";

/** "true"/"1"/"yes" → true; anything else → false. z.coerce.boolean would turn "false" into true. */
const bool = z.preprocess((v) => (typeof v === "string" ? ["true", "1", "yes", "on"].includes(v.trim().toLowerCase()) : Boolean(v)), z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEFAULT_LOCALE: z.enum(["es-MX", "en"]).default("es-MX"),
  BUSINESS_TIMEZONE: z.string().default("America/Mexico_City"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  VOTER_SESSION_SECRET: z.string().min(32),
  SCREEN_CODE_SECRET: z.string().min(16),
  TURNSTILE_ENABLED: bool.default(false),
  TURNSTILE_SITE_KEY: z.string().optional().default(""),
  TURNSTILE_SECRET_KEY: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default("Antisocial Live <no-reply@localhost>"),
  STORAGE_ENDPOINT: z.string().optional().default(""),
  STORAGE_REGION: z.string().optional().default(""),
  STORAGE_BUCKET: z.string().optional().default(""),
  STORAGE_ACCESS_KEY: z.string().optional().default(""),
  STORAGE_SECRET_KEY: z.string().optional().default(""),
  LOG_LEVEL: z.string().default("info"),
  SENTRY_DSN: z.string().optional().default(""),
  DEPLOYMENT_FREEZE: bool.default(false),
  SEED_ADMIN_EMAIL: z.string().default("admin@antisocial.local"),
  SEED_ADMIN_PASSWORD: z.string().default("change-me"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
