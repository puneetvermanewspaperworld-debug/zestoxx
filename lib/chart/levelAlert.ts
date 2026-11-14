import type { PriceAlert } from "@/lib/types";

/**
 * A price alert on a horizontal level. The terminal's alerts are plain `{ symbol, above | below, target }` records with no link to
 * a drawing, so a level and its alert are tied by what they have in common: the symbol and the price. Nothing is added to the alert
 * and nothing about the alert is stored with the drawing (drawings stay in this browser; alerts are saved with the portfolio).
 *
 * "Alert when price crosses" is one alert: it fires the first time the price gets to the level from where it is now, so a level above
 * the price is an "above" alert and a level below it is a "below" alert. Pure.
 */
export type AlertSide = "above" | "below";

/** Which side of the level the price is on now decides the alert: below the level, wait for it to go above; above it, for it to go below. null when the price is at the level (it would fire at once) or unknown. */
export function sideFor(live: number | null | undefined, level: number): AlertSide | null {
  if (live == null || !Number.isFinite(live) || !Number.isFinite(level)) return null;
  if (live < level) return "above";
  if (live > level) return "below";
  return null;
}

export const sameLevel = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

/** The alert that belongs to a level: same symbol, target at the level's price. */
export const findLevelAlert = (alerts: readonly PriceAlert[], symbol: string, price: number): PriceAlert | undefined => alerts.find((a) => a.symbol === symbol && sameLevel(a.target, price));

/** A new alert for a level, or null when the price is at the level or not known. */
export function createLevelAlert(symbol: string, level: number, live: number | null | undefined, createdAt: string, id: number = Date.now() + Math.random()): PriceAlert | null {
  const condition = sideFor(live, level);
  return condition ? { id, symbol, condition, target: level, createdAt } : null;
}

export const removeLevelAlert = (alerts: readonly PriceAlert[], symbol: string, price: number): PriceAlert[] => alerts.filter((a) => !(a.symbol === symbol && sameLevel(a.target, price)));

/**
 * The level moved from `from` to `to`: its alert moves with it. The side is worked out again from the price now (a level dragged across
 * the price would otherwise be an alert that fires at once). Returns the same array when there was no alert for the old price.
 */
export function moveLevelAlert(alerts: readonly PriceAlert[], symbol: string, from: number, to: number, live: number | null | undefined): readonly PriceAlert[] {
  if (sameLevel(from, to) || !findLevelAlert(alerts, symbol, from)) return alerts;
  return alerts.map((a) => (a.symbol === symbol && sameLevel(a.target, from) ? { ...a, target: to, condition: sideFor(live, to) ?? a.condition } : a));
}
