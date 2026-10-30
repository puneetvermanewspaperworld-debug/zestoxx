"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Search, Sparkles, X } from "lucide-react";
import Watchlist from "@/components/Watchlist";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { fmt, fmtINR, fmtOi } from "@/lib/helpers";
import { SYMBOLS, SYMBOL_MAP } from "@/lib/symbols";
import { useExpiryToday, useWatchRows } from "@/lib/useWatchlist";
import {
  MAX_LIST_NAME,
  MAX_SYMBOLS_PER_LIST,
  POPULAR_LISTS,
  PRIMARY_LIST,
  type PopularList,
  type WatchRow,
} from "@/lib/watchlists";

const tone = (n: number | null) => (n == null || n === 0 ? "text-slate-400" : n > 0 ? "text-emerald-500" : "text-rose-500");
const signed = (n: number | null, digits = 2) => (n == null ? "--" : (n > 0 ? "+" : "") + n.toFixed(digits));

type Tab = { kind: "explore" } | { kind: "primary" } | { kind: "list"; name: string };

/** Symbols the terminal can chart and paper-trade — everything else is a live quote only. */
const TRADEABLE_STOCKS = SYMBOLS.filter((s) => s.type === "stock").map((s) => s.id);

/* ------------------------------------------------------------- index cards -- */

function IndexCard({ id, expiryUnderlying }: { id: "NIFTY50" | "BANKNIFTY"; expiryUnderlying: string }) {
  const { live, chgFor, setSelected, setActiveView } = useZestoxx();
  const expiryToday = useExpiryToday(expiryUnderlying);
  const sym = SYMBOL_MAP[id];
  const price = live[id];
  const chg = chgFor(id);
  return (
    <button
      type="button"
      onClick={() => {
        setSelected(id);
        setActiveView("trade");
      }}
      className="flex-1 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-blue-300"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {id === "NIFTY50" ? "NIFTY 50" : "NIFTY BANK"}
        </span>
        {expiryToday && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-600">
            Expiry today
          </span>
        )}
      </div>
      <div className="mt-1.5 font-mono text-[18px] font-semibold text-slate-900">{fmt(price, sym.type)}</div>
      <div className={"font-mono text-[12px] " + tone(chg)}>{signed(chg)}%</div>
    </button>
  );
}

/* ------------------------------------------------------------------ tables -- */

function Th({ children, right = true, hide }: { children?: React.ReactNode; right?: boolean; hide?: boolean }) {
  return (
    <th className={"px-3 py-2 font-medium " + (right ? "text-right " : "text-left ") + (hide ? "hidden sm:table-cell" : "")}>
      {children}
    </th>
  );
}

/** A priced row, or a bare symbol while its quote hasn't arrived (custom lists). */
type DisplayRow = { symbol: string; name?: string; row?: WatchRow };

