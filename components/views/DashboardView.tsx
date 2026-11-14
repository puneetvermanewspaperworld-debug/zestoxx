"use client";

import React from "react";
import CandleChart from "@/components/CandleChart";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { FiiDiiSummaryCard, FuturesGainersCard, MarketMoversCard } from "@/components/DashboardCards";
import { SYMBOL_MAP } from "@/lib/symbols";
import { fmt, fmtINR, fmtSigned } from "@/lib/helpers";
import { NEWS_NOT_CONNECTED } from "@/lib/news";

export default function DashboardView() {
  const { watchlist, live, histories, cash, holdings, selected, setSelected, setActiveView, chgFor } =
    useZestoxx();

  const holdingsValue = Object.entries(holdings).reduce(
    (s, [id, h]) => s + h.qty * (live[id] ?? h.avgPrice),
    0
  );
  const totalPnl = Object.entries(holdings).reduce(
    (s, [id, h]) => s + ((live[id] ?? h.avgPrice) - h.avgPrice) * h.qty,
    0
  );
  const sym = SYMBOL_MAP[selected];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate-500">Total Value</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-slate-900">
              {fmtINR(cash + holdingsValue)}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate-500">Virtual Cash</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-slate-900">{fmtINR(cash)}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate-500">Unrealised P&amp;L</div>
            <div
              className={
                "mt-1 font-mono text-[20px] font-semibold " +
                (totalPnl >= 0 ? "text-emerald-500" : "text-rose-500")
              }
            >
              {totalPnl >= 0 ? "+" : ""}
              {fmtINR(totalPnl)}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate-500">Positions</div>
            <div className="mt-1 font-mono text-[20px] font-semibold text-slate-900">
              {Object.keys(holdings).length}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-[13px] font-semibold text-slate-900">
              {selected} <span className="text-[11px] font-normal text-slate-400">{sym.name}</span>
            </h3>
            <button
              onClick={() => setActiveView("trade")}
              className="text-[11.5px] font-medium text-blue-600 hover:underline"
            >
              Open chart →
            </button>
          </div>
          <div className="h-[220px]">
            <CandleChart candles={histories[selected].slice(-40)} showMA={false} showVolume={false} />
          </div>
        </div>
        <MarketMoversCard />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FuturesGainersCard />
        <FiiDiiSummaryCard />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-[13px] font-semibold text-slate-900">Watchlist</h3>
            <button
              onClick={() => setActiveView("trade")}
              className="text-[11.5px] font-medium text-blue-600 hover:underline"
            >
              View all →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {watchlist.map((id) => {
              const s = SYMBOL_MAP[id];
              const chg = chgFor(id);
              return (
                <div
                  key={id}
                  onClick={() => {
                    setSelected(id);
                    setActiveView("trade");
                  }}
                  className="cursor-pointer rounded-md border border-slate-200 p-2 hover:bg-slate-50"
                >
                  <div className="text-[12px] font-medium text-slate-900">{id}</div>
                  <div className="font-mono text-[12px] text-slate-500">{fmt(live[id], s.type)}</div>
                  <div
                    className={
                      "font-mono text-[11px] " + (chg >= 0 ? "text-emerald-500" : "text-rose-500")
                    }
                  >
                    {fmtSigned(chg, 2, "%")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-[13px] font-semibold text-slate-900">Latest News</h3>
            <button
              onClick={() => setActiveView("news")}
              className="text-[11.5px] font-medium text-blue-600 hover:underline"
            >
              More →
            </button>
          </div>
          <p className="py-3 text-[12px] text-slate-500">{NEWS_NOT_CONNECTED}</p>
        </div>
      </div>
    </div>
  );
}
