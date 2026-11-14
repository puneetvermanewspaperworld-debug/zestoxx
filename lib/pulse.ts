import type { Candle, PulseResult } from "./types";
import { rsiSeries } from "./indicators";

/** What every Pulse score is built from, shown wherever a score is. There is no news in it: no news source is connected. */
export const PULSE_BASIS =
  "Pulse scores are based on price momentum (day change) and RSI positioning. News is not part of the score because no news source is connected.";

export const PULSE_WEIGHTS = { momentum: 0.625, rsi: 0.375 } as const;

/** Zestoxx Pulse: one composite score (0-100) from the day's price momentum and RSI positioning, nothing else. */
export function computePulse(
  symId: string,
  live: Record<string, number>,
  histories: Record<string, Candle[]>,
  prevClose: number
): PulseResult {
  const candles = histories[symId];
  const price = live[symId];
  const momentum = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0; // day change %
  const rsiArr = rsiSeries(candles, 14);
  const lastRsi = [...rsiArr].reverse().find((v) => v != null) ?? 50;

  const momentumScore = Math.max(-1, Math.min(1, momentum / 3)); // +/-3% maps to +/-1
  const rsiScore = Math.max(-1, Math.min(1, (lastRsi - 50) / 30));

  const blended = momentumScore * PULSE_WEIGHTS.momentum + rsiScore * PULSE_WEIGHTS.rsi; // -1..1
  const score = Math.round((blended + 1) * 50); // 0..100
  const label = score >= 65 ? "Bullish" : score <= 35 ? "Bearish" : "Neutral";
  return { score, label, momentum, rsi: lastRsi, basis: PULSE_BASIS };
}
