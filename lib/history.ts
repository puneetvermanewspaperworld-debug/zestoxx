import type { Candle, SymbolInfo } from "./types";
import { strSeed, seededRandom } from "./helpers";
import { VOL } from "./symbols";

export function buildHistory(sym: SymbolInfo, count = 250): Candle[] {
  const rand = seededRandom(strSeed(sym.id));
  const vol = VOL[sym.type];
  let price = sym.base * (0.93 + rand() * 0.05);
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (rand() - 0.48) * vol;
    const close = open * (1 + drift);
    const high = Math.max(open, close) * (1 + rand() * vol * 0.5);
    const low = Math.min(open, close) * (1 - rand() * vol * 0.5);
    const volume = Math.round((sym.type === "crypto" ? 3 : 1) * (50000 + rand() * 480000));
    candles.push({ open, high, low, close, volume });
    price = close;
  }
  return candles;
}

/** Aggregate a run of daily candles into coarser weekly/monthly bars, the way a real
 *  charting platform derives higher timeframes from the base daily series. */
export function aggregateCandles(candles: Candle[], groupSize: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += groupSize) {
    const chunk = candles.slice(i, i + groupSize);
    if (chunk.length === 0) continue;
    out.push({
      open: chunk[0].open,
      close: chunk[chunk.length - 1].close,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}
