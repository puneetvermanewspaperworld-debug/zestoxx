import type { Candle } from "./types";

export function maSeries(candles: Candle[], period: number): (number | null)[] {
  const closes = candles.map((c) => c.close);
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    return sum / period;
  });
}

/**
 * Relative Strength Index, Wilder's way (the standard one: TradingView, StockCharts and most brokers). The first average gain and
 * loss are plain averages of the first `period` changes; every later one is smoothed: avg = (previous avg x (period - 1) + this
 * change) / period. The first value is at index `period` (it needs `period` changes). A series with no losses is 100, and one with
 * neither gains nor losses is 50. Earlier versions of Zestoxx averaged only the last `period` changes, which gives different values.
 *
 * Wilder's smoothing never forgets its starting average, it only fades it: after n more bars its weight is ((period - 1) / period)^n.
 * See RSI_MIN_BARS for how many bars are needed before the value can be trusted.
 */
export function rsiSeries(candles: Candle[], period = 14): (number | null)[] {
  const closes = candles.map((c) => c.close);
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  const rsi = (g: number, l: number) => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = rsi(avgGain, avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = rsi(avgGain, avgLoss);
  }
  return out;
}

/**
 * Closes needed before a Wilder RSI can be shown: enough that the starting average's remaining weight is under 1%
 * (((period - 1) / period)^n < 0.01), plus the `period` + 1 closes the first value itself needs. For period 14 that is 78.
 */
export function minBarsForRsi(period = 14, tolerance = 0.01): number {
  return period + 1 + Math.ceil(Math.log(tolerance) / Math.log((period - 1) / period));
}

export const RSI_MIN_BARS = minBarsForRsi(14);

export function emaSeries(candles: Candle[], period: number): (number | null)[] {
  const closes = candles.map((c) => c.close);
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) continue;
    if (prev == null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      prev = sum / period;
    } else {
      prev = closes[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

export function bollingerBands(
  candles: Candle[],
  period = 20,
  mult = 2
): { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } {
  const closes = candles.map((c) => c.close);
  const mid = maSeries(candles, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += Math.pow(closes[j] - (mid[i] as number), 2);
    const sd = Math.sqrt(sumSq / period);
    upper[i] = (mid[i] as number) + mult * sd;
    lower[i] = (mid[i] as number) - mult * sd;
  }
  return { upper, mid, lower };
}
