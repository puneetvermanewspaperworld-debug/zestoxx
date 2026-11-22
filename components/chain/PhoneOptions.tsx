"use client";

import React, { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import DataBadge from "@/components/DataBadge";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { useAction } from "@/components/action/useAction";
import { useMarketStatus } from "@/lib/useMarketStatus";
import { useOptionChain } from "@/lib/useOptionChain";
import { useScreenMode } from "@/lib/useScreenMode";
import { chainStats, type OptionChain } from "@/lib/options";
import { COL_META, DEFAULT_COLS, TAB_COLS, availableCols, daysLabel, daysToExpiry, hasGreeks, shownCols, type ChainTab, type ChangeMode, type ColId } from "@/lib/chain-view";
import { fmtIsoDate, fmtOi, istDateString } from "@/lib/helpers";
import { unavailableNote } from "@/lib/closed-notes";
import { SYMBOLS } from "@/lib/symbols";
import PhoneChainTable, { type ChainTableHandle } from "./PhoneChainTable";

interface Prefs {
  tab: ChainTab;
  cols: Partial<Record<ChainTab, ColId[]>>;
  mode: ChangeMode;
  /** the summary strip: open the first time, then as it was left */
  summaryOpen: boolean;
}
const PREFS_KEY = "zx-chain-prefs";
const DEFAULT_PREFS: Prefs = { tab: "oi", cols: {}, mode: "abs", summaryOpen: true };

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    if (!p) return DEFAULT_PREFS;
    const known = new Set<string>([...TAB_COLS.oi, ...TAB_COLS.greeks]);
    const clean = (a: unknown): ColId[] | undefined => (Array.isArray(a) ? (a.filter((c) => typeof c === "string" && known.has(c)) as ColId[]) : undefined);
    return { tab: p.tab === "greeks" ? "greeks" : "oi", mode: p.mode === "pct" ? "pct" : "abs", summaryOpen: p.summaryOpen !== false, cols: { oi: clean(p.cols?.oi), greeks: clean(p.cols?.greeks) } };
  } catch {
    return DEFAULT_PREFS;
  }
}

const chip = "flex h-[var(--chip-h)] shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[13px] font-medium ";
const chipOn = "border-blue-600 bg-blue-600 text-white";
const chipOff = "border-slate-200 bg-white text-slate-600";
/** the buttons in the chain's header: squarer than the chips above, so the two kinds are not confused */
const tool = "flex h-[var(--chip-h)] shrink-0 items-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 ";

/**
 * The option chain on a phone, as one screen that does not scroll as a page. At the top, the underlying and the expiry. Then the chain, as a card:
 * a header with the OI / Greeks switch and the column, change and spot controls, a summary strip (PCR, Max Pain, ATM IV and India VIX, which can be
 * folded away), a folded Levels row, and the table, which takes the rest of the screen and scrolls inside itself. Tapping a Call or Put cell opens
 * the Buy/Sell screen for that contract. Sideways the controls go in a column of their own and the table takes the full height beside them.
 */
