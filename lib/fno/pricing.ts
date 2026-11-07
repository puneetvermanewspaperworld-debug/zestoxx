/** Black-Scholes-Merton with a continuous dividend yield, plus implied volatility by bisection. */

export type OptType = "CE" | "PE";

export interface BsResult {
  price: number;
  delta: number;
  gamma: number;
  /** per 1 percentage-point move in volatility */
  vega: number;
  /** per calendar day */
  theta: number;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26; error < 1.5e-7). */
export function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export const normPdf = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/**
 * @param spot   underlying price
 * @param strike strike
 * @param years  time to expiry in years
 * @param sigma  volatility as a fraction (0.2 = 20%)
 * @param r      risk-free rate as a fraction
 * @param q      dividend yield as a fraction
 */
export function bsm(type: OptType, spot: number, strike: number, years: number, sigma: number, r: number, q: number): BsResult {
  if (years <= 1e-8 || sigma <= 1e-8) {
    const intrinsic = type === "CE" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    return { price: intrinsic, delta: type === "CE" ? (spot > strike ? 1 : 0) : spot < strike ? -1 : 0, gamma: 0, vega: 0, theta: 0 };
  }
  const sq = sigma * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (r - q + 0.5 * sigma * sigma) * years) / sq;
  const d2 = d1 - sq;
  const eq = Math.exp(-q * years);
  const er = Math.exp(-r * years);
  const pdf = normPdf(d1);
  let price: number, delta: number, theta: number;
  if (type === "CE") {
    price = spot * eq * normCdf(d1) - strike * er * normCdf(d2);
    delta = eq * normCdf(d1);
    theta = -(spot * eq * pdf * sigma) / (2 * Math.sqrt(years)) - r * strike * er * normCdf(d2) + q * spot * eq * normCdf(d1);
  } else {
    price = strike * er * normCdf(-d2) - spot * eq * normCdf(-d1);
    delta = -eq * normCdf(-d1);
    theta = -(spot * eq * pdf * sigma) / (2 * Math.sqrt(years)) + r * strike * er * normCdf(-d2) - q * spot * eq * normCdf(-d1);
  }
  return { price, delta, gamma: (eq * pdf) / (spot * sq), vega: (spot * eq * pdf * Math.sqrt(years)) / 100, theta: theta / 365 };
}

/** Volatility (fraction) that reproduces `price`, or null if no volatility in 1%–400% does. */
export function impliedVol(type: OptType, spot: number, strike: number, years: number, price: number, r: number, q: number): number | null {
  if (years <= 1e-6) return null;
  let lo = 0.01;
  let hi = 4;
  const pLo = bsm(type, spot, strike, years, lo, r, q).price;
  const pHi = bsm(type, spot, strike, years, hi, r, q).price;
  if (price <= pLo + 1e-7 || price >= pHi) return null;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (bsm(type, spot, strike, years, mid, r, q).price > price) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
