"use client";

import React from "react";
import type { GreekRow } from "@/lib/fno/engine";
import { TONE_CLASS, nf, rsS, tone } from "@/lib/fno/format";

type Net = { delta: number; gamma: number; theta: number; vega: number };

const th = "whitespace-nowrap px-1 py-1.5 text-right text-[12px] font-medium text-slate-500 md:px-2.5 md:text-[11px]";
const td = "min-w-[72px] whitespace-nowrap px-1 py-1.5 text-right font-mono text-[12px] md:min-w-0 md:px-2.5";
const labelCell = "w-[76px] min-w-[76px] bg-white px-1.5 py-1.5 text-[12px] leading-tight text-slate-600 md:w-auto md:px-2.5";

/**
 * Greeks leg by leg, for trades with more than one leg. Legs run across, as the strike comparison does, so the
 * first column (the measure) can stay pinned and at least three columns show at 360px: the total first, then the legs.
 * Every figure is for the lots in the trade (a short leg shows its sign), so the legs add up to the total.
 */
export default function LegGreeks({ rows, net }: { rows: GreekRow[]; net: Net }) {
  if (rows.length < 2) return null;
  // a real minus sign, like the rest of the page (toLocaleString gives a hyphen)
  // (and never "−0.0": a value that rounds to zero shows without a sign)
  const fixed = (v: number, d: number) => {
    const t = nf(v, d);
    return Number(t.replace(/,/g, "")) === 0 ? nf(0, d) : t.replace("-", "−");
  };
  const gamma = (v: number) => fixed(v, 4);
  const lines: { short: string; long: string; total: number; of: (r: GreekRow) => number; fmt: (v: number) => string; toned: boolean }[] = [
    { short: "Delta", long: "Delta (index points of exposure)", total: net.delta, of: (r) => r.delta, fmt: (v) => fixed(v, 1), toned: true },
    { short: "Gamma", long: "Gamma (change in delta per index point)", total: net.gamma, of: (r) => r.gamma, fmt: gamma, toned: false },
    { short: "Theta / day", long: "Theta (₹ per day)", total: net.theta, of: (r) => r.theta, fmt: (v) => rsS(v), toned: true },
    { short: "Vega / vol pt", long: "Vega (₹ per 1 volatility point)", total: net.vega, of: (r) => r.vega, fmt: (v) => rsS(v), toned: true },
  ];
  return (
    <div className="mt-3">
      <h3 className="text-[13px] font-semibold text-slate-900">Leg by leg</h3>
      <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-200">
        <table aria-label="Greeks for each leg" className="w-full border-collapse md:min-w-0">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-[76px] min-w-[76px] bg-slate-50 px-1.5 py-1.5 md:w-auto md:px-2.5" />
              <th className={th + " text-slate-900"}>Total</th>
              {rows.map((r) => (
                <th key={r.leg.id} className={th}>
                  <div>
                    {r.leg.sign > 0 ? "Buy" : "Sell"}
                    {r.leg.lots > 1 ? " ×" + r.leg.lots : ""}
                  </div>
                  <div className="text-[12px] font-bold text-slate-900">{r.leg.type === "FUT" ? "Future" : `${nf(r.leg.strike)} ${r.leg.type}`}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.short} className="border-t border-slate-100">
                <td className={labelCell}>
                  <span className="md:hidden">{l.short}</span>
                  <span className="hidden md:inline">{l.long}</span>
                </td>
                <td className={td + " font-semibold " + (l.toned ? TONE_CLASS[tone(l.total)] : "")}>{l.fmt(l.total)}</td>
                {rows.map((r) => (
                  <td key={r.leg.id} className={td + " " + (l.toned ? TONE_CLASS[tone(l.of(r))] : "")}>
                    {l.fmt(l.of(r))}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-slate-100">
              <td className={labelCell}>
                <span className="md:hidden">Vol used</span>
                <span className="hidden md:inline">Volatility used (this leg’s own)</span>
              </td>
              <td className={td + " text-slate-400"}>–</td>
              {rows.map((r) => (
                <td key={r.leg.id} className={td}>
                  {r.leg.iv == null ? "–" : `${(r.leg.iv * 100).toFixed(1)}%`}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
