"use client";

import React, { useMemo, useState } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { useAction } from "@/components/action/useAction";
import { useWatchSymbols } from "@/components/useWatchSymbols";
import { fmt } from "@/lib/helpers";
import { SYMBOLS, typeOf } from "@/lib/symbols";
import { isTradableId } from "@/lib/dynamic-symbols";

/**
 * Alerts on a phone: the ones that are set, each with Edit and Delete (both open the alert screen), and a row to start a new one for a symbol.
 * A new alert is easiest from a symbol's sheet; this row is for when you know the symbol: the built-in ones and any in your lists.
 */
export default function PhoneAlerts() {
  const { alerts, setAlerts, live, watchlist, lists } = useZestoxx();
  const { openAction } = useAction();
  const symbols = useMemo(() => {
    const seen = new Set<string>();
    for (const s of [...SYMBOLS.map((x) => x.id), ...watchlist, ...lists.flatMap((l) => l.symbols), ...alerts.map((a) => a.symbol)]) if (isTradableId(s)) seen.add(s);
    return [...seen];
  }, [watchlist, lists, alerts]);
  const [symbol, setSymbol] = useState(symbols[0] ?? "RELIANCE");
  useWatchSymbols(alerts.map((a) => a.symbol));

  return (
    <div className="space-y-3" data-testid="phone-alerts">
      <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="alert-symbol" className="text-[12px] text-slate-500">
            New alert for
          </label>
          <select id="alert-symbol" data-testid="alert-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-0.5 block min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-2 text-slate-900 outline-none">
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button type="button" data-testid="alert-new" onClick={() => openAction({ kind: "alert", symbol })} className="h-11 shrink-0 rounded-lg bg-blue-600 px-4 text-[14px] font-medium text-white">
          New alert
        </button>
      </div>
      {alerts.length === 0 ? (
        <div data-testid="no-alerts" className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-[13px] text-slate-500">
          No alerts set. Pick a symbol above, or tap Set alert on a symbol&apos;s sheet.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="alert-list">
          {alerts.map((a) => (
            <li key={a.id} data-testid={`alert-row-${a.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[14px] text-slate-900">
                {a.symbol} <span className="text-slate-500">{a.condition}</span> <span className="font-mono">{fmt(a.target, typeOf(a.symbol))}</span>
              </p>
              <p className="mt-0.5 text-[12px] text-slate-500">{live[a.symbol] > 0 ? `Now ${fmt(live[a.symbol], typeOf(a.symbol))}` : "No live price now"}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" data-testid={`alert-edit-${a.id}`} onClick={() => openAction({ kind: "alert", symbol: a.symbol, editId: String(a.id) })} className="min-h-[44px] rounded-lg border border-slate-200 text-[13px] font-medium text-blue-700">
                  Edit alert
                </button>
                <button type="button" data-testid={`alert-remove-${a.id}`} onClick={() => setAlerts((cur) => cur.filter((x) => x.id !== a.id))} className="min-h-[44px] rounded-lg border border-slate-200 text-[13px] font-medium text-rose-600">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
