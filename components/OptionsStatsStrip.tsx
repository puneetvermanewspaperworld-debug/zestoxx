"use client";

import React, { useMemo } from "react";
import { chainStats, type OptionChain } from "@/lib/options";
import { fmtOi } from "@/lib/helpers";

function Stat({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10.5px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-slate-900">{value}</div>
      {sub && <div className="font-mono text-[10.5px] text-slate-400">{sub}</div>}
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
    second && top ? `OI ${fmtOi(second.oi)} · highest ${top.strike}` : undefined;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
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
        hint="Strike where option writers' total payout at expiry would be smallest"
      />
      <Stat
        label="2nd highest call"
        value={level(call2)}
        sub={levelSub(call1, call2)}
        hint="Strike with the second-largest call open interest — a secondary resistance level"
      />
      <Stat
        label="2nd highest put"
        value={level(put2)}
        sub={levelSub(put1, put2)}
        hint="Strike with the second-largest put open interest — a secondary support level"
      />
    </div>
  );
}
