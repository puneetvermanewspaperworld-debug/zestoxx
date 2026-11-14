/**
 * CoinGecko's key-less OHLC endpoint gives 4-hour bars for a 30-day window: [time ms, open, high, low, close]. Pulse's RSI and the
 * chart's "D" timeframe are daily, so those bars are resampled to daily bars on UTC day boundaries, the way crypto exchanges
 * and CoinGecko itself cut a day (00:00 to 24:00 UTC). A day's bar takes the open of its first 4-hour bar, the highest high, the
 * lowest low and the close of its last 4-hour bar; its time is 00:00 UTC. The newest day is usually partial and the oldest can be.
 * Rows are sorted by time first, so the order CoinGecko sends them in does not matter.
 */
export function resampleToDaily(rows: number[][]): number[][] {
  const DAY = 86_400_000;
  const sorted = [...rows].filter((r) => r.length >= 5 && r.slice(0, 5).every(Number.isFinite)).sort((a, b) => a[0] - b[0]);
  const out: number[][] = [];
  for (const [t, o, h, l, c] of sorted) {
    const day = Math.floor(t / DAY) * DAY;
    const last = out[out.length - 1];
    if (last && last[0] === day) {
      last[2] = Math.max(last[2], h);
      last[3] = Math.min(last[3], l);
      last[4] = c;
    } else {
      out.push([day, o, h, l, c]);
    }
  }
  return out;
}
