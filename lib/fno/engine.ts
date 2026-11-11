import { bsm, impliedVol, normCdf, type OptType } from "./pricing";
import { computeCharges, type ChargeBreakdown } from "./charges";

/**
 * The analyzer's maths, as plain functions of an explicit `Market` — no globals, no DOM.
 * Ported from the single-file prototype; the Section 4 tests in engine.test.ts pin it down.
 */

export type ExitStyle = "square" | "expire";
export type LegType = OptType | "FUT";

export interface Market {
  spot: number;
  /** days to expiry, decimal */
  dte: number;
  /** index volatility (VIX) in percent — the fallback volatility for strikes with no price */
  iv: number;
  /** risk-free rate, percent */
  r: number;
  /** dividend yield, percent */
  q: number;
  lot: number;
  /** strike gap */
  step: number;
  /** ₹ per order */
  brokerage: number;
  /** income-tax slab, percent */
  slab: number;
  exitStyle: ExitStyle;
}

export interface LegInput {
  id: number;
  side: "B" | "S";
  type: LegType;
  strike: number;
  lots: number;
  /** a price the user typed (their broker's), or null */
  price: number | null;
}

/** A market price for one option, e.g. from the live chain. */
export interface QuotePoint {
  /** the price to use: the middle of the bid and ask when the chain has both, else the last trade */
  ltp: number;
  /** what `ltp` is */
  basis?: "mid" | "last";
  /** why this price deserves less trust (wide spread, old last trade, ...); absent when it looks fine */
  low?: string;
  /** percent */
  iv: number | null;
}
export type QuoteLookup = (type: OptType, strike: number) => QuotePoint | null;

export type PriceSource = "typed" | "chain" | "model";

export interface PreparedLeg {
  id: number;
  side: "B" | "S";
  type: LegType;
  strike: number;
  lots: number;
  qty: number;
  sign: 1 | -1;
  /** what the model says it is worth */
  model: number;
  entry: number;
  priceSource: PriceSource;
  /** this strike's own volatility, as a fraction (null for futures) */
  iv: number | null;
  isOpt: boolean;
  ivNote: "" | "model" | "implied" | "fallback";
  /**
   * Entry price minus the model value at the entry state, for an option whose price could not be turned
   * back into a volatility (a stale last trade below intrinsic value, say). Fading to nothing at expiry,
   * it keeps "same spot, same day, same volatility" worth exactly the entry price. 0 otherwise.
   */
  anchor: number;
  /** for a chain price: whether it is the bid-ask mid or the last trade, and why it is low confidence (else null) */
  quoteBasis: "mid" | "last" | null;
  lowConfidence: string | null;
}

/** Days held, rounded to a hundredth, so every table and chart means the same instant by the same number. */
export const roundDays = (d: number): number => Math.round(d * 100) / 100;

/* ------------------------------------------------------------------ prep ---- */

