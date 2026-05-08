import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

/** Bumps when `prisma generate` rewrites the client (avoids a stale singleton missing new fields). */
function prismaClientFingerprint(): string {
  try {
    const marker = path.join(process.cwd(), "app", "generated", "prisma", "internal", "class.ts");
    const stat = fs.statSync(marker);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "0";
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
  prismaClientFingerprint: string | undefined;
};

const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.pool = pool;

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

function getPrisma(): PrismaClient {
  const fp = prismaClientFingerprint();
  const stale =
    globalForPrisma.prisma != null && globalForPrisma.prismaClientFingerprint !== fp;

  if (stale) {
    void globalForPrisma.prisma?.$disconnect().catch(() => undefined);
    globalForPrisma.prisma = undefined;
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prismaClientFingerprint = fp;
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

/**
 * Lazy singleton with invalidation when generated Prisma client changes.
 * Without this, Next dev can keep a PrismaClient whose embedded schema predates e.g. `BrowserSession.displayName`.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver) as unknown;
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
