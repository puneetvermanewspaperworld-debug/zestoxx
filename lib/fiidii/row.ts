import type { FiiDiiDay } from "@prisma/client";
import type { FiiDiiDayRow } from "./types";

/** A stored row as the page reads it: a half is null unless every one of its numbers is there. */
export function toRow(r: FiiDiiDay): FiiDiiDayRow {
  const cash =
    r.fiiBuy != null && r.fiiSell != null && r.fiiNet != null && r.diiBuy != null && r.diiSell != null && r.diiNet != null
      ? { fii: { buy: r.fiiBuy, sell: r.fiiSell, net: r.fiiNet }, dii: { buy: r.diiBuy, sell: r.diiSell, net: r.diiNet } }
      : null;
  const idxFut = r.fiiIdxFutLong != null && r.fiiIdxFutShort != null ? { long: r.fiiIdxFutLong, short: r.fiiIdxFutShort } : null;
  return { date: r.date, cash, idxFut, provisional: r.provisional };
}
