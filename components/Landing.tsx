"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Zap,
  SlidersHorizontal,
  Landmark,
  Bell,
  ShieldCheck,
  TrendingUp,
  Menu,
  type LucideIcon,
} from "lucide-react";

interface EcosystemItem {
  name: string;
  tag: string;
  icon: LucideIcon;
  desc: string;
}

const ECOSYSTEM: EcosystemItem[] = [
  {
    name: "Trade",
    tag: "Charts",
    icon: LineChart,
    desc: "Candlestick charts with MA, EMA, Bollinger Bands, RSI, drawing tools and your own formulas.",
  },
  {
    name: "Pulse",
    tag: "Signals",
    icon: Zap,
    desc: "One composite score per symbol, blending momentum, RSI and news sentiment.",
  },
  {
    name: "Options",
    tag: "Derivatives",
    icon: SlidersHorizontal,
    desc: "Full options chain with strikes, OI, IV and expiries for indices and stocks.",
  },
  {
    name: "FII/DII",
    tag: "Institutional flow",
    icon: Landmark,
    desc: "Daily, weekly and monthly foreign and domestic institutional net flows.",
  },
  {
    name: "Alerts",
    tag: "Notifications",
    icon: Bell,
    desc: "Set price targets and get notified the moment a symbol crosses them.",
  },
  {
    name: "Portfolio",
    tag: "Paper trading",
    icon: ShieldCheck,
    desc: "Practice with virtual capital before you ever risk real money.",
  },
];

