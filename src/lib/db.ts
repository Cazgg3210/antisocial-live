import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "./env";

// Single shared pool: Prisma queries and LISTEN/NOTIFY share the same credentials.
const globalForDb = globalThis as unknown as { pool?: Pool; prisma?: PrismaClient };

export function pgPool(): Pool {
  if (!globalForDb.pool) {
    globalForDb.pool = new Pool({ connectionString: env().DATABASE_URL, max: 20 });
  }
  return globalForDb.pool;
}

export const db: PrismaClient =
  globalForDb.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pgPool()),
    log: env().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env().NODE_ENV !== "production") globalForDb.prisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
