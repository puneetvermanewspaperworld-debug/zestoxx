"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { fmt, fmtSigned } from "@/lib/helpers";
import { SYMBOLS } from "@/lib/symbols";
import type { AssetType } from "@/lib/types";
import type { SearchResult } from "@/lib/watchlists";

export interface QuoteOf {
  price: number | null;
  pct: number | null;
}

const tone = (n: number | null) => (n == null || n === 0 ? "text-slate-500" : n > 0 ? "text-emerald-700" : "text-rose-600");
const BUILT_IN = SYMBOLS.filter((s) => s.type !== "crypto").map((s) => ({ symbol: s.id, name: s.name }));

/**
 * The underlying of the option chain, as a search box: it shows the one that is open with its live price and change; tapped, it becomes a field
 * that searches every stock and index that has options (the exchange's instrument list, through /api/watchlist-search?options=1), with the
 * built-in ones to hand before anything is typed. A result shows its price and change when the app has them.
 */
export default function UnderlyingSearch({ selected, quoteOf, typeOf, onPick }: { selected: string; quoteOf: (symbol: string) => QuoteOf; typeOf: (symbol: string) => AssetType; onPick: (symbol: string) => void }) {
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ symbol: string; name: string }[] | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (!searching || !term) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      let list: { symbol: string; name: string }[] | null = null;
      try {
        const r = await fetch(`/api/watchlist-search?q=${encodeURIComponent(term)}&options=1`);
        const data = r.ok ? await r.json() : null;
        if (data && Array.isArray(data.results)) list = (data.results as SearchResult[]).map((x) => ({ symbol: x.symbol, name: x.name }));
      } catch {
        // the built-in ones are searched below
      }
      if (!cancelled) setFound(list);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, searching]);

  const term = q.trim().toLowerCase();
  // before anything is typed: the built-in underlyings; typed: the exchange's list, or (when it did not answer) the built-in ones that match
  const shown = !term ? BUILT_IN : found && found.length ? found : BUILT_IN.filter((s) => s.symbol.toLowerCase().includes(term) || s.name.toLowerCase().includes(term));
  const close = () => {
    setSearching(false);
    setQ("");
    setFound(null);
  };
  const pick = (symbol: string) => {
    close();
    onPick(symbol);
  };

  const cur = quoteOf(selected);
  const name = selected.replace(/^IDX /, "");
  if (!searching) {
    return (
      <button type="button" data-compact data-testid="chain-search-open" aria-label={`Underlying ${name}. Search another`} onClick={() => (setSearching(true), setTimeout(() => input.current?.focus(), 0))} className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left">
        <Search size={15} className="shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0 leading-tight">
          <span data-testid="chain-underlying-name" className="block truncate text-[13px] font-semibold text-slate-900">
            {name}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[12px]">
            <span data-testid="chain-underlying-price" className="text-slate-800">
              {cur.price != null ? fmt(cur.price, typeOf(selected)) : "--"}
            </span>
            {cur.pct != null && (
              <span data-testid="chain-underlying-change" className={tone(cur.pct)}>
                {fmtSigned(cur.pct, 2, "%")}
              </span>
            )}
          </span>
        </span>
      </button>
    );
  }
  return (
    <div className="relative min-w-0 flex-1" data-testid="chain-search">
      <div className="flex h-11 items-center gap-2 rounded-lg border border-blue-500 bg-white px-2.5">
        <Search size={15} className="shrink-0 text-slate-400" aria-hidden />
        <input ref={input} autoFocus data-testid="chain-search-input" aria-label="Search stocks and indices that have options" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && close()} placeholder="Search stocks, indices…" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400" />
        <button type="button" aria-label="Close search" data-compact data-testid="chain-search-close" onClick={close} className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500">
          <X size={16} aria-hidden />
        </button>
      </div>
      <ul data-testid="chain-results" className="fixed inset-x-0 top-[var(--chain-head-h,56px)] z-50 max-h-[calc(100dvh-64px)] overflow-y-auto border-y border-slate-200 bg-white shadow-md">
        {shown.length === 0 && <li className="px-3 py-3 text-[13px] text-slate-500">Nothing with options matches that.</li>}
        {shown.map((r) => {
          const quote = quoteOf(r.symbol);
          return (
            <li key={r.symbol}>
              <button type="button" data-testid={`chain-result-${r.symbol}`} onClick={() => pick(r.symbol)} className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-slate-900">{r.symbol.replace(/^IDX /, "")}</span>
                  <span className="block truncate text-[12px] text-slate-500">{r.name}</span>
                </span>
                {quote.price != null && (
                  <span className="shrink-0 text-right font-mono text-[12px]">
                    <span className="block text-slate-800">{fmt(quote.price, typeOf(r.symbol))}</span>
                    {quote.pct != null && <span className={"block " + tone(quote.pct)}>{fmtSigned(quote.pct, 2, "%")}</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
