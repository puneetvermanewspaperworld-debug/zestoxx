"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Bell, FileText, SlidersHorizontal, Target } from "lucide-react";
import OrderPanel from "@/components/OrderPanel";
import Sheet from "@/components/chart/Sheet";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { fmt, fmtSigned } from "@/lib/helpers";
import { gttKind, triggerDirection } from "@/lib/gtt";
import { SYMBOL_MAP } from "@/lib/symbols";
import { NO_RECENT_TRADES, NO_TRADES_NOTE, isTradableId } from "@/lib/dynamic-symbols";
import { useWatchSymbols } from "@/components/useWatchSymbols";
import { useExpiryToday } from "@/lib/useWatchlist";
import { PAPER_BUY, PAPER_SELL } from "@/lib/labels";
import { DEPTH_NOT_AVAILABLE, DEPTH_WHEN_OPEN } from "@/lib/depth-state";
import { useMarketStatus } from "@/lib/useMarketStatus";
import type { DepthLevel } from "@/lib/contract";
import type { RowQuote } from "./useRowQuotes";

/** The charted symbols that have an option chain page. */
const OPTION_CHAIN_SYMBOLS = new Set(["RELIANCE", "TCS", "INFY", "HDFCBANK", "SBIN", "TATAMOTORS", "NIFTY50", "BANKNIFTY"]);

interface Detail {
  ltp: number;
  ohlc: { open: number; high: number; low: number };
  depth: { bids: DepthLevel[]; asks: DepthLevel[] } | null;
}
type DetailState = { symbol: string; res: { source: "live"; detail: Detail } | { source: "unsupported" } | { source: "unavailable" } } | null;

/** Day range and depth for a symbol from /api/symbol-detail, polled every 5 s. undefined = no answer yet. */
function useSymbolDetail(symbol: string) {
  const [state, setState] = useState<DetailState>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let res: NonNullable<DetailState>["res"] = { source: "unavailable" };
      try {
        const r = await fetch(`/api/symbol-detail?symbol=${encodeURIComponent(symbol)}`);
        const d = r.ok ? await r.json() : null;
        if (d?.source === "live") res = { source: "live", detail: d as Detail };
        else if (d?.source === "unsupported") res = { source: "unsupported" };
      } catch {
        // stays unavailable
      }
      if (!cancelled) setState((prev) => (res.source === "unavailable" && prev?.symbol === symbol && prev.res.source === "live" ? prev : { symbol, res }));
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [symbol]);
  return state?.symbol === symbol ? state.res : undefined;
}

const tone = (n: number | null) => (n == null || n === 0 ? "text-slate-500" : n > 0 ? "text-emerald-500" : "text-rose-500");

/**
 * The sheet that opens when a watchlist row is tapped: the name, price and change; Buy and Sell; View chart, Option chain, Set alert, Add
 * notes and Create GTT; five-level market depth (real, or a plain message: never rows of zeros); and the day's range. Any NSE equity or ETF can
 * be charted and traded (its quote and candles are fetched on demand); an index is a quote with depth, range and notes. A symbol with no recent
 * trades has no price, so it says so and cannot be bought or sold: a price is never made up.
 */
