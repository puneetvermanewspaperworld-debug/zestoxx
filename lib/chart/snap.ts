import { timeToLogical, type Viewport } from "./coords";
import type { Anchor } from "./drawings";

/** A bar as far as snapping is concerned. */
export interface SnapBar {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const MAGNET_PX = 32;

/**
 * The magnet: a point snaps to the nearest bar's open, high, low or close when one of them is within `thresholdPx` pixels (measured
 * on the price axis) of the point, and takes that bar's time. Otherwise the point is returned unchanged: it never snaps to something
 * far away. The nearest bar is the one at the point's own x position.
 */
export function snapToCandle(raw: Anchor, bars: readonly SnapBar[], vp: Viewport, thresholdPx = MAGNET_PX): Anchor {
  if (bars.length === 0) return raw;
  const logical = timeToLogical(
    bars.map((b) => b.t),
    raw.time
  );
  if (logical === null) return raw;
  const bar = bars[Math.min(bars.length - 1, Math.max(0, Math.round(logical)))];
  const y = vp.priceToY(raw.price);
  if (y === null) return raw;
  let best: { price: number; d: number } | null = null;
  for (const price of [bar.open, bar.high, bar.low, bar.close]) {
    const py = vp.priceToY(price);
    if (py === null) continue;
    const d = Math.abs(py - y);
    if (best === null || d < best.d) best = { price, d };
  }
  return best && best.d <= thresholdPx ? { time: bar.t, price: best.price } : raw;
}
