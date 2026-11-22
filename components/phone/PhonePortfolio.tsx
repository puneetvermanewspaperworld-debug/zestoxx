"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { usePrivacy } from "@/components/usePrivacy";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { useAction } from "@/components/action/useAction";
import { contractFromHolding, displayName } from "@/lib/contract";
import { fmt, fmtINR, istClock } from "@/lib/helpers";
import { maskPnl, maskValue } from "@/lib/privacy";
import { EQUITY_SETTLEMENT_DAYS, splitHoldings } from "@/lib/settlement";
import { typeOf } from "@/lib/symbols";
import PhoneTabs from "./PhoneTabs";

type Tab = "holdings" | "positions";
const tone = (n: number) => (n > 0 ? "text-emerald-600" : n < 0 ? "text-rose-500" : "text-slate-500");
const signedINR = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtINR(Math.abs(n));

/**
 * The portfolio on a phone: Holdings (delivery shares from earlier days that have settled) and Positions (what was bought and has not settled
 * yet, with T+1 today's trades, and every option or futures contract). The eye icon hides the portfolio's value as **** and profit and loss as
 * ***, here and everywhere else they are shown; the choice is remembered on this device.
 */
export default function PhonePortfolio() {
  const { cash, holdings, orderLog, live } = useZestoxx();
  const { openAction } = useAction();
  const [none, setNone] = useState<string | null>(null);
  const { hidden, toggle } = usePrivacy();
  // a link from an action screen's result can name the tab (?tab=positions): shares bought today are Positions until they settle
  const named = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(named === "positions" ? "positions" : "holdings");
  const today = istClock().date;
  const split = useMemo(() => splitHoldings(holdings, orderLog, today), [holdings, orderLog, today]);
  // An option contract with no mark yet (feed still loading) counts at cost, not NaN.
  const mark = (id: string, avg: number) => live[id] ?? avg;
  const rows = (items: { id: string; qty: number; avgPrice: number }[]) => items.map((h) => ({ ...h, last: mark(h.id, h.avgPrice), value: h.qty * mark(h.id, h.avgPrice), pnl: (mark(h.id, h.avgPrice) - h.avgPrice) * h.qty }));
  const held = rows(Object.entries(split.holdings).map(([id, h]) => ({ id, ...h })));
  const pos = rows(split.positions);
  const all = [...held, ...pos];
  const holdingsValue = all.reduce((s, r) => s + r.value, 0);
  const totalPnl = all.reduce((s, r) => s + r.pnl, 0);

  const shown = tab === "holdings" ? held : pos;

  // Exit sells everything held of that symbol or contract; Add buys more. Both open the same screen as Buy and Sell, filled in.
  const trade = (id: string, side: "buy" | "sell") => {
    const total = holdings[id]?.qty ?? 0;
    if (side === "sell" && !(total >= 1)) return setNone(`You don't hold ${displayName(id)} now, so there is nothing to exit.`);
    setNone(null);
    const c = contractFromHolding(id, istClock().date);
    if (c) return openAction({ kind: "option", ...c, side });
    openAction(side === "sell" ? { kind: "order", symbol: id, side, qty: total } : { kind: "order", symbol: id, side });
  };
  return (
    <div className="space-y-2.5" data-testid="phone-portfolio">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[20px] font-semibold text-slate-900">Portfolio</h1>
        <button type="button" onClick={toggle} aria-pressed={hidden} aria-label={hidden ? "Show portfolio value and profit and loss" : "Hide portfolio value and profit and loss"} data-testid="privacy-eye" className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600">
          {hidden ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Total value" testId="pf-total" value={maskValue(fmtINR(cash + holdingsValue), hidden)} />
        <Stat label="Virtual cash" testId="pf-cash" value={maskValue(fmtINR(cash), hidden)} />
        <Stat label="Holdings value" testId="pf-holdings-value" value={maskValue(fmtINR(holdingsValue), hidden)} />
        <Stat label="Unrealised P&L" testId="pf-pnl" value={maskPnl(signedINR(totalPnl), hidden)} cls={hidden ? "text-slate-500" : tone(totalPnl)} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <PhoneTabs label="Portfolio sections" testId="pf-tab" value={tab} onChange={setTab} tabs={[{ id: "holdings", label: "Holdings", count: held.length }, { id: "positions", label: "Positions", count: pos.length }]} />
      </div>

      <p data-testid="settlement-note" className="px-1 text-[11.5px] leading-relaxed text-slate-500">
        {tab === "holdings"
          ? `Delivery shares from earlier days that have settled. Shares settle ${EQUITY_SETTLEMENT_DAYS === 1 ? "the next trading day (T+1, NSE's cycle)" : `${EQUITY_SETTLEMENT_DAYS} trading days after the trade`}, counting only days the market is open.`
          : "Today's trades, which have not settled yet, and your option and futures contracts. Settled shares move to Holdings."}
      </p>

      {none && (
        <p role="alert" data-testid="pf-exit-none" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          {none}
        </p>
      )}

      {shown.length === 0 ? (
        <p data-testid={`pf-empty-${tab}`} className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-[13px] text-slate-500">
          {tab === "holdings" ? "No settled holdings. Shares you buy appear here once they settle." : "No positions. Trades you make today appear here."}
        </p>
      ) : (
        <ul className="space-y-2" data-testid={`pf-rows-${tab}`}>
          {shown.map((r) => {
            const type = typeOf(r.id);
            return (
              <li key={r.id} data-testid={`pf-row-${displayName(r.id)}`} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[14px] font-semibold text-slate-900">{displayName(r.id)}</span>
                  <span data-testid="pf-row-pnl" className={"shrink-0 font-mono text-[13px] font-semibold " + (hidden ? "text-slate-500" : tone(r.pnl))}>
                    {maskPnl(signedINR(r.pnl), hidden)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[11.5px] text-slate-500">
                  <span>
                    {r.qty} @ {fmt(r.avgPrice, type)}
                  </span>
                  <span>Last {fmt(r.last, type)}</span>
                  <span data-testid="pf-row-value">{maskValue(fmtINR(r.value), hidden)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" data-testid={`pf-exit-${displayName(r.id)}`} aria-label={`Exit ${displayName(r.id)}: sell everything you hold`} onClick={() => trade(r.id, "sell")} className="min-h-[44px] rounded-lg border border-rose-200 text-[13px] font-medium text-rose-600">
                    Exit
                  </button>
                  <button type="button" data-testid={`pf-add-${displayName(r.id)}`} aria-label={`Add to ${displayName(r.id)}: buy more`} onClick={() => trade(r.id, "buy")} className="min-h-[44px] rounded-lg border border-blue-200 text-[13px] font-medium text-blue-700">
                    Add
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, testId, cls = "text-slate-900" }: { label: string; value: string; testId: string; cls?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10.5px] uppercase tracking-wide text-slate-400">{label}</div>
      <div data-testid={testId} className={"mt-1 font-mono text-[16px] font-semibold " + cls}>
        {value}
      </div>
    </div>
  );
}
