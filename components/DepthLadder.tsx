"use client";

import React, { useEffect, useState } from "react";
import { strSeed, seededRandom, fmt } from "@/lib/helpers";
import type { AssetType } from "@/lib/types";

export default function DepthLadder({ price, type }: { price: number; type: AssetType }) {
  // Reshuffle the ladder on the client only — seeding with Date.now() during SSR would
  // desync hydration. Server renders the deterministic price-seeded snapshot.
  const [jitter, setJitter] = useState(0);
  useEffect(() => {
    setJitter(Date.now() % 997);
    const t = setInterval(() => setJitter(Date.now() % 997), 2000);
    return () => clearInterval(t);
  }, []);

  const rand = seededRandom(strSeed(String(Math.round(price * 100))) + jitter);
  const tick = price > 10000 ? price * 0.0006 : price > 1000 ? price * 0.001 : price * 0.003;
  const asks = Array.from({ length: 6 }, (_, i) => ({
    p: price + tick * (6 - i),
    s: Math.round(5 + rand() * 400),
  }));
  const bids = Array.from({ length: 6 }, (_, i) => ({
    p: price - tick * (i + 1),
    s: Math.round(5 + rand() * 400),
  }));
  const maxSize = Math.max(...asks.map((a) => a.s), ...bids.map((b) => b.s));
  return (
    <div className="text-[11.5px]">
      <div className="mb-1 flex justify-between text-[10.5px] uppercase tracking-wide text-slate-400">
        <span>Price</span>
        <span>Size</span>
      </div>
      {asks.map((a, i) => (
        <div key={i} className="relative mb-0.5 flex justify-between px-1 py-0.5">
          <div
            className="absolute inset-y-0 right-0 bg-[#F8717122]"
            style={{ width: `${(a.s / maxSize) * 100}%` }}
          />
          <span className="relative z-10 font-mono text-rose-500">{fmt(a.p, type)}</span>
          <span className="relative z-10 font-mono text-slate-500">{a.s}</span>
        </div>
      ))}
      <div className="my-1 border-t border-slate-200 py-1 text-center font-mono text-[13px] font-semibold text-slate-900">
        {fmt(price, type)}
      </div>
      {bids.map((b, i) => (
        <div key={i} className="relative mb-0.5 flex justify-between px-1 py-0.5">
          <div
            className="absolute inset-y-0 right-0 bg-[#34D39922]"
            style={{ width: `${(b.s / maxSize) * 100}%` }}
          />
          <span className="relative z-10 font-mono text-emerald-500">{fmt(b.p, type)}</span>
          <span className="relative z-10 font-mono text-slate-500">{b.s}</span>
        </div>
      ))}
    </div>
  );
}
