import { bsm, type OptType } from "./pricing";
import { evaluate, findRoots, prepareLegs, pricingSpot, probability, roundDays, type Market, type QuoteLookup } from "./engine";

/**
 * The ITM/ATM/OTM strike comparison: one long option per strike offset, same expiry. Prices and
 * volatilities come from the live chain when a lookup is supplied, else from the model.
 */

/** Index moves (%) the comparison grid is evaluated at. */
export const CMP_MOVES = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3];
/** Strike offsets from spot (%), measured toward in-the-money (negative) or out-of-the-money. */
export const CMP_OFFS = [-1, -0.5, 0, 0.5, 1, 1.5, 2, 3];

export type Hold = "same" | "half" | "expiry";

export interface StrikeColumn {
  K: number;
  kind: "ITM" | "ATM" | "OTM";
  /** % away from spot */
  dist: number;
  qty: number;
  cost: number;
  entry: number;
  priceSource: "chain" | "model";
  /** whether a chain price is the bid-ask mid or the last trade (null when priced from the model) */
  quoteBasis: "mid" | "last" | null;
  /** why this strike's price and volatility deserve less trust, or null */
  low: string | null;
  /** worst case for 1 lot, after charges (positive number) */
  worst: number;
  /** lots that fit inside the risk limit */
  lots: number;
  be: number | null;
  pop: number;
  /** chance of losing 90% or more of the premium */
  ruin: number;
  delta: number;
  /** this strike's own volatility, percent (implied from its price; the market volatility if it has none) */
  iv: number;
  /** change in the lot's delta per 1 index point, for 1 lot */
  gamma: number;
  /** ₹ gained per 1 volatility point rise, for 1 lot */
  vega: number;
  decay: number;
  decayPct: number;
  perPct: number;
  /** charges in and out for 1 lot */
  chg: number;
  /** P&L after charges for each of CMP_MOVES */
  cells: number[];
}

export interface Comparison {
  cols: StrikeColumn[];
  /** days held before exit */
  d: number;
  st: "square" | "expire";
}

export function holdDays(m: Pick<Market, "dte">, hold: Hold): number {
  const d = hold === "same" ? 0 : hold === "half" ? m.dte / 2 : m.dte;
  return roundDays(d);
}

export function compareStrikes(m: Market, dir: OptType, risk: number, hold: Hold, quote?: QuoteLookup): Comparison {
  const d = holdDays(m, hold);
  const T = m.dte / 365;
  const r = m.r / 100;
  const q = m.q / 100;
  const st = d >= m.dte - 1e-9 && m.exitStyle === "expire" ? "expire" : "square";
  const seen = new Set<number>();
  const cols: StrikeColumn[] = [];

  for (const o of CMP_OFFS) {
    const raw = dir === "CE" ? m.spot * (1 + o / 100) : m.spot * (1 - o / 100);
    const K = Math.round(Math.round(raw / m.step) * m.step * 100) / 100;
    if (!(K > 0) || seen.has(K)) continue;
    seen.add(K);

    const P = prepareLegs([{ id: 0, side: "B", type: dir, strike: K, lots: 1, price: null }], m, quote);
    if (!P.length) continue;
    const L = P[0];
    const cost = L.entry * L.qty;
    const itm = dir === "CE" ? K < m.spot : K > m.spot;
    const atm = Math.abs(K - m.spot) <= m.step / 2;
    const far = dir === "CE" ? K * 0.5 : K * 1.5;
    const worst = -evaluate(P, m, far, m.dte, 0, "expire").pre;
    const roots = findRoots((x) => evaluate(P, m, x, m.dte, 0, m.exitStyle).pre, m.spot * 0.6, m.spot * 1.6);
    const g = bsm(dir, pricingSpot(m), K, T, L.iv as number, r, q);
    cols.push({
      K,
      kind: atm ? "ATM" : itm ? "ITM" : "OTM",
      dist: Math.abs(K / m.spot - 1) * 100,
      qty: L.qty,
      cost,
      entry: L.entry,
      priceSource: L.priceSource === "chain" ? "chain" : "model",
      quoteBasis: L.quoteBasis,
      low: L.lowConfidence,
      worst,
      lots: worst > 0 ? Math.floor(risk / worst) : 0,
      be: roots.length ? roots[0] : null,
      pop: probability(P, m, (e) => e.pre > 0),
      ruin: probability(P, m, (e) => e.pre <= -0.9 * cost),
      delta: g.delta,
      iv: (L.iv as number) * 100,
      gamma: g.gamma * L.qty,
      vega: g.vega * L.qty,
      decay: g.theta * L.qty,
      decayPct: cost > 0 ? (Math.abs(g.theta * L.qty) / cost) * 100 : 0,
      perPct: Math.abs(g.delta * L.qty * m.spot * 0.01),
      chg: evaluate(P, m, m.spot, d, 0, "square").total,
      cells: CMP_MOVES.map((mv) => evaluate(P, m, m.spot * (1 + mv / 100), d, 0, st).pre),
    });
  }
  return { cols, d, st };
}
