"use client";

import React, { useEffect, useState } from "react";
import { Search, Plus, X } from "lucide-react";
import { SYMBOLS } from "@/lib/symbols";
import { fmt } from "@/lib/helpers";
import { useRowQuotes } from "@/components/phone/useRowQuotes";
import type { SearchResult } from "@/lib/watchlists";

interface WatchlistProps {
  watchlist: string[];
  selected: string;
  onSelect: (id: string) => void;
  /** Returns an error message (a full list, a symbol the terminal cannot trade), or null when added. */
  onAdd: (id: string) => string | null;
  onRemove: (id: string) => void;
  compact?: boolean;
}

/** An instrument's name while a search result or a row has none yet. */
const nameOf = (symbol: string, names: Record<string, string>) => names[symbol] ?? symbol;

/**
 * The terminal's main list: any NSE stock or ETF from the instrument list (searched by name or symbol, beyond the twelve the terminal was built
 * around), each with its live price and day change. Indices other than the built-in ones cannot be charted or traded here, so the search does not offer them.
 */
export default function Watchlist({ watchlist, selected, onSelect, onAdd, onRemove, compact }: WatchlistProps) {
  const quotes = useRowQuotes(watchlist);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  // the rest of the instrument list: asked for once two characters are typed, not on every key
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/watchlist-search?q=${encodeURIComponent(term)}`);
        const data = r.ok ? await r.json() : { results: [] };
        if (!cancelled) setRemote(data.results ?? []);
      } catch {
        if (!cancelled) setRemote([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const term = q.trim().toLowerCase();
  const builtIn = SYMBOLS.filter((s) => !watchlist.includes(s.id) && term && (s.id.toLowerCase().includes(term) || s.name.toLowerCase().includes(term))).map((s) => ({ id: s.id, name: s.name }));
  const seen = new Set(builtIn.map((o) => o.id));
  const fromList = (term.length >= 2 ? remote : [])
    .filter((r) => r.kind !== "index" && !watchlist.includes(r.symbol) && !seen.has(r.symbol))
    .map((r) => ({ id: r.symbol, name: r.name }));
  const options = [...builtIn, ...fromList].slice(0, 12);

  return (
    <div className="flex h-full flex-col">
      {!compact && (
        <div className="px-3 pb-2 pt-3">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <Search size={14} className="text-slate-400" />
            <input
              value={q}
              onChange={(e) => (setQ(e.target.value), setMessage(null))}
              placeholder="Add any NSE stock or ETF..."
              aria-label="Add a stock or ETF to the watchlist"
              data-testid="sidebar-search"
              className="w-full bg-transparent text-[13px] text-slate-900 placeholder-slate-400 outline-none"
            />
          </div>
          {message && (
            <p role="alert" data-testid="sidebar-search-message" className="mt-1 text-[11.5px] text-rose-500">
              {message}
            </p>
          )}
          {q && options.length > 0 && (
            <div data-testid="sidebar-results" className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50">
              {options.map((o) => (
                <button
                  key={o.id}
                  data-testid={`sidebar-result-${o.id}`}
                  onClick={() => {
                    const err = onAdd(o.id);
                    if (err) return setMessage(err);
                    setQ("");
                    setRemote([]);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] text-slate-900 hover:bg-blue-50"
                >
                  <span className="min-w-0">
                    <span className="block">{o.id}</span>
                    <span className="block truncate text-[10.5px] text-slate-400">{nameOf(o.id, { [o.id]: o.name })}</span>
                  </span>
                  <Plus size={13} className="shrink-0 text-blue-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {watchlist.map((id) => {
          const row = quotes[id];
          const isSel = id === selected;
          const chg = row?.changePct ?? null;
          return (
            <div
              key={id}
              data-testid={`sidebar-row-${id}`}
              onClick={() => onSelect(id)}
              className={
                "group mb-1 flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 " +
                (isSel ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50")
              }
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-slate-900">{id}</div>
                {!compact && <div className="truncate text-[10.5px] text-slate-400">{row?.name ?? id}</div>}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-mono text-[12.5px] text-slate-900">{row?.price == null ? "--" : fmt(row.price, row.type)}</div>
                  <div className={"font-mono text-[11px] " + (chg == null ? "text-slate-400" : chg >= 0 ? "text-emerald-500" : "text-rose-500")}>
                    {chg == null ? "--" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}
                  </div>
                </div>
                {!compact && (
                  <button
                    aria-label={`Remove ${id} from the watchlist`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(id);
                    }}
                    className="opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                  >
                    <X size={13} className="text-slate-400 hover:text-rose-500" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
