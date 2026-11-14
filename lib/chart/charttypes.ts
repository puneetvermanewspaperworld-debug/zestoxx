import type { Candle } from "../types";

/**
 * The chart types of the Trade page and the conversions behind the aggregated ones. Pure: bars in, bars out, no chart library.
 *
 * Candle, hollow candle, bar, line, area and baseline draw the bars as they are. Heikin Ashi, Renko and Line Break are built from the
 * bars first. Renko and Line Break are labelled experimental: their rules are the usual ones and are checked against worked examples,
 * but no published dataset with known values exists for them.
 */
export type ChartType = "candle" | "hollow" | "bar" | "line" | "area" | "baseline" | "ha" | "renko" | "linebreak";

export interface ChartTypeInfo {
  id: ChartType;
  label: string;
  group: "standard" | "aggregated";
  /** the rules are standard but there is no published example with known values to check against */
  experimental?: boolean;
  /** the bars are rebuilt from the data: their times are not the bars' times (see Brick) */
  rebuilt?: boolean;
}

/** In the order the menu shows them. */
export const CHART_TYPES: ChartTypeInfo[] = [
  { id: "candle", label: "Candle", group: "standard" },
  { id: "hollow", label: "Hollow candle", group: "standard" },
  { id: "bar", label: "Bar", group: "standard" },
  { id: "line", label: "Line", group: "standard" },
  { id: "area", label: "Area", group: "standard" },
  { id: "baseline", label: "Baseline", group: "standard" },
  { id: "ha", label: "Heikin Ashi", group: "aggregated" },
  { id: "renko", label: "Renko", group: "aggregated", experimental: true, rebuilt: true },
  { id: "linebreak", label: "3-Line Break", group: "aggregated", experimental: true, rebuilt: true },
];
export const isChartType = (v: unknown): v is ChartType => CHART_TYPES.some((t) => t.id === v);
export const chartTypeInfo = (id: ChartType): ChartTypeInfo => CHART_TYPES.find((t) => t.id === id) as ChartTypeInfo;

/** Whether the drawing tools work on this chart type: Renko and Line Break are not drawn on a time axis, so a drawing's time has no place there. */
export const drawingsAllowed = (id: ChartType): boolean => !chartTypeInfo(id).rebuilt;

/* ---------------------------------------------------------------------------------- Heikin Ashi -- */

/**
 * Heikin Ashi: close = (open + high + low + close) / 4; open = the middle of the previous Heikin Ashi bar's open and close (the first
 * bar's open is the middle of its own open and close); high and low are the extremes of the real high or low and the new open and close.
 * Same times, same volume.
 */
export function toHeikinAshi<T extends Candle>(bars: readonly T[]): T[] {
  const out: T[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  bars.forEach((b, i) => {
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (prevOpen + prevClose) / 2;
    out.push({ ...b, open, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), close });
    prevOpen = open;
    prevClose = close;
  });
  return out;
}

/* ------------------------------------------------------------------------------ Renko, Line Break -- */

/**
 * A bar that is not a time bar. `t` is the real time of the bar of the data that completed it (several bricks can share one), and
 * `src` is that bar's position in the data. Volume is 0: a brick has no volume.
 */
export interface Brick extends Candle {
  t: number;
  src: number;
}

/** Most bricks either conversion will make: a brick size far too small for the data stops here rather than drawing without end. */
export const MAX_BRICKS = 5000;

const brick = (open: number, close: number, t: number, src: number): Brick => ({ t, src, open, close, high: Math.max(open, close), low: Math.min(open, close), volume: 0 });

/**
 * Renko, from closing prices. The bricks sit on a grid of whole multiples of `size` (the first brick starts at the first close
 * rounded to the grid). A brick is added each time the close gets a full `size` past the last brick in its direction; to turn round
 * the close must get a full `size` beyond the OPEN of the last brick (two bricks back from its close), and the new brick is drawn from
 * that open. One bar can make several bricks. The brick size is an input and never worked out from the data, so bricks already drawn
 * do not change when bars are added.
 */
export function toRenko(bars: readonly Candle[], size: number): Brick[] {
  const out: Brick[] = [];
  if (bars.length === 0 || !(size > 0) || !Number.isFinite(size)) return out;
  const eps = size * 1e-9;
  let close = Math.round(bars[0].close / size) * size; // close of the last brick (the first brick starts here)
  let open = close;
  let dir: 0 | 1 | -1 = 0;
  for (let i = 0; i < bars.length && out.length < MAX_BRICKS; i++) {
    const c = bars[i].close;
    const t = bars[i].t ?? i;
    while (out.length < MAX_BRICKS) {
      if (dir >= 0 && c >= close + size - eps) {
        out.push(brick(close, close + size, t, i));
        open = close;
        close += size;
        dir = 1;
      } else if (dir <= 0 && c <= close - size + eps) {
        out.push(brick(close, close - size, t, i));
        open = close;
        close -= size;
        dir = -1;
      } else if (dir === 1 && c <= open - size + eps) {
        out.push(brick(open, open - size, t, i));
        close = open - size;
        dir = -1;
        open = close + size;
      } else if (dir === -1 && c >= open + size - eps) {
        out.push(brick(open, open + size, t, i));
        close = open + size;
        dir = 1;
        open = close - size;
      } else break;
    }
  }
  return out;
}

/**
 * Line Break (three lines by default), from closing prices. The first line runs from the first close to the first different close. After
 * that a line is added when the close goes past the last line's close in its direction (it continues from that close), or, to reverse,
 * when it closes beyond the lowest low (after a rising line) or highest high (after a falling one) of the last `lines` lines; the
 * reversing line is drawn from the last line's open. Several lines in a row are never made from one bar.
 */
export function toLineBreak(bars: readonly Candle[], lines = 3): Brick[] {
  const out: Brick[] = [];
  if (bars.length === 0 || lines < 1) return out;
  const first = bars[0].close;
  for (let i = 1; i < bars.length && out.length < MAX_BRICKS; i++) {
    const c = bars[i].close;
    const t = bars[i].t ?? i;
    const last = out[out.length - 1];
    if (!last) {
      if (c !== first) out.push(brick(first, c, t, i));
      continue;
    }
    const window = out.slice(-lines);
    const hi = Math.max(...window.map((b) => b.high));
    const lo = Math.min(...window.map((b) => b.low));
    if (last.close >= last.open) {
      if (c > last.close) out.push(brick(last.close, c, t, i));
      else if (c < lo) out.push(brick(last.open, c, t, i));
    } else if (c < last.close) out.push(brick(last.close, c, t, i));
    else if (c > hi) out.push(brick(last.open, c, t, i));
  }
  return out;
}

/** Time used for bricks as far as the chart library is concerned: one day apart, in order. The chart shows each brick's real time instead (see the formatter in TradeChart). */
export const ORDINAL_BASE = 946_684_800; // 1 Jan 2000
export const ordinalTime = (k: number): number => ORDINAL_BASE + k * 86_400;
