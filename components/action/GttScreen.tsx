"use client";

import React, { useState } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { useWatchSymbols } from "@/components/useWatchSymbols";
import { exchangeOf } from "@/lib/actions";
import { fmt, fmtINR } from "@/lib/helpers";
import { gttKind, triggerDirection } from "@/lib/gtt";
import { typeOf } from "@/lib/symbols";
import { NO_RECENT_TRADES } from "@/lib/dynamic-symbols";
import ActionScreen from "./ActionScreen";
import { Choice, Field, FormCard, FormRow, Notice, PriceStrip } from "./ActionParts";

const wholeQty = (text: string): number | null => (/^\d+$/.test(text.trim()) && Number(text) >= 1 ? Number(text) : null);

/**
 * Create, edit or delete a GTT order, full screen. A GTT is one trigger: when the price reaches it, the order trades at once, and the engine
 * fills it at the trigger price, so the limit price is the trigger (shown, not asked for). There is no OCO and no product choice because the
 * engine has neither. Editing is a cancel and a new order, and the screen says so: the time it was placed resets.
 */
export default function GttScreen({ symbol, editId, onClose, onLeave }: { symbol: string; editId?: string; onClose: () => void; onLeave: (href: string) => void }) {
  const { live, cash, holdings, openOrders, createGtt, cancelOrder, chgFor, hasFeedQuote, prevCloseFor, quoteStateOf } = useZestoxx();
  useWatchSymbols([symbol]);
  const existing = editId ? openOrders.find((o) => String(o.id) === editId && o.orderType === "GTT" && o.symbol === symbol) : undefined;
  const [side, setSide] = useState<"buy" | "sell">(existing?.side ?? "sell");
  const [triggerText, setTriggerText] = useState(existing ? String(existing.limitPrice) : "");
  const [qtyText, setQtyText] = useState(existing ? String(existing.qty) : "1");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { saved: "created" | "saved" | "deleted"; text: string }>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const type = typeOf(symbol);
  const price = live[symbol] > 0 ? live[symbol] : null;
  const pct = price != null && hasFeedQuote(symbol) ? chgFor(symbol) : null;
  const change = price != null && pct != null ? price - prevCloseFor(symbol) : null;
  const held = holdings[symbol]?.qty ?? 0;
  const qty = wholeQty(qtyText);
  const trigger = Number(triggerText);
  const noTrades = quoteStateOf(symbol) === "none";
  const strip = <PriceStrip exchange={exchangeOf(symbol)} price={price} type={type} change={change} pct={pct} noPriceText={noTrades ? NO_RECENT_TRADES : undefined} />;

  // how far the trigger is from the live price, as the order sees it
  const away = price != null && trigger > 0 ? ((trigger - price) / price) * 100 : null;
  const kind = price != null && trigger > 0 ? gttKind(side, triggerDirection(trigger, price)) : null;

  const submit = () => {
    setError(null);
    if (!(trigger > 0)) return setError("Enter a trigger price above 0.");
    if (qty == null) return setError("Enter a whole quantity of 1 or more.");
    const err = createGtt({ symbol, side, qty, trigger }, existing?.id);
    if (err) return setError(err);
    setDone({ saved: existing ? "saved" : "created", text: `${kind ?? "GTT"}: ${side} ${qty} ${symbol} when the price reaches ${fmt(trigger, type)}` });
  };

  if (editId && !existing && !done) {
    return (
      <ActionScreen label="Edit GTT" symbol={symbol} onBack={onClose} strip={strip} footer={{ label: "Back", onPress: onClose, tone: "primary", testId: "action-done" }}>
        <Notice tone="warn" testId="gtt-missing">That GTT is no longer open: it may have triggered, been cancelled, or the page was reloaded (open GTT orders get new references each visit). Open the GTT list to pick it again.</Notice>
      </ActionScreen>
    );
  }

  if (done) {
    return (
      <ActionScreen label={done.saved === "deleted" ? "GTT deleted" : done.saved === "saved" ? "GTT saved" : "GTT created"} symbol={symbol} onBack={onClose} strip={strip} footer={{ label: "Done", onPress: onClose, tone: "primary", testId: "action-done" }}>
        <FormCard testId="gtt-result">
          <div className="space-y-1.5 px-3 py-4">
            <p data-testid="result-status" className="text-[15px] text-emerald-700">
              {done.saved === "deleted" ? "GTT deleted" : done.saved === "saved" ? "GTT saved (the old one was cancelled)" : "GTT created"}
            </p>
            <p data-testid="result-line" className="text-[14px] text-slate-800">
              {done.text}
            </p>
            {done.saved !== "deleted" && <p className="text-[12px] text-slate-500">It is checked while Zestoxx is open, and on your next visit if it was shut.</p>}
          </div>
        </FormCard>
        <button type="button" data-testid="result-gtt-list" onClick={() => onLeave("/app/orders?tab=gtt")} className="h-11 w-full rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-blue-700">
          View GTT orders
        </button>
      </ActionScreen>
    );
  }

  const required = qty != null && trigger > 0 ? qty * trigger : null;
  const short = required != null && (side === "buy" ? required > cash : qty != null && qty > held);
  const verb = existing ? "Save GTT" : "Create GTT";

  return (
    <ActionScreen label={existing ? "Edit GTT" : "Create GTT"} symbol={symbol} onBack={onClose} strip={strip} footer={{ label: `${verb} · ${symbol} · ${qty ?? "?"}`, onPress: submit, tone: "primary", testId: "action-submit" }}>
      {error && <Notice tone="error" testId="gtt-error">{error}</Notice>}
      {price == null && <Notice tone="warn" testId="gtt-no-price">{noTrades ? "No recent trades in this symbol, so there is no live price. A GTT needs one to place." : "There is no live price for this symbol yet, so a GTT cannot be placed."}</Notice>}
      <FormCard testId="gtt-fields">
        <FormRow label="Type">
          <Choice label="Side" value={side} onChange={(v) => (setSide(v), setError(null))} options={[{ id: "buy", label: "Buy", testId: "side-buy" }, { id: "sell", label: "Sell", testId: "side-sell" }]} />
        </FormRow>
        <FormRow label="Trigger price" htmlFor="gtt-trigger" hint={away == null ? "The price at which the order trades." : <span data-testid="gtt-away">{Math.abs(away).toFixed(2)}% {away >= 0 ? "above" : "below"} LTP{kind ? ` · ${kind}` : ""}</span>}>
          <Field id="gtt-trigger" testId="gtt-trigger" ariaLabel="Trigger price" value={triggerText} onChange={(v) => (setTriggerText(v), setError(null))} unit="₹" error={triggerText !== "" && !(trigger > 0)} />
        </FormRow>
        <FormRow label="Quantity" htmlFor="gtt-qty" hint={side === "sell" ? `You hold ${held}.` : undefined}>
          <Field id="gtt-qty" testId="gtt-qty" ariaLabel="Quantity" inputMode="numeric" value={qtyText} onChange={(v) => (setQtyText(v), setError(null))} error={qtyText !== "" && qty == null} />
        </FormRow>
        <FormRow label="Limit price" hint="The same as the trigger: Zestoxx fills a GTT at the trigger price.">
          <p data-testid="gtt-limit" className="pt-2.5 font-mono text-[14px] text-slate-900">
            {trigger > 0 ? fmt(trigger, type) : "--"}
          </p>
        </FormRow>
      </FormCard>
      {kind && qty != null && trigger > 0 && (
        <p data-testid="gtt-kind" className="px-1 text-[13px] text-slate-700">
          {kind}: {side} {qty} when the price reaches {fmt(trigger, type)}
        </p>
      )}
      <FormCard testId="gtt-funds">
        <FormRow label="Funds">
          <div className="space-y-1 pt-2 text-[13px]">
            {side === "buy" ? (
              <>
                <div className="flex justify-between"><span className="text-slate-500">Needed at the trigger</span><span data-testid="funds-required" className={"font-mono " + (short ? "text-rose-600" : "text-slate-900")}>{required == null ? "--" : fmtINR(required)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Available</span><span data-testid="funds-available" className="font-mono text-slate-900">{fmtINR(cash)}</span></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-slate-500">Selling</span><span data-testid="funds-required" className={"font-mono " + (short ? "text-rose-600" : "text-slate-900")}>{qty ?? "--"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">You hold</span><span data-testid="funds-available" className="font-mono text-slate-900">{held}</span></div>
              </>
            )}
          </div>
        </FormRow>
      </FormCard>
      <Notice tone="info" testId="gtt-note">
        A simulated order, not guaranteed. Zestoxx checks the price while the app is open. If it is shut, the next time you open it the candles since you placed this order are checked, and it fills at the first candle that crossed the trigger, marked simulated. If you no longer have the cash or shares when it triggers, it is cancelled.
      </Notice>
      {existing && (
        <>
          <Notice tone="warn" testId="gtt-edit-note">Saving cancels this GTT and creates a new one that starts now, so the time it was placed resets: only candles from now on can trigger it.</Notice>
          {confirmDelete ? (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" data-testid="gtt-delete-confirm" onClick={() => (cancelOrder(existing.id), setDone({ saved: "deleted", text: `${kindOf(existing)}: ${existing.side} ${existing.qty} ${symbol} at ${fmt(existing.limitPrice, type)}` }))} className="h-11 rounded-lg bg-rose-600 text-[14px] font-medium text-white">
                Yes, delete it
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-11 rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-slate-700">
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" data-testid="gtt-delete" onClick={() => setConfirmDelete(true)} className="h-11 w-full rounded-lg border border-rose-300 bg-white text-[14px] font-medium text-rose-600">
              Delete this GTT
            </button>
          )}
        </>
      )}
    </ActionScreen>
  );
}

const kindOf = (o: { side: "buy" | "sell"; trigger?: "above" | "below" }) => gttKind(o.side, o.trigger ?? "above");
