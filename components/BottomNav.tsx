"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV } from "./nav";
import { useZestoxx } from "./ZestoxxProvider";

/** The four sections that get their own tab; everything else lives under "More". */
const MAIN = ["dashboard", "watchlist", "trade", "pulse"];

/**
 * Phone navigation (below 768px): a bottom tab bar — Dashboard, Watchlist, Trade, Pulse, More — with every
 * other page in a sheet under "More". Respects the bottom safe area (home indicator). Desktop keeps the sidebar.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { selected, alerts } = useZestoxx();
  const segment = pathname.split("/")[2] || "dashboard";
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const main = NAV.filter((n) => MAIN.includes(n.id));
  const more = NAV.filter((n) => !MAIN.includes(n.id));
  const moreActive = more.some((n) => n.id === segment);

  // Close the sheet when the page changes, on Escape, and focus its close button when it opens.
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const tab = "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-medium ";

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {main.map((n) => {
          const Icon = n.icon;
          const active = segment === n.id;
          return (
            <Link
              key={n.id}
              href={n.id === "trade" ? `/app/trade/${selected}` : n.href}
              aria-current={active ? "page" : undefined}
              className={tab + (active ? "text-blue-600" : "text-slate-600")}
            >
              <Icon size={20} />
              {n.label}
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className={tab + (moreActive || open ? "text-blue-600" : "text-slate-600")}
        >
          <span className="relative">
            <Menu size={20} />
            {alerts.length > 0 && <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-blue-600" aria-label={`${alerts.length} active alerts`} />}
          </span>
          More
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-900/40 md:hidden" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="All pages"
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <h2 className="font-display text-[15px] font-semibold text-slate-900">More</h2>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded text-slate-600">
                <X size={18} />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2 p-3">
              {more.map((n) => {
                const Icon = n.icon;
                const active = segment === n.id;
                return (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        "flex min-h-[52px] items-center gap-3 rounded-lg border px-3 text-[14px] font-medium " +
                        (active ? "border-blue-200 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-800")
                      }
                    >
                      <Icon size={18} className="shrink-0" />
                      <span className="min-w-0 truncate">{n.label}</span>
                      {n.id === "alerts" && alerts.length > 0 && (
                        <span className="ml-auto rounded-full bg-blue-600 px-1.5 text-[12px] font-bold text-white">{alerts.length}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link href="/" className="mx-3 mb-1 flex min-h-[48px] items-center justify-center rounded-lg text-[14px] font-medium text-slate-600">
              ← Back to homepage
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
