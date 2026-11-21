import type { RangeId, IntervalId } from "./chart/intervals";

/**
 * GTT (good till triggered) and stop-loss orders. An order waits for the price to cross a trigger, then trades at once at that price
 * (a market order in the paper account). Zestoxx cannot watch prices while it is closed, so:
 *   - while the app is open, a tick that crosses the trigger fills it (a real fill, at the price that crossed);
 *   - on the next visit the app asks for the candles since the order was placed and fills it at the first candle that crossed the trigger,
 *     at the trigger price (or at that candle's open if the price gapped past it), and says the fill is simulated.
 * A stop-loss is a GTT that sells below the price; a target is one that sells above it.
 */
export type Direction = "above" | "below";

/** The side of the trigger the price has to reach: above when the trigger is over the price now, below when it is under it. */
export const triggerDirection = (trigger: number, priceNow: number): Direction => (trigger > priceNow ? "above" : "below");

export type GttKind = "Stop-loss" | "Target" | "Buy on breakout" | "Buy on dip";
export function gttKind(side: "buy" | "sell", direction: Direction): GttKind {
  if (side === "sell") return direction === "below" ? "Stop-loss" : "Target";
  return direction === "above" ? "Buy on breakout" : "Buy on dip";
}

/** An error message for an order that cannot be placed, or null. The trigger must be a real distance from the price or it would fire at once. */
export function gttError(o: { side: "buy" | "sell"; qty: number; trigger: number; priceNow: number; heldQty: number; cash: number }): string | null {
  if (!Number.isInteger(o.qty) || o.qty < 1) return "Quantity must be a whole number of 1 or more.";
  if (!(o.trigger > 0) || !Number.isFinite(o.trigger)) return "Enter a trigger price above 0.";
  if (Math.abs(o.trigger - o.priceNow) / o.priceNow < 0.0005) return "The trigger is too close to the price now: it would fire at once. Pick a price a little further away.";
  if (o.side === "sell" && o.heldQty < o.qty) return o.heldQty > 0 ? `You hold ${o.heldQty}. A stop-loss or target can only sell what you hold.` : "You do not hold this symbol, and paper trading cannot short sell.";
  if (o.side === "buy" && o.qty * o.trigger > o.cash) return "Not enough virtual cash to buy that quantity at the trigger price.";
  return null;
}

export interface Bar {
  /** epoch ms at the start of the candle */
  t: number;
  o: number;
  h: number;
  l: number;
}

/**
 * The first candle, starting at or after the order was placed, that crossed the trigger, and the price it fills at: the trigger itself, or
 * the candle's open when the price had already gone past the trigger by then (a gap). Null when no candle crossed. The candle the order was
 * placed in is skipped: part of it was before the order existed.
 */
export function firstCrossing(bars: readonly Bar[], o: { trigger: number; direction: Direction; placedAtMs: number }): { t: number; price: number; gapped: boolean } | null {
  for (const b of bars) {
    if (b.t < o.placedAtMs) continue;
    if (o.direction === "above" && b.h >= o.trigger) return b.o >= o.trigger ? { t: b.t, price: b.o, gapped: true } : { t: b.t, price: o.trigger, gapped: false };
    if (o.direction === "below" && b.l <= o.trigger) return b.o <= o.trigger ? { t: b.t, price: b.o, gapped: true } : { t: b.t, price: o.trigger, gapped: false };
  }
  return null;
}

/** Which candles to ask for to cover the time since an order was placed: the finest the feed offers for that span, or null when it is too long ago. */
export function catchUpWindow(sinceMs: number, nowMs: number): { range: RangeId; interval: IntervalId; barMs: number } | null {
  const days = (nowMs - sinceMs) / 86_400_000;
  if (days <= 6) return { range: "5D", interval: "5m", barMs: 300_000 };
  if (days <= 30) return { range: "1M", interval: "5m", barMs: 300_000 };
  if (days <= 90) return { range: "3M", interval: "15m", barMs: 900_000 };
  if (days <= 180) return { range: "6M", interval: "30m", barMs: 1_800_000 };
  return null;
}
