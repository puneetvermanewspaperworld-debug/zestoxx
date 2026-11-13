"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Percent, Search } from "lucide-react";
import { useWatchRows } from "@/lib/useWatchlist";
import { fmtINR } from "@/lib/helpers";
import {
  DEFAULTS,
  DEFAULT_CHARGES,
  FORCED_SALE_LABEL,
  FUNDING_LABEL,
  MTF_WARNING,
  RATE_LABEL,
  compute,
  type MtfCharges,
  type Side,
} from "@/lib/mtf/calc";

/**
 * MTF calculator. Informational only: no orders, no funding. Every number comes from lib/mtf/calc.ts, the price from the live
 * quote of the chosen stock (editable), and everything else from fields the user can change.
 */

const num = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s));
/** "−₹1,234", "₹1,234": the sign goes before the rupee sign */
const money = (n: number, signed = false): string => {
  const r = Math.round(n);
  const body = fmtINR(Math.abs(r));
  return r < 0 ? `−${body}` : signed && r > 0 ? `+${body}` : body;
};
const pct = (n: number | null, d = 2): string => (n === null || !Number.isFinite(n) ? "--" : `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}%`);
const tone = (n: number) => (n > 0 ? "text-emerald-600" : n < 0 ? "text-rose-500" : "text-slate-900");

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  step = "any",
  suffix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  step?: string;
  suffix?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-[11.5px] font-medium text-slate-600">
        {label}
      </label>
      <div className="mt-0.5 flex items-center rounded-md border border-slate-200 bg-slate-50 focus-within:border-blue-400">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent px-2 py-2 font-mono text-[13px] text-slate-900 outline-none"
        />
        {suffix && <span className="pr-2 text-[11.5px] text-slate-400">{suffix}</span>}
      </div>
      {hint && <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}