function WatchTable({
  rows,
  showRange,
  onRemove,
}: {
  rows: DisplayRow[];
  showRange?: "high" | "low";
  onRemove?: (symbol: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px] sm:min-w-[520px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <Th right={false}>Symbol</Th>
            <Th>LTP</Th>
            <Th hide>Chg</Th>
            <Th>Chg %</Th>
            {showRange ? <Th hide>{showRange === "high" ? "52W High" : "52W Low"}</Th> : <Th hide>Volume</Th>}
            {showRange && <Th hide>{showRange === "high" ? "Off high" : "Above low"}</Th>}
            {onRemove && <Th> </Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ symbol, name, row: r }) => {
            const rangeVal = r && showRange ? (showRange === "high" ? r.hi52 : r.lo52) : undefined;
            const gap =
              r && rangeVal
                ? showRange === "high"
                  ? ((rangeVal - r.ltp) / rangeVal) * 100
                  : ((r.ltp - rangeVal) / rangeVal) * 100
                : null;
            return (
              <tr key={symbol} className="border-b border-blue-50 hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  {SYMBOL_MAP[symbol] ? (
                    <Link href={`/app/trade/${symbol}`} className="font-medium text-blue-600 hover:underline">
                      {symbol}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{symbol}</span>
                  )}
                  <div className="max-w-[220px] truncate text-[10.5px] text-slate-400">{r?.name ?? name ?? ""}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-900">{r ? fmtINR(r.ltp) : "--"}</td>
                <td className={"hidden px-3 py-2.5 text-right font-mono sm:table-cell " + tone(r?.change ?? null)}>
                  {r ? signed(r.change) : "--"}
                </td>
                <td className={"px-3 py-2.5 text-right font-mono " + tone(r?.changePct ?? null)}>
                  {r ? `${signed(r.changePct)}${r.changePct == null ? "" : "%"}` : "--"}
                </td>
                {showRange ? (
                  <>
                    <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">
                      {rangeVal ? fmtINR(rangeVal) : "--"}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">
                      {gap == null ? "--" : `${gap.toFixed(2)}%`}
                    </td>
                  </>
                ) : (
                  <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">
                    {r ? fmtOi(r.volume) : "--"}
                  </td>
                )}
                {onRemove && (
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(symbol)}
                      aria-label={`Remove ${symbol}`}
                      className="text-slate-300 hover:text-rose-500"
                    >
                      <X size={14} />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="px-6 py-12 text-center text-[12.5px] text-slate-400">{children}</div>
);

const Skeleton = () => <div className="h-[260px] animate-pulse bg-slate-50" aria-busy="true" />;

const QUOTE_ONLY_NOTE = `Live NSE quotes. Charts and paper trading cover ${TRADEABLE_STOCKS.join(", ")} and the indices — click one of those to open it.`;

/* ---------------------------------------------------------- popular lists ---- */

function PopularGrid({ onOpen }: { onOpen: (l: PopularList) => void }) {
  return (
    <div className="p-4">
      <h3 className="font-display text-[13px] font-semibold text-slate-900">Popular Watchlists</h3>
      <p className="mb-3 text-[11.5px] text-slate-400">
        Curated by Zestoxx for browsing — not recommendations. Open one to see live prices, or save it as your own.
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {POPULAR_LISTS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onOpen(l)}
            className={
              "rounded-lg border p-3 text-left transition-colors hover:border-blue-300 " +
              (l.editorial ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-slate-900">{l.name}</span>
              {l.editorial ? (
                <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700">
                  <Sparkles size={10} /> Editorial
                </span>
              ) : l.kind.type !== "static" ? (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-emerald-600">
                  Live ranking
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-slate-500">{l.blurb}</p>
            {l.kind.type === "static" && (
              <p className="mt-1.5 text-[10.5px] text-slate-400">{l.kind.symbols.length} stocks</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function PopularDetail({ list, onBack, onSaved }: { list: PopularList; onBack: () => void; onSaved: (name: string) => void }) {
  const { createList } = useZestoxx();
  const { res } = useWatchRows(`list=${list.id}`);
  const [name, setName] = useState(list.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = res?.source === "live" ? res.rows : [];
  const showRange = list.kind.type === "high52" ? "high" : list.kind.type === "low52" ? "low" : undefined;

  const save = () => {
    const err = createList(name, rows.map((r) => r.symbol));
    if (err) setError(err);
    else onSaved(name.trim());
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-1 flex items-center gap-1 text-[11.5px] text-blue-600 hover:underline">
            <ArrowLeft size={12} /> Popular watchlists
          </button>
          <h3 className="font-display text-[15px] font-semibold text-slate-900">{list.name}</h3>
          <p className="text-[11.5px] text-slate-400">{list.blurb}</p>
        </div>
        {rows.length > 0 &&
          (saving ? (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5">
                <input
                  aria-label="Watchlist name"
                  value={name}
                  maxLength={MAX_LIST_NAME}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  className="w-40 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12px] text-slate-900 outline-none focus:border-blue-400"
                />
                <button type="button" onClick={save} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[12px] font-medium text-white">
                  Save
                </button>
                <button type="button" onClick={() => setSaving(false)} className="text-[12px] text-slate-500">
                  Cancel
                </button>
              </div>
              {error && <span className="text-[11px] text-rose-500">{error}</span>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSaving(true)}
              className="flex items-center gap-1 rounded-md border border-blue-200 px-2.5 py-1.5 text-[12px] font-medium text-blue-600 hover:bg-blue-50"
            >
              <Plus size={13} /> Save as my watchlist
            </button>
          ))}
      </div>
      {res === null ? (
        <Skeleton />
      ) : res.source === "unavailable" ? (
        <Empty>
          Live prices aren&apos;t available right now — Upstox didn&apos;t answer. If this keeps happening on your own
          deployment, check that <code>UPSTOX_ANALYTICS_TOKEN</code> is set.
        </Empty>
      ) : rows.length === 0 ? (
        <Empty>Nothing to show yet — the market may not have opened.</Empty>
      ) : (
        <>
          <WatchTable rows={rows.map((r) => ({ symbol: r.symbol, row: r }))} showRange={showRange} />
          <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400">
            {res.note && <>{res.note} </>}
            {QUOTE_ONLY_NOTE}
          </p>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- custom lists ---- */

function AddSymbol({ listName, taken }: { listName: string; taken: string[] }) {
  const { addToList } = useZestoxx();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/watchlist-search?q=${encodeURIComponent(term)}`);
        const data = r.ok ? await r.json() : { results: [] };
        if (!cancelled) setResults(data.results ?? []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const shown = q.trim() ? results.filter((r) => !taken.includes(r.symbol)) : [];

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
        <Search size={14} className="text-slate-400" />
        <input
          aria-label="Search NSE symbols to add"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setError(null);
          }}
          placeholder="Search any NSE stock or ETF…"
          className="w-full bg-transparent text-[13px] text-slate-900 placeholder-slate-400 outline-none"
        />
      </div>
      {error && <div className="mt-1 text-[11.5px] text-rose-500">{error}</div>}
      {shown.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {shown.map((r) => (
            <button
              key={r.symbol}
              type="button"
              onClick={() => {
                const err = addToList(listName, r.symbol);
                setError(err);
                if (!err) setQ("");
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[12px] hover:bg-blue-50"
            >
              <span className="min-w-0">
                <span className="font-medium text-slate-900">{r.symbol}</span>
                <span className="ml-2 truncate text-[10.5px] text-slate-400">{r.name}</span>
              </span>
              <Plus size={13} className="shrink-0 text-blue-600" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomListPanel({ name, onDeleted }: { name: string; onDeleted: () => void }) {
  const { lists, removeFromList, deleteList } = useZestoxx();
  const list = lists.find((l) => l.name === name);
  const symbols = useMemo(() => list?.symbols ?? [], [list]);
  const [confirming, setConfirming] = useState(false);
  const { res } = useWatchRows(symbols.length ? `symbols=${symbols.map(encodeURIComponent).join(",")}` : null);

  if (!list) return null;
  const byDisplay = new Map(res?.source === "live" ? res.rows.map((r) => [r.symbol, r]) : []);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div className="min-w-[220px] flex-1">
          <AddSymbol listName={name} taken={symbols} />
          <p className="mt-1 text-[11px] text-slate-400">
            {symbols.length}/{MAX_SYMBOLS_PER_LIST} symbols
          </p>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-slate-500">Delete &ldquo;{name}&rdquo;?</span>
            <button
              type="button"
              onClick={() => {
                deleteList(name);
                onDeleted();
              }}
              className="rounded-md bg-rose-500 px-2.5 py-1.5 font-medium text-white"
            >
              Delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-slate-500">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="text-[12px] text-slate-400 hover:text-rose-500">
            Delete list
          </button>
        )}
      </div>
      {symbols.length === 0 ? (
        <Empty>This watchlist is empty. Search above to add a stock or ETF, or save one from Explore.</Empty>
      ) : res === null ? (
        <Skeleton />
      ) : (
        <>
          {res.source === "unavailable" && (
            <p className="border-b border-slate-100 px-4 py-2 text-[11.5px] text-amber-600">
              Live prices aren&apos;t available right now, so prices show as &ldquo;--&rdquo;.
            </p>
          )}
          <WatchTable
            rows={symbols.map((s) => ({ symbol: s, row: byDisplay.get(s) }))}
            onRemove={(s) => removeFromList(name, s)}
          />
          <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400">{QUOTE_ONLY_NOTE}</p>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- the view ---- */

export default function WatchlistView() {
  const { watchlist, selected, setSelected, addToWatchlist, removeFromWatchlist, live, lists, createList, setActiveView } =
    useZestoxx();
  const [tab, setTab] = useState<Tab>({ kind: "explore" });
  const [popular, setPopular] = useState<PopularList | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // A tab for a list that no longer exists (just deleted) falls back to Explore.
  const active: Tab = tab.kind === "list" && !lists.some((l) => l.name === tab.name) ? { kind: "explore" } : tab;
  const isActive = (t: Tab) => active.kind === t.kind && (t.kind !== "list" || (active.kind === "list" && active.name === t.name));

  const tabClass = (on: boolean) =>
    "shrink-0 border-b-2 px-3 py-2.5 text-[12.5px] font-medium whitespace-nowrap " +
    (on ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-900");

  const submitCreate = () => {
    const err = createList(newName);
    if (err) {
      setCreateError(err);
      return;
    }
    setTab({ kind: "list", name: newName.trim() });
    setCreating(false);
    setNewName("");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <IndexCard id="NIFTY50" expiryUnderlying="NIFTY" />
        <IndexCard id="BANKNIFTY" expiryUnderlying="BANKNIFTY" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div role="tablist" aria-label="Watchlists" className="flex items-center overflow-x-auto border-b border-slate-200 px-2">
          <button
            role="tab"
            type="button"
            aria-selected={isActive({ kind: "explore" })}
            onClick={() => {
              setTab({ kind: "explore" });
              setPopular(null);
            }}
            className={tabClass(isActive({ kind: "explore" }))}
          >
            Explore
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={isActive({ kind: "primary" })}
            onClick={() => setTab({ kind: "primary" })}
            className={tabClass(isActive({ kind: "primary" }))}
          >
            {PRIMARY_LIST}
          </button>
          {lists.map((l) => (
            <button
              key={l.name}
              role="tab"
              type="button"
              aria-selected={isActive({ kind: "list", name: l.name })}
              onClick={() => setTab({ kind: "list", name: l.name })}
              className={tabClass(isActive({ kind: "list", name: l.name }))}
            >
              {l.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setCreateError(null);
            }}
            className="flex shrink-0 items-center gap-1 px-3 py-2.5 text-[12.5px] font-medium whitespace-nowrap text-blue-600 hover:underline"
          >
            <Plus size={13} /> Create Watchlist
          </button>
        </div>

        {creating && (
          <div className="border-b border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                aria-label="New watchlist name"
                value={newName}
                maxLength={MAX_LIST_NAME}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setCreateError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Watchlist name"
                className="w-56 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none focus:border-blue-400"
              />
              <button type="button" onClick={submitCreate} className="rounded-md bg-blue-600 px-3 py-1.5 text-[12.5px] font-medium text-white">
                Create
              </button>
              <button type="button" onClick={() => setCreating(false)} className="text-[12.5px] text-slate-500">
                Cancel
              </button>
            </div>
            {createError && <div className="mt-1.5 text-[11.5px] text-rose-500">{createError}</div>}
          </div>
        )}

        <div role="tabpanel">
          {active.kind === "explore" &&
            (popular ? (
              <PopularDetail
                key={popular.id}
                list={popular}
                onBack={() => setPopular(null)}
                onSaved={(name) => {
                  setPopular(null);
                  setTab({ kind: "list", name });
                }}
              />
            ) : (
              <PopularGrid onOpen={setPopular} />
            ))}
          {active.kind === "primary" && (
            <div className="p-2">
              <p className="px-2 pb-2 pt-1 text-[11.5px] text-slate-400">
                Your main watchlist — the one in the terminal sidebar. Click a symbol to open its chart and trade it.
              </p>
              <Watchlist
                watchlist={watchlist}
                selected={selected}
                onSelect={(id) => {
                  setSelected(id);
                  setActiveView("trade");
                }}
                onAdd={addToWatchlist}
                onRemove={removeFromWatchlist}
                live={live}
              />
            </div>
          )}
          {active.kind === "list" && (
            <CustomListPanel key={active.name} name={active.name} onDeleted={() => setTab({ kind: "explore" })} />
          )}
        </div>
      </div>
    </div>
  );
}
