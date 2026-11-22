"use client";

import React, { useState } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { useWatchSymbols } from "@/components/useWatchSymbols";
import { exchangeOf } from "@/lib/actions";
import { fmt } from "@/lib/helpers";
import { typeOf } from "@/lib/symbols";
import { NO_RECENT_TRADES } from "@/lib/dynamic-symbols";
import type { PriceAlert } from "@/lib/types";
import ActionScreen from "./ActionScreen";
import { Choice, Field, FormCard, FormRow, Notice, PriceStrip } from "./ActionParts";

/**
 * Create, edit or delete a price alert, full screen. An alert is a symbol, a side of the price (above or below) and a target: it fires once, as a
 * message while Zestoxx is open, and is then removed. That is all the engine has, so that is all that is here. Editing is a delete and a new
 * alert, and the screen says the created time resets.
 */
export default function AlertScreen({ symbol, editId, onClose, onLeave }: { symbol: string; editId?: string; onClose: () => void; onLeave: (href: string) => void }) {
  const { live, alerts, setAlerts, chgFor, hasFeedQuote, prevCloseFor, quoteStateOf } = useZestoxx();
  useWatchSymbols([symbol]);
  const existing = editId ? alerts.find((a) => String(a.id) === editId && a.symbol === symbol) : undefined;
  const [condition, setCondition] = useState<"above" | "below">(existing?.condition ?? "above");
  const [targetText, setTargetText] = useState(existing ? String(existing.target) : "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { what: "set" | "saved" | "deleted"; text: string }>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const type = typeOf(symbol);
  const price = live[symbol] > 0 ? live[symbol] : null;
  const pct = price != null && hasFeedQuote(symbol) ? chgFor(symbol) : null;
  const change = price != null && pct != null ? price - prevCloseFor(symbol) : null;
  const target = Number(targetText);
  const noTrades = quoteStateOf(symbol) === "none";
  const away = price != null && target > 0 ? ((target - price) / price) * 100 : null;
  const strip = <PriceStrip exchange={exchangeOf(symbol)} price={price} type={type} change={change} pct={pct} noPriceText={noTrades ? NO_RECENT_TRADES : undefined} />;
  const sentence = (c: "above" | "below", t: number) => `${symbol} goes ${c} ${fmt(t, type)}`;

  const submit = () => {
    setError(null);
    if (!(target > 0) || !Number.isFinite(target)) return setError("Enter a target price above 0.");
    // an alert whose target the price is already past would fire at once: say so instead
    if (price != null && condition === "above" && price >= target) return setError(`The price is already at or above ${fmt(target, type)}. Pick a target above the live price, ${fmt(price, type)}.`);
    if (price != null && condition === "below" && price <= target) return setError(`The price is already at or below ${fmt(target, type)}. Pick a target below the live price, ${fmt(price, type)}.`);
    const a: PriceAlert = { id: Date.now() + Math.random(), symbol, condition, target, createdAt: new Date().toLocaleTimeString("en-IN") };
    setAlerts((cur) => [a, ...cur.filter((x) => x.id !== existing?.id)]);
    setDone({ what: existing ? "saved" : "set", text: `Alert me when ${sentence(condition, target)}` });
  };

  if (editId && !existing && !done) {
    return (
      <ActionScreen label="Edit alert" symbol={symbol} onBack={onClose} strip={strip} footer={{ label: "Back", onPress: onClose, tone: "primary", testId: "action-done" }}>
        <Notice tone="warn" testId="alert-missing">That alert is no longer set: it may have fired or been deleted. Open the alerts list to pick it again.</Notice>
      </ActionScreen>
    );
  }

  if (done) {
    return (
      <ActionScreen label={done.what === "deleted" ? "Alert deleted" : done.what === "saved" ? "Alert saved" : "Alert set"} symbol={symbol} onBack={onClose} strip={strip} footer={{ label: "Done", onPress: onClose, tone: "primary", testId: "action-done" }}>
        <FormCard testId="alert-result">
          <div className="space-y-1.5 px-3 py-4">
            <p data-testid="result-status" className="text-[15px] text-emerald-700">
              {done.what === "deleted" ? "Alert deleted" : done.what === "saved" ? "Alert saved (the old one was deleted)" : "Alert set"}
            </p>
            <p data-testid="result-line" className="text-[14px] text-slate-800">
              {done.text}
            </p>
            {done.what !== "deleted" && <p className="text-[12px] text-slate-500">It fires once, as a message, while Zestoxx is open.</p>}
          </div>
        </FormCard>
        <button type="button" data-testid="result-alert-list" onClick={() => onLeave("/app/orders?tab=alerts")} className="h-11 w-full rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-blue-700">
          View alerts
        </button>
      </ActionScreen>
    );
  }

  return (
    <ActionScreen label={existing ? "Edit alert" : "Set alert"} symbol={symbol} onBack={onClose} strip={strip} footer={{ label: `${existing ? "Save alert" : "Set alert"} · ${symbol}`, onPress: submit, tone: "primary", testId: "action-submit" }}>
      {error && <Notice tone="error" testId="alert-error">{error}</Notice>}
      {price == null && <Notice tone="warn" testId="alert-no-price">{noTrades ? "No recent trades in this symbol, so there is no live price to measure against. You can still set a target." : "There is no live price for this symbol yet, so the distance to the target cannot be shown."}</Notice>}
      <FormCard testId="alert-fields">
        <FormRow label="Alert me when">
          <Choice label="Condition" value={condition} onChange={(v) => (setCondition(v), setError(null))} options={[{ id: "above", label: "Goes above", testId: "cond-above" }, { id: "below", label: "Goes below", testId: "cond-below" }]} />
        </FormRow>
        <FormRow label="Target price" htmlFor="alert-target" hint={away == null ? (price != null ? `Now ${fmt(price, type)}.` : undefined) : <span data-testid="alert-away">{Math.abs(away).toFixed(2)}% {away >= 0 ? "above" : "below"} the live price</span>}>
          <Field id="alert-target" testId="alert-target" ariaLabel="Target price" value={targetText} onChange={(v) => (setTargetText(v), setError(null))} unit="₹" error={targetText !== "" && !(target > 0)} />
        </FormRow>
      </FormCard>
      <Notice tone="info" testId="alert-note">An alert fires once, as a message, while Zestoxx is open. It cannot reach you when the app is shut, and it is removed after it fires.</Notice>
      {existing && (
        <>
          <Notice tone="warn" testId="alert-edit-note">Saving deletes this alert and sets a new one, so the time it was created resets.</Notice>
          {confirmDelete ? (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" data-testid="alert-delete-confirm" onClick={() => (setAlerts((cur) => cur.filter((x) => x.id !== existing.id)), setDone({ what: "deleted", text: `Alert for ${sentence(existing.condition, existing.target)}` }))} className="h-11 rounded-lg bg-rose-600 text-[14px] font-medium text-white">
                Yes, delete it
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-11 rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-slate-700">
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" data-testid="alert-delete" onClick={() => setConfirmDelete(true)} className="h-11 w-full rounded-lg border border-rose-300 bg-white text-[14px] font-medium text-rose-600">
              Delete this alert
            </button>
          )}
        </>
      )}
    </ActionScreen>
  );
}