export default function SymbolSheet({ symbol, quote, onClose }: { symbol: string; quote: RowQuote; onClose: () => void }) {
  const router = useRouter();
  const { setSelected, holdings, cash, onTrade, setAlerts, createGtt, notes, setNote, live, quoteStateOf, chgFor, hasFeedQuote } = useZestoxx();
  const tradable = isTradableId(symbol);
  const own = !!SYMBOL_MAP[symbol];
  useWatchSymbols([symbol]);
  const state = own ? undefined : quoteStateOf(symbol);
  const noTrades = state === "none";
  const type = quote.type;
  const [panel, setPanel] = useState<"order" | "alert" | "notes" | "gtt" | null>(null);
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const expiryToday = useExpiryToday(symbol === "NIFTY50" || symbol === "BANKNIFTY" ? symbol : "NIFTY50");
  const showExpiry = (symbol === "NIFTY50" || symbol === "BANKNIFTY") && expiryToday === true;
  const price = tradable ? (live[symbol] > 0 ? live[symbol] : null) : quote.price;
  // the day's change needs a previous close; with none (a feed that gave only a price) it is not shown rather than shown as 0
  const changePct = !tradable ? quote.changePct : price == null ? null : own || hasFeedQuote(symbol) ? chgFor(symbol) : null;
  const canOrder = tradable && price != null;
  const listed = tradable && state !== "unknown";
  const open = (p: typeof panel) => {
    if (tradable && (p === "order" || p === "gtt")) setSelected(symbol);
    setPanel((cur) => (cur === p ? null : p));
  };

  return (
    <Sheet title={symbol.replace(/^IDX /, "")} large onClose={onClose} testId="symbol-sheet">
      <div className="flex flex-col gap-2 px-1 pb-1">
        <header className="flex h-[var(--sheet-sub)] items-center gap-2 px-2">
          <p data-testid="sheet-name" className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
            {quote.name}
          </p>
          {showExpiry && (
            <span data-testid="expiry-today" className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-800">
              Expiry today
            </span>
          )}
          <span data-testid="sheet-price" className={"shrink-0 font-mono text-[15px] " + tone(price == null ? null : changePct)}>
            {price == null ? (noTrades ? NO_RECENT_TRADES : "--") : fmt(price, type)}
          </span>
          <span data-testid="sheet-change" className={"shrink-0 font-mono text-[13px] " + tone(changePct)}>
            {changePct == null ? "--" : fmtSigned(changePct, 2, "%")}
          </span>
        </header>

        {!tradable && (
          <p data-testid="quote-only-note" className="mx-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-500">
            An index is not something you can buy or sell: Zestoxx shows its live quote, the day&apos;s range and your notes. Charts, paper orders, alerts and GTT are for NSE stocks and ETFs.
          </p>
        )}
        {noTrades && (
          <p data-testid="no-trades-note" role="status" className="mx-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
            {NO_TRADES_NOTE}
          </p>
        )}
        {state === "unknown" && (
          <p data-testid="not-listed-note" role="status" className="mx-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-500">
            {symbol} is not an NSE equity or ETF on Upstox&apos;s instrument list, so there is no quote and nothing to trade.
          </p>
        )}
        {tradable && !own && state === "unavailable" && price == null && (
          <p data-testid="quote-unavailable-note" role="status" className="mx-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-500">
            The live quote is not available right now, so orders are off until it is. Zestoxx never makes a price up.
          </p>
        )}

        <div className="mt-[var(--sheet-gap)] grid grid-cols-2 gap-5 px-2">
          <button type="button" disabled={!canOrder} onClick={() => (setOrderSide("buy"), open("order"))} data-testid="sheet-buy" className="h-[var(--btn-primary-h)] rounded-lg bg-emerald-500 text-[14px] font-semibold text-white disabled:opacity-40">
            Buy
          </button>
          <button type="button" disabled={!canOrder} onClick={() => (setOrderSide("sell"), open("order"))} data-testid="sheet-sell" className="h-[var(--btn-primary-h)] rounded-lg bg-rose-500 text-[14px] font-semibold text-white disabled:opacity-40">
            Sell
          </button>
        </div>
        {panel === "order" && canOrder && price != null && (
          <div data-testid="sheet-order-panel" className="px-2" aria-label={`Paper ${orderSide}`}>
            <p className="pb-1 text-[11.5px] text-slate-500">
              Opened for a paper {orderSide}: choose the quantity and tap {orderSide === "buy" ? PAPER_BUY : PAPER_SELL}.
            </p>
            <OrderPanel symId={symbol} price={price} type={type} cash={cash} holdings={holdings} onTrade={onTrade} />
          </div>
        )}

        {/* text links, two rows with a hairline between: 44 px each, 71 px from one row's centre to the next */}
        <div className="px-2">
          <div className="mt-1 flex h-11 items-center justify-between">
            <ActionButton icon={<BarChart3 size={16} aria-hidden />} label="View chart" testId="sheet-chart" disabled={!listed} onClick={() => (setSelected(symbol), router.push(`/app/trade/${symbol}`))} />
            <ActionButton icon={<SlidersHorizontal size={16} aria-hidden />} label="Option chain" testId="sheet-chain" disabled={!OPTION_CHAIN_SYMBOLS.has(symbol)} onClick={() => (setSelected(symbol), router.push("/app/options"))} />
          </div>
          <div className="my-[var(--link-gap)] h-px bg-slate-200" />
          <div className="flex h-11 items-center justify-between">
            <ActionButton icon={<Bell size={16} aria-hidden />} label="Set alert" testId="sheet-alert" disabled={!listed} pressed={panel === "alert"} onClick={() => open("alert")} />
            <ActionButton icon={<FileText size={16} aria-hidden />} label={notes[symbol] ? "Edit notes" : "Add notes"} testId="sheet-notes" pressed={panel === "notes"} onClick={() => open("notes")} />
            <ActionButton icon={<Target size={16} aria-hidden />} label="Create GTT" testId="sheet-gtt" disabled={!canOrder} pressed={panel === "gtt"} onClick={() => open("gtt")} />
          </div>
        </div>

        {panel === "alert" && listed && <AlertForm symbol={symbol} price={price} type={type} onDone={() => setPanel(null)} setAlerts={setAlerts} />}
        {panel === "notes" && <NotesForm symbol={symbol} initial={notes[symbol] ?? ""} onSave={(t) => (setNote(symbol, t), setPanel(null))} />}
        {panel === "gtt" && canOrder && price != null && <GttForm symbol={symbol} price={price} type={type} onPlaced={() => setPanel(null)} createGtt={createGtt} />}
        {notes[symbol] && panel !== "notes" && (
          <p data-testid="saved-note" className="mx-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            {notes[symbol]}
          </p>
        )}

        <DayRange symbol={symbol} type={type} price={price} />
        <Depth symbol={symbol} type={type} />
      </div>
    </Sheet>
  );
}

