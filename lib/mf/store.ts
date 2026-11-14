import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as sharedPrisma } from "../db";
import type { MfStore, NavRow, ReturnRow, SchemeRow } from "./ingest";
import type { NavPoint } from "./returns";

/**
 * Postgres-backed store for the mutual fund tables. Writes go in as one statement per batch (arrays unnested server-side), so a night's
 * work is a handful of round trips. Dates travel as text and are cast in SQL. `client` is injectable so a script can use its own
 * connection (see scripts/mf-backfill.ts); the app uses the shared one.
 */
const CHUNK = 4000;
const chunks = <T,>(xs: T[], n = CHUNK): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

export function makeMfStore(client: PrismaClient = sharedPrisma): MfStore {
  return {
    async upsertSchemes(rows: SchemeRow[]) {
      for (const c of chunks(rows)) {
        await client.$executeRaw(Prisma.sql`
          INSERT INTO "MfScheme" ("code","name","isin","amc","category","nav","navDate","updatedAt")
          SELECT t.code, t.name, t.isin, t.amc, t.category, t.nav, t.nav_date::date, NOW()
          FROM unnest(${c.map((r) => r.code)}::int[], ${c.map((r) => r.name)}::text[], ${c.map((r) => r.isin ?? "")}::text[], ${c.map((r) => r.amc)}::text[],
                      ${c.map((r) => r.category)}::text[], ${c.map((r) => r.nav)}::float8[], ${c.map((r) => r.navDate)}::text[])
            AS t(code, name, isin, amc, category, nav, nav_date)
          ON CONFLICT ("code") DO UPDATE SET
            "name" = EXCLUDED."name", "isin" = EXCLUDED."isin", "amc" = EXCLUDED."amc", "category" = EXCLUDED."category",
            "nav" = EXCLUDED."nav", "navDate" = EXCLUDED."navDate", "updatedAt" = NOW()
          WHERE "MfScheme"."navDate" <= EXCLUDED."navDate"`);
        // a stored empty ISIN is really "none"
        await client.$executeRaw(Prisma.sql`UPDATE "MfScheme" SET "isin" = NULL WHERE "isin" = ''`);
      }
    },

    async insertNavs(rows: NavRow[]) {
      let inserted = 0;
      for (const c of chunks(rows)) {
        inserted += await client.$executeRaw(Prisma.sql`
          INSERT INTO "MfNav" ("code","date","nav")
          SELECT t.code, t.d::date, t.nav
          FROM unnest(${c.map((r) => r.code)}::int[], ${c.map((r) => r.date)}::text[], ${c.map((r) => r.nav)}::float8[]) AS t(code, d, nav)
          ON CONFLICT ("code","date") DO NOTHING`);
      }
      return inserted;
    },

    async anchorNavs(codes: number[], from: string, to: string) {
      const out = new Map<number, NavPoint>();
      for (const c of chunks(codes, 2000)) {
        const rows = await client.$queryRaw<{ code: number; date: string; nav: number }[]>(Prisma.sql`
          SELECT DISTINCT ON ("code") "code", to_char("date", 'YYYY-MM-DD') AS "date", "nav"
          FROM "MfNav"
          WHERE "code" = ANY(${c}::int[]) AND "date" >= ${from}::date AND "date" <= ${to}::date
          ORDER BY "code", "date" DESC`);
        for (const r of rows) out.set(r.code, { date: r.date, nav: r.nav });
      }
      return out;
    },

    async updateReturns(rows: ReturnRow[]) {
      for (const c of chunks(rows)) {
        await client.$executeRaw(Prisma.sql`
          UPDATE "MfScheme" AS s SET "ret1m" = t.r1, "ret6m" = t.r2, "ret1y" = t.r3, "ret3y" = t.r4, "ret5y" = t.r5
          FROM (
            SELECT * FROM unnest(${c.map((r) => r.code)}::int[], ${c.map((r) => r["1m"])}::float8[], ${c.map((r) => r["6m"])}::float8[],
                                 ${c.map((r) => r["1y"])}::float8[], ${c.map((r) => r["3y"])}::float8[], ${c.map((r) => r["5y"])}::float8[])
              AS x(code, r1, r2, r3, r4, r5)
          ) AS t
          WHERE s."code" = t.code`);
      }
    },
  };
}
