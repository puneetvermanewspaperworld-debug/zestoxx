import type { ExitStyle, Market } from "./engine";
import { nf } from "./format";
import { daysToExpiry, lastCloseTime, type FnoSnapshot } from "./snapshot";

/**
 * One snapshot, one analysis. The analyzer prices everything (cards, plain-words lines, tables, chart, strike comparison) from a
 * single snapshot, so nothing on the page can disagree with anything else. Two modes decide how that snapshot is chosen:
 *
 *   Live     (default) every feed update takes a new snapshot, so the whole analysis re-prices together.
 *   Frozen   the snapshot is held still while the feed refreshes in the background, and only changes when the user acts: presses
 *            "Update to live prices", edits the trade (a leg, a strike, a preset), or switches expiry or underlying.
 *
 * In both modes a value the user typed over the feed is an override that sits on top of the snapshot: a refresh replaces the
 * snapshot underneath it but never the override itself. The mode survives trade, expiry and underlying changes.
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

export type PriceMode = "live" | "frozen";

export interface FreezeState {
  mode: PriceMode;
  /** the snapshot the analysis is priced from: follows the feed in Live mode, held still in Frozen mode; null until the first one arrives */
  snap: FnoSnapshot | null;
  ov: Overrides;
}

export type FreezeAction =
  /** the feed delivered something (every few seconds): Live takes it; Frozen takes only the first snapshot, or one for a different contract */
  | { type: "feed"; feed: FnoSnapshot | null }
  /** "Update to live prices": take the latest snapshot now */
  | { type: "update"; feed: FnoSnapshot | null }
  /** the user changed the trade (a leg, a strike, a preset): take the latest snapshot now */
  | { type: "tradeEdit"; feed: FnoSnapshot | null }
  /** the Live / Frozen switch; going Live takes the latest snapshot at once, going Frozen holds the current one */
  | { type: "setMode"; mode: PriceMode; feed: FnoSnapshot | null }
  /** the user typed a value (or cleared one by passing undefined) */
  | { type: "override"; patch: Partial<Overrides> }
  /** "Use live values": drop typed spot, days and volatility (lot size and strike gap stay) */
  | { type: "clearOverrides" }
  /** another underlying: the snapshot and typed values go, the chosen mode stays */
  | { type: "reset" };

export const initialFreeze: FreezeState = { mode: "live", snap: null, ov: {} };

/** Which contract a snapshot is for. */
export const snapKey = (s: Pick<FnoSnapshot, "underlying" | "expiry">): string => `${s.underlying}|${s.expiry}`;

export function freezeReducer(state: FreezeState, a: FreezeAction): FreezeState {
  switch (a.type) {
    case "feed": {
      const f = a.feed;
      if (!f) return state;
      if (state.mode === "live") return state.snap === f ? state : { ...state, snap: f }; // every update re-prices the whole analysis
      if (!state.snap || snapKey(state.snap) !== snapKey(f)) return { ...state, snap: f };
      return state; // frozen, same contract: the feed refreshes in the background, the analysis stays put
    }
    case "update":
    case "tradeEdit":
      return a.feed ? { ...state, snap: a.feed } : state; // typed values are kept as they are
    case "setMode":
      if (a.mode === state.mode) return state;
      return { ...state, mode: a.mode, snap: a.mode === "live" && a.feed ? a.feed : state.snap };
    case "override":
      return { ...state, ov: { ...state.ov, ...a.patch } };
    case "clearOverrides":
      return { ...state, ov: { lot: state.ov.lot, step: state.ov.step } };
    case "reset":
      return { ...initialFreeze, mode: state.mode };
  }
}

/** Has the live feed moved on from what the analysis is priced at? Drives the "Update to live prices" button (Frozen mode only). */
export function feedMoved(snap: FnoSnapshot | null, feed: FnoSnapshot | null): boolean {
  if (!snap || !feed || snapKey(snap) !== snapKey(feed)) return false;
  return feed.feedAsOf !== snap.feedAsOf || feed.spot !== snap.spot || feed.vix !== snap.vix;
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
 * The market the analysis runs on: the current snapshot with the user's typed values on top. Time to expiry is counted from the
 * snapshot's own time (the exchange's last update when delayed, else when it was built), never from the wall clock, so nothing
 * drifts while the page is open.
 */
export function buildMarket(
  snap: FnoSnapshot | null,
  ov: Overrides,
  costs: MarketInputs,
  exitStyle: ExitStyle,
  kind: "index" | "stock"
): Market | null {
  if (!snap) return null;
  // Chain prices are dropped once anything is typed over the feed, so the options are then priced from the spot shown.
  const manual = ov.spot != null || ov.dte != null || ov.iv != null;
  const feedIv = kind === "index" ? (snap.vix ?? snap.atmIv) : (snap.atmIv ?? snap.vix);
  const built = new Date(Date.parse(snap.asOf));
  const from = snap.source === "delayed" ? new Date(snap.feedAsOf ?? lastCloseTime(built)) : built;
  return {
    // the index quote: the one spot shown anywhere; scenarios are measured from it
    spot: ov.spot ?? snap.spot,
    // the chain's own underlying level matters only inside the option pricing, as an offset from the spot shown
    basis: manual ? 0 : (snap.chainSpot ?? snap.spot) - snap.spot,
    dte: ov.dte ?? daysToExpiry(snap.expiry, from),
    iv: ov.iv ?? feedIv ?? 16,
    r: costs.r,
    q: costs.q,
    lot: ov.lot ?? snap.lot,
    step: ov.step ?? snap.step,
    brokerage: costs.brokerage,
    slab: costs.slab,
    exitStyle,
  };
}

/** Two levels differing by more than this share of the index are worth saying so. */
export const SPOT_NOTE_THRESHOLD = 0.001;

export interface SpotNote {
  /** the index when the option prices were quoted (the chain's own underlying level) */
  quoted: number;
  /** the index quote now (the spot shown) */
  now: number;
}

/**
 * The index quote is the only spot shown. The option chain carries its own underlying level, from when its prices were quoted; when
 * that differs from the index quote by more than 0.1% the page says so in one line. Both numbers come from the same snapshot as
 * everything else on screen. No note once anything has been typed over the feed: chain prices are dropped then, so the chain's
 * level no longer matters.
 */
export function spotNote(snap: FnoSnapshot | null, ov: Overrides): SpotNote | null {
  if (!snap || snap.source === "simulated") return null;
  if (ov.spot != null || ov.dte != null || ov.iv != null) return null;
  const quoted = snap.chainSpot;
  if (!(quoted != null && quoted > 0) || !(snap.spot > 0)) return null;
  return Math.abs(quoted - snap.spot) / snap.spot > SPOT_NOTE_THRESHOLD ? { quoted, now: snap.spot } : null;
}

export const spotNoteText = (n: SpotNote): string =>
  `Option prices were quoted when the index was at ${nf(n.quoted, 2)}; the index is now at ${nf(n.now, 2)}.`;
