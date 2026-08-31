"use client";

import React, { useState } from "react";
import { BellRing } from "lucide-react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOLS, SYMBOL_MAP } from "@/lib/symbols";
import { fmt } from "@/lib/helpers";

export default function AlertsView() {
  const { alerts, setAlerts, live, alertPrefill } = useZestoxx();
  const [symbol, setSymbol] = useState(alertPrefill || SYMBOLS[0].id);
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");

  const addAlert = () => {
    if (!target || parseFloat(target) <= 0) return;
    setAlerts((a) => [
      {
        id: Date.now() + Math.random(),
        symbol,
        condition,
        target: parseFloat(target),
        createdAt: new Date().toLocaleTimeString("en-IN"),
      },
      ...a,
    ]);
    setTarget("");
  };
  const removeAlert = (id: number) => setAlerts((a) => a.filter((x) => x.id !== id));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-1.5 font-display text-[13px] font-semibold text-slate-900">
          <BellRing size={14} /> Set a Price Alert
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[11px] text-slate-500">Symbol</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="mt-0.5 block rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12.5px] text-slate-900 outline-none"
            >
              {SYMBOLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-500">Condition</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as "above" | "below")}
              className="mt-0.5 block rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12.5px] text-slate-900 outline-none"
            >
              <option value="above">Price goes above</option>
              <option value="below">Price goes below</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-500">Target Price</label>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              type="number"
              placeholder={live[symbol]?.toFixed(2)}
              className="mt-0.5 block w-32 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[12.5px] text-slate-900 outline-none focus:border-blue-400"
            />
          </div>
          <button
            onClick={addAlert}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-[12.5px] font-semibold text-slate-50 hover:opacity-90"
          >
            Create Alert
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-display text-[13px] font-semibold text-slate-900">Active Alerts</h3>
        {alerts.length === 0 ? (
          <div className="py-3 text-center text-[12px] text-slate-400">
            No alerts set. Create one above to get notified when a symbol crosses your target.
          </div>
        ) : (
          <div className="space-y-1.5">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-[12px]"
              >
                <span className="text-slate-900">
                  {a.symbol} {a.condition}{" "}
                  <span className="font-mono">{fmt(a.target, SYMBOL_MAP[a.symbol].type)}</span>
                </span>
                <button
                  onClick={() => removeAlert(a.id)}
                  className="text-rose-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
