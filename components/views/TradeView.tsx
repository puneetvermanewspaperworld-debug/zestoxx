"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Bell,
  Layers,
  ListOrdered,
  FunctionSquare,
  SlidersHorizontal,
} from "lucide-react";
import DepthLadder from "@/components/DepthLadder";
import Watchlist from "@/components/Watchlist";
import OrderPanel from "@/components/OrderPanel";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOLS, SYMBOL_MAP } from "@/lib/symbols";
import { aggregateCandles } from "@/lib/history";
import { computeCustomSeries } from "@/lib/formula";
import { PULSE_BASIS, pulseFor } from "@/lib/pulse";
import { rsiSeries } from "@/lib/indicators";
import DataBadge from "@/components/DataBadge";
import { fmt, fmtSigned } from "@/lib/helpers";
import type { Candle } from "@/lib/types";

// The chart needs the browser (canvas), so it is loaded on the client only.
const ChartWithTools = dynamic(() => import("@/components/chart/ChartWithTools"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded bg-slate-50" aria-busy="true" />,
});

export default function TradeView({ symbol }: { symbol?: string }) {
  // Phones: the order ticket opens as a bottom sheet from the sticky Paper buy / Paper sell bar.
  const [orderOpen, setOrderOpen] = useState(false);
  const {
    selected,
    setSelected,
    sym,
    price,
    chg,
    prevCloseFor,
    histories,
    live,
    liveSource,
    timeframe,
    setTimeframe,
    showMA,
    setShowMA,
    showVolume,
    setShowVolume,
    showRSI,
    setShowRSI,
    showBB,
    setShowBB,
    showEMA,
    setShowEMA,
    compareWith,
    setCompareWith,
    cash,
    holdings,
    onTrade,
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    orderLog,
    onAddAlert,
    formula,
    setFormula,
    hasFeedQuote,
    hasRealHistory,
  } = useZestoxx();

  // Keep the selected symbol in sync with the /app/trade/[symbol] route segment.
  useEffect(() => {
    if (symbol && SYMBOL_MAP[symbol] && symbol !== selected) setSelected(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const symOrders = orderLog.filter((o) => o.symbol === selected).slice(0, 6);
  const pulseState = pulseFor({
    symId: selected,
    live,
    histories,
    prevClose: prevCloseFor(selected),
    hasQuote: hasFeedQuote(selected),
    hasRealHistory: hasRealHistory(selected),
  });
  // The chart gets the whole history for the timeframe (it opens on the last `keep` bars and can be panned back). Indicators, RSI and
  // the custom formula are worked out on all of it: Wilder's smoothing and the EMA need the earlier bars.
  const frame = { D: { size: 1, keep: 30 }, W: { size: 5, keep: 26 }, M: { size: 21, keep: 14 } }[timeframe];
  const frameOf = (candles: Candle[]) => (frame.size === 1 ? candles : aggregateCandles(candles, frame.size));
  const fullFrame = frameOf(histories[selected]);
  const rsiFull = rsiSeries(fullFrame, 14);
  const compareFull = compareWith ? frameOf(histories[compareWith]) : null;
  const { series: customSeries, error: formulaError } = useMemo(
    () => computeCustomSeries(fullFrame, formula),
    [fullFrame, formula]
  );

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_1fr_260px]">
      {/* On phones the watchlist comes after the chart and ticket, not before them. */}
      <div className="order-last overflow-hidden rounded-xl border border-slate-200 bg-white xl:order-none">
        <div className="px-3 pt-3 pb-1 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          Watchlist
        </div>
        <Watchlist
          watchlist={watchlist}
          selected={selected}
          onSelect={setSelected}
          onAdd={addToWatchlist}
          onRemove={removeFromWatchlist}
          live={live}
        />
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-[18px] font-semibold text-slate-900">{selected}</h1>
                <span className="text-[12px] text-slate-400">{sym.name}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[24px] font-semibold text-slate-900">
                  {fmt(price, sym.type)}
                </span>
                <span
                  className={
                    "flex items-center gap-1 font-mono text-[13px] " +
                    (chg >= 0 ? "text-emerald-500" : "text-rose-500")
                  }
                >
                  {chg >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {fmtSigned(chg, 2, "%")}
                </span>
                <span
                  data-testid="pulse-pill"
                  title={pulseState.state === "ok" ? pulseState.result.basis : PULSE_BASIS}
                  className={
                    "ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold " +
                    (pulseState.state !== "ok"
                      ? "bg-slate-100 text-slate-500"
                      : pulseState.result.label === "Bullish"
                        ? "bg-emerald-50 text-emerald-500"
                        : pulseState.result.label === "Bearish"
                          ? "bg-rose-50 text-rose-500"
                          : "bg-blue-50 text-slate-500")
                  }
                >
                  <Zap size={10} />{" "}
                  {pulseState.state === "ok" ? `Pulse ${pulseState.result.score} · ${pulseState.result.label}` : `Pulse · ${pulseState.text}`}
                </span>
                <DataBadge source={liveSource[selected]} type={sym.type} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-md border border-slate-200 p-0.5">
                {(["D", "W", "M"] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={
                      "rounded px-2.5 py-1 text-[11.5px] font-medium " +
                      (timeframe === tf
                        ? "bg-blue-600 text-slate-50"
                        : "text-slate-500 hover:text-slate-900")
                    }
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 p-0.5">
                <button
                  onClick={() => setShowMA((v) => !v)}
                  className={
                    "rounded px-2 py-1 text-[11px] font-medium " +
                    (showMA ? "bg-blue-50 text-blue-600" : "text-slate-400")
                  }
                >
                  MA
                </button>
                <button
                  onClick={() => setShowEMA((v) => !v)}
                  className={
                    "rounded px-2 py-1 text-[11px] font-medium " +
                    (showEMA ? "bg-blue-50 text-blue-600" : "text-slate-400")
                  }
                >
                  EMA
                </button>
                <button
                  onClick={() => setShowBB((v) => !v)}
                  className={
                    "rounded px-2 py-1 text-[11px] font-medium " +
                    (showBB ? "bg-blue-50 text-blue-600" : "text-slate-400")
                  }
                >
                  BB
                </button>
                <button
                  onClick={() => setShowVolume((v) => !v)}
                  className={
                    "rounded px-2 py-1 text-[11px] font-medium " +
                    (showVolume ? "bg-blue-50 text-blue-600" : "text-slate-400")
                  }
                >
                  Vol
                </button>
                <button
                  onClick={() => setShowRSI((v) => !v)}
                  className={
                    "rounded px-2 py-1 text-[11px] font-medium " +
                    (showRSI ? "bg-blue-50 text-blue-600" : "text-slate-400")
                  }
                >
                  RSI
                </button>
              </div>
              <select
                value={compareWith || ""}
                onChange={(e) => setCompareWith(e.target.value || null)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-900 outline-none"
              >
                <option value="">Compare vs...</option>
                {SYMBOLS.filter((s) => s.id !== selected).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
              {sym.type !== "crypto" && (
                <Link
                  href="/app/options"
                  className="flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/60 px-2 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                >
                  <SlidersHorizontal size={12} /> Option Chain
                </Link>
              )}
              <button
                onClick={() => onAddAlert(selected)}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:text-blue-600"
              >
                <Bell size={12} /> Alert
              </button>
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-blue-50 pb-2.5">
            <div className="ml-auto flex w-full basis-full items-center gap-1.5 sm:w-[340px] sm:flex-none sm:basis-auto">
              <FunctionSquare size={13} className="shrink-0 text-slate-400" />
              <input
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="Custom formula, e.g. sma(20) or (high+low)/2"
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-cyan-600 placeholder-slate-400 outline-none focus:border-cyan-400"
              />
            </div>
          </div>
          {formulaError && <div className="mb-2 text-[11px] text-rose-500">{formulaError}</div>}

          <ChartWithTools
            heightClass={showRSI ? "h-[440px] md:h-[480px]" : "h-[320px] md:h-[360px]"}
              symbol={selected}
              timeframe={timeframe}
              type={sym.type}
              candles={fullFrame}
              keep={frame.keep}
              showMA={showMA}
              showEMA={showEMA}
              showBB={showBB}
              showVolume={showVolume}
              showRSI={showRSI}
              rsi={rsiFull}
              compare={compareFull}
              custom={customSeries}
          />
          {compareWith && (
            <div className="mt-1 text-[10.5px] text-amber-500">
              ┄┄ dashed amber line = {compareWith} normalized for comparison
            </div>
          )}
          {customSeries && (
            <div className="mt-1 text-[10.5px] text-cyan-600">— cyan line = your custom formula</div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2.5 flex items-center gap-1.5 font-display text-[12.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <ListOrdered size={13} /> Recent Orders — {selected}
          </h3>
          {symOrders.length === 0 ? (
            <div className="py-3 text-center text-[12px] text-slate-400">
              No orders for this symbol yet.
            </div>
          ) : (
            <div className="space-y-1">
              {symOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-[11.5px]">
                  <span
                    className={
                      "font-medium " + (o.side === "buy" ? "text-emerald-500" : "text-rose-500")
                    }
                  >
                    {o.side.toUpperCase()} {o.qty} · {o.mode}
                  </span>
                  <span className="font-mono text-slate-500">{fmt(o.price, sym.type)}</span>
                  <span className="text-slate-400">{o.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {/* Sticky action bar (phones only), sitting just above the bottom tab bar */}
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t border-slate-200 bg-white p-2 md:hidden">
          <button type="button" onClick={() => setOrderOpen(true)} className="min-h-[44px] flex-1 rounded-md bg-emerald-500 text-[14px] font-semibold text-white">
            Paper buy
          </button>
          <button type="button" onClick={() => setOrderOpen(true)} className="min-h-[44px] flex-1 rounded-md bg-rose-500 text-[14px] font-semibold text-white">
            Paper sell
          </button>
        </div>
        <div
          className={orderOpen ? "fixed inset-0 z-50 flex items-end bg-slate-900/40 md:static md:z-auto md:block md:bg-transparent" : "hidden md:block"}
          onClick={() => setOrderOpen(false)}
        >
          <div
            role={orderOpen ? "dialog" : undefined}
            aria-modal={orderOpen ? true : undefined}
            aria-label="Paper trade ticket"
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] md:max-h-none md:overflow-visible md:rounded-none md:bg-transparent md:pb-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-3 md:hidden">
              <span className="font-display text-[15px] font-semibold text-slate-900">Paper trade · {selected}</span>
              <button type="button" onClick={() => setOrderOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded text-[20px] text-slate-600">
                ×
              </button>
            </div>
            <OrderPanel
              symId={selected}
              price={price}
              type={sym.type}
              cash={cash}
              holdings={holdings}
              onTrade={onTrade}
            />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 flex items-center gap-1.5 font-display text-[12.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <Layers size={13} /> Order Book
          </h3>
          <DepthLadder symbol={selected} type={sym.type} />
        </div>
      </div>
    </div>
  );
}
