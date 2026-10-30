"use client";

import React, { useMemo } from "react";
import { chainStats, type OptionChain } from "@/lib/options";
import { fmtOi, fmtOiChange } from "@/lib/helpers";

const WINDOW = 10; // strikes shown either side of ATM

const oiTone = (n: number) => (n > 0 ? "text-emerald-500" : n < 0 ? "text-rose-500" : "text-slate-400");

export default function OptionsChain({ chain }: { chain: OptionChain }) {
  const atm = useMemo(() => chainStats(chain.rows, chain.spot)?.atmStrike, [chain.rows, chain.spot]);

  const rows = useMemo(() => {
    const idx = chain.rows.findIndex((r) => r.strike === atm);
    if (idx < 0) return chain.rows;
    return chain.rows.slice(Math.max(0, idx - WINDOW), idx + WINDOW + 1);
  }, [chain.rows, atm]);

  if (rows.length === 0) {
    return <div className="p-6 text-center text-[12.5px] text-slate-400">No option data for this expiry.</div>;
  }

  return (
    <table className="w-full min-w-[640px] border-collapse text-[11.5px]">
      <thead className="sticky top-0 bg-white">
        <tr className="text-slate-500">
          <th className="px-2 py-1.5 text-right font-medium">CE OI</th>
          <th className="px-2 py-1.5 text-right font-medium">CE ΔOI</th>
          <th className="px-2 py-1.5 text-right font-medium">CE IV</th>
          <th className="px-2 py-1.5 text-right font-medium">CE LTP</th>
          <th className="px-2 py-1.5 text-center font-semibold text-blue-600">Strike</th>
          <th className="px-2 py-1.5 text-left font-medium">PE LTP</th>
          <th className="px-2 py-1.5 text-left font-medium">PE IV</th>
          <th className="px-2 py-1.5 text-left font-medium">PE ΔOI</th>
          <th className="px-2 py-1.5 text-left font-medium">PE OI</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const isAtm = r.strike === atm;
          const ceItm = r.strike < chain.spot;
          const peItm = r.strike > chain.spot;
          const ceD = r.call.oi - r.call.prevOi;
          const peD = r.put.oi - r.put.prevOi;
          return (
            <tr key={r.strike} className={isAtm ? "bg-blue-50" : "hover:bg-slate-50"}>
              <td className={"px-2 py-1.5 text-right font-mono text-slate-500 " + (ceItm && !isAtm ? "bg-slate-50" : "")}>
                {fmtOi(r.call.oi)}
              </td>
              <td className={"px-2 py-1.5 text-right font-mono " + oiTone(ceD) + (ceItm && !isAtm ? " bg-slate-50" : "")}>
                {fmtOiChange(ceD)}
              </td>
              <td className={"px-2 py-1.5 text-right font-mono text-slate-500 " + (ceItm && !isAtm ? "bg-slate-50" : "")}>
                {r.call.iv > 0 ? `${r.call.iv.toFixed(1)}%` : "--"}
              </td>
              <td className={"px-2 py-1.5 text-right font-mono text-emerald-500 " + (ceItm && !isAtm ? "bg-slate-50" : "")}>
                {r.call.ltp.toFixed(1)}
              </td>
              <td className="px-2 py-1.5 text-center font-mono font-semibold text-slate-900">{r.strike}</td>
              <td className={"px-2 py-1.5 text-left font-mono text-rose-500 " + (peItm && !isAtm ? "bg-slate-50" : "")}>
                {r.put.ltp.toFixed(1)}
              </td>
              <td className={"px-2 py-1.5 text-left font-mono text-slate-500 " + (peItm && !isAtm ? "bg-slate-50" : "")}>
                {r.put.iv > 0 ? `${r.put.iv.toFixed(1)}%` : "--"}
              </td>
              <td className={"px-2 py-1.5 text-left font-mono " + oiTone(peD) + (peItm && !isAtm ? " bg-slate-50" : "")}>
                {fmtOiChange(peD)}
              </td>
              <td className={"px-2 py-1.5 text-left font-mono text-slate-500 " + (peItm && !isAtm ? "bg-slate-50" : "")}>
                {fmtOi(r.put.oi)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
