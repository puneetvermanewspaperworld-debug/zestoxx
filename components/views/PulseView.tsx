"use client";

import React from "react";
import { Zap } from "lucide-react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOLS } from "@/lib/symbols";
import { computePulse } from "@/lib/pulse";

export default function PulseView() {
  const { live, histories, setSelected, setActiveView } = useZestoxx();
  const rows = SYMBOLS.map((s) => ({ ...s, pulse: computePulse(s.id, live, histories) })).sort(
    (a, b) => b.pulse.score - a.pulse.score
  );
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-4">
        <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-slate-900">
          <Zap size={16} className="text-blue-600" /> Zestoxx Pulse
        </h2>
        <p className="mt-1 text-[12px] text-slate-500">
          One composite signal per symbol — blending price momentum, RSI positioning and news
          sentiment — so you don&apos;t have to jump between a charting app, a news feed and an
          options screen to form a view.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const tone =
            r.pulse.label === "Bullish"
              ? "#34D399"
              : r.pulse.label === "Bearish"
                ? "#F87171"
                : "#8A93A6";
          return (
            <div
              key={r.id}
              onClick={() => {
                setSelected(r.id);
                setActiveView("trade");
              }}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13.5px] font-semibold text-slate-900">{r.id}</div>
                  <div className="text-[10.5px] text-slate-400">{r.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[20px] font-bold" style={{ color: tone }}>
                    {r.pulse.score}
                  </div>
                  <div className="text-[10.5px] font-medium" style={{ color: tone }}>
                    {r.pulse.label}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-blue-50">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${r.pulse.score}%`, background: tone }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10.5px] text-slate-400">
                <span>
                  Momentum {r.pulse.momentum >= 0 ? "+" : ""}
                  {r.pulse.momentum.toFixed(2)}%
                </span>
                <span>RSI {r.pulse.rsi.toFixed(0)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
