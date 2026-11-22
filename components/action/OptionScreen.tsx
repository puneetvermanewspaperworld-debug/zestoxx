"use client";

import React, { useMemo, useState } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { makeContractId, simulateContractQuote, type ContractQuote } from "@/lib/contract";
import { contractLabel } from "@/lib/movers";
import { quoteNote } from "@/lib/closed-notes";
import { SELL_NOT_HELD } from "@/lib/sell-shortcut";
import { fundsError } from "@/lib/order-check";
import { fmtINR, fmtIsoDate } from "@/lib/helpers";
import { useMarketStatus } from "@/lib/useMarketStatus";
import { useOptionChain } from "@/lib/useOptionChain";
import { useContractQuote } from "@/lib/useContractQuote";
import ActionScreen from "./ActionScreen";
import { Choice, Field, FormCard, FormRow, Notice, PriceStrip } from "./ActionParts";

const wholeLots = (text: string): number | null => (/^\d+$/.test(text.trim()) && Number(text) >= 1 ? Number(text) : null);

/**
 * Buy or sell one option contract, full screen. The paper engine trades options at the live premium (a market order) in whole lots: the contract
 * is bought or sold in lots, and the quantity is lots x the lot size. There is no limit price, product or validity for a contract, so there is
 * none here. A sell closes a contract you hold: there is no short selling.
 */