export default function PhoneOptions() {
  const { selected, setSelected, price, sym, prevCloseFor, hasFeedQuote, chgFor } = useZestoxx();
  const { openAction } = useAction();
  const open = useMarketStatus()?.open ?? null;
  const landscape = useScreenMode() === "landscape";
  const isCrypto = sym.type === "crypto";
  const underlyings = useMemo(() => {
    const ids = SYMBOLS.filter((s) => s.type !== "crypto").map((s) => s.id);
    return !isCrypto && !ids.includes(selected) ? [selected, ...ids] : ids;
  }, [selected, isCrypto]);

  // each underlying has its own expiries, so the choice is kept per underlying; null is the nearest
  const [expiryFor, setExpiryFor] = useState<Record<string, string>>({});
  const { chain } = useOptionChain(selected, expiryFor[selected] ?? null, price, { enabled: !isCrypto });

  // this screen only mounts in the browser (the server renders the wide layout), so this device's choice can be read straight away
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const save = (next: Prefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* private window: the choice lasts until the page is closed */
    }
  };

  const [picking, setPicking] = useState(false);
  const [levels, setLevels] = useState(false);
  const table = useRef<ChainTableHandle | null>(null);

  const greeks = chain ? hasGreeks(chain) : false;
  const tab: ChainTab = prefs.tab === "greeks" && greeks ? "greeks" : "oi";
  const have = useMemo(() => (chain ? availableCols(chain.rows) : new Set<ColId>()), [chain]);
  const cols = shownCols(tab, prefs.cols[tab], have);
  const stats = useMemo(() => (chain ? chainStats(chain.rows, chain.spot) : null), [chain]);

  const pct = hasFeedQuote(selected) ? chgFor(selected) : null;
  const change = price > 0 && pct != null ? price - prevCloseFor(selected) : null;

  if (isCrypto) {
    return (
      <div data-testid="phone-options" className="px-2 py-16 text-center text-[13px] text-slate-500">
        Options chain isn&apos;t available for crypto pairs on Zestoxx yet.
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setSelected("NIFTY50")} className={chip + chipOn}>
            Open NIFTY50
          </button>
        </div>
      </div>
    );
  }

  const toggleCol = (c: ColId) => {
    const now = new Set(shownCols(tab, prefs.cols[tab], have));
    if (now.has(c)) now.delete(c);
    else now.add(c);
    // never an empty table side: the default comes back if everything is switched off
    const next = TAB_COLS[tab].filter((x) => now.has(x));
    save({ ...prefs, cols: { ...prefs.cols, [tab]: next.length ? next : DEFAULT_COLS[tab] } });
  };

  const closedNote = chain && chain.source === "live" && open === false ? "Market closed. Prices, open interest and volume are from the last session." : null;
  const atmLegs = chain && stats ? chain.rows.find((r) => r.strike === stats.atmStrike) : null;
  const staleNote = chain && chain.source === "live" && open === true && atmLegs && atmLegs.call.volume === 0 && atmLegs.put.volume === 0 ? "No trades yet at the at-the-money strike, so these prices may be old." : null;
  const note = chain?.source === "simulated" ? "Simulated chain: the live option feed is not available, so every figure here is generated." : (closedNote ?? staleNote);

  const pickers = (
    <div className="shrink-0 space-y-1.5 px-3 pb-1.5">
      <div className="flex items-center gap-1.5">
        <div role="tablist" aria-label="Underlying" data-testid="chain-underlying" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {underlyings.map((id) => (
            <button key={id} type="button" role="tab" data-compact aria-selected={selected === id} data-testid={`chain-sym-${id}`} onClick={() => setSelected(id)} className={chip + (selected === id ? chipOn : chipOff)}>
              {id}
            </button>
          ))}
        </div>
        {chain && <DataBadge source={chain.source === "live" ? "live" : "sim"} className="shrink-0" />}
      </div>
      <div className="flex items-center gap-1.5">
      <div role="tablist" aria-label="Expiry" data-testid="chain-expiries" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {chain ? (
          chain.expiries.map((e) => (
            <button key={e} type="button" role="tab" data-compact aria-selected={chain.expiry === e} data-testid={`chain-expiry-${e}`} onClick={() => setExpiryFor((m) => ({ ...m, [selected]: e }))} className={chip + (chain.expiry === e ? chipOn : chipOff)}>
              {fmtIsoDate(e, false)}
              <span className={"ml-1.5 font-mono text-[11px] " + (chain.expiry === e ? "text-white/85" : "text-slate-500")}>{daysLabel(daysToExpiry(e, istDateString()))}</span>
            </button>
          ))
        ) : (
          <div className="h-[var(--chip-h)] w-40 animate-pulse rounded-full bg-slate-100" aria-busy="true" />
        )}
      </div>
      {chain && chain.expiry === istDateString() && (
        <span data-testid="chain-expiry-today" className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          Expiry today
        </span>
      )}
      </div>
    </div>
  );

  // the chain card's header: the two views as a segmented control, then the controls
  const header = (
    <div className={"relative z-40 flex shrink-0 items-center gap-1.5 border-b border-slate-200 px-2 py-1.5 " + (landscape ? "flex-wrap" : "")}>
      <div role="radiogroup" aria-label="Chain view" className="flex rounded-lg bg-slate-100 p-0.5">
        {(
          [
            ["oi", "OI"],
            ...(greeks ? [["greeks", "Greeks"]] : []),
          ] as [ChainTab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" data-compact aria-checked={tab === id} data-testid={`chain-view-${id}`} onClick={() => save({ ...prefs, tab: id })} className={"flex h-[calc(var(--chip-h)-4px)] items-center rounded-md px-3 text-[13px] font-medium " + (tab === id ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}>
            {label}
          </button>
        ))}
      </div>
      <span className="flex-1" />
      <button type="button" data-compact aria-expanded={picking} aria-haspopup="true" data-testid="chain-columns" onClick={() => setPicking((v) => !v)} className={tool}>
        Columns
      </button>
      <button type="button" data-compact data-testid="chain-change" aria-label={prefs.mode === "abs" ? "Changes are shown as amounts: show percentages" : "Changes are shown as percentages: show amounts"} onClick={() => save({ ...prefs, mode: prefs.mode === "abs" ? "pct" : "abs" })} className={tool}>
        Chg {prefs.mode === "abs" ? "₹" : "%"}
      </button>
      <button type="button" data-compact data-testid="chain-spot-jump" aria-label="Jump to the live spot" onClick={() => table.current?.jumpToSpot()} className={tool + "border-blue-200 text-blue-700"}>
        Spot
      </button>
      {picking && (
        <div role="group" aria-label="Columns to show" data-testid="chain-column-menu" className="absolute right-2 top-full mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {TAB_COLS[tab].filter((c) => have.has(c)).map((c) => (
            <button key={c} type="button" aria-pressed={cols.includes(c)} data-testid={`chain-col-${c}`} onClick={() => toggleCol(c)} className={"flex w-full items-center justify-between rounded-lg px-3 text-left text-[13px] " + (cols.includes(c) ? "font-semibold text-blue-700" : "text-slate-700")}>
              {COL_META[c].label}
              <span aria-hidden>{cols.includes(c) ? "✓" : ""}</span>
            </button>
          ))}
          <p className="px-3 pb-1 pt-0.5 text-[11px] text-slate-500">Only what this chain really carries is listed.</p>
        </div>
      )}
    </div>
  );

  const status = note ? (
    <p data-testid="chain-note" role="status" className={"mx-2 my-1 shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] " + (chain?.source === "simulated" ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-600")}>
      {note}
    </p>
  ) : null;

  // two folding sections in one row: the summary (PCR, Max Pain, ATM IV, India VIX) and the levels (support and resistance)
  const foldRow =
    chain && stats ? (
      <div data-testid="chain-folds" className="shrink-0 border-b border-slate-100">
        <div className="flex">
          <button type="button" data-compact aria-expanded={prefs.summaryOpen} data-testid="chain-summary-toggle" onClick={() => save({ ...prefs, summaryOpen: !prefs.summaryOpen })} className="flex h-[var(--control-row)] flex-1 items-center justify-between px-3 text-[12px] font-medium text-slate-600">
            Summary
            {prefs.summaryOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
          <button type="button" data-compact aria-expanded={levels} data-testid="chain-levels-toggle" onClick={() => setLevels((v) => !v)} className="flex h-[var(--control-row)] flex-1 items-center justify-between border-l border-slate-100 px-3 text-[12px] font-medium text-slate-600">
            Levels
            {levels ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
        </div>
        {prefs.summaryOpen && <Summary chain={chain} stats={stats} open={open} />}
        {levels && (
          <div data-testid="chain-levels" className="grid grid-cols-2 gap-2 px-2 pb-2 text-[12px]">
            <Level title="Resistance" sub="2nd highest call OI" level={stats.topCalls[1]} top={stats.topCalls[0]} tone="text-indigo-700" />
            <Level title="Support" sub="2nd highest put OI" level={stats.topPuts[1]} top={stats.topPuts[0]} tone="text-amber-700" />
          </div>
        )}
      </div>
    ) : null;

  const body = chain ? (
    <PhoneChainTable chain={chain} atm={stats?.atmStrike} spot={price > 0 ? price : chain.spot} change={change} pct={pct} cols={cols} mode={prefs.mode} tab={tab} handle={table} onPick={(strike, type) => openAction({ kind: "option", underlying: chain.underlying, expiry: chain.expiry, strike, type, side: "buy" })} />
  ) : (
    <div data-testid="chain-loading" className="min-h-0 flex-1 animate-pulse border-t border-slate-200 bg-slate-50" aria-busy="true" />
  );

  const card = "mx-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white";

  if (landscape) {
    // sideways: the controls in a column at the left, the chain beside it with the whole height
    return (
      <div data-testid="phone-options" className="-mx-3 flex min-h-0 flex-1 gap-0">
        <div className="flex w-[300px] shrink-0 flex-col overflow-y-auto pb-1">
          {pickers}
          <div className="mx-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {status}
            {foldRow}
          </div>
        </div>
        <div className={card + " mr-3 ml-0"}>
          {header}
          {body}
        </div>
      </div>
    );
  }
  return (
    <div data-testid="phone-options" className="-mx-3 flex min-h-0 flex-1 flex-col">
      {pickers}
      <div className={card + " mb-1"}>
        {header}
        {status}
        {foldRow}
        {body}
      </div>
    </div>
  );
}

function Level({ title, sub, level, top, tone }: { title: string; sub: string; level?: { strike: number; oi: number }; top?: { strike: number; oi: number }; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-2.5 py-1.5">
      <div className={"text-[11px] font-semibold uppercase tracking-wide " + tone}>{title}</div>
      <div className="font-mono text-[14px] font-semibold text-slate-900">{level ? level.strike : "--"}</div>
      <div className="text-[11px] text-slate-500">{level && top ? `${sub}: ${fmtOi(level.oi)} · top ${top.strike}` : sub}</div>
    </div>
  );
}

/**
 * PCR, Max Pain, ATM IV and India VIX, all worked out from this chain or sent with it, in a strip at the top of the chain that folds away. IV
 * percentile is not here: the app keeps no history of IV to rank it against.
 */
function Summary({ chain, stats, open }: { chain: OptionChain; stats: NonNullable<ReturnType<typeof chainStats>>; open: boolean | null }) {
  const items: { id: string; label: string; value: string; note?: string | null }[] = [
    { id: "pcr", label: "PCR", value: stats.pcr != null ? stats.pcr.toFixed(2) : "--", note: unavailableNote(open, stats.pcr) },
    { id: "maxpain", label: "Max Pain", value: stats.maxPain != null ? String(stats.maxPain) : "--", note: unavailableNote(open, stats.maxPain) },
    { id: "atmiv", label: "ATM IV", value: stats.atmIv != null ? stats.atmIv.toFixed(2) : "--", note: unavailableNote(open, stats.atmIv) },
    { id: "vix", label: "India VIX", value: chain.vix != null ? chain.vix.toFixed(2) : "--", note: chain.source === "simulated" ? "simulated" : unavailableNote(open, chain.vix) },
  ];
  return (
    <div data-testid="chain-summary" className="px-2">
      <div data-testid="chain-summary-stats" className="grid grid-cols-4 gap-1.5 pb-2">
        {items.map((i) => (
          <div key={i.id} title={i.note ?? undefined} className="rounded-lg bg-slate-50 px-1.5 py-1 text-center">
            <div className="text-[11px] text-slate-500">{i.label}</div>
            <div data-testid={`chain-stat-${i.id}`} className="font-mono text-[14px] font-semibold text-slate-900">
              {i.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