export function prepareLegs(legs: LegInput[], m: Market, quote?: QuoteLookup): PreparedLeg[] {
  const T0 = m.dte / 365;
  const r = m.r / 100;
  const q = m.q / 100;
  const iv0 = m.iv / 100;
  const out: PreparedLeg[] = [];
  for (const L of legs) {
    const qty = Math.max(1, L.lots) * m.lot;
    const sign: 1 | -1 = L.side === "B" ? 1 : -1;
    if (L.type === "FUT") {
      const model = m.spot * Math.exp((r - q) * T0);
      const typed = L.price != null && L.price > 0;
      out.push({
        id: L.id, side: L.side, type: "FUT", strike: 0, lots: L.lots, qty, sign, model,
        entry: typed ? (L.price as number) : model, priceSource: typed ? "typed" : "model",
        iv: null, isOpt: false, ivNote: "", anchor: 0, quoteBasis: null, lowConfidence: null,
      });
      continue;
    }
    if (!(L.strike > 0)) continue;
    const model = bsm(L.type, m.spot, L.strike, T0, iv0, r, q).price;
    let entry = model;
    let iv = iv0;
    let ivNote: PreparedLeg["ivNote"] = "model";
    let priceSource: PriceSource = "model";
    let anchor = 0;

    const typed = L.price != null && L.price > 0;
    const chain = !typed && quote ? quote(L.type, L.strike) : null;
    const mkt = typed ? (L.price as number) : chain && chain.ltp > 0 ? chain.ltp : null;
    if (mkt != null) {
      entry = mkt;
      priceSource = typed ? "typed" : "chain";
      const imp = impliedVol(L.type, m.spot, L.strike, T0, mkt, r, q);
      if (imp) {
        iv = imp;
        ivNote = "implied";
      } else if (chain?.iv && chain.iv > 0) {
        iv = chain.iv / 100;
        ivNote = "implied";
      } else ivNote = "fallback";
      if (ivNote !== "implied" || !imp) anchor = entry - bsm(L.type, m.spot, L.strike, T0, iv, r, q).price;
    }
    out.push({
      id: L.id, side: L.side, type: L.type, strike: L.strike, lots: L.lots, qty, sign, model, entry, priceSource, iv, isOpt: true, ivNote, anchor,
      quoteBasis: priceSource === "chain" ? (chain?.basis ?? "last") : null,
      lowConfidence: priceSource === "chain" ? (chain?.low ?? null) : null,
    });
  }
  return out;
}

export function exitPrice(L: PreparedLeg, m: Market, spot: number, days: number, dIV: number): number {
  const rem = Math.max(0, m.dte - days) / 365;
  const r = m.r / 100;
  const q = m.q / 100;
  if (!L.isOpt) return spot * Math.exp((r - q) * rem);
  const px = bsm(L.type as OptType, spot, L.strike, rem, Math.max(0.01, (L.iv as number) + dIV / 100), r, q).price;
  if (!L.anchor || m.dte <= 0) return px;
  return Math.max(0, px + L.anchor * Math.min(1, Math.max(0, Math.max(0, m.dte - days) / m.dte)));
}

/* -------------------------------------------------------------- evaluate ---- */

export interface Outcome extends ChargeBreakdown {
  gross: number;
  /** after charges, before tax */
  pre: number;
  tax: number;
  net: number;
  orders: number;
  mode: "square" | "expire";
}

/** The trade's P&L if the index is `spot` after `days`, with volatility shifted by `dIV` points. */
export function evaluate(P: PreparedLeg[], m: Market, spot: number, days: number, dIV: number, style: ExitStyle): Outcome {
  if (style === "expire") days = m.dte;
  const mode = style === "expire" && days >= m.dte - 1e-9 ? "expire" : "square";
  let gross = 0;
  const a = { optBuy: 0, optSell: 0, futBuy: 0, futSell: 0, orders: 0, sttExBase: 0 };
  for (const L of P) {
    const ex = exitPrice(L, m, spot, days, dIV);
    const eT = L.entry * L.qty;
    const xT = ex * L.qty;
    gross += L.sign * (ex - L.entry) * L.qty;
    if (L.isOpt) {
      if (L.sign > 0) a.optBuy += eT;
      else a.optSell += eT;
    } else if (L.sign > 0) a.futBuy += eT;
    else a.futSell += eT;
    a.orders++;
    if (mode === "expire") {
      if (L.isOpt) {
        if (L.sign > 0 && ex > 0) a.sttExBase += ex * L.qty;
      } else if (L.sign > 0) a.futSell += xT;
    } else if (!(L.isOpt && ex < 0.05)) {
      a.orders++; // the closing order (an option worth nothing isn't squared off)
      if (L.isOpt) {
        if (L.sign > 0) a.optSell += xT;
        else a.optBuy += xT;
      } else if (L.sign > 0) a.futSell += xT;
      else a.futBuy += xT;
    }
  }
  const ch = computeCharges(a, m.brokerage);
  const pre = gross - ch.total;
  const tax = pre > 0 ? pre * (m.slab / 100) * 1.04 : 0;
  return { ...ch, gross, pre, tax, net: pre - tax, orders: a.orders, mode };
}

/** Index moves (%) and days held that the profit grid shows. */
export const GRID_MOVES = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3];
export const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

