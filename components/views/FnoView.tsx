"use client";

import React, { useMemo, useReducer, useState } from "react";
import PayoffChart, { chartRange } from "@/components/fno/PayoffChart";
import LegGreeks from "@/components/fno/LegGreeks";
import StrikeCompare, { type CmpState } from "@/components/fno/StrikeCompare";
import { RATES } from "@/lib/fno/charges";
import {
  PRESETS,
  atmStrike,
  computeExtremes,
  computeStatic,
  evaluate,
  greeksNow,
  prepareLegs,
  profitGrid,
  presetLegs,
  tradeSide,
  type ExitStyle,
  type LegInput,
  type LegType,
  type SideView,
  type Market,
} from "@/lib/fno/engine";
import type { OptType } from "@/lib/fno/pricing";
import { explain, slopeText } from "@/lib/fno/explain";
import { TONE_CLASS, compact, gammaStr, nf, pct, rs, rsS, tone } from "@/lib/fno/format";
import { UNDERLYINGS, UNDERLYING_IDS } from "@/lib/fno/lots";
import { expiresToday, quoteFromSnapshot, type FnoSource } from "@/lib/fno/snapshot";
import { buildMarket, feedMoved, freezeReducer, initialFreeze, pricedAtText, snapKey, type Overrides, type PriceMode } from "@/lib/fno/freeze";
import { CALENDAR } from "@/lib/market-calendar";
import { useMarketStatus } from "@/lib/useMarketStatus";
import { compareStrikes } from "@/lib/fno/strikes";
import { fmtIsoDate } from "@/lib/helpers";
import { useFnoSnapshot } from "@/lib/useFnoSnapshot";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const round2 = (x: number) => Math.round(x * 100) / 100;
const card = "rounded-xl border border-slate-200 bg-white p-3 md:p-4";
const inputCls =
  "mt-0.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[13px] text-slate-900 outline-none focus:border-blue-400";

/* ------------------------------------------------------------ small parts ---- */

