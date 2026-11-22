"use client";

import React, { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { useMarketStatus } from "@/lib/useMarketStatus";
import { useScreenMode } from "@/lib/useScreenMode";
import { BUILDUP_META, chainStats, type OptionChain } from "@/lib/options";
import { TOP_ORDER, anyBuildup, buildupMarkClass, buildupNote, topPerCategory, type TopPerCategory } from "@/lib/chain-buildup";
import { COL_META, DEFAULT_COLS, TAB_COLS, availableCols, hasGreeks, oiShare, shownCols, signed, windowRows, type ChainTab, type ChangeMode, type ColId } from "@/lib/chain-view";
import { fmtOi, fmtOiChange } from "@/lib/helpers";
import { unavailableNote } from "@/lib/closed-notes";
import PhoneChainTable, { type ChainTableHandle } from "./PhoneChainTable";

interface Prefs {
  tab: ChainTab;
  cols: Partial<Record<ChainTab, ColId[]>>;
  mode: ChangeMode;
  /** the two folded lines: closed until opened, then as they were left */
  summaryOpen: boolean;
  levelsOpen: boolean;
}
const PREFS_KEY = "zx-chain-prefs";
const DEFAULT_PREFS: Prefs = { tab: "oi", cols: {}, mode: "abs", summaryOpen: false, levelsOpen: false };

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    if (!p) return DEFAULT_PREFS;
    const known = new Set<string>([...TAB_COLS.oi, ...TAB_COLS.greeks]);
    const clean = (a: unknown): ColId[] | undefined => (Array.isArray(a) ? (a.filter((c) => typeof c === "string" && known.has(c)) as ColId[]) : undefined);
    return { tab: p.tab === "greeks" ? "greeks" : p.tab === "buildup" ? "buildup" : "oi", mode: p.mode === "pct" ? "pct" : "abs", summaryOpen: p.summaryOpen === true, levelsOpen: p.levelsOpen === true, cols: { oi: clean(p.cols?.oi), greeks: clean(p.cols?.greeks) } };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** the text buttons at the right of the controls row: no boxes, a 36px row whose tap area is still 44px */
const tool = "flex h-9 shrink-0 items-center whitespace-nowrap px-2 text-[13px] font-medium text-slate-700 ";

/**
 * The chain itself, for a phone: a controls row (the OI / Greeks switch, Columns, the kind of change, and Spot), the Summary and Levels lines,
 * which are one line each until tapped, and the table, which takes the rest of the height. It is the same on the Options screen and in the index
 * chart's Option Chain tab. A tap on a Call or Put cell is `onPick`.
 */
export default function ChainView({ chain, price, change, pct, onPick, top }: { /** the screen's header row; sideways the controls share its line */ top?: React.ReactNode; chain: OptionChain | null; price: number; change: number | null; pct: number | null; onPick: (strike: number, type: "CE" | "PE") => void }) {
  const open = useMarketStatus()?.open ?? null;
  // sideways there is little height: Summary and Levels share one line
  const landscape = useScreenMode() === "landscape";
  // this view only mounts in the browser (the server renders the wide layout), so this device's choice can be read straight away
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
  const table = useRef<ChainTableHandle | null>(null);

  const greeks = chain ? hasGreeks(chain) : false;
  const tab: ChainTab = prefs.tab === "greeks" && greeks ? "greeks" : prefs.tab === "buildup" ? "buildup" : "oi";
  const have = useMemo(() => (chain ? availableCols(chain.rows) : new Set<ColId>()), [chain]);
  const cols = shownCols(tab, prefs.cols[tab], have);
  const stats = useMemo(() => (chain ? chainStats(chain.rows, chain.spot) : null), [chain]);
  // the buildup of the strikes the table shows: the tags, and the largest OI change per category on each side
  const shownRows = useMemo(() => (chain ? windowRows(chain.rows, stats?.atmStrike) : []), [chain, stats]);
  const tops = useMemo(() => ({ call: topPerCategory(shownRows, "call"), put: topPerCategory(shownRows, "put") }), [shownRows]);
  const buildupAny = useMemo(() => anyBuildup(shownRows), [shownRows]);

  const toggleCol = (c: ColId) => {
    const now = new Set(shownCols(tab, prefs.cols[tab], have));
    if (now.has(c)) now.delete(c);
    else now.add(c);
    // never an empty table side: the default comes back if everything is switched off
    const next = TAB_COLS[tab].filter((x) => now.has(x));
    save({ ...prefs, cols: { ...prefs.cols, [tab]: next.length ? next : DEFAULT_COLS[tab] } });
  };

  // one small tag says where the numbers come from, and the longer reason is its title
  const atmLegs = chain && stats ? chain.rows.find((r) => r.strike === stats.atmStrike) : null;
  const tag: { text: string; why: string; tone: "live" | "quiet" | "warn" } | null = !chain
    ? null
    : chain.source === "simulated"
      ? { text: "Simulated", why: "Simulated chain: the live option feed is not available, so every figure here is generated.", tone: "warn" }
      : open === false
        ? { text: "Market closed", why: "Market closed. Prices, open interest and volume are from the last session.", tone: "quiet" }
        : open === true && atmLegs && atmLegs.call.volume === 0 && atmLegs.put.volume === 0
          ? { text: "Prices may be old", why: "No trades yet at the at-the-money strike, so these prices may be old.", tone: "warn" }
          : open === true
            ? { text: "Live", why: "Live option prices from the exchange feed.", tone: "live" }
            : null;

  const oneLine = stats && chain ? `PCR ${stats.pcr != null ? stats.pcr.toFixed(2) : "--"} · Pain ${stats.maxPain ?? "--"} · IV ${stats.atmIv != null ? stats.atmIv.toFixed(2) : "--"} · VIX ${chain.vix != null ? chain.vix.toFixed(2) : "--"}` : "";
  const levelsLine = stats ? `Support ${stats.topPuts[1]?.strike ?? "--"} · Resistance ${stats.topCalls[1]?.strike ?? "--"}` : "";
  const split = chain ? oiShare(chain.rows) : null;
  const splitText = split ? `Open interest: calls ${Math.round(split.call * 100)}%, puts ${Math.round(split.put * 100)}%` : "";
  const fold = "relative flex h-10 items-center gap-3 text-left";
  const chev = (open: boolean) => (open ? <ChevronUp size={16} aria-hidden className="shrink-0 text-chain-quiet" /> : <ChevronDown size={16} aria-hidden className="shrink-0 text-chain-quiet" />);
  // the small tag for where the numbers come from: in the line above the table, between "Calls" and "Puts" (sideways, with no such line, it is at the end of Levels)
  const tagEl = tag && (
    <span data-testid="chain-tag" title={tag.why} aria-label={tag.why} className={"flex shrink-0 items-center gap-1.5 text-[11px] font-normal leading-[16px] " + (tag.tone === "live" ? "text-chain-up" : tag.tone === "warn" ? "text-amber-700" : "text-chain-quiet")}>
      <i aria-hidden className="block h-1.5 w-1.5 rounded-full bg-current" />
      {tag.text}
    </span>
  );

  return (
    <div data-testid="chain-view" className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      {/* the header row, and the controls (sideways: on the header's own line) */}
      <div className={landscape ? "flex shrink-0 items-center border-b border-slate-200" : "contents"}>
      <div className={landscape ? "min-w-0 flex-1" : "contents"}>{top}</div>
      <div data-testid="chain-controls" className={"relative z-40 flex shrink-0 items-center justify-between gap-2 px-3 " + (landscape ? "" : "mt-3")}>
        <div role="radiogroup" aria-label="Chain view" className="flex gap-5">
          {(
            [
              ["oi", "OI"],
              ...(greeks ? [["greeks", "Greeks"]] : []),
              ["buildup", "Buildup"],
            ] as [ChainTab, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" data-compact aria-checked={tab === id} data-testid={`chain-view-${id}`} onClick={() => save({ ...prefs, tab: id })} className={"relative flex h-10 items-center text-[14px] " + (tab === id ? "font-bold text-slate-900" : "font-medium text-chain-quiet")}>
              {label}
              {tab === id && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600" />}
            </button>
          ))}
        </div>
        <div className="-mr-2 flex items-center">
          {tab !== "buildup" && (
            <>
              <button type="button" data-compact aria-expanded={picking} aria-haspopup="true" data-testid="chain-columns" onClick={() => setPicking((v) => !v)} className={tool}>
                Columns
              </button>
              <button type="button" data-compact data-testid="chain-change" aria-label={prefs.mode === "abs" ? "Changes are shown as amounts: show percentages" : "Changes are shown as percentages: show amounts"} onClick={() => save({ ...prefs, mode: prefs.mode === "abs" ? "pct" : "abs" })} className={tool}>
                Chg <span className="ml-1 font-bold text-blue-700">{prefs.mode === "abs" ? "₹" : "%"}</span>
              </button>
            </>
          )}
          <button type="button" data-compact data-testid="chain-spot-jump" aria-label="Jump to the live spot" onClick={() => table.current?.jumpToSpot()} className={tool + "text-blue-700"}>
            Spot
          </button>
        </div>
        {picking && (
          <div role="group" aria-label="Columns to show" data-testid="chain-column-menu" className="absolute right-3 top-full mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
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
      </div>
      {!landscape && <div aria-hidden className="mx-3 border-b border-slate-200" />}

      {tab === "buildup" && chain && (
        <div data-testid="chain-buildup-help" className="shrink-0 px-3 pt-2.5">
          <div data-testid="chain-legend" className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] leading-[16px] text-chain-quiet">
            {TOP_ORDER.map((k) => (
              <span key={k} data-testid={`legend-${BUILDUP_META[k].code}`} title={BUILDUP_META[k].meaning} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={"text-[12px] " + buildupMarkClass(k)}>{BUILDUP_META[k].code}</span>
                {BUILDUP_META[k].label}
              </span>
            ))}
          </div>
          <p data-testid="chain-legend-key" className="mt-0.5 text-[11px] leading-[16px] text-chain-quiet">
            Green: price up · Red: price down · Bold: OI up
          </p>
          <p data-testid="chain-buildup-note" className="text-[11px] leading-[16px] text-chain-quiet">
            {buildupAny ? buildupNote(chain.source, open) : "No strike has both a change in open interest and a change in premium to tag yet."}
          </p>
        </div>
      )}

      {/* Summary and Levels: one line each, opened by a tap */}
      {chain && stats && (
        <div data-testid="chain-folds" className={"flex shrink-0 flex-wrap px-3 " + (landscape ? "" : "mt-1")}>
          <button type="button" data-compact aria-expanded={prefs.summaryOpen} data-testid="chain-summary-toggle" onClick={() => save({ ...prefs, summaryOpen: !prefs.summaryOpen })} className={fold + (landscape ? " order-1 w-1/2 pr-3" : " order-1 w-full")}>
            <span className="shrink-0 text-[13px] font-bold text-slate-900">Summary</span>
            <span data-testid="chain-summary-line" title="PCR, Max Pain, ATM IV and India VIX" className="min-w-0 flex-1 truncate text-[11px] text-chain-quiet">
              {oneLine}
            </span>
            {chev(prefs.summaryOpen)}
            {/* the thin bar: calls' share of the open interest against puts' (the same totals as the PCR) */}
            {split && (
              <span role="img" aria-label={splitText} title={splitText} data-testid="chain-oi-split" className="absolute inset-x-0 bottom-0 flex h-[3px] overflow-hidden rounded-full bg-slate-200">
                <i className="block h-full bg-blue-600/60" style={{ width: `${(split.put * 100).toFixed(1)}%` }} />
              </span>
            )}
          </button>
          {prefs.summaryOpen && (
            <div className={"max-h-[48dvh] w-full overflow-y-auto " + (landscape ? "order-3" : "order-2")}>
              <Summary chain={chain} stats={stats} open={open} splitText={splitText} />
              <TopStrikes tops={tops} note={buildupAny ? buildupNote(chain.source, open) : "No strike has both a change in open interest and a change in premium to tag yet."} onGo={(strike) => table.current?.goToStrike(strike)} />
            </div>
          )}
          <div className={"flex items-center " + (landscape ? "order-2 w-1/2 border-l border-slate-200 pl-3" : "order-3 w-full")}>
            <button type="button" data-compact aria-expanded={prefs.levelsOpen} data-testid="chain-levels-toggle" onClick={() => save({ ...prefs, levelsOpen: !prefs.levelsOpen })} className={fold + " min-w-0 flex-1"}>
              <span className="shrink-0 text-[13px] font-bold text-slate-900">Levels</span>
              <span data-testid="chain-levels-line" className="min-w-0 flex-1 truncate text-[11px] text-chain-quiet">
                {levelsLine}
              </span>
              {chev(prefs.levelsOpen)}
            </button>
            {landscape && tagEl && <span className="ml-3 shrink-0">{tagEl}</span>}
          </div>
          {prefs.levelsOpen && (
            <div data-testid="chain-levels" className="order-4 grid w-full grid-cols-2 gap-6 pb-2 pt-1">
              <Level title="Resistance" sub="2nd highest call OI" level={stats.topCalls[1]} top={stats.topCalls[0]} />
              <Level title="Support" sub="2nd highest put OI" level={stats.topPuts[1]} top={stats.topPuts[0]} />
            </div>
          )}
        </div>
      )}

      {chain ? <PhoneChainTable chain={chain} atm={stats?.atmStrike} spot={price > 0 ? price : chain.spot} change={change} pct={pct} cols={cols} mode={prefs.mode} tab={tab} handle={table} onPick={onPick} sides={!landscape} badge={tagEl} /> : <div data-testid="chain-loading" className="min-h-0 flex-1 animate-pulse bg-slate-50" aria-busy="true" />}
    </div>
  );
}

function Level({ title, sub, level, top }: { title: string; sub: string; level?: { strike: number; oi: number }; top?: { strike: number; oi: number } }) {
  return (
    <div>
      <div className="text-[11px] text-chain-quiet">{title}</div>
      <div className="text-[14px] font-medium text-slate-900">{level ? level.strike : "--"}</div>
      <div className="text-[11px] text-chain-quiet">{level && top ? `${sub}: ${fmtOi(level.oi)} · top ${top.strike}` : sub}</div>
    </div>
  );
}

/** PCR, Max Pain, ATM IV and India VIX, worked out from this chain or sent with it. IV percentile is not here: the app keeps no history of IV to rank it against. */
function Summary({ chain, stats, open, splitText }: { chain: OptionChain; stats: NonNullable<ReturnType<typeof chainStats>>; open: boolean | null; splitText: string }) {
  const items: { id: string; label: string; value: string; note?: string | null }[] = [
    { id: "pcr", label: "PCR", value: stats.pcr != null ? stats.pcr.toFixed(2) : "--", note: unavailableNote(open, stats.pcr) },
    { id: "maxpain", label: "Max Pain", value: stats.maxPain != null ? String(stats.maxPain) : "--", note: unavailableNote(open, stats.maxPain) },
    { id: "atmiv", label: "ATM IV", value: stats.atmIv != null ? stats.atmIv.toFixed(2) : "--", note: unavailableNote(open, stats.atmIv) },
    { id: "vix", label: "India VIX", value: chain.vix != null ? chain.vix.toFixed(2) : "--", note: chain.source === "simulated" ? "simulated" : unavailableNote(open, chain.vix) },
  ];
  return (
    <div data-testid="chain-summary" className="pb-2 pt-1">
      <div data-testid="chain-summary-stats" className="grid grid-cols-4 gap-2">
        {items.map((i) => (
          <div key={i.id} title={i.note ?? undefined}>
            <div className="text-[11px] text-chain-quiet">{i.label}</div>
            <div data-testid={`chain-stat-${i.id}`} className="text-[14px] font-medium text-slate-900">
              {i.value}
            </div>
          </div>
        ))}
      </div>
      {splitText && (
        <p data-testid="chain-split-text" className="mt-1.5 text-[11px] text-chain-quiet">
          {splitText} (the bar under the Summary line)
        </p>
      )}
    </div>
  );
}

/**
 * For the calls and for the puts, the strike with the largest change in open interest in each of the four buildup categories, as a table of
 * category against Calls and Puts. "Largest" is by size, up or down, among the strikes the table shows; a tie goes to the lower strike. Tapping a
 * strike finds it in the table. The one line that says what it is sits behind the info icon.
 */
function TopStrikes({ tops, note, onGo }: { tops: { call: TopPerCategory; put: TopPerCategory }; note: string; onGo: (strike: number) => void }) {
  const [info, setInfo] = useState(false);
  const cell = (t: TopPerCategory, k: (typeof TOP_ORDER)[number], type: "CE" | "PE") => {
    const e = t[k];
    const meta = BUILDUP_META[k];
    return (
      <button key={type} type="button" data-compact disabled={!e} data-testid={`top-${type}-${meta.code}`} onClick={() => e && onGo(e.strike)} aria-label={e ? `${meta.label}, ${type === "CE" ? "call" : "put"} strike ${e.strike}: OI change ${fmtOiChange(e.oiChange)}, price ${signed(e.priceChangePct, 1)} per cent. Show it in the table` : `${meta.label}, ${type === "CE" ? "call" : "put"}: none`} title={e ? `OI change ${fmtOiChange(e.oiChange)}, price ${signed(e.priceChangePct, 1)}%` : undefined} className="flex h-11 w-full items-center justify-end border-b border-slate-100 pr-2 text-right disabled:opacity-100">
        {e ? (
          <span data-testid={`top-${type}-${meta.code}-strike`} className="text-[14px] font-bold text-blue-700">
            {e.strike}
          </span>
        ) : (
          <span data-testid={`top-${type}-${meta.code}-none`} className="text-[13px] text-chain-quiet">
            none
          </span>
        )}
      </button>
    );
  };
  return (
    <div data-testid="chain-tops" className="pb-2">
      <div className="flex h-9 items-center gap-1 text-[13px] font-bold text-slate-900">
        Top buildup strikes
        <button type="button" data-compact data-testid="chain-tops-info-toggle" aria-expanded={info} aria-label="What these are" title="The strike with the largest change in open interest in each category, up or down, among the strikes shown; a tie takes the lower strike" onClick={() => setInfo((v) => !v)} className="flex h-6 w-6 items-center justify-center text-chain-quiet">
          <Info size={16} aria-hidden />
        </button>
      </div>
      {info && (
        <p data-testid="chain-tops-info" className="pb-1 text-[11px] leading-[16px] text-chain-quiet">
          Largest OI change, up or down, per category in the strikes shown. Tap a strike to find it.
        </p>
      )}
      <div className="grid grid-cols-[1fr_76px_76px] items-center">
        <span />
        <span className="pr-2 text-right text-[11px] text-chain-quiet">Calls</span>
        <span className="pr-2 text-right text-[11px] text-chain-quiet">Puts</span>
        {TOP_ORDER.map((k) => (
          <React.Fragment key={k}>
            <div className="flex h-11 items-center gap-2 border-b border-slate-100 text-[13px] text-slate-700">
              <span className={"w-6 text-[12px] " + buildupMarkClass(k)}>{BUILDUP_META[k].code}</span>
              {BUILDUP_META[k].label}
            </div>
            {cell(tops.call, k, "CE")}
            {cell(tops.put, k, "PE")}
          </React.Fragment>
        ))}
      </div>
      <p data-testid="chain-tops-note" className="pt-1.5 text-[11px] leading-[16px] text-chain-quiet">
        {note}
      </p>
    </div>
  );
}
