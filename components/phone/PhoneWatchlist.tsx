"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { fmt, fmtSigned } from "@/lib/helpers";
import { MAX_LIST_NAME, MAX_SYMBOLS_PER_LIST, PRIMARY_LIST, type SearchResult } from "@/lib/watchlists";
import SymbolSheet from "./SymbolSheet";
import { useRowQuotes } from "./useRowQuotes";

const tone = (n: number | null) => (n == null || n === 0 ? "text-slate-500" : n > 0 ? "text-emerald-600" : "text-rose-500");

/**
 * The phone's home screen: your watchlists (stored in your paper account), a search that adds any NSE equity, ETF or index (and shows which
 * have futures and options) to the open list, a count for the list, a New list action, and live price and change on every row. Edit moves
 * rows up and down or removes them. Tapping a row opens its sheet.
 */
export default function PhoneWatchlist() {
  const { watchlist, lists, createList, deleteList, addToAnyList, removeFromAnyList, moveInList } = useZestoxx();
  const names = useMemo(() => [PRIMARY_LIST, ...lists.map((l) => l.name)], [lists]);
  const [current, setCurrent] = useState(PRIMARY_LIST);
  const active = names.includes(current) ? current : PRIMARY_LIST;
  const symbols = active === PRIMARY_LIST ? watchlist : (lists.find((l) => l.name === active)?.symbols ?? []);
  const quotes = useRowQuotes(symbols);
  const [editing, setEditing] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="-mt-3 space-y-2" data-testid="phone-watchlist">
      <h1 className="sr-only">Watchlist</h1>
      {/* the lists: a strip 36 px tall; each chip is 28 px and keeps a 44 px tap area */}
      <div className="flex h-[var(--tab-strip)] items-center gap-1.5">
        <div role="tablist" aria-label="Watchlists" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {names.map((n) => (
            <button key={n} type="button" role="tab" data-compact aria-selected={active === n} data-testid={`wl-tab-${n}`} onClick={() => (setCurrent(n), setEditing(false), setConfirmDelete(false))} className={"h-[var(--chip-h)] shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium " + (active === n ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600")}>
              {n}
            </button>
          ))}
        </div>
        <button type="button" data-compact onClick={() => (setCreating((v) => !v), setCreateError(null))} aria-expanded={creating} data-testid="wl-new" className="flex h-[var(--chip-h)] shrink-0 items-center gap-1 rounded-full border border-dashed border-blue-300 px-3 text-[13px] font-medium text-blue-700">
          <Plus size={13} aria-hidden /> New list
        </button>
      </div>

      <AddSearch listName={active} taken={symbols} onAdd={(sym) => addToAnyList(active, sym)} full={symbols.length >= MAX_SYMBOLS_PER_LIST} />

      {creating && (
        <form
          data-testid="wl-new-form"
          className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const err = createList(newName);
            if (err) return setCreateError(err);
            setCurrent(newName.trim());
            setNewName("");
            setCreating(false);
          }}
        >
          <label htmlFor="wl-name" className="text-[12px] text-slate-500">
            Name of the new list
          </label>
          <div className="flex gap-2">
            <input id="wl-name" data-testid="wl-name" value={newName} maxLength={MAX_LIST_NAME} onChange={(e) => (setNewName(e.target.value), setCreateError(null))} placeholder="e.g. Banks" className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[14px] outline-none focus:border-blue-400" />
            <button type="submit" data-testid="wl-create" className="min-h-[44px] rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white">
              Create
            </button>
          </div>
          {createError && <p role="alert" data-testid="wl-create-error" className="text-[12px] text-rose-500">{createError}</p>}
        </form>
      )}

      <div className="flex h-[var(--control-row)] items-center justify-between px-1 text-[12px] text-slate-500">
        <span data-testid="wl-count" aria-label={`${symbols.length} of ${MAX_SYMBOLS_PER_LIST} symbols`}>
          {symbols.length}/{MAX_SYMBOLS_PER_LIST}
        </span>
        <span className="flex items-center gap-2">
        {editing && active !== PRIMARY_LIST && (
          <span className="flex items-center gap-2">
            {confirmDelete ? (
              <>
                <button type="button" data-testid="wl-delete-confirm" onClick={() => (deleteList(active), setCurrent(PRIMARY_LIST), setConfirmDelete(false), setEditing(false))} className="min-h-[44px] rounded-lg bg-rose-600 px-3 text-[12.5px] font-semibold text-white">
                  Delete {active}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-[12.5px] text-slate-600">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" data-compact data-testid="wl-delete" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 rounded-lg px-2 text-[12.5px] text-rose-600">
                <Trash2 size={14} aria-hidden /> Delete this list
              </button>
            )}
          </span>
        )}
        <button type="button" data-compact onClick={() => (setEditing((v) => !v), setConfirmDelete(false))} aria-pressed={editing} data-testid="wl-edit" className={"flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium " + (editing ? "bg-blue-50 text-blue-700" : "text-blue-700")}>
          <Pencil size={13} aria-hidden /> {editing ? "Done" : "Edit"}
        </button>
        </span>
      </div>

      {symbols.length === 0 ? (
        <p data-testid="wl-empty" className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-[13px] text-slate-500">
          Nothing here yet. Search above for a stock, ETF or index and tap it to add it to {active}.
        </p>
      ) : (
        <ul className="-mx-3 border-y border-slate-200 bg-white" data-testid="wl-rows">
          {symbols.map((s, i) => {
            const q = quotes[s];
            return (
              <li key={s} data-testid={`wl-row-${s}`} className="flex items-center border-b border-slate-200 last:border-b-0">
                <button type="button" onClick={() => !editing && setOpened(s)} data-testid={`wl-open-${s}`} disabled={editing} className="flex min-h-[var(--row-min)] min-w-0 flex-1 items-center justify-between gap-3 px-4 text-left disabled:cursor-default">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-normal leading-tight text-slate-900">{s.replace(/^IDX /, "")}</span>
                    <span className="mt-1 block truncate text-[12px] leading-tight text-slate-500">{q.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span data-testid={`wl-price-${s}`} className={"block font-mono text-[15px] font-normal leading-tight " + tone(q.changePct)}>
                      {q.price == null ? "--" : fmt(q.price, q.type)}
                    </span>
                    <span data-testid={`wl-chg-${s}`} className={"mt-1 block font-mono text-[13px] leading-tight " + tone(q.changePct)}>
                      {q.changePct == null ? "--" : fmtSigned(q.changePct, 2, "%")}
                    </span>
                  </span>
                </button>
                {editing && (
                  <span className="flex shrink-0 items-center">
                    <button type="button" aria-label={`Move ${s} up`} disabled={i === 0} onClick={() => moveInList(active, s, -1)} data-testid={`wl-up-${s}`} className="flex h-11 w-11 items-center justify-center text-slate-600 disabled:opacity-30">
                      <ArrowUp size={17} aria-hidden />
                    </button>
                    <button type="button" aria-label={`Move ${s} down`} disabled={i === symbols.length - 1} onClick={() => moveInList(active, s, 1)} data-testid={`wl-down-${s}`} className="flex h-11 w-11 items-center justify-center text-slate-600 disabled:opacity-30">
                      <ArrowDown size={17} aria-hidden />
                    </button>
                    <button type="button" aria-label={`Remove ${s} from ${active}`} onClick={() => removeFromAnyList(active, s)} data-testid={`wl-remove-${s}`} className="flex h-11 w-11 items-center justify-center text-rose-500">
                      <X size={18} aria-hidden />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {opened && quotes[opened] && <SymbolSheet symbol={opened} quote={quotes[opened]} onClose={() => setOpened(null)} />}
    </div>
  );
}

/** The search field: type a name or symbol, and tap a result to add it to the open list. */
function AddSearch({ listName, taken, onAdd, full }: { listName: string; taken: string[]; onAdd: (symbol: string) => string | null; full: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

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

  const shown = q.trim() ? results : [];
  return (
    <div className="relative" data-testid="wl-search">
      <div className="flex h-[var(--search-h)] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
        <Search size={16} className="shrink-0 text-slate-400" aria-hidden />
        <input aria-label="Search stocks, ETFs and indices to add" data-testid="wl-search-input" value={q} onChange={(e) => (setQ(e.target.value), setMessage(null))} placeholder="Search stocks, ETFs, indices…" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="min-h-[44px] w-full bg-transparent text-[14px] text-slate-900 placeholder-slate-400 outline-none" />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => (setQ(""), setResults([]))} data-compact className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400">
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} data-testid="wl-search-message" className={"mt-1 px-1 text-[12px] " + (message.kind === "error" ? "text-rose-500" : "text-emerald-600")}>
          {message.text}
        </p>
      )}
      {shown.length > 0 && (
        <ul data-testid="wl-results" className="absolute left-1/2 top-full z-40 mt-2 max-h-[60dvh] w-screen -translate-x-1/2 overflow-y-auto border-y border-slate-200 bg-white shadow-md">
          {shown.map((r) => {
            const have = taken.includes(r.symbol);
            return (
              <li key={r.symbol}>
                <button
                  type="button"
                  disabled={have || full}
                  data-testid={`wl-result-${r.symbol}`}
                  onClick={() => {
                    const err = onAdd(r.symbol);
                    setMessage(err ? { kind: "error", text: err } : { kind: "ok", text: `${r.symbol.replace(/^IDX /, "")} added to ${listName}.` });
                    if (!err) {
                      setQ("");
                      setResults([]);
                    }
                  }}
                  className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 text-left disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-slate-900">{r.symbol.replace(/^IDX /, "")}</span>
                    <span className="block truncate text-[11.5px] text-slate-400">{r.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {r.kind !== "equity" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{r.kind === "etf" ? "ETF" : "Index"}</span>}
                    {r.fno && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">F&amp;O</span>}
                    <span className="text-[12px] font-semibold text-blue-600">{have ? "Added" : "Add"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

