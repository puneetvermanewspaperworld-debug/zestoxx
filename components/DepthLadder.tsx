"use client";

import React from "react";
import { fmt } from "@/lib/helpers";
import type { AssetType } from "@/lib/types";
import { depthView } from "@/lib/depth-state";
import { useSymbolDepth } from "@/lib/useSymbolDepth";
import { useMarketStatus } from "@/lib/useMarketStatus";

/** The order book for a symbol: real five-level depth from Upstox, or a plain message. Nothing here is generated. */
export default function DepthLadder({ symbol, type }: { symbol: string; type: AssetType }) {
  const res = useSymbolDepth(symbol);
  const status = useMarketStatus();
  const view = depthView(res, status?.open ?? true);

  if (view.kind === "loading") return <div className="h-[140px] animate-pulse rounded bg-slate-50" aria-busy="true" />;
  if (view.kind === "message") {
    return (
      <p data-testid="depth-message" className="py-6 text-center text-[12px] text-slate-400">
        {view.text}
      </p>
    );
  }
  const maxSize = Math.max(...view.asks.map((a) => a.qty), ...view.bids.map((b) => b.qty), 1);
  return (
    <div className="text-[11.5px]" data-testid="depth-ladder">
      <div className="mb-1 flex justify-between text-[10.5px] uppercase tracking-wide text-slate-400">
        <span>Price</span>
        <span>Qty</span>
      </div>
      {[...view.asks].reverse().map((a, i) => (
        <div key={`a${i}`} className="relative mb-0.5 flex justify-between px-1 py-0.5">
          <div className="absolute inset-y-0 right-0 bg-[#F8717122]" style={{ width: `${(a.qty / maxSize) * 100}%` }} />
          <span className="relative z-10 font-mono text-rose-500">{fmt(a.price, type)}</span>
          <span className="relative z-10 font-mono text-slate-500">{a.qty}</span>
        </div>
      ))}
      <div className="my-1 border-t border-slate-200" />
      {view.bids.map((b, i) => (
        <div key={`b${i}`} className="relative mb-0.5 flex justify-between px-1 py-0.5">
          <div className="absolute inset-y-0 right-0 bg-[#34D39922]" style={{ width: `${(b.qty / maxSize) * 100}%` }} />
          <span className="relative z-10 font-mono text-emerald-500">{fmt(b.price, type)}</span>
          <span className="relative z-10 font-mono text-slate-500">{b.qty}</span>
        </div>
      ))}
    </div>
  );
}
