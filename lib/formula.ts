import type { Candle } from "./types";

/** Lightweight, sandboxed formula evaluator for the chart's "custom indicator" bar —
 *  lets a user plot their own line using open/high/low/close/volume plus sma()/ema()
 *  helpers, similar in spirit to a single-line Pine Script expression. */
export function computeCustomSeries(
  candles: Candle[],
  formula: string
): { series: (number | null)[] | null; error: string | null } {
  if (!formula || !formula.trim()) return { series: null, error: null };
  const closes = candles.map((c) => c.close);
  let fn: (...args: unknown[]) => unknown;
  try {
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    fn = new Function(
      "close",
      "open",
      "high",
      "low",
      "volume",
      "sma",
      "ema",
      "Math",
      `"use strict"; return (${formula});`
    ) as (...args: unknown[]) => unknown;
  } catch {
    return { series: null, error: "Couldn't parse that formula." };
  }
  try {
    const series = candles.map((c, i) => {
      const smaFn = (p: number) => {
        if (i < p - 1) return null;
        let s = 0;
        for (let j = i - p + 1; j <= i; j++) s += closes[j];
        return s / p;
      };
      const emaFn = (p: number) => {
        if (i < p - 1) return null;
        const k = 2 / (p + 1);
        let prev: number | null = null;
        for (let x = p - 1; x <= i; x++) {
          if (prev == null) {
            let s = 0;
            for (let j = x - p + 1; j <= x; j++) s += closes[j];
            prev = s / p;
          } else prev = closes[x] * k + prev * (1 - k);
        }
        return prev;
      };
      const val = fn(c.close, c.open, c.high, c.low, c.volume, smaFn, emaFn, Math);
      return typeof val === "number" && isFinite(val) ? val : null;
    });
    return { series, error: null };
  } catch {
    return { series: null, error: "Formula errored while evaluating — check variable names." };
  }
}
