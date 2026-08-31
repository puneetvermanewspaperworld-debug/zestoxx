import type { Candle, PulseResult } from "./types";
import { rsiSeries } from "./indicators";
import { NEWS } from "./symbols";

/** Zestoxx Pulse — a single composite score (0-100) blending momentum, RSI positioning,
 *  and news sentiment for a symbol. This is the cross-asset "edge" signal none of the
 *  reference apps show as one number — the idea being to make a call faster than
 *  flipping between a charting app, a news app and an options app separately. */
export function computePulse(
  symId: string,
  live: Record<string, number>,
  histories: Record<string, Candle[]>
): PulseResult {
  const candles = histories[symId];
  const open = candles[0].open;
  const price = live[symId];
  const momentum = ((price - open) / open) * 100; // day change %
  const rsiArr = rsiSeries(candles, 14);
  const lastRsi = [...rsiArr].reverse().find((v) => v != null) ?? 50;
  const newsHits = NEWS.filter((n) => n.tag === symId);
  const newsScore = newsHits.reduce(
    (s, n) => s + (n.sentiment === "bullish" ? 1 : n.sentiment === "bearish" ? -1 : 0),
    0
  );

  const momentumScore = Math.max(-1, Math.min(1, momentum / 3)); // +/-3% maps to +/-1
  const rsiScore = Math.max(-1, Math.min(1, (lastRsi - 50) / 30));
  const newsScoreNorm = Math.max(-1, Math.min(1, newsScore / 2));

  const blended = momentumScore * 0.5 + rsiScore * 0.3 + newsScoreNorm * 0.2; // -1..1
  const score = Math.round((blended + 1) * 50); // 0..100
  const label = score >= 65 ? "Bullish" : score <= 35 ? "Bearish" : "Neutral";
  return { score, label, momentum, rsi: lastRsi, newsScore };
}
