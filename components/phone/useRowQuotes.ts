"use client";

import { useMemo } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOL_MAP } from "@/lib/symbols";
import { useWatchRows } from "@/lib/useWatchlist";
import type { AssetType } from "@/lib/types";

export interface RowQuote {
  name: string;
  type: AssetType;
  /** null until a price has arrived (never a made-up one) */
  price: number | null;
  /** day change, per cent; null when there is no previous close to compare with */
  changePct: number | null;
}

/** An index id from a watchlist ("IDX NIFTY PVT BANK") is an index; the app's own indices are in SYMBOL_MAP. */
export const typeOfWatch = (symbol: string): AssetType => SYMBOL_MAP[symbol]?.type ?? (symbol.startsWith("IDX ") ? "index" : "stock");

/**
 * Live price and day change for a list of watchlist symbols. The symbols the app charts come from its own live prices; any other NSE
 * symbol or index is priced by /api/watchlist (polled every 15 s). A symbol with no price yet has price null.
 */
export function useRowQuotes(symbols: string[]): Record<string, RowQuote> {
  const { live, chgFor } = useZestoxx();
  const others = useMemo(() => symbols.filter((s) => !SYMBOL_MAP[s]), [symbols]);
  const { res } = useWatchRows(others.length ? `symbols=${others.map(encodeURIComponent).join(",")}` : null);
  const rows = useMemo(() => (res && res.source === "live" ? new Map(res.rows.map((r) => [r.symbol, r])) : new Map()), [res]);
  const out: Record<string, RowQuote> = {};
  for (const s of symbols) {
    const info = SYMBOL_MAP[s];
    if (info) {
      out[s] = { name: info.name, type: info.type, price: live[s] > 0 ? live[s] : null, changePct: chgFor(s) };
    } else {
      const r = rows.get(s);
      out[s] = { name: r?.name ?? s.replace(/^IDX /, ""), type: typeOfWatch(s), price: r?.ltp ?? null, changePct: r?.changePct ?? null };
    }
  }
  return out;
}
