import { rsiSeries } from "../indicators";
import type { Candle } from "../types";

/**
 * The studies (indicators) of the Trade page: the maths, the list the menu shows, how their parameters are checked, and when a study
 * cannot be shown. Pure: bars in, numbers out. A value is null where it cannot be worked out yet (not enough bars, or a zero range),
 * never a guess. Volume is only ever used as the feed gives it: a study that needs volume is unavailable without it.
 *
 * How each is checked: RSI, ATR, ADX, Stochastic, CCI, Williams %R, ROC, Accumulation/Distribution and Bollinger Bands against published
 * worked examples with known values (lib/chart/fixtures/stockcharts.ts); the others against small examples worked by hand from their
 * usual definitions. Supertrend, Donchian Channels and the Awesome Oscillator have no published reference and are marked experimental.
 */
export type Num = number | null;
const isNum = (v: Num | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/* ------------------------------------------------------------------------------------- maths -- */

/** Simple moving average of `n` values; a value needs `n` values in a row. */
export function smaOf(values: readonly Num[], n: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let run = 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) {
      run = 0;
      sum = 0;
      continue;
    }
    run++;
    sum += v;
    if (run > n) sum -= values[i - n] as number;
    if (run >= n) out[i] = sum / n;
  }
  return out;
}

/** Exponential moving average, starting from the simple average of the first `n` values (the usual way); smoothing 2 / (n + 1). */
export function emaOf(values: readonly Num[], n: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let run = 0;
  let sum = 0;
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) {
      run = 0;
      sum = 0;
      prev = null;
      continue;
    }
    run++;
    if (prev === null) {
      sum += v;
      if (run === n) {
        prev = sum / n;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder's smoothing: the first value is the plain average of the first `n` values, then (previous x (n - 1) + value) / n. */
export function wilderOf(values: readonly Num[], n: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let run = 0;
  let sum = 0;
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) {
      run = 0;
      sum = 0;
      prev = null;
      continue;
    }
    run++;
    if (prev === null) {
      sum += v;
      if (run === n) {
        prev = sum / n;
        out[i] = prev;
      }
    } else {
      prev = (prev * (n - 1) + v) / n;
      out[i] = prev;
    }
  }
  return out;
}

/** Population standard deviation over `n` values (what Bollinger Bands use). */
export function stdevOf(values: readonly Num[], n: number): Num[] {
  const mean = smaOf(values, n);
  return values.map((_, i) => {
    const m = mean[i];
    if (!isNum(m)) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += ((values[j] as number) - m) ** 2;
    return Math.sqrt(s / n);
  });
}

const rolling = (values: readonly number[], n: number, pick: (a: number, b: number) => number): Num[] =>
  values.map((_, i) => {
    if (i < n - 1) return null;
    let m = values[i - n + 1];
    for (let j = i - n + 2; j <= i; j++) m = pick(m, values[j]);
    return m;
  });
export const highestOf = (values: readonly number[], n: number): Num[] => rolling(values, n, Math.max);
export const lowestOf = (values: readonly number[], n: number): Num[] => rolling(values, n, Math.min);

