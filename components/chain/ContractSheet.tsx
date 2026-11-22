"use client";

import React from "react";
import { BarChart3 } from "lucide-react";
import Sheet from "@/components/chart/Sheet";
import DataBadge from "@/components/DataBadge";
import { useAction } from "@/components/action/useAction";
import { ActionButton, Message, Side, tone } from "@/components/phone/SymbolSheet";
import { contractLabel } from "@/lib/movers";
import { DEPTH_NOT_AVAILABLE, DEPTH_WHEN_OPEN } from "@/lib/depth-state";
import { fmtOi, fmtOiChange, fmtSigned } from "@/lib/helpers";
import { GREEKS, type OptionChain } from "@/lib/options";
import { useContractQuote } from "@/lib/useContractQuote";
import { useMarketStatus } from "@/lib/useMarketStatus";

const money = (n: number) => n.toFixed(2);

/**
 * The sheet that opens when a Call or Put cell of the chain is tapped, like the row sheet in the watchlist: the contract, its premium and change;
 * Buy and Sell (the option order screen for this strike and expiry); View chart (the contract's intraday chart); and below them what the chain and the
 * contract's quote really carry: open interest and its change, volume, IV, the Greeks, the best bid and ask, the day's range, and the book's depth.
 * Anything the feed did not send is left out, and a simulated chain says so: nothing is made up.
 *
 * Left out, because the paper engine cannot do them for a contract: Set alert and Create GTT (it watches the prices of stocks and ETFs, and a
 * contract has no price feed of its own to watch) and Add notes (notes belong to a stock or an ETF; a contract expires).
 */