/** The profit grid: after-charges P&L for each index move (rows) and days held (columns), same volatility shift `dIV`. */
export function profitGrid(P: PreparedLeg[], m: Market, dIV: number) {
  const moves = GRID_MOVES;
  const cols = [...new Set(GRID_FRACTIONS.map((f) => roundDays(m.dte * f)))];
  const cells = moves.map((mv) => cols.map((c) => evaluate(P, m, m.spot * (1 + mv / 100), c, dIV, c >= m.dte - 1e-9 && m.exitStyle === "expire" ? "expire" : "square").pre));
  return { moves, cols, cells, mx: Math.max(1, ...cells.flat().map(Math.abs)) };
}

export function findRoots(fn: (x: number) => number, lo: number, hi: number): number[] {
  const n = 1600;
  const res: number[] = [];
  let x0 = lo;
  let y0 = fn(lo);
  for (let i = 1; i <= n; i++) {
    const x1 = lo + ((hi - lo) * i) / n;
    const y1 = fn(x1);
    if (y0 === 0) res.push(x0);
    else if (y0 * y1 < 0) {
      let a = x0;
      let b = x1;
      let ya = y0;
      for (let k = 0; k < 40; k++) {
        const mid = (a + b) / 2;
        const ym = fn(mid);
        if (ya * ym <= 0) b = mid;
        else {
          a = mid;
          ya = ym;
        }
      }
      res.push((a + b) / 2);
    }
    x0 = x1;
    y0 = y1;
  }
  return res;
}

/** Chance that `win(outcome)` holds at expiry, under a lognormal index with the market's volatility. */
export function probability(P: PreparedLeg[], m: Market, win: (o: Outcome) => boolean, steps = 500): number {
  const T = m.dte / 365;
  const sig = m.iv / 100;
  const mu = m.r / 100 - m.q / 100;
  const F = m.spot * Math.exp(mu * T);
  const zr = 6;
  let p = 0;
  for (let i = 0; i < steps; i++) {
    const z0 = -zr + (2 * zr * i) / steps;
    const z1 = z0 + (2 * zr) / steps;
    const mass = normCdf(z1) - normCdf(z0);
    const zm = (z0 + z1) / 2;
    const sx = F * Math.exp(-0.5 * sig * sig * T + sig * Math.sqrt(T) * zm);
    if (win(evaluate(P, m, sx, m.dte, 0, m.exitStyle))) p += mass;
  }
  return p;
}

export interface StaticResult {
  beNet: number[];
  beGross: number[];
  maxV: number;
  maxX: number;
  minV: number;
  minX: number;
  unlimProfit: boolean;
  unlimLoss: boolean;
  pop: number;
}

export function computeStatic(P: PreparedLeg[], m: Market): StaticResult {
  const lo = m.spot * 0.35;
  const hi = m.spot * 1.9;
  const net = (x: number) => evaluate(P, m, x, m.dte, 0, m.exitStyle).pre;
  const gr = (x: number) => evaluate(P, m, x, m.dte, 0, m.exitStyle).gross;
  const beNet = findRoots(net, lo, hi);
  const beGross = findRoots(gr, lo, hi);
  const cand: number[] = [0.01, m.spot * 3];
  for (const L of P) if (L.isOpt) cand.push(L.strike);
  const n = 1200;
  for (let i = 0; i <= n; i++) cand.push(Math.max(0.01, (m.spot * 3 * i) / n));
  let maxV = -Infinity, maxX = 0, minV = Infinity, minX = 0;
  for (const x of cand) {
    const e = net(x);
    if (e > maxV) { maxV = e; maxX = x; }
    if (e < minV) { minV = e; minX = x; }
  }
  const up = P.reduce((a, L) => a + (L.type === "PE" ? 0 : L.sign * L.qty), 0);
  return { beNet, beGross, maxV, maxX, minV, minX, unlimProfit: up > 0, unlimLoss: up < 0, pop: probability(P, m, (o) => o.pre > 0, 900) };
}

/* ---------------------------------------------------------------- greeks ---- */

