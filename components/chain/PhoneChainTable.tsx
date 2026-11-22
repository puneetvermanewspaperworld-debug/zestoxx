"use client";

import React, { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COL_META, cellFor, fmtOiChangeShort, isItm, maxOiIn, signed, spotSlot, textWidth, windowRows, type ChainTab, type ChangeMode, type ColId } from "@/lib/chain-view";
import { buildupMarkClass, legFigures } from "@/lib/chain-buildup";
import { fmt, fmtSigned } from "@/lib/helpers";
import { BUILDUP_META } from "@/lib/options";
import type { OptionChain, OptionLeg } from "@/lib/options";

/** The table's side padding: nothing, not even the right-most tag column or the "Calls" and "Puts" labels, touches the edge of the screen. */
const SIDE = 12;
/** the space inside a cell, both sides together, around its figure: roomy in the OI and Greeks views, tight in Buildup, whose three columns have to fit beside the pinned centre */
const padFor = (tab: ChainTab) => (tab === "buildup" ? 4 : 8);
const MIN_LTP = 50;
const MIN_STRIKE = 42;

export interface ChainTableHandle {
  /** scroll the live spot's row to the middle of the table (and the pinned columns to the middle of the screen) */
  jumpToSpot: () => void;
  /** scroll to a strike, put it in the middle, and mark its row for a moment; false when that strike is not in the table */
  goToStrike: (strike: number) => boolean;
}

const TONE = { up: "text-chain-up", down: "text-chain-down", flat: "text-chain-quiet" } as const;
type Tone = keyof typeof TONE;

/** the text of one outer cell and its direction: blank ("") when the leg has no such figure (nothing is made up, and nothing reads "--") */
function textOf(c: ColId, leg: OptionLeg, mode: ChangeMode): { text: string; tone: Tone } {
  if (c === "buTag" || c === "buOi" || c === "buPx") {
    const f = legFigures(leg);
    if (!f) return { text: "", tone: "flat" };
    if (c === "buTag") return { text: f.kind ? BUILDUP_META[f.kind].code : "", tone: "flat" };
    if (c === "buOi") return { text: fmtOiChangeShort(f.oiChange), tone: "flat" };
    return { text: signed(f.priceChangePct, 1), tone: dir(f.priceChangePct) };
  }
  const v = cellFor(c, leg, mode);
  return { text: v.text === "--" ? "" : v.text, tone: c === "ltpChg" ? v.tone : "flat" };
}
/** the font size of a column's figures: the Buildup view's changes are a size down so the tag, the OI change and the price change fit beside the pinned centre */
const sizeOf = (c: ColId) => (c === "buOi" || c === "buPx" ? 11 : 12);
const dir = (n: number): Tone => (n > 0 ? "up" : n < 0 ? "down" : "flat");

/**
 * The phone's option chain, one table with its own scrolling. Rows are a fixed height and every figure is tabular, so a price tick changes digits
 * and nothing moves. The header is sticky, and so are the three middle columns: with columns to the sides, they scroll sideways inside the table
 * under the pinned ones; the page itself never scrolls sideways. The table has 12px of padding at each side.
 *
 * Calls are on the left and puts on the right, every figure right-aligned in a column of its own, sized to the figures it holds. The live spot is a
 * thin line of its own between the two strikes it sits between, with a small label; a call is in the money above that line (strike below the
 * spot), a put below it, and those cells have a barely-there tint. Open interest has a 2px rule under the figure in its cell, scaled to the largest
 * in view. A tap on any cell of a side opens that contract.
 */
