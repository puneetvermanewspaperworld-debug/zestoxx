"use client";

import React from "react";
import { strSeed, seededRandom } from "@/lib/helpers";
import type { AssetType } from "@/lib/types";

export default function OptionsChain({
  symId,
  price,
  type,
  expiry,
}: {
  symId: string;
  price: number;
  type: AssetType;
  expiry: string;
}) {
  if (type === "crypto") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-slate-400">
        Options chain isn&apos;t available for crypto pairs on Zestoxx yet — futures analytics
        coming soon.
      </div>
    );
  }
  const step = price > 10000 ? 100 : price > 2000 ? 50 : price > 500 ? 20 : 5;
  const atm = Math.round(price / step) * step;
  const strikes = Array.from({ length: 11 }, (_, i) => atm + (i - 5) * step);
  const rand = seededRandom(strSeed(symId + expiry + Math.floor(price)));
  const rows = strikes.map((strike) => {
    const intrinsicCE = Math.max(0, price - strike);
    const intrinsicPE = Math.max(0, strike - price);
    const timeVal = step * (0.3 + rand() * 0.9);
    return {
      strike,
      ceLtp: intrinsicCE + timeVal,
      ceOi: Math.round(20000 + rand() * 400000),
      ceIv: (11 + rand() * 22).toFixed(1),
      peLtp: intrinsicPE + timeVal,
      peOi: Math.round(20000 + rand() * 400000),
      peIv: (11 + rand() * 22).toFixed(1),
    };
  });
  return (
    <table className="w-full border-collapse text-[11.5px]">
      <thead className="sticky top-0 bg-white">
        <tr className="text-slate-500">
          <th className="px-2 py-1.5 text-right font-medium">CE OI</th>
          <th className="px-2 py-1.5 text-right font-medium">CE IV</th>
          <th className="px-2 py-1.5 text-right font-medium">CE LTP</th>
          <th className="px-2 py-1.5 text-center font-semibold text-blue-600">Strike</th>
          <th className="px-2 py-1.5 text-left font-medium">PE LTP</th>
          <th className="px-2 py-1.5 text-left font-medium">PE IV</th>
          <th className="px-2 py-1.5 text-left font-medium">PE OI</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.strike} className={r.strike === atm ? "bg-blue-50" : "hover:bg-slate-50"}>
            <td className="px-2 py-1.5 text-right font-mono text-slate-500">{(r.ceOi / 1000).toFixed(0)}k</td>
            <td className="px-2 py-1.5 text-right font-mono text-slate-500">{r.ceIv}%</td>
            <td className="px-2 py-1.5 text-right font-mono text-emerald-500">{r.ceLtp.toFixed(1)}</td>
            <td className="px-2 py-1.5 text-center font-mono font-semibold text-slate-900">{r.strike}</td>
            <td className="px-2 py-1.5 text-left font-mono text-rose-500">{r.peLtp.toFixed(1)}</td>
            <td className="px-2 py-1.5 text-left font-mono text-slate-500">{r.peIv}%</td>
            <td className="px-2 py-1.5 text-left font-mono text-slate-500">{(r.peOi / 1000).toFixed(0)}k</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
