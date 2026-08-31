"use client";

import React, { useState } from "react";
import { Table2, Grid3x3 } from "lucide-react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOLS } from "@/lib/symbols";
import { fmt } from "@/lib/helpers";

type SortKey = "price" | "chg" | "dayHigh" | "dayLow" | "volume";
type SortDir = "asc" | "desc";

function SortHead({
  label,
  k,
  align = "right",
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  align?: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th
      onClick={() => onSort(k)}
      className={`cursor-pointer px-3 py-2 text-${align} font-medium text-slate-500 hover:text-slate-900`}
    >
      {label} {sortKey === k && (sortDir === "desc" ? "↓" : "↑")}
    </th>
  );
}

export default function MarketsView() {
  const { live, histories, setSelected, setActiveView } = useZestoxx();
  const [sortKey, setSortKey] = useState<SortKey>("chg");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<"table" | "heatmap">("table");

  const rows = SYMBOLS.map((s) => {
    const candles = histories[s.id];
    const open = candles[0].open;
    const price = live[s.id];
    const chg = ((price - open) / open) * 100;
    const dayHigh = Math.max(...candles.slice(-24).map((c) => c.high));
    const dayLow = Math.min(...candles.slice(-24).map((c) => c.low));
    const volume = candles.slice(-24).reduce((s2, c) => s2 + c.volume, 0);
    return { ...s, price, chg, dayHigh, dayLow, volume };
  }).sort((a, b) => (sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };
  const head = (label: string, k: SortKey) => (
    <SortHead label={label} k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-slate-900">Markets</h2>
          <p className="text-[12px] text-slate-400">
            All symbols across equities, indices and crypto — click a symbol to trade.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-slate-200 p-0.5">
          <button
            onClick={() => setView("table")}
            className={
              "flex items-center gap-1 rounded px-2.5 py-1 text-[11.5px] font-medium " +
              (view === "table" ? "bg-blue-600 text-slate-50" : "text-slate-500")
            }
          >
            <Table2 size={12} /> Table
          </button>
          <button
            onClick={() => setView("heatmap")}
            className={
              "flex items-center gap-1 rounded px-2.5 py-1 text-[11.5px] font-medium " +
              (view === "heatmap" ? "bg-blue-600 text-slate-50" : "text-slate-500")
            }
          >
            <Grid3x3 size={12} /> Heatmap
          </button>
        </div>
      </div>
      {view === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2 text-left font-medium text-slate-500">Symbol</th>
                {head("Price", "price")}
                {head("Chg %", "chg")}
                {head("Day High", "dayHigh")}
                {head("Day Low", "dayLow")}
                {head("Volume", "volume")}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => {
                    setSelected(r.id);
                    setActiveView("trade");
                  }}
                  className="cursor-pointer border-b border-blue-50 hover:bg-slate-50"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-900">{r.id}</div>
                    <div className="text-[10.5px] text-slate-400">{r.name}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-900">{fmt(r.price, r.type)}</td>
                  <td
                    className={
                      "px-3 py-2.5 text-right font-mono " +
                      (r.chg >= 0 ? "text-emerald-500" : "text-rose-500")
                    }
                  >
                    {r.chg >= 0 ? "+" : ""}
                    {r.chg.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">{fmt(r.dayHigh, r.type)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">{fmt(r.dayLow, r.type)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                    {(r.volume / 1000).toFixed(0)}k
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => {
            const intensity = Math.min(1, Math.abs(r.chg) / 4);
            const bg =
              r.chg >= 0
                ? `rgba(52,211,153,${0.12 + intensity * 0.55})`
                : `rgba(248,113,113,${0.12 + intensity * 0.55})`;
            return (
              <div
                key={r.id}
                onClick={() => {
                  setSelected(r.id);
                  setActiveView("trade");
                }}
                className="cursor-pointer rounded-lg p-3 transition-transform hover:scale-[1.02]"
                style={{ background: bg }}
              >
                <div className="text-[13px] font-semibold text-slate-900">{r.id}</div>
                <div className="mt-1 font-mono text-[11.5px] text-slate-700">{fmt(r.price, r.type)}</div>
                <div className="font-mono text-[13px] font-semibold text-slate-900">
                  {r.chg >= 0 ? "+" : ""}
                  {r.chg.toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
