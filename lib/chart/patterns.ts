import type { Candle } from "../types";

/**
 * Candlestick patterns, as shapes. Each rule below describes what ONE candle (or a pair) looks like and nothing else: there is no
 * trend filter, no prediction and no advice, and they are shown as plain labelled marks, never as arrows or in buy/sell colours. They are
 * for learning to read candles, and are not buy or sell signals. The thresholds are fixed and listed here; they are the commonly taught
 * ones, rounded, not tuned to any data.
 *
 *   body    = |close - open|            range = high - low
 *   upper   = high - max(open, close)   lower = min(open, close) - low
 *
 * Doji             range > 0 and body <= 10% of the range
 * Hammer           not a doji; lower >= 2 x body, upper <= 0.5 x body, body > 0
 * Shooting star    not a doji; upper >= 2 x body, lower <= 0.5 x body, body > 0
 * Bullish engulfing  the bar before closed down, this one closed up, opens at or below the previous close and closes at or above the previous
 *                    open, and its body is larger than the previous body
 * Bearish engulfing  the mirror image
 *
 * When one candle fits more than one, the first in the order above is shown. Only the latest MAX_MARKED bars are marked.
 */
export const PATTERN_THRESHOLDS = { dojiBody: 0.1, longShadow: 2, shortShadow: 0.5 } as const;
export const MAX_MARKED = 300;

export type PatternId = "doji" | "hammer" | "shootingStar" | "bullEngulf" | "bearEngulf";
export const PATTERNS: { id: PatternId; label: string; rule: string }[] = [
  { id: "doji", label: "Doji", rule: "body at most 10% of the range" },
  { id: "hammer", label: "Hammer", rule: "lower shadow at least 2x the body, upper at most 0.5x" },
  { id: "shootingStar", label: "Shooting star", rule: "upper shadow at least 2x the body, lower at most 0.5x" },
  { id: "bullEngulf", label: "Bullish engulfing", rule: "an up candle whose body covers the previous down candle's, and is larger" },
  { id: "bearEngulf", label: "Bearish engulfing", rule: "a down candle whose body covers the previous up candle's, and is larger" },
];
export const patternLabel = (id: PatternId): string => PATTERNS.find((p) => p.id === id)?.label ?? id;

/** What the study says wherever it appears. */
export const PATTERNS_NOTE = "Educational: shapes of candles, not buy or sell signals.";

/** The pattern each bar shows, or null. Index-aligned with the bars; the first bar can only show a single-candle pattern. */
export function detectPatterns(bars: readonly Candle[]): (PatternId | null)[] {
  const { dojiBody, longShadow, shortShadow } = PATTERN_THRESHOLDS;
  return bars.map((b, i) => {
    const range = b.high - b.low;
    if (!(range > 0)) return null;
    const body = Math.abs(b.close - b.open);
    const upper = b.high - Math.max(b.open, b.close);
    const lower = Math.min(b.open, b.close) - b.low;
    if (body <= dojiBody * range) return "doji";
    if (lower >= longShadow * body && upper <= shortShadow * body) return "hammer";
    if (upper >= longShadow * body && lower <= shortShadow * body) return "shootingStar";
    const p = i > 0 ? bars[i - 1] : null;
    if (p) {
      const pBody = Math.abs(p.close - p.open);
      if (p.close < p.open && b.close > b.open && b.open <= p.close && b.close >= p.open && body > pBody) return "bullEngulf";
      if (p.close > p.open && b.close < b.open && b.open >= p.close && b.close <= p.open && body > pBody) return "bearEngulf";
    }
    return null;
  });
}

export interface PatternMark {
  time: number;
  position: "aboveBar";
  shape: "circle";
  color: string;
  text: string;
}
export const MARK_COLOR = "#64748b";

/** The marks for the latest MAX_MARKED bars: one neutral grey circle above the bar, with the pattern's name. */
export function patternMarks(bars: readonly (Candle & { t: number })[], found: readonly (PatternId | null)[]): PatternMark[] {
  const out: PatternMark[] = [];
  for (let i = Math.max(0, bars.length - MAX_MARKED); i < bars.length; i++) {
    const id = found[i];
    if (id) out.push({ time: bars[i].t, position: "aboveBar", shape: "circle", color: MARK_COLOR, text: patternLabel(id) });
  }
  return out;
}