/** Numeric field: lets you type "1." or an empty box without fighting the parsed value. */
function Num({ label, value, onChange, min, step, hint, id }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number | "any"; hint?: string; id: string }) {
  const [text, setText] = useState<string | null>(null); // non-null while the field is focused
  // What you are typing wins while it still matches the value (or is half-typed, like "-" or empty); if the
  // value changed from outside (e.g. "Use live values"), show the new value instead of stale text.
  const parsed = text == null ? NaN : parseFloat(text);
  const shown = text !== null && (!isFinite(parsed) || parsed === value) ? text : String(round2(value));
  return (
    <div>
      <label htmlFor={id} className="text-[11px] text-slate-500">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step ?? "any"}
        value={shown}
        onFocus={() => setText(String(round2(value)))}
        onBlur={() => setText(null)}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (isFinite(v)) onChange(v);
        }}
        className={inputCls}
      />
      {hint && <p className="mt-0.5 text-[10.5px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; text: string; tone?: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={"flex-1 rounded-md px-2.5 py-1 text-[12px] font-medium " + (value === o.id ? (o.tone ?? "bg-blue-600") + " text-slate-50" : "text-slate-500 hover:text-slate-900")}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

const BADGE: Record<FnoSource | "manual", { text: string; cls: string; dot: string }> = {
  live: { text: "Live", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  delayed: { text: "Delayed", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  simulated: { text: "Simulated", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  manual: { text: "Manual", cls: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
};

function Stat({ k, v, s, cls = "" }: { k: string; v: string; s?: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{k}</div>
      <div className={"mt-1 font-mono text-[17px] font-semibold leading-none " + (cls || "text-slate-900")}>{v}</div>
      <div className="mt-1.5 min-h-[14px] text-[10.5px] text-slate-500">{s}</div>
    </div>
  );
}

/**
 * Best or worst case for a side of the trade that never stops growing (a long call's profit, a naked short's loss...).
 * Instead of one huge number it gives the slope, what the side is worth at sensible distances, and a labelled stress case.
 */
function OpenStat({ k, kind, view, cls }: { k: string; kind: "best" | "worst"; view: SideView; cls: string }) {
  const row = "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5";
  const val = (v: number) => <b className={"font-mono " + (v >= 0 ? "text-emerald-600" : "text-rose-500")}>{rs(v)}</b>;
  return (
    <div className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{k}</div>
      <div className={"mt-1 text-[14px] font-semibold leading-snug " + cls}>{slopeText(view.open, kind)}</div>
      <div className="mt-2 space-y-1 text-[12px] leading-snug text-slate-600">
        <div className={row}>
          <span>Inside the expected range ({nf(view.inRange.lo)}–{nf(view.inRange.hi)})</span>
          {val(view.inRange.value)}
        </div>
        <div className={row}>
          <span>At 3 standard deviations ({nf(view.at3.lo)}–{nf(view.at3.hi)})</span>
          {val(view.at3.value)}
        </div>
        {view.stress.map((s) => (
          <div key={s.dir} className={row + " rounded bg-slate-50 px-1.5 py-1"}>
            <span>
              <b>Stress case</b>, index 20% {s.dir === "down" ? "lower" : "higher"} ({nf(s.spot)})
              {kind === "worst" && <span className="block text-slate-500">The loss is open-ended.</span>}
            </span>
            {val(s.value)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The chosen price mode lives for the browser session (it survives trade, expiry and underlying changes, and a reload of the tab). */
const MODE_KEY = "zestoxx-fno-price-mode";
const readMode = (): PriceMode => {
  try {
    return sessionStorage.getItem(MODE_KEY) === "frozen" ? "frozen" : "live";
  } catch {
    return "live";
  }
};
const saveMode = (mode: PriceMode) => {
  try {
    sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    /* private window or blocked storage: the mode just lasts until the page is closed */
  }
};

/* ------------------------------------------------------------------ view ---- */

export default function FnoView() {
  const [und, setUnd] = useState("NIFTY");
  const [expiry, setExpiry] = useState<string | null>(null);
  const { snap, loading, feedLost } = useFnoSnapshot(und, expiry);
  // `feed` is the latest answer and keeps refreshing in the background. The analysis is priced from `fz.snap`, one snapshot
  // held still until the user acts (Update to live prices, a trade edit, another expiry or underlying), so no number moves under them.
  const feed = snap && snap.underlying === und ? snap : null;
  const info = UNDERLYINGS[und];

  const [fz, dispatch] = useReducer(freezeReducer, undefined, () => ({ ...initialFreeze, mode: readMode() }));
  // Take the first snapshot, and a fresh one for a different contract; the same contract refreshing changes nothing.
  if (freezeReducer(fz, { type: "feed", feed }) !== fz) dispatch({ type: "feed", feed });
  // Shown only while the frozen snapshot is for the contract the feed is on (not for a moment after switching expiry).
  const live = fz.snap && feed && snapKey(fz.snap) === snapKey(feed) ? fz.snap : null;
  const feedAhead = feedMoved(live, feed);

  // Anything the user types over the feed is a "manual" override; an update replaces the snapshot, never these.
  const ov = fz.ov;
  const setOv = (patch: Partial<Overrides>) => dispatch({ type: "override", patch });
  const manual = ov.spot != null || ov.dte != null || ov.iv != null;
  const [costs, setCosts] = useState({ r: 6.5, q: 1.3, brokerage: 20, slab: 30 });
  const [exitStyle, setExitStyle] = useState<ExitStyle>("square");

  const market = useMemo<Market | null>(() => buildMarket(live, ov, costs, exitStyle, info.kind), [live, ov, costs, exitStyle, info.kind]);

  // The legs follow a preset around the money until the user edits them.
  const [preset, setPreset] = useState("lc");
  const [legs, setLegs] = useState<LegInput[]>([]);
  const [legsFor, setLegsFor] = useState(""); // "" = (re)generate from the preset; "custom" = the user's own
  const nextId = (ls: LegInput[]) => ls.reduce((a, l) => Math.max(a, l.id), 0) + 1;
  if (market && legsFor === "") {
    setLegsFor(`${und}|${preset}`);
    setLegs(presetLegs(preset, market, nextId(legs)));
  }
  // The strike comparison starts on the same side as the trade (puts for a put trade) until the user picks a side.
  const [cmpSide, setCmpSide] = useState<OptType | null>(null);
  const editLegs = (fn: (ls: LegInput[]) => LegInput[]) => {
    setLegs(fn);
    setLegsFor("custom");
    setPreset("");
    setCmpSide(null);
    dispatch({ type: "tradeEdit", feed }); // changing the trade takes a fresh snapshot
    setExitSpotRaw(null); // a new trade starts with the exit at the current spot, never at a leftover marker
  };

  // Exit controls.
  const [exitSpotRaw, setExitSpotRaw] = useState<number | null>(null);
  const [days, setDays] = useState(0);
  const [dIV, setDIV] = useState(0);

  const [cmp, setCmp] = useState<CmpState>({ dir: "CE", risk: 15000, hold: "half", mode: "lot" });
  const [ctx, setCtx] = useState({ pe: 22, peAvg: 20, bond: 6.5 });

  // Chain prices only describe the market the feed saw, so they're dropped once the user overrides it.
  const usingChain = !!live && live.source !== "simulated" && !manual;
  const quote = useMemo(
    () => (usingChain && market ? quoteFromSnapshot(live, { r: market.r / 100, q: market.q / 100, dte: market.dte }) : undefined),
    [usingChain, live, market]
  );

  const P = useMemo(() => (market ? prepareLegs(legs, market, quote) : []), [legs, market, quote]);
  const ok = !!market && P.length > 0 && market.spot > 0 && market.dte > 0 && market.iv > 0 && market.lot > 0;
  const st = useMemo(() => (ok && market ? computeStatic(P, market) : null), [ok, P, market]);
  const cmpState = useMemo<CmpState>(() => ({ ...cmp, dir: cmpSide ?? tradeSide(legs) }), [cmp, cmpSide, legs]);
  const comparison = useMemo(() => (ok && market ? compareStrikes(market, cmpState.dir, cmpState.risk, cmpState.hold, quote) : null), [ok, market, cmpState, quote]);

  // ---- handlers
  const changeUnderlying = (u: string) => {
    setUnd(u);
    setExpiry(null);
    dispatch({ type: "reset" });
    setExitSpotRaw(null);
    setCmpSide(null);
    setLegsFor("");
    setPreset((p) => p || "lc");
  };
  const useLive = () => { dispatch({ type: "clearOverrides" }); setExitSpotRaw(null); };
  // "Update to live prices": a new snapshot now (typed values stay), and the exit goes back to the current spot.
  const updateLive = () => { dispatch({ type: "update", feed }); setExitSpotRaw(null); };
  // The Live / Frozen choice is kept for the session; going Live re-prices at once (the exit scenario you chose is left alone).
  const chooseMode = (mode: PriceMode) => { saveMode(mode); dispatch({ type: "setMode", mode, feed }); };

  const badgeKey: FnoSource | "manual" = manual ? "manual" : (live?.source ?? "simulated");
  const badge = BADGE[badgeKey];
  const name = info.name;
  const mk = useMarketStatus();
  // Why the prices aren't live, in plain words, using the exchange calendar when it has an answer.
  const delayedWhy = !mk
    ? "The exchange feed hasn’t updated in the last minute, so spot, VIX and option prices are the last values received."
    : mk.open
      ? "NSE is scheduled to be open, but its feed hasn’t updated in the last minute — it may have stalled. Spot, VIX and option prices are the last values received."
      : mk.kind === "holiday"
        ? `NSE is closed today (${mk.reason}), so spot, VIX and option prices are the last values from the previous session.`
        : mk.kind === "special"
          ? `${mk.label}. The exchange feed hasn’t updated in the last minute, so prices are the last values received.`
          : "The market is shut, so spot, VIX and option prices are the last values from the previous session.";

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      {/* header */}
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[17px] font-semibold text-slate-900">F&amp;O Analyzer</h1>
            <p className="mt-0.5 text-[12px] text-slate-500">Test an options or futures trade: what it can make or lose, where it breaks even, and what the charges do to it.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold " + badge.cls}>
              <span className={"h-1.5 w-1.5 rounded-full " + badge.dot} />
              {badge.text}
            </span>
            {manual && (
              <button type="button" onClick={useLive} className="rounded-md border border-slate-200 px-2.5 py-1 text-[11.5px] font-medium text-blue-600 hover:bg-blue-50">
                Use live values
              </button>
            )}
          </div>
        </div>
        {live && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div data-testid="price-mode" className="w-44">
              <Seg
                label="Price mode"
                value={fz.mode}
                onChange={chooseMode}
                options={[
                  { id: "live", text: "Live" },
                  { id: "frozen", text: "Frozen" },
                ]}
              />
            </div>
            <p data-testid="priced-at" className="text-[13px] font-semibold text-slate-800">
              {pricedAtText(live)}
            </p>
            {fz.mode === "frozen" && feedAhead ? (
              <button
                type="button"
                data-testid="update-live"
                onClick={updateLive}
                className="min-h-[44px] rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white hover:bg-blue-700 md:min-h-0 md:py-1"
              >
                Update to live prices
              </button>
            ) : (
              <span className="text-[11.5px] text-slate-500">
                {fz.mode === "live"
                  ? "Everything re-prices together with each feed update."
                  : "Frozen: prices stay put until you change the trade or update."}
              </span>
            )}
          </div>
        )}
        {live && (
          <p className="mt-2 text-[11px] text-slate-500">
            {live.source === "simulated"
              ? "Upstox isn’t answering, so every number here is generated — treat it as a demonstration, not a market."
              : live.source === "delayed"
                ? delayedWhy
                : "The feed refreshes every 5 seconds while the market is open. In Live mode the whole analysis re-prices with it; in Frozen mode it stays put until you update it."}{" "}
            {live.source !== "simulated" && live.feedAsOf && (
              <>Exchange’s last update: {new Date(live.feedAsOf).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}.</>
            )}
            {feedLost && <b className="ml-1 text-rose-500">The feed stopped answering — these are the last values received.</b>}
          </p>
        )}
      </div>

      {!market || !live ? (
        <div className="h-[320px] animate-pulse rounded-xl bg-slate-50" aria-busy="true">
          {loading ? null : <p className="p-6 text-[12.5px] text-slate-500">Couldn’t load market data.</p>}
        </div>
      ) : (
        <>
          {/* market + costs */}
          <section aria-label="Market" className={card}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label htmlFor="fno-und" className="text-[11px] text-slate-500">Underlying</label>
                <select id="fno-und" value={und} onChange={(e) => changeUnderlying(e.target.value)} className={inputCls + " font-sans"}>
                  {UNDERLYING_IDS.map((u) => <option key={u} value={u}>{UNDERLYINGS[u].name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fno-exp" className="text-[11px] text-slate-500">Expiry</label>
                <select
                  id="fno-exp"
                  value={live.expiry}
                  onChange={(e) => { setExpiry(e.target.value); setOv({ dte: undefined }); }}
                  className={inputCls + " font-sans"}
                >
                  {live.expiries.map((e) => <option key={e} value={e}>{fmtIsoDate(e)}</option>)}
                </select>
              </div>
              <Num id="fno-spot" label={`${name} price`} value={market.spot} onChange={(v) => setOv({ spot: v })} min={0} hint={ov.spot != null ? "typed by you" : "from the feed"} />
              <Num id="fno-dte" label="Days to expiry" value={market.dte} onChange={(v) => setOv({ dte: v })} min={0} hint={ov.dte != null ? "typed by you" : live.source === "delayed" ? "from the feed’s last update to 15:30 IST on expiry day" : "to 15:30 IST on expiry day"} />
              <Num id="fno-iv" label={info.kind === "index" ? "VIX" : "Volatility (ATM IV)"} value={market.iv} onChange={(v) => setOv({ iv: v })} min={0} hint={ov.iv != null ? "typed by you" : info.kind === "index" ? "India VIX" : "at-the-money implied volatility"} />
              <Num id="fno-lot" label="Lot size" value={market.lot} onChange={(v) => setOv({ lot: v })} min={1} hint={ov.lot != null ? "typed by you" : "from the exchange contract list"} />
              <Num id="fno-step" label="Strike gap" value={market.step} onChange={(v) => setOv({ step: v })} min={0} />
              <Num id="fno-brok" label="Brokerage per order (₹)" value={costs.brokerage} onChange={(v) => setCosts((c) => ({ ...c, brokerage: Math.max(0, v) }))} min={0} />
              <div>
                <label htmlFor="fno-slab" className="text-[11px] text-slate-500">Income-tax slab</label>
                <select id="fno-slab" value={String(costs.slab)} onChange={(e) => setCosts((c) => ({ ...c, slab: Number(e.target.value) }))} className={inputCls + " font-sans"}>
                  {[0, 5, 10, 15, 20, 25, 30].map((s) => <option key={s} value={s}>{s}%</option>)}
                </select>
              </div>
              <Num id="fno-r" label="Risk-free rate (%)" value={costs.r} onChange={(v) => setCosts((c) => ({ ...c, r: v }))} hint="What a safe government bond pays a year; used to price options." />
              <Num id="fno-q" label="Dividend yield (%)" value={costs.q} onChange={(v) => setCosts((c) => ({ ...c, q: v }))} hint="Dividends the index pays out in a year, as a share of its price." />
              <div>
                <span className="text-[11px] text-slate-500">If you hold to expiry</span>
                <div className="mt-0.5">
                  <Seg label="Exit style" value={exitStyle} onChange={setExitStyle} options={[{ id: "square", text: "Square off" }, { id: "expire", text: "Hold to expiry" }]} />
                </div>
              </div>
            </div>
            {expiresToday(live.expiry, new Date(live.feedAsOf ?? live.asOf)) && (
              <p role="note" className="mt-3 rounded-lg border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800">
                This expiry is today ({fmtIsoDate(live.expiry)}, 15:30 IST). Prices move very fast on expiry day and almost no time value is left; the next expiry is in the list above.
              </p>
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              Every field is editable — type your broker’s numbers over the feed and the badge turns to Manual.
              {live.pcr != null && <> Put-call ratio (OI) {live.pcr.toFixed(2)}.</>}
            </p>
          </section>

          {/* strategy */}
          <section aria-label="Your trade" className={card}>
            <h2 className="font-display text-[14px] font-semibold text-slate-900">Your trade</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={preset === p.id}
                  onClick={() => { setPreset(p.id); setLegsFor(""); setCmpSide(null); dispatch({ type: "tradeEdit", feed }); setExitSpotRaw(null); }}
                  className={"rounded-full border px-3 py-1 text-[12px] " + (preset === p.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:border-blue-300")}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              {legs.length === 0 && <p className="py-3 text-center text-[12px] text-slate-500">No legs yet. Pick a strategy above or add a leg.</p>}
              {legs.map((L) => {
                const pl = P.find((x) => x.id === L.id);
                const fut = L.type === "FUT";
                const upd = (patch: Partial<LegInput>) => editLegs((ls) => ls.map((x) => (x.id === L.id ? { ...x, ...patch } : x)));
                return (
                  <div key={L.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-[auto_1fr_1fr_1fr_1.2fr_auto]">
                      <Seg label="Action" value={L.side} onChange={(side) => upd({ side })} options={[{ id: "B", text: "Buy", tone: "bg-emerald-500" }, { id: "S", text: "Sell", tone: "bg-rose-500" }]} />
                      <div>
                        <label className="text-[11px] text-slate-500">Type</label>
                        <select
                          value={L.type}
                          onChange={(e) => { const type = e.target.value as LegType; upd({ type, strike: type !== "FUT" && !(L.strike > 0) ? atmStrike(market.spot, market.step) : L.strike, price: null }); }}
                          className={inputCls + " font-sans"}
                        >
                          <option value="CE">Call</option><option value="PE">Put</option><option value="FUT">Future</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500">Strike</label>
                        <input type="number" step="any" disabled={fut} placeholder={fut ? "Not needed" : ""} value={fut ? "" : L.strike} onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) upd({ strike: v }); }} className={inputCls} />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500">Lots</label>
                        <input type="number" min={1} step={1} value={L.lots} onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= 1) upd({ lots: Math.round(v) }); }} className={inputCls} />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500">Entry price in ₹ (optional)</label>
                        <input
                          type="number" step="any" min={0}
                          placeholder={pl ? `${pl.priceSource === "chain" ? "Chain" : "Model"} ${nf(pl.entry, 2)}` : ""}
                          value={L.price ?? ""}
                          onChange={(e) => { const v = parseFloat(e.target.value); upd({ price: isFinite(v) && v > 0 ? v : null }); }}
                          className={inputCls}
                        />
                      </div>
                      <button type="button" aria-label="Remove this leg" onClick={() => editLegs((ls) => ls.filter((x) => x.id !== L.id))} className="h-8 rounded-md px-2 text-[18px] leading-none text-slate-300 hover:text-rose-500">×</button>
                    </div>
                    {pl && (
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        {pl.isOpt
                          ? `Priced from ${pl.priceSource === "chain" ? (pl.quoteBasis === "mid" ? "the middle of the live bid and ask" : "the live chain") : pl.priceSource === "typed" ? "your price" : "the model"} · volatility ${((pl.iv ?? 0) * 100).toFixed(1)}%${pl.ivNote === "implied" ? " (this strike’s own)" : ""} · model value ${nf(pl.model, 2)}${pl.lowConfidence ? ` · low confidence: ${pl.lowConfidence}` : ""}`
                          : "Futures price follows the index"}
                        {pl.priceSource === "typed" && (
                          <button type="button" onClick={() => upd({ price: null })} className="ml-2 text-blue-600 hover:underline">
                            Use {usingChain ? "chain" : "model"} price
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => editLegs((ls) => [...ls, { id: nextId(ls), side: "B", type: "CE", strike: atmStrike(market.spot, market.step), lots: 1, price: null }])}
                className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600"
              >
                + Add a leg
              </button>
            </div>
          </section>

          {ok && st ? (
            <Analysis
              P={P}
              market={market}
              st={st}
              name={name}
              exitSpotRaw={exitSpotRaw}
              setExitSpotRaw={setExitSpotRaw}
              days={days}
              setDays={setDays}
              dIV={dIV}
              setDIV={setDIV}
              resetExit={() => { setExitSpotRaw(null); setDays(0); setDIV(0); }}
            />
          ) : (
            <p className={card + " text-center text-[12.5px] text-slate-500"}>Add at least one leg, and check the price, days to expiry and volatility are above zero, to see the analysis.</p>
          )}

          {ok && comparison && (
            <StrikeCompare
              m={market}
              name={name}
              result={comparison}
              state={cmpState}
              onChange={(next) => { setCmp(next); if (next.dir !== cmpState.dir) setCmpSide(next.dir); }}
              usingChain={usingChain}
              onLoad={(K, lots) => { editLegs(() => [{ id: 1, side: "B", type: cmpState.dir, strike: K, lots, price: null }]); }}
            />
          )}

          <Context iv={market.iv} percentile={manual ? null : live.vixPercentile} vixPrev={live.vixPrevClose} vix={live.vix} ctx={ctx} setCtx={setCtx} />

          <footer className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11.5px] leading-relaxed text-slate-500">
            <p>
              These are model estimates for learning, not advice. Margin isn’t included, and Zestoxx does not place orders — check everything in
              your broker before you trade. Charges use rates verified on <b>{fmtIsoDate(RATES.verifiedOn)}</b> (STT, exchange fees, SEBI fee,
              stamp duty and GST change from time to time). The exchange holiday calendar ({CALENDAR.year}, NSE equity derivatives, including the
              Diwali Muhurat session) was verified on <b>{fmtIsoDate(CALENDAR.verifiedOn)}</b>; for dates outside {CALENDAR.year} only weekday hours are known.
            </p>
          </footer>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ the analysis --- */

function Analysis({
  P, market, st, name, exitSpotRaw, setExitSpotRaw, days, setDays, dIV, setDIV, resetExit,
}: {
  P: ReturnType<typeof prepareLegs>;
  market: Market;
  st: NonNullable<ReturnType<typeof computeStatic>>;
  name: string;
  exitSpotRaw: number | null;
  setExitSpotRaw: (v: number) => void;
  days: number;
  setDays: (v: number) => void;
  dIV: number;
  setDIV: (v: number) => void;
  resetExit: () => void;
}) {
  const m = market;
  const { lo, hi } = chartRange(P, m);
  // The exit starts at the current spot. A marker left outside the chart (the legs or the market changed under it) is
  // dropped rather than pinned to an edge.
  const exitSpot = exitSpotRaw != null && exitSpotRaw >= m.spot * 0.5 && exitSpotRaw <= m.spot * 1.5 ? exitSpotRaw : m.spot;
  const d = m.exitStyle === "expire" ? m.dte : clamp(days, 0, m.dte);
  const sc = useMemo(() => evaluate(P, m, exitSpot, d, dIV, m.exitStyle), [P, m, exitSpot, d, dIV]);
  const gk = useMemo(() => greeksNow(P, m), [P, m]);
  const lines = useMemo(() => explain(P, m, st, sc, gk, name, d), [P, m, st, sc, gk, name, d]);
  const heat = useMemo(() => profitGrid(P, m, dIV), [P, m, dIV]);
  const ex = useMemo(() => computeExtremes(P, m, st), [P, m, st]);

  const be = st.beNet.length ? st.beNet.map((x) => nf(x)).join(" / ") : "None in range";
  const n = gk.net;
  const kind = (k: string) => (k === "warn" ? "border-amber-400" : k === "bad" ? "border-rose-400" : k === "good" ? "border-emerald-400" : "border-slate-200");
  const row = (label: string, v: number, text: string, strong = false) => (
    <tr className={"border-t border-slate-100 " + (strong ? "bg-slate-50 font-semibold" : "")}>
      <td className="px-3 py-1.5 text-[12.5px] text-slate-600">{label}</td>
      <td className={"px-3 py-1.5 text-right font-mono text-[12.5px] " + TONE_CLASS[tone(v)]}>{text}</td>
    </tr>
  );

  return (
    <>
      <section aria-label="Result" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {ex.best.open.length ? <OpenStat k="Best case" kind="best" view={ex.best} cls="text-emerald-600" /> : <Stat k="Best case" v={rs(ex.best.cap)} s="at expiry, after charges" cls="text-emerald-600" />}
        {ex.worst.open.length ? <OpenStat k="Worst case" kind="worst" view={ex.worst} cls="text-rose-500" /> : <Stat k="Worst case" v={rs(ex.worst.cap)} s="at expiry, after charges" cls="text-rose-500" />}
        <Stat k="Breakeven" v={be} s={st.beNet.length ? `${st.beNet.map((x) => pct((x / m.spot - 1) * 100)).join(" / ")} from spot` : ""} />
        <Stat k="Chance of profit" v={`${Math.round(st.pop * 100)}%`} s="model estimate" />
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
        <section aria-label="Profit and loss chart" className={card + " min-w-0"}>
          <h2 className="font-display text-[14px] font-semibold text-slate-900">Profit or loss at different index levels</h2>
          <PayoffChart P={P} m={m} st={st} sc={sc} exitSpot={exitSpot} days={d} dIV={dIV} onPick={setExitSpotRaw} />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="fno-exs" className="text-[11px] text-slate-500">{name} at exit</label>
              <input id="fno-exs" type="range" min={lo} max={hi} step={Math.max(0.05, m.step / 10)} value={clamp(exitSpot, lo, hi)} onChange={(e) => setExitSpotRaw(parseFloat(e.target.value))} className="w-full accent-blue-600" />
              <div className="font-mono text-[11.5px] text-slate-600">{nf(exitSpot, 2)} ({pct((exitSpot / m.spot - 1) * 100)})</div>
            </div>
            <div>
              <label htmlFor="fno-days" className="text-[11px] text-slate-500">Days held</label>
              <input id="fno-days" type="range" min={0} max={m.dte} step={m.dte <= 5 ? 0.25 : 1} disabled={m.exitStyle === "expire"} value={d} onChange={(e) => setDays(parseFloat(e.target.value))} className="w-full accent-blue-600" />
              <div className="font-mono text-[11.5px] text-slate-600">
                {m.exitStyle === "expire" ? "Held to expiry" : d >= m.dte - 1e-9 ? "At expiry" : `${nf(d, d % 1 ? 2 : 0)} of ${nf(m.dte, m.dte % 1 ? 1 : 0)} days`}
              </div>
            </div>
            <div>
              <label htmlFor="fno-div" className="text-[11px] text-slate-500">Volatility change</label>
              <input id="fno-div" type="range" min={-10} max={10} step={0.5} value={dIV} onChange={(e) => setDIV(parseFloat(e.target.value))} className="w-full accent-blue-600" />
              <div className="font-mono text-[11.5px] text-slate-600">{(m.iv + dIV).toFixed(1)} ({dIV >= 0 ? "+" : "−"}{Math.abs(dIV).toFixed(1)})</div>
            </div>
          </div>
          <button type="button" onClick={resetExit} className="mt-2 text-[11.5px] font-medium text-blue-600 hover:underline">Reset exit</button>
        </section>

        <section aria-label="What you keep" className={card + " min-w-0"}>
          <h2 className="font-display text-[14px] font-semibold text-slate-900">What you keep</h2>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-snug text-slate-700">
            <span>
              <b>Exit scenario:</b> {name} at {nf(exitSpot, 2)} ({pct((exitSpot / m.spot - 1) * 100)}), {m.exitStyle === "expire" ? "held to expiry" : d >= m.dte - 1e-9 ? "squared off at expiry" : `squared off after ${nf(d, d % 1 ? 2 : 0)} day${d === 1 ? "" : "s"}`}
              {dIV ? `, volatility ${dIV > 0 ? "up " : "down "}${Math.abs(dIV)} points` : ", volatility unchanged"}.
            </span>
            <button type="button" onClick={resetExit} className="min-h-[44px] text-[12px] font-medium text-blue-600 hover:underline md:min-h-0">Reset exit</button>
          </p>
          <table className="mt-2 w-full">
            <tbody>
              {row("Profit or loss on the trade", sc.gross, rsS(sc.gross))}
              {row(`Brokerage (${sc.orders} order${sc.orders === 1 ? "" : "s"})`, -sc.brokerage, rsS(-sc.brokerage))}
              {row(`STT${sc.sttEx > 0 ? " (includes exercise STT)" : ""}`, -sc.stt, rsS(-sc.stt))}
              {row("Exchange charges", -sc.txn, rsS(-sc.txn))}
              {row("SEBI fee", -sc.sebi, rsS(-sc.sebi, 2))}
              {row("Stamp duty", -sc.stamp, rsS(-sc.stamp))}
              {row("GST on brokerage and fees", -sc.gst, rsS(-sc.gst))}
              {row("Result after charges", sc.pre, rsS(sc.pre), true)}
              {row(`Estimated income tax (${nf(m.slab * 1.04, 1)}%)`, -sc.tax, rsS(-sc.tax))}
              {row("Reaches your pocket", sc.net, rsS(sc.net), true)}
            </tbody>
          </table>
        </section>
      </div>

      <section aria-label="In plain words" className={card}>
        <h2 className="font-display text-[14px] font-semibold text-slate-900">In plain words</h2>
        <ul className="mt-2 space-y-2">
          {lines.map((l, i) => (
            <li key={i} className={"rounded-lg border-l-2 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-700 " + kind(l.kind)} dangerouslySetInnerHTML={{ __html: l.html }} />
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section aria-label="Greeks" className={card + " min-w-0"}>
          <h2 className="font-display text-[14px] font-semibold text-slate-900">How the position behaves</h2>
          <table className="no-sticky-col mt-2 w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-slate-500">
                <th className="py-1 font-medium">Measure</th>
                <th className="py-1 text-right font-medium">Your position</th>
                <th className="hidden py-1 pl-3 font-medium md:table-cell">In plain terms</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Delta", nf(n.delta, 1), TONE_CLASS[tone(n.delta)], `${rsS(n.delta)} for each 1 point the index rises`],
                  ["Gamma", gammaStr(n.gamma), "", `Delta changes by ${gammaStr(Math.abs(n.gamma))} per point. ${n.gamma >= 0 ? "Gains speed up, losses slow down." : "Losses speed up, gains slow down."}`],
                  ["Theta", rsS(n.theta), TONE_CLASS[tone(n.theta)], n.theta < 0 ? "You lose this each day from time passing" : "You earn this each day from time passing"],
                  ["Vega", rsS(n.vega), TONE_CLASS[tone(n.vega)], "For each 1 point rise in volatility"],
                ] as const
              ).map(([name, value, cls, text]) => (
                <tr key={name} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-2">
                    {name}
                    <span className="mt-0.5 block text-[12px] leading-snug text-slate-500 md:hidden">{text}</span>
                  </td>
                  <td className={"whitespace-nowrap py-1.5 text-right font-mono " + cls}>{value}</td>
                  <td className="hidden py-1.5 pl-3 text-slate-500 md:table-cell">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <LegGreeks rows={gk.rows} net={n} />
        </section>

        <section aria-label="Profit grid" className={card + " min-w-0"}>
          <h2 className="font-display text-[14px] font-semibold text-slate-900">Profit or loss by index move and day</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">After charges, before tax.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="no-sticky-col w-full border-collapse text-[12px] md:min-w-[380px]">
              <thead>
                <tr className="text-[11px] text-slate-500">
                  <th className="px-1 py-1 text-left font-medium md:px-2">Move</th>
                  {heat.cols.map((c) => <th key={c} className="px-1 py-1 text-right font-medium md:px-2">{c === 0 ? "Today" : c >= m.dte - 1e-9 ? "Expiry" : `D${nf(c, c % 1 ? 1 : 0)}`}</th>)}
                </tr>
              </thead>
              <tbody>
                {heat.moves.map((mv, ri) => (
                  <tr key={mv} className="border-t border-slate-100">
                    <td className="px-1 py-1 text-[12px] text-slate-600 md:px-2">{mv === 0 ? "0%" : pct(mv, 1)}<span className="block text-[12px] text-slate-500">{nf(m.spot * (1 + mv / 100))}</span></td>
                    {heat.cells[ri].map((v, ci) => {
                      const a = 0.08 + 0.5 * Math.min(1, Math.abs(v) / heat.mx);
                      return <td key={ci} className="px-1 py-1 text-right font-mono md:px-2" style={{ background: v >= 0 ? `rgba(16,185,129,${a.toFixed(2)})` : `rgba(244,63,94,${a.toFixed(2)})` }}>{compact(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- context --- */

function Context({
  iv, percentile, vix, vixPrev, ctx, setCtx,
}: {
  iv: number;
  percentile: number | null;
  vix: number | null;
  vixPrev: number | null;
  ctx: { pe: number; peAvg: number; bond: number };
  setCtx: (c: { pe: number; peAvg: number; bond: number }) => void;
}) {
  const band = iv < 12 ? "very low" : iv < 15 ? "low" : iv < 20 ? "normal" : iv < 25 ? "elevated" : "high";
  const txt = {
    "very low": "Options are cheap, so buyers pay little for time, but moves are usually small too.",
    low: "Premiums are on the lighter side. Sudden jumps in VIX can lift option prices quickly.",
    normal: "Premiums are in a typical range. Buyers need a real move to beat time decay; sellers collect a fair premium.",
    elevated: "Options are expensive. Buyers face “IV crush” if the VIX falls back; sellers earn more but carry bigger swings.",
    high: "Fear is priced in. Premiums are rich, moves are large, and a falling VIX can hurt buyers badly even when they are right on direction.",
  }[band];
  const { pe, peAvg, bond } = ctx;
  const ey = pe > 0 ? 100 / pe : 0;
  const spread = ey - bond;
  const vs = pe > 0 && peAvg > 0 ? (pe / peAvg - 1) * 100 : 0;
  const lbl = vs > 10 ? "richer than its long-run average" : vs < -10 ? "cheaper than its long-run average" : "close to its long-run average";
  const field = "mt-0.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[13px] outline-none focus:border-blue-400";
  const setNum = (k: "pe" | "peAvg" | "bond") => (e: React.ChangeEvent<HTMLInputElement>) => { const v = parseFloat(e.target.value); if (isFinite(v)) setCtx({ ...ctx, [k]: v }); };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <section aria-label="Volatility context" className={card}>
        <h2 className="font-display text-[14px] font-semibold text-slate-900">Is volatility high or low?</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
          <b>Volatility {iv.toFixed(2)} is {band}.</b> {txt}
        </p>
        {vix != null && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
            India VIX is <b>{vix.toFixed(2)}</b>
            {vixPrev != null && <> ({vix >= vixPrev ? "up" : "down"} from {vixPrev.toFixed(2)} at the last close)</>}
            {percentile != null && <>, higher than about <b>{Math.round(percentile)}%</b> of the past year’s closes</>}.
          </p>
        )}
      </section>
      <section aria-label="Valuation context" className={card}>
        <h2 className="font-display text-[14px] font-semibold text-slate-900">Is the market cheap or expensive?</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div><label className="text-[11px] text-slate-500" htmlFor="ctx-pe">Index PE</label><input id="ctx-pe" type="number" step="any" value={ctx.pe} onChange={setNum("pe")} className={field} /></div>
          <div><label className="text-[11px] text-slate-500" htmlFor="ctx-avg">Long-run avg PE</label><input id="ctx-avg" type="number" step="any" value={ctx.peAvg} onChange={setNum("peAvg")} className={field} /></div>
          <div><label className="text-[11px] text-slate-500" htmlFor="ctx-bond">Bond yield %</label><input id="ctx-bond" type="number" step="any" value={ctx.bond} onChange={setNum("bond")} className={field} /></div>
        </div>
        {pe > 0 && peAvg > 0 && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-600">
            A PE of <b>{pe.toFixed(1)}</b> is <b>{Math.abs(vs).toFixed(0)}% {vs >= 0 ? "above" : "below"}</b> the long-run level, so it looks <b>{lbl}</b>. Earnings yield is{" "}
            <b>{ey.toFixed(2)}%</b> against a {bond.toFixed(2)}% bond, a gap of <b className={spread >= 0 ? "text-emerald-600" : "text-rose-500"}>{spread >= 0 ? "+" : "−"}{Math.abs(spread).toFixed(2)} points</b>.
            Valuation moves over months and years, so it says little about a weekly expiry.
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">Index PE isn’t available from Upstox — enter the current figure yourself (NSE publishes it daily).</p>
      </section>
    </div>
  );
}
