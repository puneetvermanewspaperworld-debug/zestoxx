"use client";

import React from "react";
import { displayName } from "@/lib/contract";
import { fmt, fmtINR, fmtIsoDate } from "@/lib/helpers";
import { typeOf } from "@/lib/symbols";
import type { Holdings, OpenOrder } from "@/lib/types";
import { usePrivacy } from "@/components/usePrivacy";
import { maskPnl } from "@/lib/privacy";

/** The ids of the holdings that belong to a symbol's chart: the symbol itself, and the option contracts on it ("NIFTY 17 NOV 25500 CE" for NIFTY50). */
export function positionIdsFor(symbol: string, holdings: Holdings): string[] {
  const name = symbol === "NIFTY50" ? "NIFTY" : symbol;
  return Object.keys(holdings).filter((id) => holdings[id].qty > 0 && (id === symbol || displayName(id).startsWith(`${name} `)));
}

/** The resting (limit and good-till-date) orders for this symbol, with a cancel button. Market orders fill at once, so they are never open. */
export function OpenOrdersTab({ symbol, orders, onCancel, recent }: { symbol: string; orders: OpenOrder[]; onCancel: (id: number) => void; /** the finished orders for the symbol, under the open ones */ recent: React.ReactNode }) {
  return (
    <div className="space-y-3" data-testid="open-orders">
      {orders.length === 0 ? (
        <p data-testid="no-open-orders" className="rounded-lg bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
          No open orders for {symbol}. Market orders fill at once at the last price; a limit or good-till-date order waits here until it is reached.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {orders.map((o) => (
            <li key={o.id} data-testid={`open-order-${o.id}`} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
              <span className={"w-9 font-semibold " + (o.side === "buy" ? "text-emerald-500" : "text-rose-500")}>{o.side.toUpperCase()}</span>
              <span className="font-mono text-slate-600">{o.qty}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-slate-900">
                @ {fmt(o.limitPrice, typeOf(o.symbol))}
                <span className="ml-1.5 font-sans text-[10.5px] text-slate-400">
                  {o.orderType === "GTD" && o.expiryDate ? `till ${fmtIsoDate(o.expiryDate)}` : "today"}
                </span>
              </span>
              <button type="button" onClick={() => onCancel(o.id)} aria-label={`Cancel ${o.side} ${o.qty} ${symbol}`} data-testid={`cancel-order-${o.id}`} className="min-h-[44px] min-w-[44px] rounded-lg px-2 text-[12px] font-medium text-rose-500">
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
      {recent}
    </div>
  );
}

/** The positions held in this symbol (and its option contracts), each at its last price. */
export function PositionsTab({ symbol, holdings, live }: { symbol: string; holdings: Holdings; live: Record<string, number> }) {
  const ids = positionIdsFor(symbol, holdings);
  const { hidden } = usePrivacy();
  if (ids.length === 0)
    return (
      <p data-testid="no-positions" className="rounded-lg bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
        No positions in {symbol} yet. A paper buy puts one here.
      </p>
    );
  // an option contract with no mark yet counts at cost, as on the Portfolio page
  const markOf = (id: string, avg: number) => live[id] ?? avg;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200" data-testid="positions">
      {ids.map((id) => {
        const h = holdings[id];
        const mark = markOf(id, h.avgPrice);
        const pnl = (mark - h.avgPrice) * h.qty;
        const pct = h.avgPrice > 0 ? ((mark - h.avgPrice) / h.avgPrice) * 100 : 0;
        return (
          <li key={id} data-testid={`position-${displayName(id)}`} className="px-3 py-2 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-slate-900">{displayName(id)}</span>
              <span className="font-mono text-slate-600">{h.qty}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[11.5px] text-slate-500">
              <span>
                Avg {fmt(h.avgPrice, typeOf(id))} · Last {fmt(mark, typeOf(id))}
              </span>
              <span data-testid="position-pnl" className={pnl >= 0 ? "text-emerald-600" : "text-rose-500"}>
                {maskPnl(`${pnl >= 0 ? "+" : "−"}${fmtINR(Math.abs(pnl))} (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%)`, hidden)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