export default function ContractSheet({ chain, strike, type, onClose }: { chain: OptionChain; strike: number; type: "CE" | "PE"; onClose: () => void }) {
  const { openAction } = useAction();
  const market = useMarketStatus();
  const row = chain.rows.find((r) => r.strike === strike);
  const leg = row ? (type === "CE" ? row.call : row.put) : null;
  const { quote } = useContractQuote(leg?.key);
  const short = chain.underlying === "NIFTY50" ? "NIFTY" : chain.underlying;
  const label = contractLabel({ symbol: short, expiry: chain.expiry, strike, type });
  if (!leg) return null;

  const live = quote?.source === "live" ? quote : null;
  const ltp = live ? live.ltp : leg.ltp;
  const prev = live ? live.prevClose : leg.prevClose;
  const change = live ? live.change : ltp > 0 && prev > 0 ? ltp - prev : null;
  const pct = live ? live.changePct : change != null && prev > 0 ? (change / prev) * 100 : null;
  const canOrder = ltp > 0;
  const order = (side: "buy" | "sell") => openAction({ kind: "option", underlying: chain.underlying, expiry: chain.expiry, strike, type, side });

  const volume = live ? live.volume : leg.volume;
  const bid = live?.bids[0]?.price ?? leg.bid;
  const ask = live?.asks[0]?.price ?? leg.ask;
  const data: { id: string; label: string; value: string }[] = [];
  if (leg.oi > 0) data.push({ id: "oi", label: "Open interest", value: fmtOi(leg.oi) });
  if (leg.prevOi > 0) data.push({ id: "oichg", label: "OI change", value: `${fmtOiChange(leg.oi - leg.prevOi)} (${fmtSigned(((leg.oi - leg.prevOi) / leg.prevOi) * 100, 1, "%")})` });
  if (volume > 0) data.push({ id: "volume", label: "Volume", value: fmtOi(volume) });
  if (leg.iv > 0) data.push({ id: "iv", label: "IV", value: `${leg.iv.toFixed(2)}%` });
  for (const g of GREEKS) if (leg[g.id] != null) data.push({ id: g.id, label: g.label, value: leg[g.id]!.toFixed(g.digits) });
  if (bid != null && bid > 0) data.push({ id: "bid", label: "Best bid", value: money(bid) });
  if (ask != null && ask > 0) data.push({ id: "ask", label: "Best ask", value: money(ask) });
  data.push({ id: "lot", label: "Lot size", value: String(chain.lotSize) });

  const bids = live ? live.bids.filter((l) => l.price > 0 && l.qty > 0) : [];
  const asks = live ? live.asks.filter((l) => l.price > 0 && l.qty > 0) : [];
  const range = live && live.high > 0 && live.low > 0 ? live : null;

  return (
    <Sheet title={label} large onClose={onClose} testId="contract-sheet">
      <div className="flex flex-col gap-2 px-1 pb-1">
        <header className="flex h-[var(--sheet-sub)] items-center gap-2 px-2">
          <p data-testid="contract-sheet-name" className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
            {type === "CE" ? "Call option" : "Put option"}
          </p>
          <DataBadge source={chain.source === "live" ? "live" : "sim"} className="shrink-0" />
          <span data-testid="contract-sheet-price" className={"shrink-0 font-mono text-[15px] " + tone(change)}>
            {ltp > 0 ? money(ltp) : "--"}
          </span>
          <span data-testid="contract-sheet-change" className={"shrink-0 font-mono text-[13px] " + tone(change)}>
            {change != null && pct != null ? `${fmtSigned(change, 2)} (${fmtSigned(pct, 2, "%")})` : "--"}
          </span>
        </header>
        {chain.source === "simulated" && (
          <p data-testid="contract-simulated" role="status" className="mx-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
            This is a simulated chain (the live option feed is not available), so every figure here is generated.
          </p>
        )}
        {!canOrder && (
          <p data-testid="contract-no-price" role="status" className="mx-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-500">
            This contract has no price right now, so there is nothing to fill an order at. Zestoxx never makes a price up.
          </p>
        )}

        <div className="mt-[var(--sheet-gap)] grid grid-cols-2 gap-5 px-2">
          <button type="button" disabled={!canOrder} onClick={() => order("buy")} data-testid="contract-buy" className="h-[var(--btn-primary-h)] rounded-lg bg-emerald-500 text-[14px] font-semibold text-white disabled:opacity-40">
            Buy
          </button>
          <button type="button" disabled={!canOrder} onClick={() => order("sell")} data-testid="contract-sell" className="h-[var(--btn-primary-h)] rounded-lg bg-rose-500 text-[14px] font-semibold text-white disabled:opacity-40">
            Sell
          </button>
        </div>
        <div className="px-2">
          <div className="mt-1 flex h-11 items-center">
            <ActionButton icon={<BarChart3 size={16} aria-hidden />} label="View chart" testId="contract-chart" onClick={() => openAction({ kind: "ochart", underlying: chain.underlying, expiry: chain.expiry, strike, type })} />
          </div>
        </div>

        <section aria-label="Contract data" data-testid="contract-data" className="mx-2 rounded-lg border border-slate-200 p-2.5">
          <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Contract data</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
            {data.map((d) => (
              <div key={d.id} className="flex justify-between gap-2">
                <dt className="text-slate-500">{d.label}</dt>
                <dd data-testid={`contract-data-${d.id}`} className="font-mono text-slate-900">
                  {d.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="Day's range" data-testid="contract-range" className="mx-2 rounded-lg border border-slate-200 p-2.5">
          <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Day&apos;s range</h3>
          {range ? (
            <>
              <div className="flex justify-between font-mono text-[12.5px] text-slate-700">
                <span data-testid="contract-range-low">Low {money(range.low)}</span>
                <span data-testid="contract-range-high">High {money(range.high)}</span>
              </div>
              <div className="relative mt-2 h-1.5 rounded-full bg-slate-100">
                {ltp > 0 && range.high > range.low && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600" style={{ left: `${Math.min(100, Math.max(0, ((ltp - range.low) / (range.high - range.low)) * 100))}%` }} />}
              </div>
              {range.open > 0 && <p className="mt-2 font-mono text-[11.5px] text-slate-500">Open {money(range.open)}</p>}
            </>
          ) : (
            <p data-testid="contract-range-unavailable" className="text-[12px] text-slate-500">
              The day&apos;s range is not available right now.
            </p>
          )}
        </section>

        <section aria-label="Market depth" data-testid="contract-depth" className="mx-2 rounded-lg border border-slate-200 p-2.5">
          <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Market depth · 5 levels</h3>
          {bids.length === 0 && asks.length === 0 ? (
            <Message text={(market?.open === false ? DEPTH_WHEN_OPEN : DEPTH_NOT_AVAILABLE) + "."} />
          ) : (
            <div className="grid grid-cols-2 gap-3 font-mono text-[12px]" data-testid="contract-depth-levels">
              <Side title="Bid" rows={bids} type="stock" tone="text-emerald-600" />
              <Side title="Ask" rows={asks} type="stock" tone="text-rose-500" />
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}
