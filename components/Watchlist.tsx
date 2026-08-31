"use client";

import React, { useState } from "react";
import { Search, Plus, X } from "lucide-react";
import { SYMBOLS, SYMBOL_MAP } from "@/lib/symbols";
import { fmt } from "@/lib/helpers";
import type { Candle } from "@/lib/types";

interface WatchlistProps {
  watchlist: string[];
  selected: string;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  live: Record<string, number>;
  histories: Record<string, Candle[]>;
  compact?: boolean;
}

export default function Watchlist({
  watchlist,
  selected,
  onSelect,
  onAdd,
  onRemove,
  live,
  histories,
  compact,
}: WatchlistProps) {
  const [q, setQ] = useState("");
  const options = SYMBOLS.filter(
    (s) =>
      !watchlist.includes(s.id) &&
      (s.id.toLowerCase().includes(q.toLowerCase()) ||
        s.name.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div className="flex h-full flex-col">
      {!compact && (
        <div className="px-3 pb-2 pt-3">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <Search size={14} className="text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Add symbol..."
              className="w-full bg-transparent text-[13px] text-slate-900 placeholder-slate-400 outline-none"
            />
          </div>
          {q && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50">
              {options.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-slate-400">No matches</div>
              )}
              {options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    onAdd(o.id);
                    setQ("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] text-slate-900 hover:bg-blue-50"
                >
                  <span>{o.id}</span>
                  <Plus size={13} className="text-blue-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {watchlist.map((id) => {
          const sym = SYMBOL_MAP[id];
          const price = live[id];
          const open = histories[id]?.[0]?.open ?? price;
          const chg = ((price - open) / open) * 100;
          const isSel = id === selected;
          return (
            <div
              key={id}
              onClick={() => onSelect(id)}
              className={
                "group mb-1 flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 " +
                (isSel ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50")
              }
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-slate-900">{id}</div>
                {!compact && <div className="truncate text-[10.5px] text-slate-400">{sym.name}</div>}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-mono text-[12.5px] text-slate-900">{fmt(price, sym.type)}</div>
                  <div
                    className={
                      "font-mono text-[11px] " +
                      (chg >= 0 ? "text-emerald-500" : "text-rose-500")
                    }
                  >
                    {chg >= 0 ? "+" : ""}
                    {chg.toFixed(2)}%
                  </div>
                </div>
                {!compact && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(id);
                    }}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
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