export interface GreekRow {
  leg: PreparedLeg;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export function greeksNow(P: PreparedLeg[], m: Market): { rows: GreekRow[]; net: { delta: number; gamma: number; theta: number; vega: number } } {
  const T0 = m.dte / 365;
  const r = m.r / 100;
  const q = m.q / 100;
  const rows: GreekRow[] = [];
  const net = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  for (const L of P) {
    let row: GreekRow;
    if (L.isOpt) {
      const g = bsm(L.type as OptType, m.spot, L.strike, T0, L.iv as number, r, q);
      const k = L.sign * L.qty;
      row = { leg: L, delta: g.delta * k, gamma: g.gamma * k, theta: g.theta * k, vega: g.vega * k };
    } else row = { leg: L, delta: L.sign * L.qty, gamma: 0, theta: 0, vega: 0 };
    rows.push(row);
    net.delta += row.delta; net.gamma += row.gamma; net.theta += row.theta; net.vega += row.vega;
  }
  return { rows, net };
}

/* ---------------------------------------------------------------- margin ---- */

export type MarginKind = "none" | "hedged" | "full";

/**
 * How much margin a trade is likely to need, from its legs:
 *   none    nothing sold and no futures: the premium is all it costs (a long call, a long straddle)
 *   hedged  options only, something sold, and the loss is capped at both ends by options you also hold
 *           (a bull call spread, a bear put spread, an iron condor): brokers charge far less than for a naked sale
 *   full    anything else with a short option or a future: a naked short call or put, a straddle or strangle,
 *           a ratio spread, a short future (a long future also needs margin)
 * The test is the expiry payoff's slope at each end: a net short call position loses without limit on the upside, and
 * a net short put position (or a long future) keeps losing all the way down to zero. Both ends must be flat or rising.
 */
export function marginKind(P: PreparedLeg[]): MarginKind {
  if (P.some((l) => !l.isOpt)) return "full";
  if (!P.some((l) => l.sign < 0)) return "none";
  const net = (t: LegType) => P.filter((l) => l.type === t).reduce((a, l) => a + l.sign * l.qty, 0);
  return net("CE") >= 0 && net("PE") >= 0 ? "hedged" : "full";
}

/* --------------------------------------------------------------- presets ---- */

export const PRESETS: { id: string; label: string; legs: [side: "B" | "S", type: LegType, offsetSteps: number][] }[] = [
  { id: "lc", label: "Long call", legs: [["B", "CE", 0]] },
  { id: "lp", label: "Long put", legs: [["B", "PE", 0]] },
  { id: "ls", label: "Long straddle", legs: [["B", "CE", 0], ["B", "PE", 0]] },
  { id: "ss", label: "Short straddle", legs: [["S", "CE", 0], ["S", "PE", 0]] },
  { id: "sst", label: "Short strangle", legs: [["S", "CE", 4], ["S", "PE", -4]] },
  { id: "bcs", label: "Bull call spread", legs: [["B", "CE", 0], ["S", "CE", 4]] },
  { id: "bps", label: "Bear put spread", legs: [["B", "PE", 0], ["S", "PE", -4]] },
  { id: "ic", label: "Iron condor", legs: [["S", "CE", 4], ["B", "CE", 8], ["S", "PE", -4], ["B", "PE", -8]] },
  { id: "lf", label: "Long future", legs: [["B", "FUT", 0]] },
  { id: "sf", label: "Short future", legs: [["S", "FUT", 0]] },
];

export const atmStrike = (spot: number, step: number): number => Math.round(spot / step) * step;

/** Legs for a preset around the at-the-money strike. Ids start at `firstId`. */
export function presetLegs(id: string, m: Pick<Market, "spot" | "step">, firstId: number): LegInput[] {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  const a = atmStrike(m.spot, m.step);
  return p.legs.map(([side, type, off], i) => ({
    id: firstId + i,
    side,
    type,
    strike: type === "FUT" ? 0 : Math.round((a + off * m.step) * 100) / 100,
    lots: 1,
    price: null,
  }));
}
