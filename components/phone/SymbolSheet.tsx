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
 * notes and Create GTT; five-level market depth (real, or a plain message: never rows of zeros); and the day's range. Trading, charts and
 * alerts are for the symbols Zestoxx can chart; any other NSE symbol is a quote with depth, range and notes.
 */
export default function SymbolSheet({ symbol, quote, onClose }: { symbol: string; quote: RowQuote; onClose: () => void }) {
  const router = useRouter();
  const { setSelected, holdings, cash, onTrade, setAlerts, createGtt, notes, setNote, live } = useZestoxx();
  const charted = !!SYMBOL_MAP[symbol];
  const type = quote.type;
  const [panel, setPanel] = useState<"order" | "alert" | "notes" | "gtt" | null>(null);
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const expiryToday = useExpiryToday(symbol === "NIFTY50" || symbol === "BANKNIFTY" ? symbol : "NIFTY50");
  const showExpiry = (symbol === "NIFTY50" || symbol === "BANKNIFTY") && expiryToday === true;
  const price = charted ? (live[symbol] > 0 ? live[symbol] : null) : quote.price;
  const open = (p: typeof panel) => {
    if (charted && (p === "order" || p === "gtt")) setSelected(symbol);
    setPanel((cur) => (cur === p ? null : p));
  };

  return (
    <Sheet title={symbol.replace(/^IDX /, "")} onClose={onClose} testId="symbol-sheet">
      <div className="space-y-2 px-1 pb-1">
        <header className="flex items-start justify-between gap-3 px-2">
          <div className="min-w-0">
            <p data-testid="sheet-name" className="truncate text-[13px] text-slate-500">
              {quote.name}
            </p>
            {showExpiry && (
              <span data-testid="expiry-today" className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
                Expiry today
              </span>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div data-testid="sheet-price" className="font-mono text-[20px] font-semibold text-slate-900">
              {price == null ? "--" : fmt(price, type)}
            </div>
            <div data-testid="sheet-change" className={"font-mono text-[12.5px] " + tone(quote.changePct)}>
              {quote.changePct == null ? "--" : fmtSigned(quote.changePct, 2, "%")}
            </div>
          </div>
        </header>

        {!charted && (
          <p data-testid="quote-only-note" className="mx-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-500">
            Zestoxx shows a live quote, depth and the day&apos;s range for this symbol. Paper trading, charts and alerts are for the symbols it can chart (RELIANCE, TCS, INFY, HDFCBANK, SBIN, TATAMOTORS, NIFTY50, BANKNIFTY, SENSEX, BTC, ETH, SOL).
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 px-2">
          <button type="button" disabled={!charted} onClick={() => (setOrderSide("buy"), open("order"))} data-testid="sheet-buy" className="min-h-[44px] rounded-lg bg-emerald-500 text-[14px] font-semibold text-white disabled:opacity-40">
            Buy
          </button>
          <button type="button" disabled={!charted} onClick={() => (setOrderSide("sell"), open("order"))} data-testid="sheet-sell" className="min-h-[44px] rounded-lg bg-rose-500 text-[14px] font-semibold text-white disabled:opacity-40">
            Sell
          </button>
        </div>
        {panel === "order" && charted && price != null && (
          <div data-testid="sheet-order-panel" className="px-2" aria-label={`Paper ${orderSide}`}>
            <p className="pb-1 text-[11.5px] text-slate-500">
              Opened for a paper {orderSide}: choose the quantity and tap {orderSide === "buy" ? PAPER_BUY : PAPER_SELL}.
            </p>
            <OrderPanel symId={symbol} price={price} type={type} cash={cash} holdings={holdings} onTrade={onTrade} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 px-2">
          <ActionButton icon={<BarChart3 size={16} aria-hidden />} label="View chart" testId="sheet-chart" disabled={!charted} onClick={() => router.push(`/app/trade/${symbol}`)} />
          <ActionButton icon={<SlidersHorizontal size={16} aria-hidden />} label="Option chain" testId="sheet-chain" disabled={!OPTION_CHAIN_SYMBOLS.has(symbol)} onClick={() => (setSelected(symbol), router.push("/app/options"))} />
          <ActionButton icon={<Bell size={16} aria-hidden />} label="Set alert" testId="sheet-alert" disabled={!charted} pressed={panel === "alert"} onClick={() => open("alert")} />
          <ActionButton icon={<FileText size={16} aria-hidden />} label={notes[symbol] ? "Edit notes" : "Add notes"} testId="sheet-notes" pressed={panel === "notes"} onClick={() => open("notes")} />
          <ActionButton icon={<Target size={16} aria-hidden />} label="Create GTT" testId="sheet-gtt" disabled={!charted} pressed={panel === "gtt"} onClick={() => open("gtt")} />
        </div>

        {panel === "alert" && charted && price != null && <AlertForm symbol={symbol} price={price} type={type} onDone={() => setPanel(null)} setAlerts={setAlerts} />}
        {panel === "notes" && <NotesForm symbol={symbol} initial={notes[symbol] ?? ""} onSave={(t) => (setNote(symbol, t), setPanel(null))} />}
        {panel === "gtt" && charted && price != null && <GttForm symbol={symbol} price={price} type={type} onPlaced={() => setPanel(null)} createGtt={createGtt} />}
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
    <button type="button" disabled={disabled} aria-pressed={pressed} onClick={onClick} data-testid={testId} className={"flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-[12px] font-medium leading-tight disabled:opacity-40 " + (pressed ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700")}>
      {icon}
      {label}
    </button>
  );
}

const field = "min-h-[44px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[14px] text-slate-900 outline-none focus:border-blue-400";

function AlertForm({ symbol, price, type, onDone, setAlerts }: { symbol: string; price: number; type: RowQuote["type"]; onDone: () => void; setAlerts: ReturnType<typeof useZestoxx>["setAlerts"] }) {
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
      <p className="text-[12px] text-slate-500">Alert me once when {symbol} goes… (now {fmt(price, type)}). It fires while Zestoxx is open.</p>
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
        <div key={i} className="flex justify-between py-0.5">
          <span className={tone}>{fmt(l.price, type)}</span>
          <span className="text-slate-600">{l.qty}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="text-[11.5px] text-slate-400">None</p>}
    </div>
  );
}
