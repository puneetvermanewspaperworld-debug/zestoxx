"use client";

import React from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { PAPER_BUY, PAPER_SELL } from "@/lib/labels";
import { fmt } from "@/lib/helpers";
import { typeOf } from "@/lib/symbols";
import { useAction } from "./useAction";

/**
 * The chart drawer's Trade tab on a phone: what you hold of the symbol and a Buy and a Sell button. Each opens the full-screen order, so the
 * quantity, price and funds are entered where the keyboard has room. (Client-only: it reads the address for the screen it opens.)
 */
export default function DrawerTradeButtons({ symbol }: { symbol: string }) {
  const { holdings, live } = useZestoxx();
  const { openAction } = useAction();
  const h = holdings[symbol];
  const price = live[symbol];
  return (
    <div data-testid="drawer-trade" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <p data-testid="drawer-held" className="text-[13px] text-slate-600">
        {h && h.qty > 0 ? `You hold ${h.qty} of ${symbol}, average ${fmt(h.avgPrice, typeOf(symbol))}.` : `You don't hold ${symbol} now.`}
        {price > 0 ? ` Last ${fmt(price, typeOf(symbol))}.` : ""}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" data-testid="drawer-buy" onClick={() => openAction({ kind: "order", symbol, side: "buy" })} className="min-h-[44px] rounded-lg bg-emerald-500 text-[14px] font-semibold text-white">
          {PAPER_BUY}
        </button>
        <button type="button" data-testid="drawer-sell" onClick={() => openAction({ kind: "order", symbol, side: "sell" })} className="min-h-[44px] rounded-lg bg-rose-500 text-[14px] font-semibold text-white">
          {PAPER_SELL}
        </button>
      </div>
      <p className="text-[11.5px] text-slate-500">Paper trading: Buy and Sell open the order screen. Market, limit and until-date orders fill at the live price.</p>
    </div>
  );
}
