"use client";

import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { fmt } from "@/lib/helpers";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { useRowQuotes } from "@/components/phone/useRowQuotes";

export default function TickerTape() {
  const { watchlist } = useZestoxx();
  const quotes = useRowQuotes(watchlist);
  const items = watchlist.map((id) => ({ id, price: quotes[id]?.price ?? null, chg: quotes[id]?.changePct ?? null, type: quotes[id]?.type ?? ("stock" as const) }));
  const loop = [...items, ...items];
  return (
    <div className="ticker-strip relative h-8 shrink-0 overflow-hidden border-y border-slate-200 bg-slate-50 md:h-auto">
      <div className="flex h-full w-max animate-[ticker_30s_linear_infinite] items-center gap-8 px-4 md:py-2">
        {loop.map((it, i) => (
          <div key={i} className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span className="text-[11px] font-semibold tracking-wide text-slate-500">{it.id}</span>
            <span className="font-mono text-[13px] text-slate-900">{it.price == null ? "--" : fmt(it.price, it.type)}</span>
            <span
              className={
                "flex items-center gap-0.5 font-mono text-[12px] " +
                (it.chg == null ? "text-slate-400" : it.chg >= 0 ? "text-emerald-500" : "text-rose-500")
              }
            >
              {it.chg == null ? (
                "--"
              ) : (
                <>
                  {it.chg >= 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {it.chg >= 0 ? "+" : ""}
                  {it.chg.toFixed(2)}%
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
