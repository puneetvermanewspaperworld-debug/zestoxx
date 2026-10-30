"use client";

import React from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { typeOf } from "@/lib/symbols";
import { displayName } from "@/lib/contract";
import { fmt, fmtINR } from "@/lib/helpers";

export default function PortfolioView() {
  const { cash, holdings, live } = useZestoxx();
  const rows = Object.entries(holdings);
  // An option contract with no mark yet (feed still loading) counts at cost, not NaN.
  const markOf = (id: string, avg: number) => live[id] ?? avg;
  const holdingsValue = rows.reduce((sum, [id, h]) => sum + h.qty * markOf(id, h.avgPrice), 0);
  const totalPnl = rows.reduce((sum, [id, h]) => sum + (markOf(id, h.avgPrice) - h.avgPrice) * h.qty, 0);
  const totalValue = cash + holdingsValue;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            ["Virtual Cash", fmtINR(cash), "text-slate-900"],
            ["Holdings Value", fmtINR(holdingsValue), "text-slate-900"],
            ["Total Value", fmtINR(totalValue), "text-slate-900"],
            [
              "Unrealised P&L",
              (totalPnl >= 0 ? "+" : "") + fmtINR(totalPnl),
              totalPnl >= 0 ? "text-emerald-500" : "text-rose-500",
            ],
          ] as const
        ).map(([label, val, cls], i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[10.5px] uppercase tracking-wide text-slate-400">{label}</div>
            <div className={"mt-1 font-mono text-[16px] font-semibold " + cls}>{val}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 font-display text-[13px] font-semibold text-slate-900">
          Holdings Allocation
        </h3>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-slate-400">
            No positions yet — place a paper trade from the Trade view to get started.
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map(([id, h]) => {
              const mark = markOf(id, h.avgPrice);
              const val = h.qty * mark;
              const pct = (val / holdingsValue) * 100;
              const pnl = (mark - h.avgPrice) * h.qty;
              return (
                <div key={id}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="font-medium text-slate-900">
                      {displayName(id)}{" "}
                      <span className="text-slate-400">
                        · {h.qty} qty @ avg {fmt(h.avgPrice, typeOf(id))}
                      </span>
                    </span>
                    <span
                      className={"font-mono " + (pnl >= 0 ? "text-emerald-500" : "text-rose-500")}
                    >
                      {pnl >= 0 ? "+" : ""}
                      {fmtINR(pnl)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-50">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
