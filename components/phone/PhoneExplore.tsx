"use client";

import React from "react";
import Link from "next/link";
import { Activity, Calculator, Flame, Landmark, LayoutDashboard, Newspaper, Percent, SlidersHorizontal, Store, Zap, type LucideIcon } from "lucide-react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { fmt, fmtSigned } from "@/lib/helpers";
import { SYMBOL_MAP } from "@/lib/symbols";
import { useExpiryToday } from "@/lib/useWatchlist";

const TOOLS: { id: string; label: string; blurb: string; href: string; icon: LucideIcon }[] = [
  { id: "pulse", label: "Pulse", blurb: "Momentum score for every symbol", href: "/app/pulse", icon: Zap },
  { id: "fno", label: "F&O Analyzer", blurb: "Strategies, payoffs and risk", href: "/app/fno", icon: Calculator },
  { id: "mtf", label: "MTF", blurb: "Margin funding cost calculator", href: "/app/mtf", icon: Percent },
  { id: "fiidii", label: "FII/DII", blurb: "Institutional buying and selling", href: "/app/fiidii", icon: Landmark },
  { id: "movers", label: "Movers", blurb: "Gainers and losers, stocks and F&O", href: "/app/movers", icon: Flame },
  { id: "options", label: "Options", blurb: "Option chain and ATM trades", href: "/app/options", icon: SlidersHorizontal },
  { id: "buildup", label: "Buildup", blurb: "Open-interest buildup heatmap", href: "/app/buildup", icon: Activity },
];
const MORE = [
  { id: "dashboard", label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { id: "markets", label: "Markets", href: "/app/markets", icon: Store },
  { id: "news", label: "News", href: "/app/news", icon: Newspaper },
];

const tone = (n: number) => (n > 0 ? "text-emerald-600" : n < 0 ? "text-rose-500" : "text-slate-500");

/** An index's card: its price and change, and an "Expiry today" tag when its nearest option expiry is today. Tapping opens its chart. */
function IndexCard({ id, title }: { id: "NIFTY50" | "BANKNIFTY" | "SENSEX"; title: string }) {
  const { live, chgFor } = useZestoxx();
  const expiryToday = useExpiryToday(id === "SENSEX" ? "NIFTY50" : id);
  const showTag = id !== "SENSEX" && expiryToday === true;
  const sym = SYMBOL_MAP[id];
  const chg = chgFor(id);
  return (
    <Link href={`/app/trade/${id}`} data-testid={`index-card-${id}`} className="flex min-h-[44px] min-w-[150px] flex-1 flex-col rounded-xl border border-slate-200 bg-white p-3">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        {showTag && (
          <span data-testid={`expiry-today-${id}`} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
            Expiry today
          </span>
        )}
      </span>
      <span className="mt-1 font-mono text-[17px] font-semibold text-slate-900">{live[id] > 0 ? fmt(live[id], sym.type) : "--"}</span>
      <span className={"font-mono text-[12px] " + tone(chg)}>{fmtSigned(chg, 2, "%")}</span>
    </Link>
  );
}

/** Explore: the indices at a glance and a grid of the analysis pages. */
export default function PhoneExplore() {
  return (
    <div className="space-y-3" data-testid="phone-explore">
      <h1 className="font-display text-[20px] font-semibold text-slate-900">Explore</h1>
      <div className="flex gap-2 overflow-x-auto pb-0.5" data-testid="index-cards">
        <IndexCard id="NIFTY50" title="Nifty 50" />
        <IndexCard id="BANKNIFTY" title="Bank Nifty" />
        <IndexCard id="SENSEX" title="Sensex" />
      </div>
      <ul className="grid grid-cols-2 gap-2" data-testid="explore-grid">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.id}>
              <Link href={t.href} data-testid={`explore-${t.id}`} className="flex min-h-[88px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-3">
                <Icon size={20} className="text-blue-600" aria-hidden />
                <span>
                  <span className="block text-[14px] font-semibold text-slate-900">{t.label}</span>
                  <span className="block text-[11.5px] leading-snug text-slate-500">{t.blurb}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <section aria-label="More pages">
        <h2 className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">More pages</h2>
        <ul className="flex flex-wrap gap-2">
          {MORE.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.id}>
                <Link href={m.href} data-testid={`explore-more-${m.id}`} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700">
                  <Icon size={15} aria-hidden /> {m.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
