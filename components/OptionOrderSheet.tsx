"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import {
  makeContractId,
  pressure,
  simulateContractQuote,
  type Candle5,
  type ContractQuote,
} from "@/lib/contract";
import { contractLabel } from "@/lib/movers";
import { fmtINR, fmtIsoDate, fmtOi, fmtOiChange } from "@/lib/helpers";
import { GREEKS, chainStats, type OptionChain, type OptionLeg } from "@/lib/options";
import { useContractCandles, useContractQuote } from "@/lib/useContractQuote";

type Tab = "charts" | "chain" | "details";
const TABS: { id: Tab; label: string }[] = [
  { id: "charts", label: "Charts" },
  { id: "chain", label: "Option Chain" },
  { id: "details", label: "Scrip Details" },
];

const tone = (n: number) => (n > 0 ? "text-emerald-500" : n < 0 ? "text-rose-500" : "text-slate-500");
const price = (n: number) => (n > 0 ? n.toFixed(2) : "--");

/* ------------------------------------------------------------------ chart ---- */

/** Today's 5-minute closes as a line, with a dashed previous-close reference. */
function IntradayChart({ candles, prevClose }: { candles: Candle5[]; prevClose: number }) {
  const W = 320;
  const H = 130;
  const PAD = 6;
  const closes = candles.map((c) => c.c);
  const lo = Math.min(...closes, prevClose);
  const hi = Math.max(...closes, prevClose);
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i / Math.max(1, closes.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const pts = closes.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = closes[closes.length - 1] >= prevClose;
  const stroke = up ? "#10b981" : "#f43f5e";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[130px] w-full"
      role="img"
      aria-label={`Intraday premium, ${up ? "above" : "below"} previous close`}
    >
      <line
        x1={PAD}
        x2={W - PAD}
        y1={y(prevClose)}
        y2={y(prevClose)}
        stroke="#94a3b8"
        strokeDasharray="3 3"
        strokeWidth="1"
      />
      <polygon points={`${x(0)},${H - PAD} ${pts} ${x(closes.length - 1)},${H - PAD}`} fill={stroke} opacity="0.1" />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function ChartsTab({
  liveKey,
  prevClose,
  active,
}: {
  liveKey: string | undefined;
  prevClose: number;
  active: boolean;
}) {
  const candles = useContractCandles(liveKey, active);
  if (!liveKey) {
    return <Note>Intraday charts need live exchange data — not available for simulated contracts.</Note>;
  }
  if (candles === null) return <div className="h-[130px] animate-pulse rounded bg-slate-50" aria-busy="true" />;
  if (candles.length < 2) return <Note>No intraday trades to chart yet.</Note>;
  const first = candles[0].t.slice(11, 16);
  const last = candles[candles.length - 1].t.slice(11, 16);
  return (
    <div>
      <IntradayChart candles={candles} prevClose={prevClose} />
      <div className="mt-1 flex justify-between text-[10.5px] text-slate-400">
        <span>{first}</span>
        <span>5-min closes · dashed = previous close</span>
        <span>{last}</span>
      </div>
    </div>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[130px] items-center justify-center px-4 text-center text-[12px] text-slate-400">
    {children}
  </div>
);

/* ------------------------------------------------------------ chain / details */

const NEIGHBOURS = 4;

function ChainTab({
  chain,
  strike,
  type,
  onPick,
}: {
  chain: OptionChain;
  strike: number;
  type: "CE" | "PE";
  onPick: (strike: number, type: "CE" | "PE") => void;
}) {
  const rows = useMemo(() => {
    const i = chain.rows.findIndex((r) => r.strike === strike);
    return i < 0 ? [] : chain.rows.slice(Math.max(0, i - NEIGHBOURS), i + NEIGHBOURS + 1);
  }, [chain.rows, strike]);
  const atm = useMemo(() => chainStats(chain.rows, chain.spot)?.atmStrike, [chain.rows, chain.spot]);

  const cell = (selected: boolean, itm: boolean) =>
    "w-full rounded px-2 py-1 font-mono text-[12px] " +
    (selected ? "bg-blue-600 text-white" : itm ? "bg-slate-50 hover:bg-blue-50" : "hover:bg-blue-50");

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-[10.5px] uppercase tracking-wide text-slate-400">
          <th className="py-1 text-right font-medium">Call LTP</th>
          <th className="py-1 text-center font-medium">Strike</th>
          <th className="py-1 text-left font-medium">Put LTP</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.strike} className={r.strike === atm ? "bg-blue-50/60" : ""}>
            <td className="px-1 py-0.5 text-right">
              <button
                type="button"
                onClick={() => onPick(r.strike, "CE")}
                aria-label={`Call ${r.strike}`}
                className={cell(r.strike === strike && type === "CE", r.strike < chain.spot) + " text-right"}
              >
                {r.call.ltp.toFixed(2)}
              </button>
            </td>
            <td className="px-2 py-0.5 text-center font-mono font-semibold text-slate-900">{r.strike}</td>
            <td className="px-1 py-0.5 text-left">
              <button
                type="button"
                onClick={() => onPick(r.strike, "PE")}
                aria-label={`Put ${r.strike}`}
                className={cell(r.strike === strike && type === "PE", r.strike > chain.spot) + " text-left"}
              >
                {r.put.ltp.toFixed(2)}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetailsTab({
  chain,
  strike,
  type,
  leg,
  quote,
  lotSize,
}: {
  chain: OptionChain;
  strike: number;
  type: "CE" | "PE";
  leg: OptionLeg;
  quote: ContractQuote;
  lotSize: number;
}) {
  const rows: [string, string][] = [
    ["Underlying", chain.underlying === "NIFTY50" ? "NIFTY" : chain.underlying],
    ["Expiry", fmtIsoDate(chain.expiry)],
    ["Strike", String(strike)],
    ["Type", type === "CE" ? "Call (CE)" : "Put (PE)"],
    ["Lot size", String(lotSize)],
    ["Open interest", fmtOi(quote.oi || leg.oi)],
    ["OI change", fmtOiChange(leg.oi - leg.prevOi)],
    ["Implied vol.", leg.iv > 0 ? `${leg.iv.toFixed(2)}%` : "--"],
    ...GREEKS.filter((g) => leg[g.id] != null).map((g): [string, string] => [g.label, leg[g.id]!.toFixed(g.digits)]),
    ["Volume", fmtOi(quote.volume || leg.volume)],
    ["Avg. price", price(quote.avgPrice)],
  ];
  if (quote.lowerCircuit > 0 && quote.upperCircuit > 0) {
    rows.push(["Lower circuit", price(quote.lowerCircuit)], ["Upper circuit", price(quote.upperCircuit)]);
  }
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-mono text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ the sheet */

export default function OptionOrderSheet({
  chain,
  strike,
  type,
  onPick,
  onClose,
}: {
  chain: OptionChain;
  strike: number;
  type: "CE" | "PE";
  onPick: (strike: number, type: "CE" | "PE") => void;
  onClose: () => void;
}) {
  const { cash, holdings, tradeContract } = useZestoxx();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<Tab>("charts");
  const [lots, setLots] = useState(1);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const row = chain.rows.find((r) => r.strike === strike);
  const leg = row ? (type === "CE" ? row.call : row.put) : null;
  const id = makeContractId({ underlying: chain.underlying, expiry: chain.expiry, strike, type, key: leg?.key });
  const label = contractLabel({
    symbol: chain.underlying === "NIFTY50" ? "NIFTY" : chain.underlying,
    expiry: chain.expiry,
    strike,
    type,
  });

  const { quote: liveQuote, loading } = useContractQuote(leg?.key);
  const quote = useMemo<ContractQuote | null>(() => {
    if (liveQuote) return liveQuote;
    if (!leg || loading) return null;
    return simulateContractQuote(leg, chain.lotSize, id);
  }, [liveQuote, leg, loading, chain.lotSize, id]);

  if (!leg) return null;

  const qty = lots * chain.lotSize;
  const ltp = quote?.ltp ?? leg.ltp;
  const held = holdings[id]?.qty ?? 0;
  const split = quote ? pressure(quote.totalBuyQty, quote.totalSellQty) : null;
  const isLive = quote?.source === "live";

  const submit = (side: "buy" | "sell") => {
    if (!quote) return;
    if (side === "buy" && ltp * qty > cash) {
      setMsg({ t: "err", text: "Not enough virtual cash for this order." });
    } else if (side === "sell" && qty > held) {
      setMsg({
        t: "err",
        text:
          held > 0
            ? `You hold ${held} of this contract. Selling closes an existing paper position.`
            : "You don't hold this contract. Paper trading can only sell what you've bought — short selling isn't supported yet.",
      });
    } else {
      tradeContract({ id, side, qty, price: ltp });
      setMsg({
        t: "ok",
        text: `${side === "buy" ? "Bought" : "Sold"} ${lots} lot${lots > 1 ? "s" : ""} (${qty}) ${label} @ ${fmtINR(ltp)}`,
      });
    }
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-sheet-title"
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto">
          {/* header */}
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="order-sheet-title" className="font-display text-[15px] font-semibold text-slate-900">
                  {label}
                </h3>
                <span
                  className={
                    "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold " +
                    (isLive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")
                  }
                >
                  <span className={"h-1.5 w-1.5 rounded-full " + (isLive ? "bg-emerald-500" : "bg-slate-400")} />
                  {loading ? "Loading" : isLive ? "Live data" : "Simulated"}
                </span>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded p-1 text-slate-400 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>
            {quote && (
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-[22px] font-semibold text-slate-900">{ltp.toFixed(2)}</span>
                <span className={"font-mono text-[12.5px] " + tone(quote.change)}>
                  {quote.change >= 0 ? "+" : ""}
                  {quote.change.toFixed(2)}
                  {quote.changePct != null &&
                    ` (${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%)`}
                </span>
              </div>
            )}
          </div>

          {/* tabs */}
          <div role="tablist" aria-label="Contract views" className="flex border-b border-slate-200 px-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={
                  "border-b-2 px-3 py-2 text-[12px] font-medium " +
                  (tab === t.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-900")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="min-h-[150px] p-4">
            {!quote ? (
              <div className="h-[130px] animate-pulse rounded bg-slate-50" aria-busy="true" />
            ) : tab === "charts" ? (
              <ChartsTab liveKey={leg.key} prevClose={quote.prevClose} active={tab === "charts"} />
            ) : tab === "chain" ? (
              <ChainTab chain={chain} strike={strike} type={type} onPick={onPick} />
            ) : (
              <DetailsTab chain={chain} strike={strike} type={type} leg={leg} quote={quote} lotSize={chain.lotSize} />
            )}
          </div>

          {quote && (
            <>
              {/* OHLC */}
              <div className="grid grid-cols-4 gap-2 border-t border-slate-200 px-4 py-3">
                {(
                  [
                    ["Open", quote.open],
                    ["High", quote.high],
                    ["Low", quote.low],
                    ["Prev Close", quote.prevClose],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10.5px] uppercase tracking-wide text-slate-400">{k}</div>
                    <div className="font-mono text-[12.5px] text-slate-900">{price(v)}</div>
                  </div>
                ))}
              </div>

              {/* depth */}
              <div className="border-t border-slate-200 px-4 py-3">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-slate-400">
                      <th className="py-1 text-left font-medium">Qty</th>
                      <th className="py-1 text-right font-medium">Buy Price</th>
                      <th className="py-1 text-right font-medium">Sell Price</th>
                      <th className="py-1 text-right font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 5 }, (_, i) => {
                      const b = quote.bids[i];
                      const a = quote.asks[i];
                      return (
                        <tr key={i}>
                          <td className="py-0.5 text-left font-mono text-slate-500">{b ? b.qty : "--"}</td>
                          <td className="py-0.5 text-right font-mono text-emerald-500">{b ? b.price.toFixed(2) : "--"}</td>
                          <td className="py-0.5 text-right font-mono text-rose-500">{a ? a.price.toFixed(2) : "--"}</td>
                          <td className="py-0.5 text-right font-mono text-slate-500">{a ? a.qty : "--"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {split && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px] font-medium">
                      <span className="text-emerald-600">Buy {split.buyPct}%</span>
                      <span className="text-rose-600">Sell {split.sellPct}%</span>
                    </div>
                    <div
                      className="flex h-2 overflow-hidden rounded-full bg-slate-100"
                      role="img"
                      aria-label={`Buy quantity ${split.buyPct} percent, sell quantity ${split.sellPct} percent`}
                    >
                      <div className="bg-emerald-500" style={{ width: `${split.buyPct}%` }} />
                      <div className="bg-rose-500" style={{ width: `${split.sellPct}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-[10.5px] text-slate-400">
                      <span>{fmtOi(quote.totalBuyQty)}</span>
                      <span className="font-sans">total buy / sell qty in the book</span>
                      <span>{fmtOi(quote.totalSellQty)}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* paper trade */}
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-display text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Paper Trade
            </h4>
            <span className="text-[11px] text-slate-400">Virtual money — no real order is placed</span>
          </div>
          <div className="mb-3 flex items-end gap-3">
            <div className="w-24">
              <label htmlFor="order-lots" className="text-[11px] text-slate-500">
                Lots
              </label>
              <input
                id="order-lots"
                type="number"
                min={1}
                value={lots}
                onChange={(e) => setLots(Math.max(1, parseInt(e.target.value) || 1))}
                className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-[13px] text-slate-900 outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex-1 text-[11.5px] text-slate-500">
              <div>
                Qty <span className="font-mono text-slate-900">{qty}</span>
                <span className="text-slate-400"> ({chain.lotSize}/lot)</span>
              </div>
              <div>
                Premium <span className="font-mono text-slate-900">{fmtINR(ltp * qty)}</span>
                {held > 0 && (
                  <span className="text-slate-400">
                    {" "}
                    · Holding <span className="font-mono text-slate-900">{held}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submit("sell")}
              disabled={!quote}
              className="flex-1 rounded-md bg-rose-500 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Sell
            </button>
            <button
              type="button"
              onClick={() => submit("buy")}
              disabled={!quote}
              className="flex-1 rounded-md bg-emerald-500 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Buy
            </button>
          </div>
          <div aria-live="polite" className="min-h-[18px]">
            {msg && (
              <div className={"mt-2 text-[11.5px] " + (msg.t === "err" ? "text-rose-500" : "text-emerald-600")}>
                {msg.text}
              </div>
            )}
          </div>
          <p className="mt-1 text-[10.5px] text-slate-400">
            Market orders fill at the last traded price. Only market orders are supported for options.
          </p>
        </div>
      </div>
    </div>
  );
}
