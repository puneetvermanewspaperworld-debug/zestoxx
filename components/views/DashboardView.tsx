"use client";

import React from "react";
import CandleChart from "@/components/CandleChart";
import Chip from "@/components/Chip";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOLS, SYMBOL_MAP, NEWS } from "@/lib/symbols";
import { fmt, fmtINR } from "@/lib/helpers";

export default function DashboardView() {
  const { watchlist, live, histories, cash, holdings, selected, setSelected, setActiveView, chgFor } =
    useZestoxx();

  const holdingsValue = Object.entries(holdings).reduce(
    (s, [id, h]) => s + h.qty * (live[id] || 0),
    0
  );
  const totalPnl = Object.entries(holdings).reduce(
    (s, [id, h]) => s + (live[id] - h.avgPrice) * h.qty,
    0
  );
  const movers = SYMBOLS.map((s) => ({ ...s, chg: chgFor(s.id) })).sort((a, b) => b.chg - a.chg);
  const gainers = movers.slice(0, 3),
    losers = movers.slice(-3).reverse();
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
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 font-display text-[13px] font-semibold text-slate-900">Market Movers</h3>
          <div className="mb-2 text-[10.5px] uppercase tracking-wide text-emerald-500">Top Gainers</div>
          {gainers.map((g) => (
            <div
              key={g.id}
              onClick={() => {
                setSelected(g.id);
                setActiveView("trade");
              }}
              className="flex cursor-pointer justify-between py-1 text-[12px] hover:text-blue-600"
            >
              <span>{g.id}</span>
              <span className="font-mono text-emerald-500">+{g.chg.toFixed(2)}%</span>
            </div>
          ))}
          <div className="mb-2 mt-3 text-[10.5px] uppercase tracking-wide text-rose-500">Top Losers</div>
          {losers.map((g) => (
            <div
              key={g.id}
              onClick={() => {
                setSelected(g.id);
                setActiveView("trade");
              }}
              className="flex cursor-pointer justify-between py-1 text-[12px] hover:text-blue-600"
            >
              <span>{g.id}</span>
              <span className="font-mono text-rose-500">{g.chg.toFixed(2)}%</span>
            </div>
          ))}
        </div>
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
                    {chg >= 0 ? "+" : ""}
                    {chg.toFixed(2)}%
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
          {NEWS.slice(0, 3).map((n, i) => (
            <div key={i} className="mb-2 border-b border-blue-50 pb-2 last:border-0">
              <div className="text-[12px] leading-snug text-slate-900">{n.h}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-slate-400">
                <Chip tone="gold">{n.tag}</Chip>
                {n.t}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
