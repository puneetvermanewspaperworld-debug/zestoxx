/**
 * Mapping between (time, price) and screen pixels, in both directions. The chart library knows the pixel position of a bar (its
 * "logical" index) and of a price; this module adds the missing piece, turning a time into a possibly fractional bar index and back,
 * so a drawing anchored between two bars, or past the last one, still has a place. Pure: the chart is passed in as functions.
 */
export const DAY = 86_400;

/** The (possibly fractional) bar index of `time`: exact on a bar, interpolated between two bars, extrapolated at the ends by the end bar spacing. */
export function timeToLogical(times: readonly number[], time: number): number | null {
  const n = times.length;
  if (n === 0 || !Number.isFinite(time)) return null;
  if (n === 1) return (time - times[0]) / DAY;
  if (time <= times[0]) {
    if (Math.floor(time / DAY) === Math.floor(times[0] / DAY)) return 0; // earlier on the first bar's day: that day's first bar
    return (time - times[0]) / (times[1] - times[0]);
  }
  if (time >= times[n - 1]) return n - 1 + (time - times[n - 1]) / (times[n - 1] - times[n - 2]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) lo = mid;
    else hi = mid;
  }
  // A time earlier on the same calendar day as the next bar, in the overnight gap of an intraday chart (what a drawing made on a daily chart
  // has: a bar's day, give or take part of a bar), stands for that day: it is placed on the day's first bar, so it lands inside its own
  // day, not half way back to the day before. On daily and longer charts every bar is at midnight, so this never applies.
  const nextDay = Math.floor(times[lo + 1] / DAY);
  if (Math.floor(time / DAY) === nextDay && Math.floor(times[lo] / DAY) < nextDay) return lo + 1;
  return lo + (time - times[lo]) / (times[lo + 1] - times[lo]);
}

/** The inverse: the time at a (possibly fractional) bar index, rounded to a whole second. */
export function logicalToTime(times: readonly number[], logical: number): number | null {
  const n = times.length;
  if (n === 0 || !Number.isFinite(logical)) return null;
  if (n === 1) return Math.round(times[0] + logical * DAY);
  if (logical <= 0) return Math.round(times[0] + logical * (times[1] - times[0]));
  if (logical >= n - 1) return Math.round(times[n - 1] + (logical - (n - 1)) * (times[n - 1] - times[n - 2]));
  const i = Math.floor(logical);
  return Math.round(times[i] + (logical - i) * (times[i + 1] - times[i]));
}

/** What the drawing layer needs from a chart. Pixels are relative to the plot area's top-left corner. */
export interface Viewport {
  width: number;
  height: number;
  timeToX(time: number): number | null;
  xToTime(x: number): number | null;
  priceToY(price: number): number | null;
  yToPrice(y: number): number | null;
}

export interface ViewportSource {
  /** the bars' times, oldest first */
  times: readonly number[];
  width: number;
  height: number;
  /** bar index to x pixel, and back (the chart's time scale) */
  logicalToX: (logical: number) => number | null;
  xToLogical: (x: number) => number | null;
  /** price to y pixel, and back (the chart's price scale) */
  priceToY: (price: number) => number | null;
  yToPrice: (y: number) => number | null;
}

/** Compose a chart's scales and the bar times into a time/price <-> pixel mapping. */
export function makeViewport(s: ViewportSource): Viewport {
  return {
    width: s.width,
    height: s.height,
    timeToX: (t) => {
      const l = timeToLogical(s.times, t);
      return l === null ? null : s.logicalToX(l);
    },
    xToTime: (x) => {
      const l = s.xToLogical(x);
      return l === null ? null : logicalToTime(s.times, l);
    },
    priceToY: s.priceToY,
    yToPrice: s.yToPrice,
  };
}

/** A pixel point to an anchor, or null when either axis cannot be read. */
export function pixelToAnchor(vp: Viewport, x: number, y: number): { time: number; price: number } | null {
  const time = vp.xToTime(x);
  const price = vp.yToPrice(y);
  return time === null || price === null ? null : { time, price };
}

/** An anchor to a pixel point, or null when it cannot be placed. */
export function anchorToPixel(vp: Viewport, a: { time: number; price: number }): { x: number; y: number } | null {
  const x = vp.timeToX(a.time);
  const y = vp.priceToY(a.price);
  return x === null || y === null ? null : { x, y };
}
