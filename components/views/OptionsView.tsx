"use client";

import React from "react";
import OptionsChain from "@/components/OptionsChain";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOLS, EXPIRIES } from "@/lib/symbols";
import { fmt } from "@/lib/helpers";

export default function OptionsView() {
  const { selected, sym, price, expiry, setExpiry, setSelected } = useZestoxx();
  const eligible = SYMBOLS.filter((s) => s.type !== "crypto");
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-slate-900">Options Chain</h2>
          <p className="text-[12px] text-slate-400">
            {sym.name} · Spot {fmt(price, sym.type)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md border border-slate-200 p-0.5">
            {eligible.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={
                  "rounded px-2.5 py-1 text-[11.5px] font-medium " +
                  (selected === s.id
                    ? "bg-blue-600 text-slate-50"
                    : "text-slate-500 hover:text-slate-900")
                }
              >
                {s.id}
              </button>
            ))}
          </div>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11.5px] text-slate-900 outline-none"
          >
            {EXPIRIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="max-h-[560px] overflow-y-auto">
        <OptionsChain symId={selected} price={price} type={sym.type} expiry={expiry} />
      </div>
    </div>
  );
}
