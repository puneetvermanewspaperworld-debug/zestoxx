import type { Candle, PulseResult } from "./types";
import { RSI_MIN_BARS, rsiSeries } from "./indicators";

/** What every Pulse score is built from, shown wherever a score is. There is no news in it: no news source is connected. */
export const PULSE_BASIS =
  "Pulse scores are based on price momentum (day change) and RSI positioning. News is not part of the score because no news source is connected.";

export const PULSE_WEIGHTS = { momentum: 0.625, rsi: 0.375 } as const;

export const PULSE_LOADING = "Loading";
export const PULSE_NO_HISTORY = "Not enough price history";

/**
 * Zestoxx Pulse: one composite score (0-100) from the day's price momentum and Wilder's RSI(14) on daily bars, nothing else.
 * Pure: it scores whatever bars it is given. Use `pulseFor` to decide whether there is anything real to score.
 */
export function computePulse(
  symId: string,
  live: Record<string, number>,
  histories: Record<string, Candle[]>,
  prevClose: number
): PulseResult {
  const candles = histories[symId];
  const price = live[symId];
  const momentum = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0; // day change %
  const lastRsi = [...rsiSeries(candles, 14)].reverse().find((v) => v != null) ?? 50;

  const momentumScore = Math.max(-1, Math.min(1, momentum / 3)); // +/-3% maps to +/-1
  const rsiScore = Math.max(-1, Math.min(1, (lastRsi - 50) / 30));

  const blended = momentumScore * PULSE_WEIGHTS.momentum + rsiScore * PULSE_WEIGHTS.rsi; // -1..1
  const score = Math.round((blended + 1) * 50); // 0..100
  const label = score >= 65 ? "Bullish" : score <= 35 ? "Bearish" : "Neutral";
  return { score, label, momentum, rsi: lastRsi, basis: PULSE_BASIS };
}

export type PulseState =
  | { state: "loading"; text: typeof PULSE_LOADING }
  | { state: "no-history"; text: typeof PULSE_NO_HISTORY }
  | { state: "ok"; result: PulseResult };

/**
 * Pulse for a symbol, or the reason there is none. A score needs both the live quote (price and previous close from a feed)
 * and the real candle history from the feed; until both have arrived the symbol is "Loading", and the 250 invented bars every
 * symbol starts with are never scored. With real history but fewer bars than Wilder's RSI needs to settle (RSI_MIN_BARS), there is
 * no score: "Not enough price history".
 */
export function pulseFor(i: {
  symId: string;
  live: Record<string, number>;
  histories: Record<string, Candle[]>;
  prevClose: number;
  hasQuote: boolean;
  hasRealHistory: boolean;
}): PulseState {
  if (!i.hasQuote || !i.hasRealHistory) return { state: "loading", text: PULSE_LOADING };
  if ((i.histories[i.symId]?.length ?? 0) < RSI_MIN_BARS) return { state: "no-history", text: PULSE_NO_HISTORY };
  return { state: "ok", result: computePulse(i.symId, i.live, i.histories, i.prevClose) };
}