export default function OptionScreen({ underlying, expiry, strike, type, side: startSide, onClose, onLeave }: { underlying: string; expiry: string; strike: number; type: "CE" | "PE"; side: "buy" | "sell"; onClose: () => void; onLeave: (href: string) => void }) {
  const { live, cash, holdings, tradeContract } = useZestoxx();
  const marketOpen = useMarketStatus()?.open ?? null;
  const { chain, loading: chainLoading } = useOptionChain(underlying, expiry, live[underlying] ?? 0);
  const [side, setSide] = useState(startSide);
  const [lotsText, setLotsText] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | { side: "buy" | "sell"; lots: number; qty: number; price: number }>(null);

  const row = chain?.rows.find((r) => r.strike === strike);
  const leg = row ? (type === "CE" ? row.call : row.put) : null;
  const id = chain && leg ? makeContractId({ underlying: chain.underlying, expiry: chain.expiry, strike, type, key: leg.key }) : null;
  const shortName = underlying === "NIFTY50" ? "NIFTY" : underlying;
  const label = contractLabel({ symbol: shortName, expiry, strike, type });

  const { quote: liveQuote, loading: quoteLoading } = useContractQuote(leg?.key);
  const quote = useMemo<ContractQuote | null>(() => {
    if (liveQuote) return liveQuote;
    if (!leg || !chain || quoteLoading) return null;
    return simulateContractQuote(leg, chain.lotSize, id ?? label);
  }, [liveQuote, leg, chain, quoteLoading, id, label]);

  const lotSize = chain?.lotSize ?? 0;
  const lots = wholeLots(lotsText);
  const qty = lots != null ? lots * lotSize : null;
  const ltp = quote?.ltp ?? leg?.ltp ?? null;
  const held = id ? (holdings[id]?.qty ?? 0) : 0;
  const isLive = quote?.source === "live";
  const strip = <PriceStrip exchange="NSE F&O" price={ltp != null && ltp > 0 ? ltp : null} type="stock" change={quote?.change ?? null} pct={quote?.changePct ?? null} />;
  const verb = side === "buy" ? "Buy" : "Sell";

  if (chainLoading) {
    return (
      <ActionScreen label={verb} symbol={label} onBack={onClose} strip={strip}>
        <Notice tone="info" testId="option-loading">Loading the option chain…</Notice>
      </ActionScreen>
    );
  }
  if (!chain || !leg || !id) {
    return (
      <ActionScreen label={verb} symbol={label} onBack={onClose} strip={strip} footer={{ label: "Back", onPress: onClose, tone: "primary", testId: "action-done" }}>
        <Notice tone="warn" testId="option-missing">This contract is not in the option chain right now (the expiry may have passed, or the chain could not be loaded). Open the option chain and pick it again.</Notice>
      </ActionScreen>
    );
  }

  const premium = qty != null && ltp != null ? qty * ltp : null;
  const short = premium != null && (side === "buy" ? premium > cash : qty != null && qty > held);

  const submit = () => {
    setError(null);
    if (lots == null || qty == null) return setError("Enter a whole number of lots, 1 or more.");
    if (ltp == null || !(ltp > 0)) return setError("There is no premium for this contract right now, so there is nothing to fill an order at.");
    if (side === "sell" && qty > held) return setError(held > 0 ? `You hold ${held} of this contract. Selling closes an existing paper position.` : "You don't hold this contract. Paper trading can only sell what you've bought: short selling isn't supported yet.");
    const err = fundsError({ side, qty, price: ltp, cash, held, symbol: label });
    if (err) return setError(err);
    tradeContract({ id, side, qty, price: ltp });
    setResult({ side, lots, qty, price: ltp });
  };

  if (result) {
    return (
      <ActionScreen label={`${verb} order`} symbol={label} onBack={onClose} strip={strip} footer={{ label: "Done", onPress: onClose, tone: "primary", testId: "action-done" }}>
        <FormCard testId="order-result">
          <div className="space-y-1.5 px-3 py-4">
            <p data-testid="result-status" className="text-[15px] text-emerald-700">Order filled</p>
            <p data-testid="result-line" className="text-[14px] text-slate-800">
              {result.side === "buy" ? "Bought" : "Sold"} {result.lots} lot{result.lots > 1 ? "s" : ""} ({result.qty}) {label} at {fmtINR(result.price)} ({fmtINR(result.qty * result.price)})
            </p>
            <p data-testid="result-cash" className="text-[12px] text-slate-500">Virtual cash now {fmtINR(cash)}</p>
          </div>
        </FormCard>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" data-testid="result-orders" onClick={() => onLeave("/app/orders?tab=executed")} className="h-11 rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-blue-700">
            View in Orders
          </button>
          <button type="button" data-testid="result-portfolio" onClick={() => onLeave("/app/portfolio?tab=positions")} className="h-11 rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-blue-700">
            View in Portfolio
          </button>
        </div>
      </ActionScreen>
    );
  }

  const note = quote ? quoteNote(marketOpen, quote) : null;
  return (
    <ActionScreen label={verb} symbol={label} onBack={onClose} strip={strip} footer={{ label: `${verb} ${label} · ${lots ?? "?"} lot${lots === 1 ? "" : "s"}`, onPress: submit, tone: side, testId: "action-submit" }}>
      {error && <Notice tone="error" testId="order-error">{error}</Notice>}
      {side === "sell" && held === 0 && <Notice tone="warn" testId="sell-not-held">{SELL_NOT_HELD}</Notice>}
      {quote && !isLive && <Notice tone="warn" testId="option-simulated">This premium is simulated (the live option feed is not available), so a fill here is simulated too.</Notice>}
      <FormCard testId="contract-card">
        <FormRow label="Contract">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 text-[13px]" data-testid="contract-details">
            <dt className="text-slate-500">Underlying</dt><dd className="text-right font-mono text-slate-900">{shortName}</dd>
            <dt className="text-slate-500">Strike</dt><dd data-testid="contract-strike" className="text-right font-mono text-slate-900">{strike}</dd>
            <dt className="text-slate-500">Type</dt><dd className="text-right font-mono text-slate-900">{type === "CE" ? "Call (CE)" : "Put (PE)"}</dd>
            <dt className="text-slate-500">Expiry</dt><dd data-testid="contract-expiry" className="text-right font-mono text-slate-900">{fmtIsoDate(expiry)}</dd>
            <dt className="text-slate-500">Lot size</dt><dd data-testid="contract-lot" className="text-right font-mono text-slate-900">{lotSize}</dd>
          </dl>
        </FormRow>
      </FormCard>
      <FormCard testId="order-card">
        <FormRow label="Type">
          <Choice label="Side" value={side} onChange={(v) => (setSide(v), setError(null))} options={[{ id: "buy", label: "Buy", testId: "side-buy" }, { id: "sell", label: "Sell", testId: "side-sell" }]} />
        </FormRow>
        <FormRow label="Lots" htmlFor="order-lots" hint={side === "sell" ? `You hold ${held} (${lotSize > 0 ? Math.floor(held / lotSize) : 0} lots).` : undefined}>
          <Field id="order-lots" testId="order-lots" ariaLabel="Lots" inputMode="numeric" value={lotsText} onChange={(v) => (setLotsText(v), setError(null))} error={lotsText !== "" && lots == null} />
        </FormRow>
        <FormRow label="Quantity" hint={`${lots ?? "?"} lot${lots === 1 ? "" : "s"} × ${lotSize} per lot`}>
          <p data-testid="order-qty-units" className="pt-2.5 font-mono text-[14px] text-slate-900">{qty ?? "--"}</p>
        </FormRow>
        <FormRow label="Price" hint={ltp != null && ltp > 0 ? `Market: fills at the live premium, ${ltp.toFixed(2)}, now.` : "No premium yet."}>
          <p className="pt-2.5 font-mono text-[14px] text-slate-900">{ltp != null && ltp > 0 ? ltp.toFixed(2) : "--"}</p>
        </FormRow>
      </FormCard>
      <FormCard testId="order-funds">
        <FormRow label="Funds">
          {side === "buy" ? (
            <div className="space-y-1 pt-2 text-[13px]" data-testid="funds-line">
              <div className="flex justify-between"><span className="text-slate-500">Premium required</span><span data-testid="funds-required" className={"font-mono " + (short ? "text-rose-600" : "text-slate-900")}>{premium == null ? "--" : fmtINR(premium)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Available</span><span data-testid="funds-available" className="font-mono text-slate-900">{fmtINR(cash)}</span></div>
            </div>
          ) : (
            <div className="space-y-1 pt-2 text-[13px]" data-testid="funds-line">
              <div className="flex justify-between"><span className="text-slate-500">Selling</span><span data-testid="funds-required" className={"font-mono " + (short ? "text-rose-600" : "text-slate-900")}>{qty ?? "--"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">You hold</span><span data-testid="funds-available" className="font-mono text-slate-900">{held}</span></div>
              {premium != null && <div className="flex justify-between"><span className="text-slate-500">You receive</span><span className="font-mono text-slate-900">{fmtINR(premium)}</span></div>}
            </div>
          )}
          {short && <p data-testid="funds-short" className="mt-1.5 text-[12px] text-rose-600">{side === "buy" ? "Not enough virtual cash for this order." : `You only hold ${held}.`}</p>}
        </FormRow>
      </FormCard>
      {note && <Notice tone="info" testId="order-market-closed">{note}</Notice>}
      <Notice tone="info" testId="order-note">Paper trading: no real money moves, and no brokerage or other charges are taken.</Notice>
    </ActionScreen>
  );
}
