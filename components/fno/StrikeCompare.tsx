"use client";

import React from "react";
import type { OptType } from "@/lib/fno/pricing";
import type { Market } from "@/lib/fno/engine";
import { CMP_MOVES, type Comparison, type Hold } from "@/lib/fno/strikes";
import { argBest, columnLabel, compareInsights } from "@/lib/fno/explain";
import { compact, nf, pct, rs } from "@/lib/fno/format";

export type CmpMode = "lot" | "risk" | "budget";
export interface CmpState {
  dir: OptType;
  risk: number;
  hold: Hold;
  mode: CmpMode;
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; text: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={"rounded-md px-2.5 py-1 text-[12px] font-medium " + (value === o.id ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900")}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

const th = "whitespace-nowrap px-1.5 py-1.5 text-right text-[12px] font-medium text-slate-500 md:px-2.5 md:text-[11px]";
const td = "min-w-[72px] whitespace-nowrap px-1.5 py-1.5 text-right font-mono text-[12px] text-slate-800 md:min-w-0 md:px-2.5";
// the row label: pinned on the left, short, and allowed two lines on phones
const labelCell = "w-[84px] min-w-[84px] bg-white px-1.5 py-1.5 text-[12px] leading-tight text-slate-600 md:w-auto md:px-2.5";
const dim = (t: string, long?: string) => (
  <span className="block text-[12px] font-normal text-slate-500 md:text-[10px]">
    {long ? (
      <>
        <span className="md:hidden">{t}</span>
        <span className="hidden md:inline">{long}</span>
      </>
    ) : (
      t
    )}
  </span>
);

export default function StrikeCompare({
  m,
  name,
  result,
  state,
  onChange,
  onLoad,
  usingChain,
}: {
  m: Market;
  name: string;
  result: Comparison;
  state: CmpState;
  onChange: (s: CmpState) => void;
  onLoad: (strike: number, lots: number) => void;
  /** whether premiums come from the live chain (else the model) */
  usingChain: boolean;
}) {
  const { cols, d } = result;
  const holdTxt = state.hold === "same" ? "the same day" : state.hold === "half" ? `halfway to expiry (${nf(d, d % 1 ? 1 : 0)} day${d === 1 ? "" : "s"} in)` : "at expiry";
  if (!cols.length) return null;

  const val = (c: (typeof cols)[number], mi: number): number | null => {
    const v = c.cells[mi];
    if (state.mode === "risk") return c.worst > 0 ? (v / c.worst) * 100 : null;
    if (state.mode === "budget") return c.lots >= 1 ? v * c.lots : null;
    return v;
  };
  const fmtV = (v: number | null) => (v == null ? "–" : state.mode === "risk" ? `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(0)}%` : compact(v));
  const grid = CMP_MOVES.map((_, mi) => cols.map((c) => val(c, mi)));
  const mx = Math.max(1, ...grid.flat().map((v) => (v == null ? 0 : Math.abs(v))));
  const wins = cols.map(() => 0);
  let profitRows = 0;
  const bestIdx = grid.map((row) => {
    const bi = argBest(row, (v) => v, true);
    if (bi >= 0 && row[bi]! > 0) { wins[bi]++; profitRows++; return bi; }
    return -1;
  });
  const tableTitle = { lot: "Profit or loss after charges for 1 lot", risk: "Profit or loss as a % of the money you put at risk", budget: "Profit or loss after charges using the lots your limit allows" }[state.mode];
  const insights = compareInsights(cols, state.risk, state.dir);

  const head = (
    <tr>
      <th className="w-[84px] min-w-[84px] bg-slate-50 px-1.5 py-1.5 md:w-auto md:px-2.5" />
      {cols.map((c) => (
        <th key={c.K} className={th}>
          <div>{columnLabel(c)}</div>
          <div className="text-[12.5px] font-bold text-slate-900">{nf(c.K)}</div>
        </th>
      ))}
    </tr>
  );
  const row = (short: string, lbl: string, fn: (c: (typeof cols)[number]) => React.ReactNode) => (
    <tr className="border-t border-slate-100">
      <td className={labelCell}>
        <span className="md:hidden">{short}</span>
        <span className="hidden md:inline">{lbl}</span>
      </td>
      {cols.map((c) => <td key={c.K} className={td}>{fn(c)}</td>)}
    </tr>
  );

  return (
    <section aria-label="Strike comparison" className="rounded-xl border border-slate-200 bg-white p-3 md:p-4">
      <h2 className="font-display text-[15px] font-semibold text-slate-900">Which strike? In-the-money, at-the-money or out-of-the-money</h2>
      <p className="mt-1 text-[11.5px] leading-snug text-slate-500">
        {name} at {nf(m.spot, 2)}, {nf(m.dte, m.dte % 1 ? 1 : 0)} day{m.dte === 1 ? "" : "s"} to expiry. Exit {holdTxt}.{" "}
        {usingChain ? "Premiums and each strike’s own volatility come from the live option chain." : "Prices are model prices (a single volatility) — not live chain prices."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Seg label="Direction" value={state.dir} onChange={(dir) => onChange({ ...state, dir })} options={[{ id: "CE", text: "Calls (expect a rise)" }, { id: "PE", text: "Puts (expect a fall)" }]} />
        <Seg label="Exit" value={state.hold} onChange={(hold) => onChange({ ...state, hold })} options={[{ id: "same", text: "Same day" }, { id: "half", text: "Halfway" }, { id: "expiry", text: "At expiry" }]} />
        <label className="flex items-center gap-2 text-[12px] text-slate-500">
          Most you’re willing to lose (₹)
          <input
            type="number"
            min={0}
            value={state.risk}
            onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= 0) onChange({ ...state, risk: v }); }}
            className="w-28 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[13px] text-slate-900 outline-none focus:border-blue-400"
          />
        </label>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse md:min-w-[640px]">
          <thead className="bg-slate-50">{head}</thead>
          <tbody>
            {row("Premium", "Premium per unit", (c) => rs(c.entry, 2))}
            {row("Cost / lot", "Cost for 1 lot", (c) => <b>{rs(c.cost)}</b>)}
            {row("Worst case", "Worst case, 1 lot (after charges)", (c) => <span className="text-rose-500">{rs(-c.worst)}</span>)}
            {row("Lots in limit", "Lots within your limit", (c) => (c.lots >= 1 ? <b>{c.lots}</b> : <span className="text-amber-600">0{dim(rs(c.worst), `needs ${rs(c.worst)}`)}</span>))}
            {row("Breakeven", "Breakeven at expiry", (c) => (c.be ? <>{nf(c.be)}{dim(pct((c.be / m.spot - 1) * 100))}</> : "–"))}
            {row("Profit chance", "Chance of profit at expiry", (c) => `${Math.round(c.pop * 100)}%`)}
            {row("Lose 90%+", "Chance of losing 90% or more", (c) => `${Math.round(c.ruin * 100)}%`)}
            {row("Delta", "Delta", (c) => c.delta.toFixed(2))}
            {row(
              usingChain ? "Implied vol" : "Vol used",
              usingChain ? "Implied volatility (this strike’s own)" : "Volatility used (one value for every strike)",
              (c) => <>{c.iv.toFixed(1)}%{usingChain && c.priceSource === "model" ? dim("no trade", "no trade: model") : null}</>
            )}
            {row("Gamma", "Gamma per lot (change in delta per index point)", (c) => c.gamma.toFixed(4))}
            {row("Vega / vol pt", "Vega per lot (₹ per 1 volatility point)", (c) => rs(c.vega))}
            {row("Gain / 1%", "Gain per 1% the index moves your way (1 lot)", (c) => rs(c.perPct))}
            {row("Decay / day", "Time decay per day (1 lot)", (c) => <><span className="text-rose-500">{rs(c.decay)}</span>{dim(`${c.decayPct.toFixed(1)}%`, `${c.decayPct.toFixed(1)}% of cost`)}</>)}
            {row("Charges", "Charges in and out (1 lot)", (c) => <>{rs(c.chg)}{dim(`${(c.cost > 0 ? (c.chg / c.cost) * 100 : 0).toFixed(1)}%`, `${(c.cost > 0 ? (c.chg / c.cost) * 100 : 0).toFixed(1)}% of cost`)}</>)}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-slate-900">{tableTitle}, exit {holdTxt}</h3>
        <Seg label="Show as" value={state.mode} onChange={(mode) => onChange({ ...state, mode })} options={[{ id: "lot", text: "₹ per lot" }, { id: "risk", text: "% of risk" }, { id: "budget", text: "Within my limit" }]} />
      </div>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse md:min-w-[640px]">
          <thead className="bg-slate-50">{head}</thead>
          <tbody>
            {CMP_MOVES.map((mv, mi) => (
              <tr key={mv} className="border-t border-slate-100">
                <td className={labelCell}>
                  {mv === 0 ? "No change" : pct(mv, 1)}
                  {dim(nf(m.spot * (1 + mv / 100)))}
                </td>
                {grid[mi].map((v, ci) => {
                  const a = v == null ? 0 : 0.07 + 0.5 * Math.min(1, Math.abs(v) / mx);
                  const bg = v == null ? undefined : v < 0 ? `rgba(244,63,94,${a.toFixed(2)})` : `rgba(16,185,129,${a.toFixed(2)})`;
                  return (
                    <td key={ci} style={{ background: bg }} className={td + (ci === bestIdx[mi] && v != null ? " font-bold ring-1 ring-inset ring-slate-900/40" : "")}>
                      {fmtV(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className={labelCell + " font-medium"}>
                <span className="md:hidden">Best in</span>
                <span className="hidden md:inline">Best when a strike makes money</span>
              </td>
              {wins.map((w, i) => <td key={i} className={td}>{w} of {profitRows}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="mt-5 text-[13px] font-semibold text-slate-900">What the numbers say</h3>
      <ul className="mt-2 space-y-2">
        {insights.map((l, i) => (
          <li
            key={i}
            className={"rounded-lg border-l-2 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-700 " + (l.kind === "warn" ? "border-amber-400" : l.kind === "bad" ? "border-rose-400" : l.kind === "good" ? "border-emerald-400" : "border-slate-200")}
            dangerouslySetInnerHTML={{ __html: l.html }}
          />
        ))}
      </ul>

      <div className="mt-4">
        <div className="text-[11px] font-medium text-slate-500">Load a strike into your trade</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {cols.map((c) => (
            <button
              key={c.K}
              type="button"
              onClick={() => onLoad(c.K, Math.max(1, c.lots))}
              className="rounded-full border border-slate-200 px-3 py-1 text-[12px] text-slate-600 hover:border-blue-300 hover:text-blue-600"
            >
              {columnLabel(c)} {nf(c.K)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
