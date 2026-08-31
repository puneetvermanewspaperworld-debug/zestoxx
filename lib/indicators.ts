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

export function rsiSeries(candles: Candle[], period = 14): (number | null)[] {
  const closes = candles.map((c) => c.close);
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let gains = 0,
      losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - closes[j - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period,
      avgLoss = losses / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

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
