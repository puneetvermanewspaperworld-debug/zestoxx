"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { NAV } from "./nav";
import { useZestoxx } from "./ZestoxxProvider";
import { fmtINR } from "@/lib/helpers";

export default function TopBar() {
  const pathname = usePathname();
  const { cash, selected } = useZestoxx();
  const segment = pathname.split("/")[2] || "dashboard";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
      <Link href="/" className="flex items-center gap-2 sm:hidden">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 font-display text-[11px] font-bold text-slate-50">
          Z
        </div>
        <span className="font-display text-[13px] font-semibold">ZESTOXX</span>
      </Link>
      <div className="flex flex-1 items-center gap-1 overflow-x-auto sm:hidden">
        {NAV.map((n) => (
          <Link
            key={n.id}
            href={n.id === "trade" ? `/app/trade/${selected}` : n.href}
            className={
              "shrink-0 rounded px-2 py-1 text-[10.5px] font-medium " +
              (segment === n.id ? "bg-blue-50 text-blue-600" : "text-slate-500")
            }
          >
            {n.label}
          </Link>
        ))}
      </div>
      <div className="hidden items-center gap-2 text-[11.5px] text-slate-500 sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Market Open
      </div>
      <div className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] sm:flex">
        <Wallet size={13} className="text-blue-600" />
        <span className="font-mono text-slate-900">{fmtINR(cash)}</span>
      </div>
    </div>
  );
}
