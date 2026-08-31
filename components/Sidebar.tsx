"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio } from "lucide-react";
import { NAV } from "./nav";
import { useZestoxx } from "./ZestoxxProvider";

export default function Sidebar() {
  const pathname = usePathname();
  const { alerts, selected } = useZestoxx();
  const segment = pathname.split("/")[2] || "dashboard";

  return (
    <div className="hidden w-[168px] shrink-0 flex-col border-r border-slate-200 bg-white sm:flex">
      <Link href="/" className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 font-display text-[13px] font-bold text-slate-50">
          Z
        </div>
        <span className="font-display text-[15px] font-semibold tracking-tight">ZESTOXX</span>
      </Link>
      <div className="flex-1 space-y-0.5 px-2 pt-2">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = segment === n.id;
          const href = n.id === "trade" ? `/app/trade/${selected}` : n.href;
          return (
            <Link
              key={n.id}
              href={href}
              className={
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[12.5px] font-medium " +
                (active
                  ? "bg-blue-50 text-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")
              }
            >
              <Icon size={15} />
              {n.label}
              {n.id === "alerts" && alerts.length > 0 && (
                <span className="ml-auto rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-slate-50">
                  {alerts.length}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-200 px-4 py-3 text-[10.5px] text-slate-400">
        <Radio size={11} className="text-emerald-500" /> Paper Trading Mode
      </div>
      <Link
        href="/"
        className="border-t border-slate-200 px-4 py-2.5 text-left text-[11px] font-medium text-slate-400 hover:text-blue-600"
      >
        ← Back to homepage
      </Link>
    </div>
  );
}
