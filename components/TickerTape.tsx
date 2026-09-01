"use client";

import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { SYMBOL_MAP } from "@/lib/symbols";
import { fmt } from "@/lib/helpers";
import { useZestoxx } from "@/components/ZestoxxProvider";

export default function TickerTape() {
  const { watchlist, live, chgFor } = useZestoxx();
  const items = watchlist.map((id) => {
    const sym = SYMBOL_MAP[id];
    return { id, price: live[id], chg: chgFor(id), type: sym.type };
  });
  const loop = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-slate-200 bg-slate-50">
      <div className="flex w-max animate-[ticker_30s_linear_infinite] gap-8 py-2 px-4">
        {loop.map((it, i) => (
          <div key={i} className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span className="text-[11px] font-semibold tracking-wide text-slate-500">{it.id}</span>
            <span className="font-mono text-[13px] text-slate-900">{fmt(it.price, it.type)}</span>
            <span
              className={
                "flex items-center gap-0.5 font-mono text-[12px] " +
                (it.chg >= 0 ? "text-emerald-500" : "text-rose-500")
              }
            >
              {it.chg >= 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {it.chg >= 0 ? "+" : ""}
              {it.chg.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
