"use client";

import React from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { useZestoxx } from "./ZestoxxProvider";
import { fmtINR } from "@/lib/helpers";
import { CALENDAR } from "@/lib/market-calendar";
import { fmtIsoDate } from "@/lib/helpers";
import { useMarketStatus } from "@/lib/useMarketStatus";

export default function TopBar() {
  const { cash } = useZestoxx();
  const market = useMarketStatus();

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 md:px-4 md:py-2.5">
      <Link href="/" className="flex items-center gap-2 md:hidden">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 font-display text-[11px] font-bold text-slate-50">
          Z
        </div>
        <span className="font-display text-[13px] font-semibold">ZESTOXX</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[12px] text-slate-600 md:flex-none md:justify-start md:text-[11.5px] md:text-slate-500">
        {market !== null && (
          <span
            className="flex items-center gap-2"
            title={`NSE holiday calendar for ${CALENDAR.year}, verified ${fmtIsoDate(CALENDAR.verifiedOn)} (equity derivatives segment${market.calendarCovered ? "" : "; this date is outside the calendar, so only weekday hours are applied"}).`}
          >
            <span className={"h-1.5 w-1.5 rounded-full " + (market.open ? (market.kind === "special" ? "bg-amber-500" : "bg-emerald-500") : "bg-slate-400")} />
            {market.label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px]">
        <Wallet size={13} className="text-blue-600" />
        <span className="font-mono text-slate-900">{fmtINR(cash)}</span>
      </div>
    </div>
  );
}
