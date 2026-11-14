"use client";

import React from "react";
import { dataBadge } from "@/lib/data-badge";
import { useMarketStatus } from "@/lib/useMarketStatus";
import type { AssetType } from "@/lib/types";

/**
 * The pill that says where a price comes from: "Live data" while the exchange is open, "Last close" once it is shut,
 * "Simulated" for a stand-in. Crypto trades around the clock and stays "Live data". `suffix` is shown after "Live data" only
 * (Movers adds the time of the last update; a last close has no such time).
 */
export default function DataBadge({
  source,
  type = "stock",
  suffix,
  className = "",
}: {
  source: "live" | "sim" | undefined;
  type?: AssetType;
  suffix?: string;
  className?: string;
}) {
  const open = useMarketStatus()?.open ?? null;
  const badge = dataBadge(source, open, type);
  if (!badge) return null;
  const on = badge.tone === "live";
  return (
    <span
      data-testid="data-badge"
      className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold " + (on ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500") + " " + className}
    >
      <span className={"h-1.5 w-1.5 rounded-full " + (on ? "bg-emerald-500" : "bg-slate-400")} />
      {badge.label}
      {on && suffix ? ` · ${suffix}` : ""}
    </span>
  );
}
