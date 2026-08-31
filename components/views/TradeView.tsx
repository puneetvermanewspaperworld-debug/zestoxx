"use client";

import React, { useEffect, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Bell,
  Layers,
  ListOrdered,
  Pencil,
  Minus,
  Eraser,
  FunctionSquare,
} from "lucide-react";
import CandleChart from "@/components/CandleChart";
import RSIPanel from "@/components/RSIPanel";
import DepthLadder from "@/components/DepthLadder";
import Watchlist from "@/components/Watchlist";
import OrderPanel from "@/components/OrderPanel";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOLS, SYMBOL_MAP } from "@/lib/symbols";
import { aggregateCandles } from "@/lib/history";
import { computeCustomSeries } from "@/lib/formula";
import { computePulse } from "@/lib/pulse";
import { fmt } from "@/lib/helpers";
import type { Candle, Timeframe } from "@/lib/types";

export default function TradeView({ symbol }: { symbol?: string }) {
  const {
    selected,
    setSelected,
    sym,
    price,
    chg,
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
    drawMode,
    setDrawMode,
    drawings,
    onAddDrawing,
    onClearDrawings,
    formula,
    setFormula,
  } = useZestoxx();

  // Keep the selected symbol in sync with the /app/trade/[symbol] route segment.
  useEffect(() => {
    if (symbol && SYMBOL_MAP[symbol] && symbol !== selected) setSelected(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const applyTimeframe = (candles: Candle[], tf: Timeframe) => {
    if (tf === "D") return candles.slice(-30);
    if (tf === "W") return aggregateCandles(candles, 5).slice(-26);
    return aggregateCandles(candles, 21).slice(-14); // "M"
  };
  const visible = applyTimeframe(histories[selected], timeframe);
  const symOrders = orderLog.filter((o) => o.symbol === selected).slice(0, 6);
  const pulse = computePulse(selected, live, histories);
  const compareCandles = compareWith ? applyTimeframe(histories[compareWith], timeframe) : null;
  const { series: customSeries, error: formulaError } = useMemo(
    () => computeCustomSeries(visible, formula),
    [visible, formula]
  );

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_1fr_260px]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
          histories={histories}
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
                  {chg >= 0 ? "+" : ""}
                  {chg.toFixed(2)}%
                </span>
                <span
                  className={
                    "ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold " +
                    (pulse.label === "Bullish"
                      ? "bg-emerald-50 text-emerald-500"
                      : pulse.label === "Bearish"
                        ? "bg-rose-50 text-rose-500"
                        : "bg-blue-50 text-slate-500")
                  }
                >
                  <Zap size={10} /> Pulse {pulse.score} · {pulse.label}
                </span>
                <span
                  className={
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold " +
                    (liveSource[selected] === "live"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-slate-100 text-slate-500")
                  }
                >
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " +
                      (liveSource[selected] === "live" ? "bg-emerald-500" : "bg-slate-400")
                    }
                  />
                  {liveSource[selected] === "live" ? "Live data" : "Simulated"}
                </span>
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
              <button
                onClick={() => onAddAlert(selected)}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:text-blue-600"
              >
                <Bell size={12} /> Alert
              </button>
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-blue-50 pb-2.5">
            <div className="flex items-center gap-1 rounded-md border border-slate-200 p-0.5">
              <button
                onClick={() => setDrawMode(drawMode === "trend" ? "none" : "trend")}
                title="Trendline"
                className={
                  "flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium " +
                  (drawMode === "trend"
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-500 hover:text-slate-900")
                }
              >
                <Pencil size={12} /> Trend
              </button>
              <button
                onClick={() => setDrawMode(drawMode === "hline" ? "none" : "hline")}
                title="Horizontal line"
                className={
                  "flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium " +
                  (drawMode === "hline"
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-500 hover:text-slate-900")
                }
              >
                <Minus size={12} /> H-Line
              </button>
              <button
                onClick={onClearDrawings}
                title="Clear drawings"
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-rose-500"
              >
                <Eraser size={12} /> Clear
              </button>
            </div>
            {drawMode !== "none" && (
              <span className="text-[10.5px] text-slate-400">
                {drawMode === "trend"
                  ? "Click two points on the chart to draw a trendline."
                  : "Click a point to draw a horizontal line at that price."}
              </span>
            )}
            <div className="ml-auto flex flex-1 items-center gap-1.5 sm:flex-none sm:w-[340px]">
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

          <div className="h-[300px]">
            <CandleChart
              candles={visible}
              showMA={showMA}
              showVolume={showVolume}
              showBB={showBB}
              showEMA={showEMA}
              compareSeries={compareCandles}
              customSeries={customSeries}
              drawMode={drawMode}
              drawings={drawings}
              onAddDrawing={onAddDrawing}
            />
          </div>
          {compareWith && (
            <div className="mt-1 text-[10.5px] text-amber-500">
              ┄┄ dashed amber line = {compareWith} normalized for comparison
            </div>
          )}
          {customSeries && (
            <div className="mt-1 text-[10.5px] text-cyan-600">— cyan line = your custom formula</div>
          )}
          {showRSI && (
            <div className="mt-1 h-[80px] border-t border-blue-50 pt-1">
              <RSIPanel candles={visible} />
            </div>
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
        <OrderPanel
          symId={selected}
          price={price}
          type={sym.type}
          cash={cash}
          holdings={holdings}
          onTrade={onTrade}
        />
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 flex items-center gap-1.5 font-display text-[12.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <Layers size={13} /> Order Book
          </h3>
          <DepthLadder price={price} type={sym.type} />
        </div>
      </div>
    </div>
  );
}
