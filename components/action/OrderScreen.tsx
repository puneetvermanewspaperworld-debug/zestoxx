"use client";

import React, { useState } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { useWatchSymbols } from "@/components/useWatchSymbols";
import { useMarketStatus } from "@/lib/useMarketStatus";
import { exchangeOf } from "@/lib/actions";
import { fmt, fmtINR, fmtIsoDate, istClock } from "@/lib/helpers";
import { addDaysIso, gtdBounds } from "@/lib/orders";
import { typeOf } from "@/lib/symbols";
import { NO_RECENT_TRADES } from "@/lib/dynamic-symbols";
import type { OrderResult } from "@/lib/order-check";
import ActionScreen from "./ActionScreen";
import { Choice, Field, FormCard, FormRow, Notice, PriceStrip } from "./ActionParts";

const wholeQty = (text: string): number | null => (/^\d+$/.test(text.trim()) && Number(text) >= 1 ? Number(text) : null);

/**
 * Buy or Sell, full screen. Only what the paper engine does is here: a whole quantity, a market or limit price, and (for a limit order) how
 * long it stays: today, or until a date. There is no product type, trigger price or margin: the funds line is the real check, the cost against
 * the virtual cash (a buy) or the quantity against the holding (a sell).
 */
export default function OrderScreen({ symbol, side: startSide, qty: startQty, onClose, onLeave }: { symbol: string; side: "buy" | "sell"; qty?: number; onClose: () => void; onLeave: (href: string) => void }) {
  const { live, cash, holdings, placeOrder, chgFor, hasFeedQuote, quoteStateOf, prevCloseFor } = useZestoxx();
  useWatchSymbols([symbol]);
  const marketOpen = useMarketStatus()?.open ?? null;
  const [side, setSide] = useState(startSide);
  const [qtyText, setQtyText] = useState(String(startQty ?? 1));
  const [mode, setMode] = useState<"market" | "limit">("market");
  const [limitText, setLimitText] = useState("");
  const [validity, setValidity] = useState<"day" | "date">("day");
  const [expiry, setExpiry] = useState(() => addDaysIso(istClock().date, 7));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);

  const type = typeOf(symbol);
  const price = live[symbol] > 0 ? live[symbol] : null;
  // the day's change needs a real previous close; without one it is not shown
  const pct = price != null && hasFeedQuote(symbol) ? chgFor(symbol) : null;
  const change = price != null && pct != null ? price - prevCloseFor(symbol) : null;
  const held = holdings[symbol]?.qty ?? 0;
  const qty = wholeQty(qtyText);
  const limit = Number(limitText);
  const at = mode === "market" ? price : limit > 0 ? limit : null;
  const required = qty != null && at != null ? qty * at : null;
  const noTrades = quoteStateOf(symbol) === "none";
  const verb = side === "buy" ? "Buy" : "Sell";
  const bounds = gtdBounds(istClock().date);

  const submit = () => {
    setError(null);
    if (qty == null) return setError("Enter a whole quantity of 1 or more.");
    if (mode === "market" && price == null) return setError("There is no live price for this symbol, so there is nothing to fill a market order at.");
    if (mode === "limit" && !(limit > 0)) return setError("Enter a limit price above 0.");
    if (mode === "limit" && validity === "date" && (!expiry || expiry < bounds.min || expiry > bounds.max)) return setError(`Pick an expiry date between ${fmtIsoDate(bounds.min)} and ${fmtIsoDate(bounds.max)}.`);
    const r = placeOrder({ symbol, side, qty, mode: mode === "market" ? "market" : validity === "date" ? "gtd" : "limit", limitPrice: mode === "limit" ? limit : undefined, expiryDate: mode === "limit" && validity === "date" ? expiry : undefined });
    if (r.status === "refused") return setError(r.reason);
    setResult(r);
  };

  const strip = <PriceStrip exchange={exchangeOf(symbol)} price={price} type={type} change={change} pct={pct} noPriceText={noTrades ? NO_RECENT_TRADES : undefined} />;

  if (result) {
    return (
      <ActionScreen label={`${verb} order`} symbol={symbol} onBack={onClose} strip={strip} footer={{ label: "Done", onPress: onClose, tone: "primary", testId: "action-done" }}>
        <FormCard testId="order-result">
          <div className="space-y-1.5 px-3 py-4">
            <p data-testid="result-status" className={"text-[15px] " + (result.status === "filled" ? "text-emerald-700" : "text-slate-900")}>
              {result.status === "filled" ? "Order filled" : "Order placed, waiting for its price"}
            </p>
            {result.status === "filled" && (
              <>
                <p data-testid="result-line" className="text-[14px] text-slate-800">
                  {result.side === "buy" ? "Bought" : "Sold"} {result.qty} {result.symbol} at {fmt(result.price, type)} ({fmtINR(result.qty * result.price)})
                </p>
                <p data-testid="result-cash" className="text-[12px] text-slate-500">
                  Virtual cash now {fmtINR(result.cashAfter)}
                </p>
              </>
            )}
            {result.status === "pending" && (
              <>
                <p data-testid="result-line" className="text-[14px] text-slate-800">
                  {result.orderType === "GTD" ? "GTD" : "Limit"} {result.side} {result.qty} {result.symbol} at {fmt(result.limitPrice, type)}
                </p>
                <p data-testid="result-validity" className="text-[12px] text-slate-500">
                  {result.orderType === "GTD" && result.expiryDate ? `Valid until ${fmtIsoDate(result.expiryDate)}.` : "Valid today (a day order)."} It fills at {fmt(result.limitPrice, type)} when the live price reaches it while Zestoxx is open, and is checked against your cash or holding again then.
                </p>
              </>
            )}
          </div>
        </FormCard>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" data-testid="result-orders" onClick={() => onLeave(`/app/orders?tab=${result.status === "filled" ? "executed" : "open"}`)} className="h-11 rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-blue-700">
            View in Orders
          </button>
          {result.status === "filled" && (
            <button type="button" data-testid="result-portfolio" onClick={() => onLeave(`/app/portfolio?tab=${result.side === "buy" ? "positions" : "holdings"}`)} className="h-11 rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-blue-700">
              View in Portfolio
            </button>
          )}
        </div>
      </ActionScreen>
    );
  }

  const short = required != null && (side === "buy" ? required > cash : qty != null && qty > held);
  const affordable = at != null && at > 0 ? Math.floor(cash / at) : null;

  return (
    <ActionScreen label={verb} symbol={symbol} onBack={onClose} strip={strip} footer={{ label: `${verb} ${symbol} · ${qty ?? "?"}`, onPress: submit, tone: side, testId: "action-submit" }}>
      {error && <Notice tone="error" testId="order-error">{error}</Notice>}
      {noTrades && <Notice tone="warn" testId="order-no-trades">No recent trades in this symbol, so there is no live price. A market order cannot be filled until it trades again; a limit order can still be placed.</Notice>}
      <FormCard testId="order-card">
        <FormRow label="Type">
          <Choice label="Side" value={side} onChange={(v) => (setSide(v), setError(null))} options={[{ id: "buy", label: "Buy", testId: "side-buy" }, { id: "sell", label: "Sell", testId: "side-sell" }]} />
        </FormRow>
      </FormCard>
      <FormCard testId="order-fields">
        <FormRow label="Quantity" htmlFor="order-qty" hint={side === "sell" ? `You hold ${held}.` : affordable != null ? `Your cash covers up to ${affordable} at this price.` : undefined}>
          <Field id="order-qty" testId="order-qty" ariaLabel="Quantity" inputMode="numeric" value={qtyText} onChange={(v) => (setQtyText(v), setError(null))} error={qtyText !== "" && qty == null} />
        </FormRow>
        <FormRow label="Price" hint={mode === "market" ? (price != null ? `Fills at the live price, ${fmt(price, type)}, now.` : "No live price yet.") : `Fills at your limit price when the live price reaches it, while Zestoxx is open.`}>
          <Choice label="Price type" value={mode} onChange={(v) => (setMode(v), setError(null), v === "limit" && !limitText && price != null && setLimitText(price.toFixed(2)))} options={[{ id: "market", label: "Market", testId: "mode-market" }, { id: "limit", label: "Limit", testId: "mode-limit" }]} />
          {mode === "limit" && (
            <div className="mt-2">
              <Field id="order-limit" testId="order-limit" ariaLabel="Limit price" value={limitText} onChange={(v) => (setLimitText(v), setError(null))} unit="₹" error={limitText !== "" && !(limit > 0)} />
            </div>
          )}
        </FormRow>
        {mode === "limit" && (
          <FormRow label="Validity" hint={validity === "day" ? "A day order: it is cancelled at the end of today if it has not filled." : `Stays open until ${expiry ? fmtIsoDate(expiry) : "the date you pick"}.`}>
            <Choice label="Validity" value={validity} onChange={(v) => (setValidity(v), setError(null))} options={[{ id: "day", label: "Day", testId: "validity-day" }, { id: "date", label: "Until a date", testId: "validity-date" }]} />
            {validity === "date" && (
              <div className="mt-2">
                <input type="date" aria-label="Valid until" data-testid="order-expiry" value={expiry} min={bounds.min} max={bounds.max} onChange={(e) => (setExpiry(e.target.value), setError(null))} className="min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-slate-900 outline-none focus:border-blue-500" />
              </div>
            )}
          </FormRow>
        )}
      </FormCard>
      <FormCard testId="order-funds">
        <FormRow label="Funds">
          {side === "buy" ? (
            <div className="space-y-1 pt-2 text-[13px]" data-testid="funds-line">
              <div className="flex justify-between"><span className="text-slate-500">Required</span><span data-testid="funds-required" className={"font-mono " + (short ? "text-rose-600" : "text-slate-900")}>{required == null ? "--" : fmtINR(required)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Available</span><span data-testid="funds-available" className="font-mono text-slate-900">{fmtINR(cash)}</span></div>
            </div>
          ) : (
            <div className="space-y-1 pt-2 text-[13px]" data-testid="funds-line">
              <div className="flex justify-between"><span className="text-slate-500">Selling</span><span data-testid="funds-required" className={"font-mono " + (short ? "text-rose-600" : "text-slate-900")}>{qty ?? "--"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">You hold</span><span data-testid="funds-available" className="font-mono text-slate-900">{held}</span></div>
              {required != null && <div className="flex justify-between"><span className="text-slate-500">You receive</span><span className="font-mono text-slate-900">{fmtINR(required)}</span></div>}
            </div>
          )}
          {short && <p data-testid="funds-short" className="mt-1.5 text-[12px] text-rose-600">{side === "buy" ? "Not enough virtual cash for this order." : `You only hold ${held}.`}</p>}
        </FormRow>
      </FormCard>
      {marketOpen === false && !["BTC", "ETH", "SOL"].includes(symbol) && (
        <Notice tone="info" testId="order-market-closed">The market is closed. A market order fills at the last price; a limit order waits for its price while Zestoxx is open.</Notice>
      )}
      <Notice tone="info" testId="order-note">Paper trading: no real money moves, and no brokerage or other charges are taken.</Notice>
    </ActionScreen>
  );
}
