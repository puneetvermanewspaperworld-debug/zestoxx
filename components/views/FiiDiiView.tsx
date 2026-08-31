"use client";

import React, { useState } from "react";
import { Landmark } from "lucide-react";
import { FIIDII, type FiiDiiRow } from "@/lib/history";

type Period = "daily" | "weekly" | "monthly";

interface LabelledRow extends FiiDiiRow {
  label: string;
}

function fiiDiiRows(period: Period): LabelledRow[] {
  let rows: FiiDiiRow[];
  if (period === "daily") {
    rows = FIIDII.slice(-20).map((r) => ({ ...r }));
  } else {
    const groupSize = period === "weekly" ? 5 : 21;
    const chunks: FiiDiiRow[] = [];
    for (let i = 0; i < FIIDII.length; i += groupSize) {
      const chunk = FIIDII.slice(i, i + groupSize);
      if (!chunk.length) continue;
      const sum = (k: keyof FiiDiiRow) => chunk.reduce((s, r) => s + (r[k] as number), 0);
      chunks.push({
        date: chunk[0].date,
        fiiBuy: sum("fiiBuy"),
        fiiSell: sum("fiiSell"),
        fiiNet: sum("fiiNet"),
        diiBuy: sum("diiBuy"),
        diiSell: sum("diiSell"),
        diiNet: sum("diiNet"),
      });
    }
    rows = chunks.slice(period === "weekly" ? -16 : -12);
  }
  // Compact axis labels: show the month only when it changes (or on the first bar).
  let lastMonth: string | null = null;
  return rows.map((r, i) => {
    let label: string;
    if (period === "monthly") {
      label = r.date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    } else {
      const day = r.date.toLocaleDateString("en-IN", { day: "2-digit" });
      const month = r.date.toLocaleDateString("en-IN", { month: "short" });
      label = i === 0 || month !== lastMonth ? `${day} ${month}` : day;
      lastMonth = month;
    }
    return { ...r, label };
  });
}

export default function FiiDiiView() {
  const [period, setPeriod] = useState<Period>("daily");
  const rows = fiiDiiRows(period);
  const latest = rows[rows.length - 1];
  const maxAbs = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.fiiNet), Math.abs(r.diiNet)]));
  const cr = (v: number) =>
    `₹${v >= 0 ? "+" : ""}${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-4">
        <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-slate-900">
          <Landmark size={16} className="text-blue-600" /> FII / DII Activity
        </h2>
        <p className="mt-1 text-[12px] text-slate-500">
          Foreign and Domestic Institutional Investor net flows in the NSE/BSE cash segment (₹ Crore)
          — a market-wide sentiment gauge none of the paper-trading apps surface alongside live
          charts.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Latest FII Net</div>
            <div
              className={
                "mt-0.5 font-mono text-[16px] font-semibold " +
                (latest.fiiNet >= 0 ? "text-emerald-500" : "text-rose-500")
              }
            >
              {cr(latest.fiiNet)}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Latest DII Net</div>
            <div
              className={
                "mt-0.5 font-mono text-[16px] font-semibold " +
                (latest.diiNet >= 0 ? "text-emerald-500" : "text-rose-500")
              }
            >
              {cr(latest.diiNet)}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate-400">
              20-Session FII Net
            </div>
            <div className="mt-0.5 font-mono text-[16px] font-semibold text-slate-900">
              {cr(FIIDII.slice(-20).reduce((s, r) => s + r.fiiNet, 0))}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-slate-400">
              20-Session DII Net
            </div>
            <div className="mt-0.5 font-mono text-[16px] font-semibold text-slate-900">
              {cr(FIIDII.slice(-20).reduce((s, r) => s + r.diiNet, 0))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-blue-600" /> FII Net
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-blue-400" /> DII Net
            </span>
          </div>
          <div className="flex gap-1 rounded-md border border-slate-200 p-0.5">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={
                  "rounded px-2.5 py-1 text-[11.5px] font-medium capitalize " +
                  (period === p ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900")
                }
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex h-[150px] items-end gap-2.5 overflow-x-auto pb-1">
          {rows.map((r, i) => (
            <div key={i} className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: 30 }}>
              <div className="flex h-[118px] items-end gap-0.5">
                <div
                  className="w-3 rounded-t"
                  style={{
                    height: `${(Math.abs(r.fiiNet) / maxAbs) * 100}%`,
                    background: r.fiiNet >= 0 ? "#2563EB" : "#F43F5E",
                  }}
                  title={cr(r.fiiNet)}
                />
                <div
                  className="w-3 rounded-t"
                  style={{
                    height: `${(Math.abs(r.diiNet) / maxAbs) * 100}%`,
                    background: r.diiNet >= 0 ? "#60A5FA" : "#F43F5E",
                  }}
                  title={cr(r.diiNet)}
                />
              </div>
              <div className="whitespace-nowrap text-[9px] text-slate-400">{r.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-2 text-left font-medium">Period</th>
                <th className="px-3 py-2 text-right font-medium">FII Buy</th>
                <th className="px-3 py-2 text-right font-medium">FII Sell</th>
                <th className="px-3 py-2 text-right font-medium">FII Net</th>
                <th className="px-3 py-2 text-right font-medium">DII Buy</th>
                <th className="px-3 py-2 text-right font-medium">DII Sell</th>
                <th className="px-3 py-2 text-right font-medium">DII Net</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r, i) => (
                <tr key={i} className="border-b border-blue-50 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-900">{r.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{r.fiiBuy.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{r.fiiSell.toFixed(0)}</td>
                  <td
                    className={
                      "px-3 py-2 text-right font-mono " +
                      (r.fiiNet >= 0 ? "text-emerald-500" : "text-rose-500")
                    }
                  >
                    {cr(r.fiiNet)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{r.diiBuy.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{r.diiSell.toFixed(0)}</td>
                  <td
                    className={
                      "px-3 py-2 text-right font-mono " +
                      (r.diiNet >= 0 ? "text-emerald-500" : "text-rose-500")
                    }
                  >
                    {cr(r.diiNet)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
