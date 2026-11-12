import type { ExitStyle, Market } from "./engine";
import { daysToExpiry, lastCloseTime, type FnoSnapshot } from "./snapshot";

/**
 * Frozen prices. The analyzer prices everything (cards, plain-words lines, tables, chart) from ONE snapshot that is held still
 * while the feed refreshes in the background. The snapshot only changes when the user acts: presses "Update to live prices",
 * edits the trade (a leg, a strike, a preset), or switches expiry or underlying. A value the user typed over the feed is an
 * override: a refresh can replace the snapshot underneath it but never the override itself.
 *
 * Pure functions and a reducer, so the rules are tested without a browser.
 */

/** Values the user typed over the feed (the badge turns to Manual). */
export interface Overrides {
  spot?: number;
  dte?: number;
  iv?: number;
  lot?: number;
  step?: number;
}

export interface FreezeState {
  /** the snapshot the analysis is priced from; null until the first one arrives */
  frozen: FnoSnapshot | null;
  ov: Overrides;
}

export type FreezeAction =
  /** the feed delivered something (every few seconds): only the first snapshot, or one for a different underlying/expiry, is taken */
  | { type: "feed"; feed: FnoSnapshot | null }
  /** "Update to live prices": take the latest snapshot now */
  | { type: "update"; feed: FnoSnapshot | null }
  /** the user changed the trade (a leg, a strike, a preset): take the latest snapshot now */
  | { type: "tradeEdit"; feed: FnoSnapshot | null }
  /** the user typed a value (or cleared one by passing undefined) */
  | { type: "override"; patch: Partial<Overrides> }
  /** "Use live values": drop typed spot, days and volatility (lot size and strike gap stay) */
  | { type: "clearOverrides" }
  /** another underlying: nothing carries over */
  | { type: "reset" };

export const initialFreeze: FreezeState = { frozen: null, ov: {} };

/** Which contract a snapshot is for. */
export const snapKey = (s: Pick<FnoSnapshot, "underlying" | "expiry">): string => `${s.underlying}|${s.expiry}`;

export function freezeReducer(state: FreezeState, a: FreezeAction): FreezeState {
  switch (a.type) {
    case "feed": {
      const f = a.feed;
      if (!f) return state;
      if (!state.frozen || snapKey(state.frozen) !== snapKey(f)) return { ...state, frozen: f };
      return state; // same contract: the feed refreshes in the background, the analysis stays put
    }
    case "update":
    case "tradeEdit":
      return a.feed ? { ...state, frozen: a.feed } : state; // overrides are kept as they are
    case "override":
      return { ...state, ov: { ...state.ov, ...a.patch } };
    case "clearOverrides":
      return { ...state, ov: { lot: state.ov.lot, step: state.ov.step } };
    case "reset":
      return initialFreeze;
  }
}

/** Has the live feed moved on from what the analysis is priced at? Drives the "Update to live prices" button. */
export function feedMoved(frozen: FnoSnapshot | null, feed: FnoSnapshot | null): boolean {
  if (!frozen || !feed || snapKey(frozen) !== snapKey(feed)) return false;
  return feed.feedAsOf !== frozen.feedAsOf || feed.spot !== frozen.spot || feed.vix !== frozen.vix;
}

/** "Priced at 15:39:59 IST", from the exchange's last update (else when the snapshot was built); the date is added when it is not today. */
export function pricedAtText(snap: FnoSnapshot, now: Date = new Date()): string {
  const t = new Date(snap.feedAsOf ?? snap.asOf);
  const ist = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour12: false, ...o });
  const time = ist(t, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const sameDay = ist(t, { year: "numeric", month: "2-digit", day: "2-digit" }) === ist(now, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `Priced at ${time} IST${sameDay ? "" : ` (${ist(t, { weekday: "short", day: "numeric", month: "short" })})`}`;
}

/** Costs and settings that sit beside the snapshot. */
export interface MarketInputs {
  r: number;
  q: number;
  brokerage: number;
  slab: number;
}

/**
 * The market the analysis runs on: the frozen snapshot with the user's typed values on top. Time to expiry is counted from the
 * snapshot's own time (the exchange's last update when delayed, else when it was built), never from the wall clock, so nothing
 * drifts while the page is open.
 */
export function buildMarket(
  frozen: FnoSnapshot | null,
  ov: Overrides,
  costs: MarketInputs,
  exitStyle: ExitStyle,
  kind: "index" | "stock"
): Market | null {
  if (!frozen) return null;
  const feedIv = kind === "index" ? (frozen.vix ?? frozen.atmIv) : (frozen.atmIv ?? frozen.vix);
  const built = new Date(Date.parse(frozen.asOf));
  const from = frozen.source === "delayed" ? new Date(frozen.feedAsOf ?? lastCloseTime(built)) : built;
  return {
    spot: ov.spot ?? frozen.spot,
    dte: ov.dte ?? daysToExpiry(frozen.expiry, from),
    iv: ov.iv ?? feedIv ?? 16,
    r: costs.r,
    q: costs.q,
    lot: ov.lot ?? frozen.lot,
    step: ov.step ?? frozen.step,
    brokerage: costs.brokerage,
    slab: costs.slab,
    exitStyle,
  };
}
