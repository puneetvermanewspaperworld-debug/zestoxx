"use client";

import React, { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { COL_META, cellFor, isItm, maxOiIn, signed, spotSlot, windowRows, type ChainTab, type ChangeMode, type ColId } from "@/lib/chain-view";
import { BUILDUP_CHIP, strikeBuildup } from "@/lib/chain-buildup";
import { fmt, fmtOiChange, fmtSigned } from "@/lib/helpers";
import { BUILDUP_META } from "@/lib/options";
import type { OptionChain } from "@/lib/options";

/** Call LTP, Strike and Put LTP: pinned in the middle of the table. Everything else scrolls sideways under them. */
const LTP_W = 64;
const STRIKE_W = 64;
/** wide enough for "1.43 Cr" and "+21.52 L" with their padding: a figure is never cut off */
const OUTER_MIN = 72;
/** the Buildup column holds a tag, an OI change and a price change */
const BUILDUP_MIN = 80;
const minOf = (c: ColId) => (c === "buildup" ? BUILDUP_MIN : OUTER_MIN);
const CENTRE_W = LTP_W * 2 + STRIKE_W;

export interface ChainTableHandle {
  /** scroll the live spot's row to the middle of the table (and the pinned columns to the middle of the screen) */
  jumpToSpot: () => void;
  /** scroll to a strike, put it in the middle, and mark its row for a moment; false when that strike is not in the table */
  goToStrike: (strike: number) => boolean;
}

const TONE = { up: "text-emerald-700", down: "text-rose-600", flat: "text-slate-700" } as const;

/**
 * The phone's option chain, one table with its own scrolling. Rows are a fixed height and every figure is tabular, so a price tick changes digits
 * and nothing moves. The header is sticky, and so are the three middle columns: with columns to the sides, they scroll sideways inside the table
 * under the pinned ones; the page itself never scrolls sideways.
 *
 * Calls are on the left and puts on the right. The live spot is a row of its own between the two strikes it sits between, with its price and its
 * change; a call is in the money above that row (strike below the spot), a put below it, and those cells are shaded. Open interest is a bar
 * behind the figure in its cell, scaled to the largest in view. A tap on any cell of a side opens that contract.
 */
export default function PhoneChainTable({ chain, atm, spot, change, pct, cols, mode, tab, onPick, handle }: { chain: OptionChain; atm: number | undefined; spot: number; change: number | null; pct: number | null; cols: ColId[]; mode: ChangeMode; tab: ChainTab; onPick: (strike: number, type: "CE" | "PE") => void; handle: React.Ref<ChainTableHandle> }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [cw, setCw] = useState(0);
  const rows = windowRows(chain.rows, atm);
  const maxOi = maxOiIn(rows);
  const callSide = [...cols].reverse(); // outermost first, so the first column chosen ends up beside the LTP
  const putSide = cols;
  const template = [...callSide.map((c) => `minmax(${minOf(c)}px,1fr)`), `${LTP_W}px`, `${STRIKE_W}px`, `${LTP_W}px`, ...putSide.map((c) => `minmax(${minOf(c)}px,1fr)`)].join(" ");
  const leftW = cols.reduce((n, c) => n + minOf(c), 0);
  // the strike whose row is marked for a moment after a tap on a top entry
  const [flash, setFlash] = useState<number | null>(null);
  // true while the table is still being put at the spot (see below); a tap on a top entry or a touch ends it
  const settling = useRef(true);
  const a = Math.max(0, Math.floor((cw - CENTRE_W) / 2)); // where the pinned columns start, when they are in the middle of the screen
  const slot = spotSlot(rows, spot);

  const jumpToSpot = useCallback(() => {
    const el = box.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth > el.clientWidth ? Math.max(0, leftW - Math.floor((el.clientWidth - CENTRE_W) / 2)) : 0;
    const row = el.querySelector<HTMLElement>('[data-spot="1"]');
    if (!row) return;
    const head = el.querySelector<HTMLElement>('[data-head="1"]')?.offsetHeight ?? 0;
    el.scrollTop = Math.max(0, row.offsetTop - head - (el.clientHeight - head - row.offsetHeight) / 2);
  }, [leftW]);
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
  const pinLeft = [a, a + LTP_W, a + LTP_W + STRIKE_W];
  // left and right together hold a cell at one x wherever the table is scrolled to: left stops it going left of it, right stops it staying to its right
  const pinStyle = (i: 0 | 1 | 2): React.CSSProperties => ({ position: "sticky", left: pinLeft[i], right: Math.max(0, cw - pinLeft[i] - (i === 1 ? STRIKE_W : LTP_W)) });

  const head = "sticky top-0 z-20 flex h-[var(--chain-head)] items-center border-b border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-500";
  const cell = "relative flex h-[var(--chain-row)] items-center border-b border-slate-100 px-1.5 font-mono text-[12px]";

  const spotRow = (
    <div key="spot" data-spot="1" data-testid="chain-spot-row" style={{ gridColumn: "1 / -1" }} className="relative z-[5] h-[var(--chain-spot)] border-y border-blue-200 bg-blue-50">
      {/* as wide as the screen and held at the left, so it can be read wherever the table is scrolled to */}
      <div className="sticky left-0 flex h-full items-center justify-center gap-2 px-3 text-blue-800" style={{ width: cw || "100%" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Spot</span>
        <span data-testid="chain-spot-price" className="font-mono text-[13px] font-semibold">
          {spot > 0 ? fmt(spot, "index") : "--"}
        </span>
        {change != null && pct != null && (
          <span data-testid="chain-spot-change" className="font-mono text-[12px]">
            {fmtSigned(change, 2)} ({fmtSigned(pct, 2, "%")})
          </span>
        )}
      </div>
    </div>
  );

  const oiBar = (side: "call" | "put", oi: number) =>
    maxOi > 0 && oi > 0 ? (
      <span aria-hidden data-testid="chain-oi-bar" className={"absolute inset-x-1 inset-y-1 flex " + (side === "call" ? "justify-end" : "justify-start")}>
        <span className={"block h-full rounded-sm " + (side === "call" ? "bg-indigo-100/80" : "bg-amber-100/80")} style={{ width: `${Math.max(3, (oi / maxOi) * 100)}%` }} />
      </span>
    ) : null;

  return (
    <div
      ref={box}
      data-testid="chain-scroll"
      role="region"
      aria-label="Option chain"
      className="relative min-h-0 flex-1 overflow-auto overscroll-contain border-t border-slate-200 bg-white"
      onClick={(e) => {
        const t = (e.target as HTMLElement).closest<HTMLElement>("[data-t]");
        if (t) onPick(Number(t.dataset.k), t.dataset.t as "CE" | "PE");
      }}
    >
      <div className="grid w-max min-w-full" style={{ gridTemplateColumns: template }}>
        {/* header */}
        {callSide.map((c) => (
          <div key={"hc" + c} data-head="1" title={COL_META[c].hint} className={head + " justify-end"}>
            {COL_META[c].label}
          </div>
        ))}
        <div data-head="1" className={head + " z-30 justify-end"} style={pinStyle(0)}>
          Call LTP
        </div>
        <div data-head="1" className={head + " z-30 justify-center font-semibold text-slate-700"} style={pinStyle(1)}>
          Strike
        </div>
        <div data-head="1" className={head + " z-30 justify-start"} style={pinStyle(2)}>
          Put LTP
        </div>
        {putSide.map((c) => (
          <div key={"hp" + c} data-head="1" title={COL_META[c].hint} className={head + " justify-start"}>
            {COL_META[c].label}
          </div>
        ))}

        {rows.map((r, i) => {
          const callItm = isItm(r.strike, spot, "CE");
          const putItm = isItm(r.strike, spot, "PE");
          const shade = (itm: boolean) => (itm ? "bg-slate-100" : "bg-white");
          const bu = strikeBuildup(r);
          const outer = (side: "call" | "put", c: ColId) => {
            const leg = side === "call" ? r.call : r.put;
            if (c === "buildup") {
              const b = side === "call" ? bu.call : bu.put;
              const meta = b.kind ? BUILDUP_META[b.kind] : null;
              return (
                <div key={`${side}-${c}`} data-k={r.strike} data-t={side === "call" ? "CE" : "PE"} data-col="buildup" data-flash={flash === r.strike ? "1" : undefined} className={cell + " gap-1 " + (side === "call" ? "justify-end" : "justify-start") + " " + shade(side === "call" ? callItm : putItm)}>
                  {b.kind && meta ? (
                    <>
                      {side === "put" && (
                        <span data-testid={`bu-tag-${r.strike}-PE`} data-kind={b.kind} title={meta.label + ": " + meta.meaning} className={"shrink-0 rounded px-1 text-[11px] font-semibold leading-[18px] " + BUILDUP_CHIP[b.kind]}>
                          {meta.code}
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col text-[11px] leading-[13px] text-slate-700">
                        <span data-testid={`bu-oi-${r.strike}-${side === "call" ? "CE" : "PE"}`} className={"whitespace-nowrap " + (side === "call" ? "text-right" : "text-left")}>{fmtOiChange(b.oiChange)}</span>
                        <span data-testid={`bu-px-${r.strike}-${side === "call" ? "CE" : "PE"}`} className={"whitespace-nowrap " + (side === "call" ? "text-right" : "text-left")}>{signed(b.priceChangePct, 1)}%</span>
                      </span>
                      {side === "call" && (
                        <span data-testid={`bu-tag-${r.strike}-CE`} data-kind={b.kind} title={meta.label + ": " + meta.meaning} className={"shrink-0 rounded px-1 text-[11px] font-semibold leading-[18px] " + BUILDUP_CHIP[b.kind]}>
                          {meta.code}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400" data-testid={`bu-none-${r.strike}-${side === "call" ? "CE" : "PE"}`}>--</span>
                  )}
                </div>
              );
            }
            const v = cellFor(c, leg, mode);
            return (
              <div key={`${side}-${c}`} data-k={r.strike} data-t={side === "call" ? "CE" : "PE"} data-col={c} data-flash={flash === r.strike ? "1" : undefined} className={cell + " " + (side === "call" ? "justify-end" : "justify-start") + " " + shade(side === "call" ? callItm : putItm) + " " + TONE[v.tone]}>
                {c === "oi" && oiBar(side, leg.oi)}
                <span className="relative whitespace-nowrap">{v.text}</span>
              </div>
            );
          };
          const ltp = (side: "call" | "put") => {
            const leg = side === "call" ? r.call : r.put;
            const type = side === "call" ? "CE" : "PE";
            return (
              <div key={`${side}-ltp`} data-k={r.strike} data-t={type} data-col="ltp" data-flash={flash === r.strike ? "1" : undefined} className={cell + " z-10 " + (side === "call" ? "justify-end" : "justify-start") + " " + shade(side === "call" ? callItm : putItm)} style={pinStyle(side === "call" ? 0 : 2)}>
                <button type="button" aria-label={`Trade ${r.strike} ${type}`} data-testid={`chain-${type.toLowerCase()}-${r.strike}`} className="font-mono text-[13px] font-semibold text-slate-900">
                  {leg.ltp > 0 ? leg.ltp.toFixed(2) : "--"}
                </button>
              </div>
            );
          };
          return (
            <React.Fragment key={r.strike}>
              {i === slot && spotRow}
              {callSide.map((c) => outer("call", c))}
              {ltp("call")}
              <div data-testid={`chain-strike-${r.strike}`} data-flash={flash === r.strike ? "1" : undefined} className={cell + " z-10 justify-center border-x border-x-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-900"} style={pinStyle(1)}>
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
  );
}
