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

/**
 * Standard normal CDF to double precision (Hart's rational approximation as given in West, "Better approximations to
 * cumulative normal functions", 2005). The older Abramowitz–Stegun fit was good to 1.5e-7 in the value but its slope was
 * off by about 0.1%, which showed up as a 0.1% error in anything taken from the price's curvature (gamma).
 */
export function normCdf(x: number): number {
  const ax = Math.abs(x);
  let c: number;
  if (ax > 37) c = 0;
  else {
    const e = Math.exp((-ax * ax) / 2);
    if (ax < 7.07106781186547) {
      let n = 3.52624965998911e-2 * ax + 0.700383064443688;
      n = n * ax + 6.37396220353165;
      n = n * ax + 33.912866078383;
      n = n * ax + 112.079291497871;
      n = n * ax + 221.213596169931;
      n = n * ax + 220.206867912376;
      let d = 8.83883476483184e-2 * ax + 1.75566716318264;
      d = d * ax + 16.064177579207;
      d = d * ax + 86.7807322029461;
      d = d * ax + 296.564248779674;
      d = d * ax + 637.333633378831;
      d = d * ax + 793.826512519948;
      d = d * ax + 440.413735824752;
      c = (e * n) / d;
    } else {
      let b = ax + 0.65;
      b = ax + 4 / b;
      b = ax + 3 / b;
      b = ax + 2 / b;
      b = ax + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
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
