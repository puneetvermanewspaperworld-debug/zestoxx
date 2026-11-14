import { prisma } from "../db";
import type { IndexIngestStore } from "./ingest";
import type { IndexDayRow } from "./types";

/** What the snapshot route reads. */
export interface IndexReadStore {
  /** the newest stored row for the index, or null */
  latest(indexName: string): Promise<IndexDayRow | null>;
  /** every stored P/E for the index (null values left out), newest first, at most `limit` */
  peHistory(indexName: string, limit: number): Promise<number[]>;
  /** the stored closing levels of the index from `from` to `to` (YYYY-MM-DD, inclusive), oldest first */
  closes(indexName: string, from: string, to: string): Promise<{ date: string; close: number }[]>;
}

/** The Postgres-backed store (table IndexValuation). */
export const prismaIndexStore: IndexIngestStore & IndexReadStore = {
  async hasDate(date) {
    return (await prisma.indexValuation.findFirst({ where: { date }, select: { date: true } })) !== null;
  },

  // upsert by (indexName, date): the day's rows replace any rows for the same indices on the same date, in one transaction
  async saveDay(date, rows, fetchedAt) {
    await prisma.$transaction([
      prisma.indexValuation.deleteMany({ where: { date, indexName: { in: rows.map((r) => r.indexName) } } }),
      prisma.indexValuation.createMany({
        data: rows.map((r) => ({ indexName: r.indexName, date, close: r.close, pe: r.pe, pb: r.pb, divYield: r.divYield, fetchedAt })),
      }),
    ]);
  },

  async latest(indexName) {
    const r = await prisma.indexValuation.findFirst({ where: { indexName }, orderBy: { date: "desc" } });
    return r ? { indexName: r.indexName, date: r.date, close: r.close, pe: r.pe, pb: r.pb, divYield: r.divYield } : null;
  },

  async peHistory(indexName, limit) {
    const rows = await prisma.indexValuation.findMany({ where: { indexName, pe: { not: null } }, orderBy: { date: "desc" }, take: limit, select: { pe: true } });
    return rows.map((r) => r.pe as number);
  },

  async closes(indexName, from, to) {
    const rows = await prisma.indexValuation.findMany({ where: { indexName, date: { gte: from, lte: to } }, orderBy: { date: "asc" }, select: { date: true, close: true } });
    return rows.map((r) => ({ date: r.date, close: r.close }));
  },
};
