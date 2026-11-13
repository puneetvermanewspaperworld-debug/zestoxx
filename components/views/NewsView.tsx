import React from "react";
import { NEWS_NOT_CONNECTED } from "@/lib/news";
import { PULSE_BASIS } from "@/lib/pulse";

export default function NewsView() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-display text-[15px] font-semibold text-slate-900">Market News</h2>
      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
        <p className="text-[14px] font-medium text-slate-700">{NEWS_NOT_CONNECTED}</p>
        <p className="mx-auto mt-1.5 max-w-md text-[12px] text-slate-400">
          Zestoxx shows no headlines until a real news source is connected. {PULSE_BASIS}
        </p>
      </div>
    </div>
  );
}