function ActionButton({ icon, label, onClick, disabled, pressed, testId }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; testId: string }) {
  return (
    <button type="button" disabled={disabled} aria-pressed={pressed} onClick={onClick} data-testid={testId} className={"flex h-11 items-center gap-2 rounded-md text-[14px] font-medium disabled:opacity-40 " + (pressed ? "bg-blue-50 px-2 text-blue-700" : "text-blue-700")}>
      {icon}
      {label}
    </button>
  );
}

const field = "min-h-[44px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[14px] text-slate-900 outline-none focus:border-blue-400";

function AlertForm({ symbol, price, type, onDone, setAlerts }: { symbol: string; price: number | null; type: RowQuote["type"]; onDone: () => void; setAlerts: ReturnType<typeof useZestoxx>["setAlerts"] }) {
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      data-testid="alert-form"
      className="mx-2 space-y-2 rounded-lg border border-slate-200 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const t = parseFloat(target);
        if (!(t > 0)) return setError("Enter a target price above 0.");
        setAlerts((a) => [{ id: Date.now() + Math.random(), symbol, condition, target: t, createdAt: new Date().toLocaleTimeString("en-IN") }, ...a]);
        onDone();
      }}
    >
      <p className="text-[12px] text-slate-500">Alert me once when {symbol} goes… ({price == null ? "no live price now" : `now ${fmt(price, type)}`}). It fires while Zestoxx is open.</p>
      <div className="flex gap-2" role="radiogroup" aria-label="Alert condition">
        {(["above", "below"] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={condition === c} onClick={() => setCondition(c)} className={"min-h-[44px] flex-1 rounded-lg border text-[13px] font-medium " + (condition === c ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
            {c === "above" ? "Above" : "Below"}
          </button>
        ))}
      </div>
      <input data-testid="alert-target" inputMode="decimal" aria-label="Target price" placeholder="Target price" value={target} onChange={(e) => (setTarget(e.target.value), setError(null))} className={field + " font-mono"} />
      {error && <p role="alert" className="text-[12px] text-rose-500">{error}</p>}
      <button type="submit" data-testid="alert-save" className="min-h-[44px] w-full rounded-lg bg-blue-600 text-[14px] font-semibold text-white">
        Set alert
      </button>
    </form>
  );
}

