"use client";

import React, { useMemo } from "react";
import { chainStats, type OptionChain } from "@/lib/options";
import { fmtOi } from "@/lib/helpers";

type Accent = "none" | "resistance" | "support";

const ACCENT_BAR: Record<Accent, string> = {
  none: "bg-slate-200",
  resistance: "bg-rose-400",
  support: "bg-emerald-400",
};

const TAG_STYLE: Record<Exclude<Accent, "none">, string> = {
  resistance: "bg-rose-50 text-rose-600",
  support: "bg-emerald-50 text-emerald-600",
};

function Stat({
  label,
  value,
  sub,
  hint,
  accent = "none",
  tag,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  accent?: Accent;
  /** plain-words role of the level, shown as a pill */
  tag?: string;
}) {
  return (
    <div
      title={hint}
      className="relative overflow-hidden rounded-lg border border-slate-200 bg-white py-2.5 pl-3.5 pr-3"
    >
      <span className={"absolute inset-y-0 left-0 w-0.5 " + ACCENT_BAR[accent]} aria-hidden />
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</span>
        {tag && accent !== "none" && (
          <span className={"rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide " + TAG_STYLE[accent]}>
            {tag}
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-[17px] font-semibold leading-none text-slate-900">{value}</div>
      <div className="mt-1.5 min-h-[14px] font-mono text-[10.5px] leading-tight text-slate-400">{sub}</div>
    </div>
  );
}

export default function OptionsStatsStrip({ chain }: { chain: OptionChain }) {
  const stats = useMemo(() => chainStats(chain.rows, chain.spot), [chain.rows, chain.spot]);
  if (!stats) return null;

  const [call1, call2] = stats.topCalls;
  const [put1, put2] = stats.topPuts;
  const level = (l?: { strike: number; oi: number }) => (l ? `${l.strike}` : "--");
  const levelSub = (top?: { strike: number; oi: number }, second?: { strike: number; oi: number }) =>
    second && top ? `OI ${fmtOi(second.oi)} · top ${top.strike}` : undefined;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Stat
        label="ATM IV"
        value={stats.atmIv != null ? `${stats.atmIv.toFixed(2)}%` : "--"}
        sub={`strike ${stats.atmStrike}`}
        hint="Average implied volatility of the at-the-money call and put"
      />
      <Stat
        label="PCR (OI)"
        value={stats.pcr != null ? stats.pcr.toFixed(2) : "--"}
        sub={stats.pcr != null ? (stats.pcr >= 1 ? "more puts than calls" : "more calls than puts") : undefined}
        hint="Put-Call Ratio: total put open interest ÷ total call open interest across the chain"
      />
      <Stat
        label="India VIX"
        value={chain.vix != null ? chain.vix.toFixed(2) : "--"}
        sub={chain.source === "simulated" ? "simulated" : undefined}
        hint="NSE's expected 30-day volatility index"
      />
      <Stat
        label="Max pain"
        value={stats.maxPain != null ? String(stats.maxPain) : "--"}
        sub="writers' least payout"
        hint="Strike where option writers' total payout at expiry would be smallest"
      />
      <Stat
        label="2nd highest call"
        value={level(call2)}
        sub={levelSub(call1, call2)}
        accent="resistance"
        tag="Resistance"
        hint="Strike with the second-largest call open interest — a secondary resistance level"
      />
      <Stat
        label="2nd highest put"
        value={level(put2)}
        sub={levelSub(put1, put2)}
        accent="support"
        tag="Support"
        hint="Strike with the second-largest put open interest — a secondary support level"
      />
    </div>
  );
}
