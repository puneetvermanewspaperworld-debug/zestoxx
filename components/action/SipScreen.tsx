"use client";

import React, { useState } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { exchangeOf } from "@/lib/actions";
import { fmt, fmtINR, fmtIsoDate, istClock } from "@/lib/helpers";
import { MAX_SIPS, SIP_MIN_AMOUNT, gtdBounds, sipFill, type SipFrequency } from "@/lib/orders";
import { SYMBOLS, typeOf } from "@/lib/symbols";
import ActionScreen from "./ActionScreen";
import { Choice, Field, FormCard, FormRow, Notice, PriceStrip } from "./ActionParts";

const SIP_STOCKS = SYMBOLS.filter((s) => s.type === "stock");

/**
 * Start a Stock SIP, full screen: a fixed ₹ amount of a stock bought on a schedule, in whole shares, as a paper trade. The stocks are the ones the
 * engine can run a SIP on. The note says what really happens: installments run on weekdays after the 9:15 IST open while Zestoxx is open; one
 * missed while it was shut is skipped, not bought later in a lump.
 */
export default function SipScreen({ onClose, onLeave }: { onClose: () => void; onLeave: (href: string) => void }) {
  const { createSip, sips, live, chgFor, hasFeedQuote, prevCloseFor } = useZestoxx();
  const [symbol, setSymbol] = useState(SIP_STOCKS[0].id);
  const [amountText, setAmountText] = useState("5000");
  const [frequency, setFrequency] = useState<SipFrequency>("monthly");
  const [startDate, setStartDate] = useState(() => istClock().date);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<null | { symbol: string; amount: number; frequency: SipFrequency; startDate: string }>(null);
  const { min, max } = gtdBounds(istClock().date);

  const price = live[symbol] > 0 ? live[symbol] : null;
  const pct = price != null && hasFeedQuote(symbol) ? chgFor(symbol) : null;
  const change = price != null && pct != null ? price - prevCloseFor(symbol) : null;
  const amount = Number(amountText);
  const strip = <PriceStrip exchange={exchangeOf(symbol)} price={price} type={typeOf(symbol)} change={change} pct={pct} />;
  const fill = price != null && amount > 0 ? sipFill(amount, price) : null;

  const submit = () => {
    setError(null);
    if (!/^\d+(\.\d+)?$/.test(amountText.trim()) || !(amount > 0)) return setError("Enter the amount to invest each time, in rupees.");
    const err = createSip({ symbol, amount, frequency, startDate });
    if (err) return setError(err);
    setStarted({ symbol, amount, frequency, startDate });
  };

  if (started) {
    return (
      <ActionScreen label="Stock SIP" symbol={started.symbol} onBack={onClose} strip={strip} footer={{ label: "Done", onPress: onClose, tone: "primary", testId: "action-done" }}>
        <FormCard testId="sip-result">
          <div className="space-y-1.5 px-3 py-4">
            <p data-testid="result-status" className="text-[15px] text-emerald-700">SIP started</p>
            <p data-testid="result-line" className="text-[14px] text-slate-800">
              {fmtINR(started.amount)} of {started.symbol} {started.frequency}, from {fmtIsoDate(started.startDate)}
            </p>
            <p className="text-[12px] text-slate-500">Each installment runs on a weekday after the 9:15 IST open, while Zestoxx is open.</p>
          </div>
        </FormCard>
        <button type="button" data-testid="result-sips" onClick={() => onLeave("/app/orders?tab=sips")} className="h-11 w-full rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-blue-700">
          View SIPs
        </button>
      </ActionScreen>
    );
  }

  return (
    <ActionScreen label="New Stock SIP" symbol={symbol} onBack={onClose} strip={strip} footer={{ label: `Start SIP · ${symbol} · ${amount > 0 ? fmtINR(amount) : "?"}`, onPress: submit, tone: "primary", testId: "action-submit" }}>
      {error && <Notice tone="error" testId="sip-error">{error}</Notice>}
      <FormCard testId="sip-fields">
        <FormRow label="Stock" htmlFor="sip-symbol">
          <select id="sip-symbol" data-testid="sip-symbol" value={symbol} onChange={(e) => (setSymbol(e.target.value), setError(null))} className="block min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-2 text-slate-900 outline-none focus:border-blue-500">
            {SIP_STOCKS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
        </FormRow>
        <FormRow label="Amount" htmlFor="sip-amount" hint={fill ? <span data-testid="sip-buys">At {fmt(price as number, typeOf(symbol))} that buys {fill.qty} whole share{fill.qty === 1 ? "" : "s"} ({fmtINR(fill.cost)}).</span> : `At least ${fmtINR(SIP_MIN_AMOUNT)} each time.`}>
          <Field id="sip-amount" testId="sip-amount" ariaLabel="Amount per installment" value={amountText} onChange={(v) => (setAmountText(v), setError(null))} unit="₹" error={amountText !== "" && !(amount > 0)} />
        </FormRow>
        <FormRow label="Frequency">
          <Choice label="Frequency" value={frequency} onChange={(v) => (setFrequency(v), setError(null))} options={[{ id: "weekly", label: "Weekly", testId: "freq-weekly" }, { id: "monthly", label: "Monthly", testId: "freq-monthly" }]} />
        </FormRow>
        <FormRow label="First installment" htmlFor="sip-start">
          <input id="sip-start" data-testid="sip-start" type="date" min={min} max={max} value={startDate} onChange={(e) => (setStartDate(e.target.value), setError(null))} className="block min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-slate-900 outline-none focus:border-blue-500" />
        </FormRow>
      </FormCard>
      <Notice tone="info" testId="sip-note">
        Buys a fixed ₹ amount of the stock on a schedule, in whole shares, as a paper trade. Installments run on weekdays after the 9:15 IST open while Zestoxx is open; one missed while it was closed is skipped, not bought later in a lump. Exchange holidays are not modelled. You can have up to {MAX_SIPS} SIPs (you have {sips.length}).
      </Notice>
    </ActionScreen>
  );
}