export default function PhoneChainTable({ chain, atm, spot, change, pct, cols, mode, tab, onPick, handle, badge, sides = true }: { chain: OptionChain; atm: number | undefined; spot: number; change: number | null; pct: number | null; cols: ColId[]; mode: ChangeMode; tab: ChainTab; onPick: (strike: number, type: "CE" | "PE") => void; handle: React.Ref<ChainTableHandle>; /** shown between "Calls" and "Puts" (the market-state tag) */ badge?: React.ReactNode; /** the "Calls" and "Puts" labels above the table; not on a phone turned sideways, which has no height to spare */ sides?: boolean }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [cw, setCw] = useState(0);
  const rows = windowRows(chain.rows, atm);
  const maxOi = maxOiIn(rows);
  const callSide = [...cols].reverse(); // outermost first, so the first column chosen ends up beside the LTP
  const putSide = cols;

  // every column is as wide as the widest figure (or the longest word of its label) in view: the table is as narrow as it can be without cutting a figure
  const widths = useMemo(() => {
    const w = {} as Record<ColId, number>;
    for (const c of cols) {
      let m = c === "buPx" ? textWidth("Price", 11) : textWidth(COL_META[c].label, 11);
      for (const r of rows) for (const leg of [r.call, r.put]) m = Math.max(m, textWidth(textOf(c, leg, mode).text, sizeOf(c)));
      w[c] = m + padFor(tab);
    }
    return w;
  }, [cols, rows, mode, tab]);
  const ltpW = useMemo(() => Math.max(MIN_LTP, ...rows.flatMap((r) => [r.call.ltp, r.put.ltp]).map((x) => (x > 0 ? textWidth(x.toFixed(2), 14) + 6 : 0))), [rows]);
  const strikeW = useMemo(() => Math.max(MIN_STRIKE, ...rows.map((r) => textWidth(String(r.strike), 14) + 6)), [rows]);
  const centreW = ltpW * 2 + strikeW;
  // the two sides have the same columns, so each is as wide as the other
  const sideW = cols.reduce((n, c) => n + widths[c], 0);
  const leftW = sideW;
  const template = [...callSide.map((c) => `minmax(${widths[c]}px,1fr)`), `${ltpW}px`, `${strikeW}px`, `${ltpW}px`, ...putSide.map((c) => `minmax(${widths[c]}px,1fr)`)].join(" ");
  // the strike whose row is marked for a moment after a tap on a top entry
  const [flash, setFlash] = useState<number | null>(null);
  // true while the table is still being put at the spot (see below); a tap on a top entry or a touch ends it
  const settling = useRef(true);
  const a = Math.max(0, Math.floor((cw - centreW) / 2)); // where the pinned columns start, when they are in the middle of the screen
  const slot = spotSlot(rows, spot);

  const jumpToSpot = useCallback(() => {
    const el = box.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth > el.clientWidth ? Math.max(0, SIDE + leftW - Math.floor((el.clientWidth - centreW) / 2)) : 0;
    const row = el.querySelector<HTMLElement>('[data-spot="1"]');
    if (!row) return;
    const head = el.querySelector<HTMLElement>('[data-head="1"]')?.offsetHeight ?? 0;
    el.scrollTop = Math.max(0, row.offsetTop - head - (el.clientHeight - head - row.offsetHeight) / 2);
  }, [leftW, centreW]);
  const goToStrike = useCallback(
    (strike: number): boolean => {
      const el = box.current;
      const cell = el?.querySelector<HTMLElement>(`[data-testid="chain-strike-${strike}"]`);
      if (!el || !cell) return false;
      settling.current = false; // from here the table is where this tap put it
      const head = el.querySelector<HTMLElement>('[data-head="1"]')?.offsetHeight ?? 0;
      el.scrollTop = Math.max(0, cell.offsetTop - head - (el.clientHeight - head - cell.offsetHeight) / 2);
      setFlash(strike);
      return true;
    },
    []
  );
  useImperativeHandle(handle, () => ({ jumpToSpot, goToStrike }), [jumpToSpot, goToStrike]);
  useLayoutEffect(() => {
    if (flash === null) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  // the width of the table, to know where the middle of the screen is
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setCw(el.clientWidth);
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Opening a chain (another underlying or expiry) or changing the columns puts the spot in the middle of the table. The table may still be getting
  // its size (the controls above it settle, fonts load), so it is put there again whenever its size changes, until a finger, a wheel or a key
  // touches it: from then on it is where the user left it.
  const key = `${chain.underlying}|${chain.expiry}|${cols.join(",")}|${tab}`;
  const shown = useRef("");
  useLayoutEffect(() => {
    if (cw === 0 || shown.current === key) return;
    shown.current = key;
    settling.current = true;
    jumpToSpot();
  }, [key, cw, jumpToSpot]);
  // the spot moving to another pair of strikes while the table is still settling is a reason to centre it again
  useLayoutEffect(() => {
    if (settling.current && shown.current === key) jumpToSpot();
  }, [slot, key, jumpToSpot]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const again = () => {
      if (settling.current) jumpToSpot();
    };
    const stop = () => {
      settling.current = false;
    };
    const ro = new ResizeObserver(again);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    const stopAfter = setTimeout(stop, 2500);
    for (const ev of ["touchstart", "wheel", "pointerdown", "keydown"]) el.addEventListener(ev, stop, { passive: true });
    return () => {
      ro.disconnect();
      clearTimeout(stopAfter);
      for (const ev of ["touchstart", "wheel", "pointerdown", "keydown"]) el.removeEventListener(ev, stop);
    };
  }, [key, jumpToSpot]);

  // the pinned columns: the call's LTP, the strike, the put's LTP
  const pinLeft = [a, a + ltpW, a + ltpW + strikeW];
  const pinWidth = [ltpW, strikeW, ltpW];
  // left and right together hold a cell at one x wherever the table is scrolled to: left stops it going left of it, right stops it staying to its right
  const pinStyle = (i: 0 | 1 | 2): React.CSSProperties => ({ position: "sticky", left: pinLeft[i], right: Math.max(0, cw - pinLeft[i] - pinWidth[i]) });

  const head = "sticky top-0 z-20 flex tabular-nums h-[var(--chain-head)] items-center justify-end border-b border-slate-200 bg-white text-right text-[11px] font-medium leading-[12px] text-chain-quiet";
  const cell = "relative flex tabular-nums h-[var(--chain-row)] items-center justify-end border-b border-slate-100 bg-white text-right";

  const px = { paddingInline: padFor(tab) / 2 };
  // the pinned centre has the same padding in every view, so its figures do not move when the view changes
  const pxc = { paddingInline: 3 };
  const tone = change == null || change === 0 ? "flat" : change > 0 ? "up" : "down";
  const spotRow = (
    <div key="spot" data-spot="1" data-testid="chain-spot-row" style={{ gridColumn: "1 / -1" }} className="relative z-[5] h-[var(--chain-spot)]">
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-blue-600/50" />
      {/* as wide as the screen's content and held at the left, so the label can be read wherever the table is scrolled to */}
      <div className="sticky flex h-full items-center justify-center" style={{ left: SIDE, width: cw ? cw - SIDE * 2 : "100%" }}>
        <span className="flex items-center gap-1.5 bg-white px-2 text-[11px] text-blue-700">
          <span>Spot</span>
          <span data-testid="chain-spot-price" className="font-medium">
            {spot > 0 ? fmt(spot, "index") : "--"}
          </span>
          {change != null && pct != null && (
            <span data-testid="chain-spot-change" className={"font-medium " + TONE[tone]}>
              {fmtSigned(change, 2)} ({fmtSigned(pct, 2, "%")})
            </span>
          )}
        </span>
      </div>
    </div>
  );

  const oiBar = (oi: number) =>
    maxOi > 0 && oi > 0 ? (
      <span aria-hidden data-testid="chain-oi-bar" className="absolute inset-x-[3px] bottom-[7px] flex justify-end">
        <span className="block h-[2px] rounded-full bg-blue-600/40" style={{ width: `${Math.max(3, (oi / maxOi) * 100)}%` }} />
      </span>
    ) : null;

  const totalMin = SIDE * 2 + leftW + centreW + sideW;
  return (
    <>
      {sides && (
        <div data-testid="chain-sides" className="flex h-7 shrink-0 items-end justify-between px-3 text-[12px] font-medium text-slate-700">
          <span>Calls</span>
          {badge}
          <span>Puts</span>
        </div>
      )}
      <div
        ref={box}
        data-testid="chain-scroll"
        role="region"
        aria-label="Option chain"
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-white"
        onClick={(e) => {
          const t = (e.target as HTMLElement).closest<HTMLElement>("[data-t]");
          if (t) onPick(Number(t.dataset.k), t.dataset.t as "CE" | "PE");
        }}
      >
        <div className="grid px-3" style={{ gridTemplateColumns: template, width: `max(100%, ${totalMin}px)` }}>
          {/* header */}
          {callSide.map((c) => (
            <div key={"hc" + c} data-head="1" title={COL_META[c].hint} className={head} style={px}>
              {COL_META[c].label}
            </div>
          ))}
          <div data-head="1" title="Call LTP" className={head + " z-30"} style={{ ...pinStyle(0), ...pxc }}>
            LTP
          </div>
          <div data-head="1" className={head + " z-30 justify-center"} style={{ ...pinStyle(1), ...pxc }}>
            Strike
          </div>
          <div data-head="1" title="Put LTP" className={head + " z-30"} style={{ ...pinStyle(2), ...pxc }}>
            LTP
          </div>
          {putSide.map((c) => (
            <div key={"hp" + c} data-head="1" title={COL_META[c].hint} className={head} style={px}>
              {COL_META[c].label}
            </div>
          ))}

          {rows.map((r, i) => {
            const callItm = isItm(r.strike, spot, "CE");
            const putItm = isItm(r.strike, spot, "PE");
            const outer = (side: "call" | "put", c: ColId) => {
              const leg = side === "call" ? r.call : r.put;
              const type = side === "call" ? "CE" : "PE";
              const v = textOf(c, leg, mode);
              const itm = side === "call" ? callItm : putItm;
              const common = { "data-k": r.strike, "data-t": type, "data-col": c, "data-flash": flash === r.strike ? "1" : undefined, "data-itm": itm ? "1" : undefined } as const;
              if (c === "buTag") {
                const kind = legFigures(leg)?.kind ?? null;
                const meta = kind ? BUILDUP_META[kind] : null;
                return (
                  <div key={`${side}-${c}`} {...common} className={cell} style={px}>
                    {kind && meta ? (
                      <span data-testid={`bu-tag-${r.strike}-${type}`} data-kind={kind} title={meta.label + ": " + meta.meaning} className={"text-[12px] " + buildupMarkClass(kind)}>
                        {meta.code}
                      </span>
                    ) : (
                      <span data-testid={`bu-none-${r.strike}-${type}`} aria-hidden />
                    )}
                  </div>
                );
              }
              if (c === "buOi" || c === "buPx") {
                return (
                  <div key={`${side}-${c}`} {...common} className={cell + " text-[11px] " + TONE[v.tone]} style={px}>
                    <span data-testid={`${c === "buOi" ? "bu-oi" : "bu-px"}-${r.strike}-${type}`} aria-label={c === "buPx" && v.text ? v.text + " per cent" : undefined} className="whitespace-nowrap">
                      {v.text}
                    </span>
                  </div>
                );
              }
              return (
                <div key={`${side}-${c}`} {...common} className={cell + " text-[12px] " + TONE[v.tone]} style={px}>
                  {c === "oi" && oiBar(leg.oi)}
                  <span className="relative whitespace-nowrap">{v.text}</span>
                </div>
              );
            };
            const ltp = (side: "call" | "put") => {
              const leg = side === "call" ? r.call : r.put;
              const type = side === "call" ? "CE" : "PE";
              const itm = side === "call" ? callItm : putItm;
              return (
                <div key={`${side}-ltp`} data-k={r.strike} data-t={type} data-col="ltp" data-flash={flash === r.strike ? "1" : undefined} data-itm={itm ? "1" : undefined} className={cell + " z-10"} style={{ ...pinStyle(side === "call" ? 0 : 2), ...pxc }}>
                  <button type="button" aria-label={`Trade ${r.strike} ${type}`} data-testid={`chain-${type.toLowerCase()}-${r.strike}`} className="text-[14px] font-medium text-slate-900">
                    {leg.ltp > 0 ? leg.ltp.toFixed(2) : ""}
                  </button>
                </div>
              );
            };
            return (
              <React.Fragment key={r.strike}>
                {i === slot && spotRow}
                {callSide.map((c) => outer("call", c))}
                {ltp("call")}
                <div data-testid={`chain-strike-${r.strike}`} data-flash={flash === r.strike ? "1" : undefined} className={cell + " z-10 justify-center text-[14px] font-bold text-slate-900"} style={{ ...pinStyle(1), ...pxc }}>
                  {r.strike}
                </div>
                {ltp("put")}
                {putSide.map((c) => outer("put", c))}
              </React.Fragment>
            );
          })}
          {slot === rows.length && spotRow}
        </div>
      </div>
    </>
  );
}