/** True range. With `firstBar: "range"` the first bar's is its high minus low (how ATR is usually started); with "none" it has no value (how ADX starts). */
export function trueRange(bars: readonly Candle[], firstBar: "range" | "none" = "range"): Num[] {
  return bars.map((b, i) => {
    if (i === 0) return firstBar === "range" ? b.high - b.low : null;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

const zip2 = (a: readonly Num[], b: readonly Num[], f: (x: number, y: number) => Num): Num[] => a.map((x, i) => (isNum(x) && isNum(b[i]) ? f(x, b[i] as number) : null));
const closes = (b: readonly Candle[]) => b.map((x) => x.close);

/* ------------------------------------------------------------------------------------ the list -- */

export interface StudyParam {
  key: string;
  label: string;
  def: number;
  min: number;
  max: number;
  integer: boolean;
  step: number;
}
export interface StudyOutput {
  key: string;
  label: string;
  color: string;
  kind: "line" | "histogram";
  width?: 1 | 2;
  dashed?: boolean;
  /** how a histogram is coloured: by its sign, or by whether it rose from the bar before */
  hist?: "sign" | "change";
}
export interface StudyDef {
  id: string;
  /** the name on a legend chip: "RSI", "BB" */
  short: string;
  name: string;
  placement: "overlay" | "pane";
  params: StudyParam[];
  outputs: StudyOutput[];
  /** horizontal reference lines in a pane (30 and 70 for RSI) */
  levels?: number[];
  /** a pane with a fixed scale */
  range?: [number, number];
  needs?: "volume" | "intraday" | "volume+intraday";
  experimental?: boolean;
  /** extra rule across parameters; a message, or null when fine */
  check?: (p: Record<string, number>) => string | null;
  compute: (bars: readonly Candle[], p: Record<string, number>) => Record<string, Num[]>;
}

export const MAX_PERIOD = 500;
const period = (key: string, label: string, def: number, max = MAX_PERIOD): StudyParam => ({ key, label, def, min: 1, max, integer: true, step: 1 });
const mult = (key: string, label: string, def: number): StudyParam => ({ key, label, def, min: 0.1, max: 10, integer: false, step: 0.1 });

const UP = "#10b981";
const DOWN = "#f43f5e";
const C = ["#f59e0b", "#2563eb", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
/** Colours handed to the lines of single-line studies in turn, so two moving averages do not look alike. */
export const INSTANCE_COLORS = C;

const line = (key: string, label: string, color: string, extra: Partial<StudyOutput> = {}): StudyOutput => ({ key, label, color, kind: "line", ...extra });

function bollinger(b: readonly Candle[], n: number, k: number) {
  const c = closes(b);
  const mid = smaOf(c, n);
  const sd = stdevOf(c, n);
  return { mid, upper: zip2(mid, sd, (m, s) => m + k * s), lower: zip2(mid, sd, (m, s) => m - k * s) };
}

export const STUDIES: StudyDef[] = [
  {
    id: "sma",
    short: "SMA",
    name: "Moving average (SMA)",
    placement: "overlay",
    params: [period("n", "Period", 20)],
    outputs: [line("sma", "SMA", C[0], { width: 2 })],
    compute: (b, p) => ({ sma: smaOf(closes(b), p.n) }),
  },
  {
    id: "ema",
    short: "EMA",
    name: "Moving average (EMA)",
    placement: "overlay",
    params: [period("n", "Period", 20)],
    outputs: [line("ema", "EMA", C[2], { width: 2 })],
    compute: (b, p) => ({ ema: emaOf(closes(b), p.n) }),
  },
  {
    id: "bb",
    short: "BB",
    name: "Bollinger Bands",
    placement: "overlay",
    params: [period("n", "Period", 20), mult("k", "Deviations", 2)],
    outputs: [line("upper", "Upper", C[1]), line("mid", "Middle", C[1], { dashed: true }), line("lower", "Lower", C[1])],
    compute: (b, p) => bollinger(b, p.n, p.k),
  },
  {
    id: "keltner",
    short: "KC",
    name: "Keltner Channels",
    placement: "overlay",
    params: [period("n", "EMA period", 20), period("atr", "ATR period", 10), mult("k", "Multiplier", 2)],
    outputs: [line("upper", "Upper", C[3]), line("mid", "Middle", C[3], { dashed: true }), line("lower", "Lower", C[3])],
    compute: (b, p) => {
      const mid = emaOf(closes(b), p.n);
      const atr = wilderOf(trueRange(b), p.atr);
      return { mid, upper: zip2(mid, atr, (m, a) => m + p.k * a), lower: zip2(mid, atr, (m, a) => m - p.k * a) };
    },
  },
  {
    id: "donchian",
    short: "DC",
    name: "Donchian Channels",
    placement: "overlay",
    experimental: true,
    params: [period("n", "Period", 20)],
    outputs: [line("upper", "Upper", C[4]), line("mid", "Middle", C[4], { dashed: true }), line("lower", "Lower", C[4])],
    compute: (b, p) => {
      const upper = highestOf(b.map((x) => x.high), p.n);
      const lower = lowestOf(b.map((x) => x.low), p.n);
      return { upper, lower, mid: zip2(upper, lower, (u, l) => (u + l) / 2) };
    },
  },
  {
    id: "vwap",
    short: "VWAP",
    name: "VWAP",
    placement: "overlay",
    needs: "volume+intraday",
    params: [],
    outputs: [line("vwap", "VWAP", C[0], { width: 2 })],
    compute: (b) => {
      let pv = 0;
      let vv = 0;
      let day = NaN;
      return {
        vwap: b.map((x) => {
          const d = Math.floor((x.t ?? 0) / 86_400);
          if (d !== day) {
            day = d;
            pv = 0;
            vv = 0;
          }
          pv += ((x.high + x.low + x.close) / 3) * x.volume;
          vv += x.volume;
          return vv > 0 ? pv / vv : null;
        }),
      };
    },
  },
  {
    id: "supertrend",
    short: "Supertrend",
    name: "Supertrend",
    placement: "overlay",
    experimental: true,
    params: [period("n", "ATR period", 10), mult("k", "Multiplier", 3)],
    outputs: [line("up", "Up", UP, { width: 2 }), line("down", "Down", DOWN, { width: 2 })],
    compute: (b, p) => {
      const atr = wilderOf(trueRange(b), p.n);
      const up: Num[] = [];
      const down: Num[] = [];
      let lower = NaN;
      let upper = NaN;
      let trend = 1;
      b.forEach((x, i) => {
        const a = atr[i];
        if (!isNum(a)) {
          up.push(null);
          down.push(null);
          return;
        }
        const hl2 = (x.high + x.low) / 2;
        let lo = hl2 - p.k * a;
        let hi = hl2 + p.k * a;
        const prevClose = i > 0 ? b[i - 1].close : x.close;
        if (Number.isFinite(lower) && prevClose > lower) lo = Math.max(lo, lower);
        if (Number.isFinite(upper) && prevClose < upper) hi = Math.min(hi, upper);
        if (Number.isFinite(upper) && trend === -1 && x.close > upper) trend = 1;
        else if (Number.isFinite(lower) && trend === 1 && x.close < lower) trend = -1;
        lower = lo;
        upper = hi;
        up.push(trend === 1 ? lo : null);
        down.push(trend === -1 ? hi : null);
      });
      return { up, down };
    },
  },
  {
    id: "volume",
    short: "Volume",
    name: "Volume",
    placement: "overlay",
    needs: "volume",
    params: [],
    outputs: [{ key: "volume", label: "Volume", color: "#94a3b8", kind: "histogram" }],
    compute: (b) => ({ volume: b.map((x) => x.volume) }),
  },
  {
    id: "rsi",
    short: "RSI",
    name: "Relative Strength Index (RSI)",
    placement: "pane",
    params: [period("n", "Period", 14)],
    outputs: [line("rsi", "RSI", C[2], { width: 2 })],
    levels: [30, 70],
    range: [0, 100],
    compute: (b, p) => ({ rsi: rsiSeries(b as Candle[], p.n) }),
  },
  {
    id: "macd",
    short: "MACD",
    name: "MACD",
    placement: "pane",
    params: [period("fast", "Fast", 12), period("slow", "Slow", 26), period("signal", "Signal", 9)],
    outputs: [{ key: "hist", label: "Histogram", color: UP, kind: "histogram", hist: "change" }, line("macd", "MACD", C[1]), line("signal", "Signal", C[0])],
    levels: [0],
    check: (p) => (p.fast >= p.slow ? "Fast must be shorter than Slow." : null),
    compute: (b, p) => {
      const c = closes(b);
      const macd = zip2(emaOf(c, p.fast), emaOf(c, p.slow), (f, s) => f - s);
      const signal = emaOf(macd, p.signal);
      return { macd, signal, hist: zip2(macd, signal, (m, s) => m - s) };
    },
  },
  {
    id: "stoch",
    short: "Stoch",
    name: "Stochastic Oscillator",
    placement: "pane",
    params: [period("n", "%K period", 14), period("smooth", "%K smoothing", 3), period("d", "%D period", 3)],
    outputs: [line("k", "%K", C[1]), line("d", "%D", C[0])],
    levels: [20, 80],
    range: [0, 100],
    compute: (b, p) => {
      const hh = highestOf(b.map((x) => x.high), p.n);
      const ll = lowestOf(b.map((x) => x.low), p.n);
      const fast: Num[] = b.map((x, i) => (isNum(hh[i]) && isNum(ll[i]) && hh[i] !== ll[i] ? (100 * (x.close - (ll[i] as number))) / ((hh[i] as number) - (ll[i] as number)) : null));
      const k = smaOf(fast, p.smooth);
      return { k, d: smaOf(k, p.d) };
    },
  },
  {
    id: "adx",
    short: "ADX",
    name: "Average Directional Index (ADX)",
    placement: "pane",
    params: [period("n", "Period", 14)],
    outputs: [line("plusDi", "+DI", UP), line("minusDi", "-DI", DOWN), line("adx", "ADX", C[0], { width: 2 })],
    compute: (b, p) => {
      const tr = trueRange(b, "none");
      const plusDm: Num[] = b.map((x, i) => {
        if (i === 0) return null;
        const up = x.high - b[i - 1].high;
        const dn = b[i - 1].low - x.low;
        return up > dn && up > 0 ? up : 0;
      });
      const minusDm: Num[] = b.map((x, i) => {
        if (i === 0) return null;
        const up = x.high - b[i - 1].high;
        const dn = b[i - 1].low - x.low;
        return dn > up && dn > 0 ? dn : 0;
      });
      const atr = wilderOf(tr, p.n);
      const plusDi = zip2(wilderOf(plusDm, p.n), atr, (d, a) => (a > 0 ? (100 * d) / a : null));
      const minusDi = zip2(wilderOf(minusDm, p.n), atr, (d, a) => (a > 0 ? (100 * d) / a : null));
      const dx = zip2(plusDi, minusDi, (x, y) => (x + y > 0 ? (100 * Math.abs(x - y)) / (x + y) : 0));
      return { plusDi, minusDi, adx: wilderOf(dx, p.n) };
    },
  },
  {
    id: "atr",
    short: "ATR",
    name: "Average True Range (ATR)",
    placement: "pane",
    params: [period("n", "Period", 14)],
    outputs: [line("atr", "ATR", C[0], { width: 2 })],
    compute: (b, p) => ({ atr: wilderOf(trueRange(b), p.n) }),
  },
  {
    id: "cci",
    short: "CCI",
    name: "Commodity Channel Index (CCI)",
    placement: "pane",
    params: [period("n", "Period", 20)],
    outputs: [line("cci", "CCI", C[4], { width: 2 })],
    levels: [-100, 100],
    compute: (b, p) => {
      const tp = b.map((x) => (x.high + x.low + x.close) / 3);
      const m = smaOf(tp, p.n);
      return {
        cci: tp.map((x, i) => {
          const mean = m[i];
          if (!isNum(mean)) return null;
          let dev = 0;
          for (let j = i - p.n + 1; j <= i; j++) dev += Math.abs(tp[j] - mean);
          dev /= p.n;
          return dev > 0 ? (x - mean) / (0.015 * dev) : null;
        }),
      };
    },
  },
  {
    id: "willr",
    short: "%R",
    name: "Williams %R",
    placement: "pane",
    params: [period("n", "Period", 14)],
    outputs: [line("r", "%R", C[5], { width: 2 })],
    levels: [-20, -80],
    range: [-100, 0],
    compute: (b, p) => {
      const hh = highestOf(b.map((x) => x.high), p.n);
      const ll = lowestOf(b.map((x) => x.low), p.n);
      return { r: b.map((x, i) => (isNum(hh[i]) && isNum(ll[i]) && hh[i] !== ll[i] ? (-100 * ((hh[i] as number) - x.close)) / ((hh[i] as number) - (ll[i] as number)) : null)) };
    },
  },
  {
    id: "roc",
    short: "ROC",
    name: "Rate of Change (ROC)",
    placement: "pane",
    params: [period("n", "Period", 12)],
    outputs: [line("roc", "ROC", C[3], { width: 2 })],
    levels: [0],
    compute: (b, p) => ({ roc: b.map((x, i) => (i >= p.n && b[i - p.n].close !== 0 ? 100 * (x.close / b[i - p.n].close - 1) : null)) }),
  },
  {
    id: "aroon",
    short: "Aroon",
    name: "Aroon",
    placement: "pane",
    params: [period("n", "Period", 25)],
    outputs: [line("up", "Up", UP), line("down", "Down", DOWN)],
    range: [0, 100],
    compute: (b, p) => {
      const up: Num[] = [];
      const down: Num[] = [];
      b.forEach((_, i) => {
        if (i < p.n) {
          up.push(null);
          down.push(null);
          return;
        }
        // bars since the highest high / lowest low of the last n + 1 bars (the latest one, on a tie)
        let hi = i - p.n;
        let lo = i - p.n;
        for (let j = i - p.n; j <= i; j++) {
          if (b[j].high >= b[hi].high) hi = j;
          if (b[j].low <= b[lo].low) lo = j;
        }
        up.push((100 * (p.n - (i - hi))) / p.n);
        down.push((100 * (p.n - (i - lo))) / p.n);
      });
      return { up, down };
    },
  },
  {
    id: "bbpb",
    short: "%b",
    name: "Bollinger %b",
    placement: "pane",
    params: [period("n", "Period", 20), mult("k", "Deviations", 2)],
    outputs: [line("pb", "%b", C[1], { width: 2 })],
    levels: [0, 1],
    compute: (b, p) => {
      const { upper, lower } = bollinger(b, p.n, p.k);
      return { pb: b.map((x, i) => (isNum(upper[i]) && isNum(lower[i]) && upper[i] !== lower[i] ? (x.close - (lower[i] as number)) / ((upper[i] as number) - (lower[i] as number)) : null)) };
    },
  },
  {
    id: "bbw",
    short: "BBW",
    name: "Bollinger BandWidth",
    placement: "pane",
    params: [period("n", "Period", 20), mult("k", "Deviations", 2)],
    outputs: [line("bw", "BandWidth", C[1], { width: 2 })],
    compute: (b, p) => {
      const { upper, lower, mid } = bollinger(b, p.n, p.k);
      return { bw: b.map((_, i) => (isNum(upper[i]) && isNum(lower[i]) && isNum(mid[i]) && mid[i] !== 0 ? (100 * ((upper[i] as number) - (lower[i] as number))) / (mid[i] as number) : null)) };
    },
  },
  {
    id: "bop",
    short: "BoP",
    name: "Balance of Power",
    placement: "pane",
    params: [period("n", "Smoothing", 14)],
    outputs: [line("bop", "BoP", C[1], { width: 2 })],
    levels: [0],
    compute: (b, p) => ({ bop: smaOf(b.map((x) => (x.high === x.low ? 0 : (x.close - x.open) / (x.high - x.low))), p.n) }),
  },
  {
    id: "ao",
    short: "AO",
    name: "Awesome Oscillator",
    placement: "pane",
    experimental: true,
    params: [],
    outputs: [{ key: "ao", label: "AO", color: UP, kind: "histogram", hist: "change" }],
    levels: [0],
    compute: (b) => {
      const mid = b.map((x) => (x.high + x.low) / 2);
      return { ao: zip2(smaOf(mid, 5), smaOf(mid, 34), (f, s) => f - s) };
    },
  },
  {
    id: "obv",
    short: "OBV",
    name: "On Balance Volume (OBV)",
    placement: "pane",
    needs: "volume",
    params: [],
    outputs: [line("obv", "OBV", C[1], { width: 2 })],
    compute: (b) => {
      let s = 0;
      return { obv: b.map((x, i) => (i === 0 ? 0 : (s += x.close > b[i - 1].close ? x.volume : x.close < b[i - 1].close ? -x.volume : 0))) };
    },
  },
  {
    id: "ad",
    short: "A/D",
    name: "Accumulation/Distribution",
    placement: "pane",
    needs: "volume",
    params: [],
    outputs: [line("ad", "A/D", C[2], { width: 2 })],
    compute: (b) => {
      let s = 0;
      return { ad: b.map((x) => (s += x.high === x.low ? 0 : (((x.close - x.low) - (x.high - x.close)) / (x.high - x.low)) * x.volume)) };
    },
  },
];

export const STUDY_MAP: Record<string, StudyDef> = Object.fromEntries(STUDIES.map((s) => [s.id, s]));

/* ------------------------------------------------------------------------- parameters, instances -- */

export interface StudyInstance {
  /** unique within the chart; lets two of the same study (two moving averages) be told apart */
  uid: number;
  id: string;
  params: Record<string, number>;
  /** the colour of a single-line study (so two moving averages differ) */
  color?: string;
}

export const defaultParams = (def: StudyDef): Record<string, number> => Object.fromEntries(def.params.map((q) => [q.key, q.def]));

/** "RSI (14)", "MACD (12, 26, 9)" */
export const studyTitle = (def: StudyDef, p: Record<string, number>): string => (def.params.length ? `${def.short} (${def.params.map((q) => p[q.key] ?? q.def).join(", ")})` : def.short);

export type ParamCheck = { ok: true; values: Record<string, number> } | { ok: false; errors: Record<string, string>; message: string };

/**
 * Check what was typed for a study's parameters. Every period must be a whole number from 1 to MAX_PERIOD; a multiplier is a number
 * from 0.1 to 10. Nothing is rounded or clamped silently: a bad entry is refused with a message saying what is allowed.
 */
export function checkParams(def: StudyDef, input: Record<string, unknown>): ParamCheck {
  const values: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const q of def.params) {
    const raw = input[q.key];
    const v = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (!Number.isFinite(v)) errors[q.key] = `${q.label} must be ${q.integer ? "a whole number" : "a number"} from ${q.min} to ${q.max}.`;
    else if (q.integer && !Number.isInteger(v)) errors[q.key] = `${q.label} must be a whole number from ${q.min} to ${q.max}.`;
    else if (v < q.min || v > q.max) errors[q.key] = `${q.label} must be from ${q.min} to ${q.max}.`;
    else values[q.key] = v;
  }
  if (Object.keys(errors).length === 0 && def.check) {
    const m = def.check(values);
    if (m) return { ok: false, errors: { _: m }, message: m };
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors, message: Object.values(errors)[0] };
  return { ok: true, values };
}

/** Bars, with every parameter taken from the instance (a missing one falls back to the study's default). */
export function computeStudy(def: StudyDef, bars: readonly Candle[], params: Record<string, number>): Record<string, Num[]> {
  return def.compute(bars, { ...defaultParams(def), ...params });
}

export const REQUIRES_VOLUME = "Requires volume";
export const INTRADAY_ONLY = "Intraday charts only";

export interface StudyContext {
  /** the feed gave real volume for these bars */
  hasVolume: boolean;
  /** the bars are shorter than a day */
  intraday: boolean;
}
export type Availability = { ok: true } | { ok: false; reason: string };

/** Whether a study can be shown on these bars, and if not why: volume studies need real volume, VWAP needs intraday bars too. */
export function studyAvailability(def: StudyDef, ctx: StudyContext): Availability {
  const needsVolume = def.needs === "volume" || def.needs === "volume+intraday";
  const needsIntraday = def.needs === "intraday" || def.needs === "volume+intraday";
  if (needsVolume && !ctx.hasVolume) return { ok: false, reason: REQUIRES_VOLUME };
  if (needsIntraday && !ctx.intraday) return { ok: false, reason: INTRADAY_ONLY };
  return { ok: true };
}

/** A search over the study names, case-insensitive, matching any word typed. */
export function searchStudies(query: string): StudyDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return STUDIES;
  return STUDIES.filter((s) => {
    const hay = `${s.name} ${s.id}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