function NotesForm({ symbol, initial, onSave }: { symbol: string; initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <form data-testid="notes-form" className="mx-2 space-y-2" onSubmit={(e) => (e.preventDefault(), onSave(text))}>
      <label htmlFor="note-text" className="text-[12px] text-slate-500">
        Your note on {symbol} (kept in your paper account, up to 500 characters)
      </label>
      <textarea id="note-text" data-testid="note-text" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} rows={3} className={field + " py-2"} />
      <button type="submit" data-testid="note-save" className="min-h-[44px] w-full rounded-lg bg-blue-600 text-[14px] font-semibold text-white">
        {text.trim() ? "Save note" : initial ? "Delete note" : "Save note"}
      </button>
    </form>
  );
}

function GttForm({ symbol, price, type, onPlaced, createGtt }: { symbol: string; price: number; type: RowQuote["type"]; onPlaced: () => void; createGtt: ReturnType<typeof useZestoxx>["createGtt"] }) {
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [qty, setQty] = useState("1");
  const [trigger, setTrigger] = useState("");
  const [error, setError] = useState<string | null>(null);
  const t = parseFloat(trigger);
  const kind = t > 0 ? gttKind(side, triggerDirection(t, price)) : null;
  return (
    <form
      data-testid="gtt-form"
      className="mx-2 space-y-2 rounded-lg border border-slate-200 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const err = createGtt({ symbol, side, qty: Number(qty), trigger: t });
        if (err) return setError(err);
        onPlaced();
      }}
    >
      <p className="text-[12px] leading-snug text-slate-500">
        Trades once {symbol} reaches your trigger (now {fmt(price, type)}): a sell below the price is a stop-loss, above it a target. It fires while Zestoxx is open; otherwise the next visit checks the candles and marks the fill as simulated.
      </p>
      <div className="flex gap-2" role="radiogroup" aria-label="GTT side">
        {(["sell", "buy"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => (setSide(s), setError(null))} className={"min-h-[44px] flex-1 rounded-lg border text-[13px] font-medium " + (side === s ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
            {s === "sell" ? "Sell" : "Buy"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input data-testid="gtt-trigger" inputMode="decimal" aria-label="Trigger price" placeholder="Trigger price" value={trigger} onChange={(e) => (setTrigger(e.target.value), setError(null))} className={field + " font-mono"} />
        <input data-testid="gtt-qty" inputMode="numeric" aria-label="Quantity" placeholder="Qty" value={qty} onChange={(e) => (setQty(e.target.value), setError(null))} className={field + " font-mono"} />
      </div>
      {kind && (
        <p data-testid="gtt-kind" className="text-[12px] font-medium text-slate-700">
          {kind}: {side} {qty || "?"} when the price reaches {fmt(t, type)}
        </p>
      )}
      {error && <p role="alert" data-testid="gtt-error" className="text-[12px] text-rose-500">{error}</p>}
      <button type="submit" data-testid="gtt-save" className="min-h-[44px] w-full rounded-lg bg-blue-600 text-[14px] font-semibold text-white">
        Create GTT
      </button>
    </form>
  );
}

function DayRange({ symbol, type, price }: { symbol: string; type: RowQuote["type"]; price: number | null }) {
  const res = useSymbolDetail(symbol);
  const range = res?.source === "live" && res.detail.ohlc.high > 0 && res.detail.ohlc.low > 0 ? res.detail.ohlc : null;
  return (
    <section aria-label="Day's range" data-testid="day-range" className="mx-2 rounded-lg border border-slate-200 p-2.5">
      <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Day&apos;s range</h3>
      {res === undefined ? (
        <div className="h-8 animate-pulse rounded bg-slate-50" aria-busy="true" />
      ) : range ? (
        <>
          <div className="flex justify-between font-mono text-[12.5px] text-slate-700">
            <span data-testid="range-low">Low {fmt(range.low, type)}</span>
            <span data-testid="range-high">High {fmt(range.high, type)}</span>
          </div>
          <div className="relative mt-2 h-1.5 rounded-full bg-slate-100">
            {price != null && range.high > range.low && (
              <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600" style={{ left: `${Math.min(100, Math.max(0, ((price - range.low) / (range.high - range.low)) * 100))}%` }} />
            )}
          </div>
          {range.open > 0 && <p className="mt-2 font-mono text-[11.5px] text-slate-500">Open {fmt(range.open, type)}</p>}
        </>
      ) : (
        <p data-testid="range-unavailable" className="text-[12px] text-slate-500">
          The day&apos;s range is not available right now.
        </p>
      )}
    </section>
  );
}

function Depth({ symbol, type }: { symbol: string; type: RowQuote["type"] }) {
  const res = useSymbolDetail(symbol);
  const market = useMarketStatus();
  const [twenty, setTwenty] = useState(false);
  let body: React.ReactNode;
  if (res === undefined) body = <div className="h-24 animate-pulse rounded bg-slate-50" aria-busy="true" />;
  else if (res.source === "unsupported") body = <Message text="No market depth for this symbol." />;
  else if (res.source === "unavailable") body = <Message text={DEPTH_NOT_AVAILABLE + "."} />;
  else if (!res.detail.depth) body = <Message text="An index has no order book, so there is no market depth." />;
  else {
    const bids = res.detail.depth.bids.filter((l) => l.price > 0 && l.qty > 0);
    const asks = res.detail.depth.asks.filter((l) => l.price > 0 && l.qty > 0);
    if (bids.length === 0 && asks.length === 0) body = <Message text={market?.open === false ? DEPTH_WHEN_OPEN + "." : DEPTH_NOT_AVAILABLE + "."} />;
    else
      body = (
        <div className="grid grid-cols-2 gap-3 font-mono text-[12px]" data-testid="depth-levels">
          <Side title="Bid" rows={bids} type={type} tone="text-emerald-600" />
          <Side title="Ask" rows={asks} type={type} tone="text-rose-500" />
        </div>
      );
  }
  return (
    <section aria-label="Market depth" data-testid="depth" className="mx-2 rounded-lg border border-slate-200 p-2.5">
      <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Market depth · 5 levels</h3>
      {body}
      <button type="button" aria-expanded={twenty} data-testid="show-20-depth" onClick={() => setTwenty((v) => !v)} className="mt-2 min-h-[44px] w-full rounded-lg border border-slate-200 text-[13px] font-medium text-slate-700">
        Show 20 depth
      </button>
      {twenty && (
        <p data-testid="depth-20-note" className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-500">
          Twenty-level depth comes from the exchange&apos;s live stream, which Zestoxx does not have, so it is not shown. The five levels above are the real ones from the quote.
        </p>
      )}
    </section>
  );
}

const Message = ({ text }: { text: string }) => (
  <p data-testid="depth-message" className="py-2 text-center text-[12.5px] text-slate-500">
    {text}
  </p>
);

function Side({ title, rows, type, tone }: { title: string; rows: DepthLevel[]; type: RowQuote["type"]; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10.5px] uppercase tracking-wide text-slate-400">
        <span>{title}</span>
        <span>Qty</span>
      </div>
      {rows.map((l, i) => (
        <div key={i} className="flex h-[var(--depth-row)] items-center justify-between">
          <span className={tone}>{fmt(l.price, type)}</span>
          <span className="text-slate-600">{l.qty}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="text-[11.5px] text-slate-400">None</p>}
    </div>
  );
}
