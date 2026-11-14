import { prisma } from "../db";
import type { FundRow } from "./overview";
import type { NavPoint } from "./returns";

/** Reads for the mutual fund API routes: stored schemes and their NAVs, nothing generated. */
const iso = (d: Date) => d.toISOString().slice(0, 10);

const toRow = (r: { code: number; name: string; amc: string; category: string; nav: number; navDate: Date; ret1m: number | null; ret6m: number | null; ret1y: number | null; ret3y: number | null; ret5y: number | null }): FundRow => ({
  code: r.code, name: r.name, amc: r.amc, category: r.category, nav: r.nav, navDate: iso(r.navDate),
  ret1m: r.ret1m, ret6m: r.ret6m, ret1y: r.ret1y, ret3y: r.ret3y, ret5y: r.ret5y,
});

export async function allSchemes(): Promise<FundRow[]> {
  return (await prisma.mfScheme.findMany({ orderBy: { name: "asc" } })).map(toRow);
}

export async function schemeWithSeries(code: number): Promise<{ scheme: FundRow & { isin: string | null }; series: NavPoint[] } | null> {
  const s = await prisma.mfScheme.findUnique({ where: { code } });
  if (!s) return null;
  const navs = await prisma.mfNav.findMany({ where: { code }, orderBy: { date: "asc" }, select: { date: true, nav: true } });
  return { scheme: { ...toRow(s), isin: s.isin }, series: navs.map((n) => ({ date: iso(n.date), nav: n.nav })) };
}
