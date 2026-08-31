import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. Next.js dev hot-reloads modules on every edit, which would
 * otherwise spawn a new PrismaClient (and a new connection pool) each time — so we
 * stash it on `globalThis` outside production.
 *
 * The connection URL comes from `DATABASE_URL` (see .env / .env.example).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
