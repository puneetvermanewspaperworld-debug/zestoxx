import { prisma } from "../db";
import type { DayPatch, FiiDiiStore, StoredDay } from "./ingest";
import { toRow } from "./row";
import type { FiiDiiDayRow } from "./types";

/** The Postgres-backed store (table FiiDiiDay). */
export const prismaStore: FiiDiiStore = {
  async get(date: string): Promise<StoredDay | null> {
    const r = await prisma.fiiDiiDay.findUnique({ where: { date } });
    return r ? { ...toRow(r), cashFetched: r.cashFetchedAt != null, oiFetched: r.oiFetchedAt != null } : null;
  },

  async upsert(date: string, p: DayPatch): Promise<void> {
    const data = {
      ...(p.cash
        ? { fiiBuy: p.cash.fii.buy, fiiSell: p.cash.fii.sell, fiiNet: p.cash.fii.net, diiBuy: p.cash.dii.buy, diiSell: p.cash.dii.sell, diiNet: p.cash.dii.net }
        : {}),
      ...(p.idxFut ? { fiiIdxFutLong: p.idxFut.long, fiiIdxFutShort: p.idxFut.short } : {}),
      ...(p.provisional !== undefined ? { provisional: p.provisional } : {}),
      ...(p.cashFetchedAt ? { cashFetchedAt: p.cashFetchedAt } : {}),
      ...(p.oiFetchedAt ? { oiFetchedAt: p.oiFetchedAt } : {}),
    };
    await prisma.fiiDiiDay.upsert({ where: { date }, create: { date, ...data }, update: data });
  },

  async list(limit: number): Promise<FiiDiiDayRow[]> {
    const rows = await prisma.fiiDiiDay.findMany({ orderBy: { date: "desc" }, take: limit });
    return rows.reverse().map(toRow);
  },
};
