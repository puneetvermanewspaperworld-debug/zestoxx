"use client";

import React from "react";
import { Zap } from "lucide-react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOLS } from "@/lib/symbols";
import { PULSE_BASIS, pulseFor } from "@/lib/pulse";
import { fmtSigned } from "@/lib/helpers";

export default function PulseView() {
  const { live, histories, prevCloseFor, hasFeedQuote, hasRealHistory, setSelected, setActiveView } = useZestoxx();
  // A score needs the live quote and the real candle history (never the invented starting bars) and enough bars for Wilder's RSI.
  const all = SYMBOLS.map((s) => ({
    ...s,
    pulse: pulseFor({ symId: s.id, live, histories, prevClose: prevCloseFor(s.id), hasQuote: hasFeedQuote(s.id), hasRealHistory: hasRealHistory(s.id) }),
  }));
  const rows = [
    ...all.filter((r) => r.pulse.state === "ok").sort((a, b) => (b.pulse.state === "ok" && a.pulse.state === "ok" ? b.pulse.result.score - a.pulse.result.score : 0)),
    ...all.filter((r) => r.pulse.state !== "ok"),
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-4">
        <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-slate-900">
          <Zap size={16} className="text-blue-600" /> Zestoxx Pulse
        </h2>
        <p className="mt-1 text-[12px] text-slate-500">
          One composite score per symbol, worked out from live price data only.
        </p>
        <p className="mt-1 text-[11.5px] text-slate-400">{PULSE_BASIS}</p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const p = r.pulse;
          const tone = p.state !== "ok" ? "#556274" : p.result.label === "Bullish" ? "#047857" : p.result.label === "Bearish" ? "#be123c" : "#556274";
          return (
            <div
              key={r.id}
              data-testid={`pulse-card-${r.id}`}
              onClick={() => {
                setSelected(r.id);
                setActiveView("trade");
              }}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-200"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[13.5px] font-semibold text-slate-900">{r.id}</div>
                  <div className="text-[10.5px] text-slate-400">{r.name}</div>
                </div>
                {p.state === "ok" ? (
                  <div className="text-right">
                    <div className="font-mono text-[20px] font-bold" style={{ color: tone }}>
                      {p.result.score}
                    </div>
                    <div className="text-[10.5px] font-medium" style={{ color: tone }}>
                      {p.result.label}
                    </div>
                  </div>
                ) : (
                  <div data-testid="pulse-no-score" className="text-right text-[12px] font-medium text-slate-400">
                    {p.text}
                  </div>
                )}
              </div>
              {p.state === "ok" && (
                <>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-blue-50">
                    <div className="h-full rounded-full" style={{ width: `${p.result.score}%`, background: tone }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[10.5px] text-slate-400">
                    <span>Momentum {fmtSigned(p.result.momentum, 2, "%")}</span>
                    <span>RSI {p.result.rsi.toFixed(0)}</span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