function StockSearch({ symbol, onPick }: { symbol: string; onPick: (s: string, name: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string }[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/watchlist-search?q=${encodeURIComponent(term)}`);
        const data = r.ok ? await r.json() : { results: [] };
        if (!cancelled) setResults(data.results ?? []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);
  const shown = q.trim() ? results : [];
  return (
    <div className="relative">
      <label htmlFor="mtf-search" className="text-[11.5px] font-medium text-slate-600">
        Stock
      </label>
      <div className="mt-0.5 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 focus-within:border-blue-400">
        <Search size={14} className="text-slate-400" />
        <input
          id="mtf-search"
          value={q}
          placeholder={`${symbol} · search NSE stocks`}
          onChange={(e) => setQ(e.target.value)}
          className="w-full min-w-0 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-500"
        />
      </div>
      {shown.length > 0 && (
        <ul role="listbox" aria-label="Matching stocks" className="absolute inset-x-0 z-20 mt-1 max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {shown.map((r) => (
            <li key={r.symbol} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  onPick(r.symbol, r.name);
                  setQ("");
                  setResults([]);
                }}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{r.symbol}</span>
                <span className="truncate text-[11px] text-slate-400">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CHARGE_FIELDS: { key: keyof MtfCharges; label: string; suffix: string }[] = [
  { key: "brokeragePerOrder", label: "Brokerage per order", suffix: "₹" },
  { key: "sttPct", label: "STT, buy and sell", suffix: "%" },
  { key: "stampBuyPct", label: "Stamp duty, buy", suffix: "%" },
  { key: "nseTxnPct", label: "NSE transaction charge", suffix: "%" },
  { key: "sebiPerCrore", label: "SEBI fee per crore", suffix: "₹" },
  { key: "gstPct", label: "GST on brokerage, charge, fee", suffix: "%" },
  { key: "dpPerSell", label: "DP charge per sell", suffix: "₹" },
];

const ROWS: { label: string; get: (s: Side) => string; tone?: (s: Side) => number }[] = [
  { label: "Position value", get: (s) => money(s.positionValue) },
  { label: "Own capital used", get: (s) => money(s.ownCapitalUsed) },
  { label: "Quantity", get: (s) => s.quantity.toLocaleString("en-IN") },
  { label: "Gross profit", get: (s) => money(s.grossProfit, true), tone: (s) => s.grossProfit },
  { label: "Interest", get: (s) => money(s.interest) },
  { label: "Charges", get: (s) => money(s.charges) },
  { label: "Net profit", get: (s) => money(s.netProfit, true), tone: (s) => s.netProfit },
  { label: "Net return on own capital", get: (s) => pct(s.netReturnPct), tone: (s) => s.netReturnPct ?? 0 },
  { label: "Breakeven price", get: (s) => (s.breakevenPrice === null ? "--" : fmtINR(Math.round(s.breakevenPrice * 100) / 100)) },
];

export default function MtfView() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [name, setName] = useState("");
  const { res, loading } = useWatchRows(`symbols=${encodeURIComponent(symbol)}`);
  const live = res?.source === "live" ? res.rows.find((r) => r.symbol === symbol) : undefined;

  // The price follows the live quote until the user types their own; the exit follows the price until the user types one.
  const [priceText, setPriceText] = useState<string | null>(null);
  const [exitText, setExitText] = useState<string | null>(null);
  const livePrice = live?.ltp ?? null;
  const priceStr = priceText ?? (livePrice !== null ? String(livePrice) : "");
  const exitStr = exitText ?? (livePrice !== null ? String(Math.round(livePrice * 1.05 * 100) / 100) : "");

  const [own, setOwn] = useState(String(DEFAULTS.ownAmount));
  const [days, setDays] = useState(String(DEFAULTS.days));
  const [funding, setFunding] = useState(String(DEFAULTS.fundingPct));
  const [rate, setRate] = useState(String(DEFAULTS.ratePct));
  const [forced, setForced] = useState(String(DEFAULTS.forcedSalePct));
  const [chargeText, setChargeText] = useState<Record<keyof MtfCharges, string>>(() =>
    Object.fromEntries(Object.entries(DEFAULT_CHARGES).map(([k, v]) => [k, String(v)])) as Record<keyof MtfCharges, string>
  );
  const [how, setHow] = useState(false);

  const charges = useMemo<MtfCharges>(() => {
    const c = { ...DEFAULT_CHARGES };
    for (const k of Object.keys(c) as (keyof MtfCharges)[]) {
      const v = num(chargeText[k]);
      c[k] = Number.isFinite(v) && v >= 0 ? v : 0;
    }
    return c;
  }, [chargeText]);

  const price = num(priceStr);
  const exit = num(exitStr);
  const ready = Number.isFinite(price) && price > 0 && Number.isFinite(exit) && exit > 0;
  const result = useMemo(
    () =>
      ready
        ? compute({
            price,
            exitPrice: exit,
            ownAmount: num(own),
            days: num(days),
            fundingPct: num(funding),
            ratePct: num(rate),
            forcedSalePct: num(forced),
            charges,
          })
        : null,
    [ready, price, exit, own, days, funding, rate, forced, charges]
  );

  const pick = (s: string, n: string) => {
    setSymbol(s);
    setName(n);
    setPriceText(null);
    setExitText(null);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-4">
        <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-slate-900">
          <Percent size={16} className="text-blue-600" /> MTF calculator
        </h2>
        <p className="mt-1 text-[12px] text-slate-500">
          See what a delivery trade looks like with and without a broker&apos;s margin funding. Informational only: nothing here places an
          order or arranges funding.
        </p>
        <button
          type="button"
          aria-expanded={how}
          aria-controls="mtf-how"
          onClick={() => setHow((v) => !v)}
          className="mt-3 rounded-md border border-blue-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-blue-700 hover:bg-blue-50"
        >
          See how MTF works
        </button>
        {how && (
          <ul id="mtf-how" className="mt-3 list-disc space-y-1 pl-5 text-[12px] leading-snug text-slate-600">
            <li>With MTF you pay part of the price of the shares and the broker funds the rest.</li>
            <li>You pay interest on the funded part for every calendar day you hold, weekends and holidays included, whether the trade gains or loses.</li>
            <li>The shares are pledged to the broker as security for the loan.</li>
            <li>Gains and losses are on the whole position, not only on your own money, so a small price move is a bigger move on your capital.</li>
            <li>If the price falls until your equity in the position drops to the broker&apos;s level, the broker may sell shares, usually without asking you first.</li>
            <li>Which stocks are eligible, and how much is funded, differs by broker and by stock.</li>
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StockSearch symbol={symbol} onPick={pick} />
          <Field
            id="mtf-price"
            label="Price per share"
            suffix="₹"
            value={priceStr}
            onChange={setPriceText}
            hint={
              priceText !== null
                ? "Your own price."
                : livePrice !== null
                  ? `Live price of ${symbol}${name ? ` (${name})` : ""}. Type to use your own.`
                  : loading
                    ? "Loading the live price…"
                    : "Live price not available right now. Type the price."
            }
          />
          <Field id="mtf-exit" label="Expected exit price" suffix="₹" value={exitStr} onChange={setExitText} hint={exitText === null ? "Starts 5% above the price." : undefined} />
          <Field id="mtf-own" label="Your own investment" suffix="₹" value={own} onChange={setOwn} />
          <Field id="mtf-days" label="Holding days" suffix="days" step="1" value={days} onChange={setDays} hint="Interest runs every calendar day." />
          <Field id="mtf-funding" label="Funding" suffix="%" value={funding} onChange={setFunding} hint={FUNDING_LABEL} />
          <Field id="mtf-rate" label="MTF interest" suffix="% / year" value={rate} onChange={setRate} hint={RATE_LABEL} />
          <Field id="mtf-forced" label="Broker's forced-sale level" suffix="%" value={forced} onChange={setForced} hint={`Equity as a % of the position at which a broker may sell. ${FORCED_SALE_LABEL}`} />
        </div>

        <details className="mt-3 rounded-md border border-slate-200">
          <summary className="min-h-[44px] cursor-pointer px-3 py-3 text-[12.5px] font-medium text-slate-700">Delivery charges (editable)</summary>
          <div className="grid grid-cols-1 gap-3 border-t border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHARGE_FIELDS.map((f) => (
              <Field
                key={f.key}
                id={`mtf-ch-${f.key}`}
                label={f.label}
                suffix={f.suffix}
                value={chargeText[f.key]}
                onChange={(v) => setChargeText((c) => ({ ...c, [f.key]: v }))}
              />
            ))}
            <p className="col-span-full text-[10.5px] text-slate-400">
              Brokerage defaults to ₹0 because many brokers charge nothing on delivery orders. Enter your broker&apos;s figure.
            </p>
          </div>
        </details>
      </div>

      {!result ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-[12.5px] text-slate-400">
          Enter a price and an expected exit price to see the comparison.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white" data-testid="mtf-results">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="font-display text-[13px] font-semibold text-slate-900">With MTF and without</h3>
              <p className="text-[11.5px] text-slate-400">
                Leverage <span className="font-mono text-slate-700">{result.leverage.toFixed(2)}x</span> at {funding || 0}% funding. Net figures include interest and charges.
              </p>
            </div>
            <table className="w-full table-fixed text-[12px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-slate-400">
                  <th className="w-[34%] px-3 py-2 text-left font-medium" />
                  <th className="px-2 py-2 text-right font-medium">With MTF</th>
                  <th className="px-3 py-2 text-right font-medium">Without MTF</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label} className="border-t border-slate-100">
                    <th scope="row" className="px-3 py-2 text-left font-normal text-slate-500">
                      {r.label}
                    </th>
                    <td className={"break-words px-2 py-2 text-right font-mono " + (r.tone ? tone(r.tone(result.withMtf)) : "text-slate-900")}>{r.get(result.withMtf)}</td>
                    <td className={"break-words px-3 py-2 text-right font-mono " + (r.tone ? tone(r.tone(result.withoutMtf)) : "text-slate-900")}>{r.get(result.withoutMtf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.withMtf.quantity === 0 && (
              <p className="border-t border-slate-100 px-4 py-3 text-[11.5px] text-amber-700">Your amount is less than the price of one share, so there is nothing to compare.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="mtf-risk">
            <h3 className="font-display text-[13px] font-semibold text-slate-900">What can go wrong</h3>
            <dl className="mt-2 grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
                <dt className="text-slate-500">A fall that wipes out your own capital</dt>
                <dd className="font-mono text-rose-500">{pct(result.wipeOutFallPct, 1)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
                <dt className="text-slate-500">Price at which a broker may sell</dt>
                <dd className="text-right font-mono text-rose-500">
                  {result.forcedSalePrice === null ? "--" : fmtINR(Math.round(result.forcedSalePrice * 100) / 100)}
                  {result.forcedSaleFallPct !== null && <span className="block text-[10.5px] text-slate-400">a {result.forcedSaleFallPct.toFixed(1)}% fall</span>}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white" data-testid="mtf-grid">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="font-display text-[13px] font-semibold text-slate-900">Net profit at other exit prices</h3>
              <p className="text-[11.5px] text-slate-400">After interest and charges. Losses are as real as gains.</p>
            </div>
            <table className="w-full table-fixed text-[12px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-slate-400">
                  <th className="w-[34%] px-3 py-2 text-left font-medium">Exit</th>
                  <th className="px-2 py-2 text-right font-medium">With MTF</th>
                  <th className="px-3 py-2 text-right font-medium">Without MTF</th>
                </tr>
              </thead>
              <tbody>
                {result.grid.map((g) => (
                  <tr key={g.movePct} className="border-t border-slate-100">
                    <th scope="row" className="px-3 py-2 text-left font-normal text-slate-600">
                      <span className="font-mono">{g.movePct > 0 ? `+${g.movePct}` : g.movePct < 0 ? `−${Math.abs(g.movePct)}` : "0"}%</span>
                      <span className="block font-mono text-[10.5px] text-slate-400">{fmtINR(Math.round(g.exitPrice * 100) / 100)}</span>
                    </th>
                    <td className={"break-words px-2 py-2 text-right font-mono " + tone(g.mtfNet)}>{money(g.mtfNet, true)}</td>
                    <td className={"break-words px-3 py-2 text-right font-mono " + tone(g.plainNet)}>{money(g.plainNet, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p data-testid="mtf-warning" className="rounded-lg bg-amber-50 px-4 py-3 text-[12px] leading-snug text-amber-900">
        {MTF_WARNING}
      </p>
    </div>
  );
}
