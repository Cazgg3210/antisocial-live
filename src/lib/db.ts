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

function createClient(): PrismaClient {
  if (!globalForDb.prisma) {
    globalForDb.prisma = new PrismaClient({
      adapter: new PrismaPg(pgPool()),
      log: env().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForDb.prisma;
}

/** Lazy: the client (and env validation) is created on first use, never at import/build time. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = createClient();
    const value = Reflect.get(client, prop) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