export default function Landing() {
  const router = useRouter();
  const onEnter = () => router.push("/app/dashboard");

  return (
    <div className="min-h-full w-full bg-white text-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 md:px-12">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-display text-sm font-bold text-white">
            Z
          </div>
          <span className="font-display text-lg font-semibold tracking-tight text-blue-600">ZESTOXX</span>
        </div>
        <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <span className="cursor-pointer hover:text-slate-900" onClick={onEnter}>
            Signup
          </span>
          <span className="cursor-pointer hover:text-slate-900">About</span>
          <span className="cursor-pointer hover:text-slate-900">Products</span>
          <span className="cursor-pointer hover:text-slate-900">Pricing</span>
          <span className="cursor-pointer hover:text-slate-900">Support</span>
        </div>
        <Menu size={20} className="text-slate-500 md:hidden" />
      </div>

      <div className="px-6 pb-16 pt-16 text-center md:px-12">
        <div className="mx-auto mb-14 flex max-w-5xl items-center justify-center gap-0 overflow-hidden rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200">
          <div className="hidden w-1/4 shrink-0 bg-slate-50 p-4 text-left sm:block">
            <div className="mb-3 text-xs font-semibold text-slate-400">PULSE</div>
            <div className="mb-1 font-mono text-2xl font-bold text-blue-600">72</div>
            <div className="mb-4 text-xs font-medium text-blue-600">Bullish</div>
            <div className="h-1.5 w-full rounded-full bg-slate-200">
              <div className="h-full w-3/4 rounded-full bg-blue-600" />
            </div>
            <div className="mt-6 text-xs font-semibold text-slate-400">WATCHLIST</div>
            <div className="mt-2 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700">RELIANCE</span>
                <span className="text-emerald-500">+1.2%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700">NIFTY50</span>
                <span className="text-rose-500">-0.4%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700">BTC</span>
                <span className="text-emerald-500">+3.8%</span>
              </div>
            </div>
          </div>
          <div className="w-full bg-white p-5 text-left">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-slate-900">Hi, Trader</span>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-600">
                Market Open
              </span>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-xs text-slate-400">Total Value</div>
                <div className="font-mono text-lg font-semibold">₹10,00,000</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Cash</div>
                <div className="font-mono text-lg font-semibold">₹8,42,300</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">P&amp;L</div>
                <div className="font-mono text-lg font-semibold text-emerald-500">+₹12,450</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Positions</div>
                <div className="font-mono text-lg font-semibold">6</div>
              </div>
            </div>
            <svg viewBox="0 0 400 90" className="w-full">
              <polyline
                points="0,60 25,55 50,58 75,42 100,48 125,35 150,40 175,25 200,30 225,18 250,22 275,10 300,15 325,8 350,20 375,12 400,18"
                fill="none"
                stroke="#2563EB"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="hidden w-1/4 shrink-0 bg-slate-50 p-4 text-left lg:block">
            <div className="mb-3 text-xs font-semibold text-slate-400">FII / DII</div>
            <div className="mb-3 flex justify-between text-xs">
              <span className="text-slate-500">FII Net</span>
              <span className="font-mono text-rose-500">-₹1,771 Cr</span>
            </div>
            <div className="mb-4 flex justify-between text-xs">
              <span className="text-slate-500">DII Net</span>
              <span className="font-mono text-emerald-600">+₹871 Cr</span>
            </div>
            <div className="flex h-16 items-end gap-1">
              <div className="w-2 rounded-t bg-blue-600" style={{ height: "60%" }} />
              <div className="w-2 rounded-t bg-rose-400" style={{ height: "30%" }} />
              <div className="w-2 rounded-t bg-blue-400" style={{ height: "80%" }} />
              <div className="w-2 rounded-t bg-blue-600" style={{ height: "40%" }} />
              <div className="w-2 rounded-t bg-rose-400" style={{ height: "55%" }} />
              <div className="w-2 rounded-t bg-blue-400" style={{ height: "35%" }} />
            </div>
          </div>
        </div>

        <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
          Trade with an edge
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-500">
          Charts, options chains, institutional flow data and a composite signal none of the big
          platforms show you — all in one place, risk-free with paper trading.
        </p>
        <button
          onClick={onEnter}
          className="mt-8 rounded-lg bg-blue-600 px-8 py-3 text-base font-semibold text-white hover:bg-blue-700"
        >
          Start paper trading free
        </button>
      </div>

      <div className="grid grid-cols-1 gap-10 border-t border-slate-100 px-6 py-16 md:grid-cols-2 md:px-12">
        <div>
          <h2 className="font-display text-3xl font-semibold text-slate-900">
            Built for learning, not gimmicks
          </h2>
          <div className="mt-8 space-y-6">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Zero real risk</h3>
              <p className="mt-1 text-sm text-slate-500">
                Every trade runs on virtual capital. Learn how markets actually move before you
                commit real money anywhere.
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">One signal, not five apps</h3>
              <p className="mt-1 text-sm text-slate-500">
                Pulse blends momentum, RSI and news sentiment into a single score, so you&apos;re not
                tab-switching between a charting app, a news feed and an options screen.
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Institutional context built in
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                FII/DII flow data sits right next to your charts — most retail platforms bury this
                two clicks deep, if they show it at all.
              </p>
            </div>
          </div>
        </div>
        <div>
          <h2 className="mb-6 font-display text-xl font-semibold text-slate-900">
            Everything in one workspace
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {ECOSYSTEM.map((e) => {
              const Icon = e.icon;
              return (
                <div
                  key={e.name}
                  className="rounded-xl border border-slate-200 p-4 hover:border-blue-300"
                >
                  <Icon size={18} className="mb-2 text-blue-600" />
                  <div className="text-sm font-semibold text-slate-900">{e.name}</div>
                  <div className="mb-1 text-xs text-slate-400">{e.tag}</div>
                  <p className="text-xs text-slate-500">{e.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-6 py-16 text-center md:px-12">
        <h2 className="font-display text-3xl font-semibold text-slate-900">
          Free, because it&apos;s practice
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-slate-500">
          No brokerage, no account minimums, no real money — Zestoxx is a simulation, so the pricing
          is simple.
        </p>
        <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <div className="font-mono text-4xl font-bold text-blue-600">₹0</div>
            <div className="mt-1 text-sm text-slate-500">Account opening</div>
          </div>
          <div>
            <div className="font-mono text-4xl font-bold text-blue-600">₹0</div>
            <div className="mt-1 text-sm text-slate-500">Every trade, always</div>
          </div>
          <div>
            <div className="font-mono text-4xl font-bold text-blue-600">₹10L</div>
            <div className="mt-1 text-sm text-slate-500">Starting virtual capital</div>
          </div>
        </div>
      </div>

      <div className="px-6 py-16 text-center md:px-12">
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          Start trading in minutes
        </h2>
        <p className="mt-2 text-slate-500">
          No KYC, no waiting period — jump straight into the terminal.
        </p>
        <button
          onClick={onEnter}
          className="mt-6 rounded-lg bg-blue-600 px-8 py-3 text-base font-semibold text-white hover:bg-blue-700"
        >
          Sign up for free
        </button>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-6 py-12 md:px-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div>
            <h4 className="mb-3 text-sm font-semibold text-slate-900">Product</h4>
            <div className="space-y-2 text-sm text-slate-500">
              <div>Trade</div>
              <div>Pulse</div>
              <div>Options</div>
              <div>FII/DII</div>
            </div>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold text-slate-900">Support</h4>
            <div className="space-y-2 text-sm text-slate-500">
              <div>Help center</div>
              <div>Contact us</div>
              <div>Status</div>
            </div>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold text-slate-900">Company</h4>
            <div className="space-y-2 text-sm text-slate-500">
              <div>About</div>
              <div>Careers</div>
              <div>Blog</div>
            </div>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold text-slate-900">Legal</h4>
            <div className="space-y-2 text-sm text-slate-500">
              <div>Terms</div>
              <div>Privacy</div>
              <div>Disclosures</div>
            </div>
          </div>
        </div>
        <div className="mt-10 flex items-center gap-2 text-xs text-slate-400">
          <TrendingUp size={14} />© 2026 Zestoxx. All prices simulated unless marked &quot;Live&quot;.
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-slate-400">
          Zestoxx is a paper-trading simulation and educational product. It is not a registered
          stockbroker, investment advisor, or exchange member, does not execute real trades, and no
          real money changes hands on this platform. Nothing here is investment advice. Simulated
          prices are illustrative; only BTC, ETH and SOL pull live prices, and only when the network
          allows it.
        </p>
      </div>
    </div>
  );
}
