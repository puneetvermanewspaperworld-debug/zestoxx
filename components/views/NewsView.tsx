import React from "react";
import Chip from "@/components/Chip";
import { NEWS } from "@/lib/symbols";

export default function NewsView() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-display text-[15px] font-semibold text-slate-900">Market News</h2>
      <div className="space-y-3">
        {NEWS.map((n, i) => (
          <div key={i} className="border-b border-blue-50 pb-3 last:border-0">
            <div className="text-[13.5px] leading-snug text-slate-900">{n.h}</div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
              <Chip tone="gold">{n.tag}</Chip>
              <Chip tone={n.sentiment === "bullish" ? "up" : n.sentiment === "bearish" ? "down" : "muted"}>
                {n.sentiment}
              </Chip>
              <span>{n.src}</span>
              <span>·</span>
              <span>{n.t}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
