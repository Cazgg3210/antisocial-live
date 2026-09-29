import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env by itself. Node 24 can; ignore when the file is absent (Docker/CI use real env vars).
try {
  process.loadEnvFile?.();
} catch {
  /* no .env present */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://antisocial:antisocial@127.0.0.1:5480/antisocial",
  },
});
