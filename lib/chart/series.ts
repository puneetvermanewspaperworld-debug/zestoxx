import { bollingerBands, emaSeries, maSeries } from "../indicators";
import type { AssetType, Candle } from "../types";

/**
 * Everything the Trade page chart plots, worked out with the same functions and formulas the old SVG chart used (lib/indicators.ts,
 * lib/formula.ts), so the two agree value for value. Pure: no chart library, no DOM. The chart component only hands these points
 * to Lightweight Charts.
 */
export const DAY = 86_400;

export interface TimedCandle extends Candle {
  t: number;
}
export interface LinePoint {
  /** seconds since the epoch, 00:00 UTC of the bar's calendar day */
  time: number;
  value: number;
}

const isoToSec = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);
const secToIso = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);

/**
 * Bars with a time. Real bars already have one (`t`). A series with none (the app's simulated starting series, which the badge
 * says is "Simulated") is given weekday dates ending on the last weekday on or before `todayIso`, oldest first. Mixed input is
 * treated as having none, so a series is never half real dates and half made-up ones. Bars whose time does not increase are dropped.
 */
export function withTimes(candles: Candle[], todayIso: string): TimedCandle[] {
  let times: number[];
  if (candles.length > 0 && candles.every((c) => typeof c.t === "number" && Number.isFinite(c.t))) {
    times = candles.map((c) => c.t as number);
  } else {
    times = new Array(candles.length);
    let d = isoToSec(todayIso);
    while ([0, 6].includes(new Date(d * 1000).getUTCDay())) d -= DAY;
    for (let i = candles.length - 1; i >= 0; i--) {
      times[i] = d;
      d -= DAY;
      while ([0, 6].includes(new Date(d * 1000).getUTCDay())) d -= DAY;
    }
  }
  const out: TimedCandle[] = [];
  candles.forEach((c, i) => {
    if (out.length === 0 || times[i] > out[out.length - 1].t) out.push({ ...c, t: times[i] });
  });
  return out;
}

/** Crypto volume is not real here (CoinGecko's OHLC has none) and indices report none: no volume panel for them, ever. */
export function volumeAvailable(candles: Candle[], type: AssetType): boolean {
  return type !== "crypto" && candles.some((c) => c.volume > 0);
}
export const VOLUME_NOT_AVAILABLE = "Volume not available";

export const toPoints = (times: number[], values: (number | null | undefined)[]): LinePoint[] =>
  values.flatMap((v, i) => (v == null || !Number.isFinite(v) || times[i] === undefined ? [] : [{ time: times[i], value: v }]));

/** The price band the old chart drew in: the highest high and lowest low, widened by any Bollinger and custom-formula values. */
export function chartBounds(candles: Candle[], extra: (number | null)[][] = []): { min: number; max: number; range: number } {
  let max = Math.max(...candles.map((c) => c.high));
  let min = Math.min(...candles.map((c) => c.low));
  for (const s of extra) {
    const vals = s.filter((v): v is number => v != null);
    if (vals.length) {
      max = Math.max(max, ...vals);
      min = Math.min(min, ...vals);
    }
  }
  return { min, max, range: max - min || 1 };
}

/**
 * The compare line, as the old chart drew it: the other symbol's close relative to its first close, laid into the chart's own price
 * band (`min + ((close / base - 1) * 8 + 0.5) * range * 0.5 + range * 0.25`). It is a shape for comparing moves, not a price, and the
 * page says so. Bars are matched by date, so symbols with different calendars line up where both have a bar; a bar the other symbol
 * does not have has no point.
 */
export function compareValues(primary: TimedCandle[], other: TimedCandle[], bounds: { min: number; range: number }): (number | null)[] {
  const byT = new Map(other.map((c) => [c.t, c]));
  const matched = primary.map((p) => byT.get(p.t) ?? null);
  const base = matched.find((c) => c)?.close;
  if (!base) return primary.map(() => null);
  return matched.map((c) => (c ? bounds.min + ((c.close / base - 1) * 8 + 0.5) * bounds.range * 0.5 + bounds.range * 0.25 : null));
}

export interface ChartSeriesInput {
  candles: TimedCandle[];
  type: AssetType;
  showMA: boolean;
  showEMA: boolean;
  showBB: boolean;
  showVolume: boolean;
  /** the other symbol's bars, when comparing */
  compare?: TimedCandle[] | null;
  /** the custom formula's values, one per bar, aligned with `candles` */
  custom?: (number | null)[] | null;
  /** RSI(14) values, one per bar, aligned with `candles` */
  rsi?: (number | null)[] | null;
}

export interface ChartSeries {
  candles: { time: number; open: number; high: number; low: number; close: number }[];
  /** null when volume is not available (crypto, indices) or not asked for */
  volume: { time: number; value: number; up: boolean }[] | null;
  ma10: LinePoint[] | null;
  ma30: LinePoint[] | null;
  ema20: LinePoint[] | null;
  bbUpper: LinePoint[] | null;
  bbLower: LinePoint[] | null;
  custom: LinePoint[] | null;
  compare: LinePoint[] | null;
  rsi: LinePoint[] | null;
}

/** The old chart's moving averages (10 and 30), EMA 20, Bollinger bands (20, 2), custom formula, compare, volume and RSI, as chart points. */
export function buildChartSeries(i: ChartSeriesInput): ChartSeries {
  const { candles } = i;
  const times = candles.map((c) => c.t);
  const bb = i.showBB ? bollingerBands(candles, 20, 2) : null;
  const bounds = chartBounds(candles, [...(bb ? [bb.upper, bb.lower] : []), ...(i.custom ? [i.custom] : [])]);
  return {
    candles: candles.map((c) => ({ time: c.t, open: c.open, high: c.high, low: c.low, close: c.close })),
    volume: i.showVolume && volumeAvailable(candles, i.type) ? candles.map((c) => ({ time: c.t, value: c.volume, up: c.close >= c.open })) : null,
    ma10: i.showMA ? toPoints(times, maSeries(candles, 10)) : null,
    ma30: i.showMA ? toPoints(times, maSeries(candles, 30)) : null,
    ema20: i.showEMA ? toPoints(times, emaSeries(candles, 20)) : null,
    bbUpper: bb ? toPoints(times, bb.upper) : null,
    bbLower: bb ? toPoints(times, bb.lower) : null,
    custom: i.custom ? toPoints(times, i.custom) : null,
    compare: i.compare ? toPoints(times, compareValues(candles, i.compare, bounds)) : null,
    rsi: i.rsi ? toPoints(times, i.rsi) : null,
  };
}

export { isoToSec, secToIso };
