"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, ListOrdered, Star, UserRound, Wallet, type LucideIcon } from "lucide-react";
import { useZestoxx } from "./ZestoxxProvider";

interface Tab {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Phones: Watchlist (the home screen), Orders, Portfolio, Explore, Account. There is no separate Trade section: a symbol's chart opens from its row. */
export const PHONE_TABS: Tab[] = [
  { id: "watchlist", label: "Watchlist", href: "/app/watchlist", icon: Star },
  { id: "orders", label: "Orders", href: "/app/orders", icon: ListOrdered },
  { id: "portfolio", label: "Portfolio", href: "/app/portfolio", icon: Wallet },
  { id: "explore", label: "Explore", href: "/app/explore", icon: Compass },
  { id: "account", label: "Account", href: "/app/account", icon: UserRound },
];

/** Which tab a page belongs to: the three that are tabs of their own, Account, and everything else (the analysis pages, the dashboard) under Explore. */
export const tabFor = (segment: string): string => (["watchlist", "orders", "portfolio", "account"].includes(segment) ? segment : "explore");

/**
 * Phone navigation (a window under 768 px wide, or a phone turned sideways): a bottom tab bar with five tabs. Respects the bottom safe area
 * (home indicator). Desktop (1000 px and up, and tablets) keeps the sidebar.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { alerts, openOrders } = useZestoxx();
  const active = tabFor(pathname.split("/")[2] || "dashboard");
  const badge: Record<string, number> = { orders: openOrders.length + alerts.length };
  return (
    <nav aria-label="Main" data-testid="bottom-nav" className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] phone:flex">
      {PHONE_TABS.map((t) => {
        const Icon = t.icon;
        const on = active === t.id;
        return (
          <Link key={t.id} href={t.href} data-testid={`nav-${t.id}`} aria-current={on ? "page" : undefined} className={"flex min-h-[var(--nav-h)] flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-medium short:min-h-[48px] short:flex-row short:gap-1.5 " + (on ? "text-blue-600" : "text-slate-600")}>
            <span className="relative">
              <Icon size={20} aria-hidden />
              {(badge[t.id] ?? 0) > 0 && <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-blue-600" aria-label={`${badge[t.id]} open`} />}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
