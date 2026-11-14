import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bollingerBands, emaSeries, maSeries, rsiSeries } from "./indicators";
import { computeCustomSeries } from "./formula";
import { buildHistory } from "./history";
import { DAY, VOLUME_NOT_AVAILABLE, buildChartSeries, chartBounds, compareValues, isoToSec, toPoints, volumeAvailable, withTimes, type TimedCandle } from "./chart/series";
import { defaultView, RIGHT_PAD } from "./chart/view";
import type { Candle, SymbolInfo } from "./types";

/**
 * The new chart must plot what the old SVG chart (components/CandleChart.tsx) plotted. The old chart computed its lines inline; the
 * expressions below are those, copied from it, and the new series must equal them value for value on the same bars.
 */
const SYM: SymbolInfo = { id: "X", name: "X", type: "stock", base: 1000 };
const bars: Candle[] = buildHistory(SYM, 60);
const timed = withTimes(bars, "2026-11-13");

const OLD = {
  // CandleChart.tsx: const ma10 = showMA ? maSeries(candles, 10); ma30 = maSeries(candles, 30); ema20 = emaSeries(candles, 20)
  ma10: maSeries(bars, 10),
  ma30: maSeries(bars, 30),
  ema20: emaSeries(bars, 20),
  // const bb = showBB ? bollingerBands(candles, 20, 2)
  bb: bollingerBands(bars, 20, 2),
};
const values = (pts: { value: number }[] | null) => (pts ?? []).map((p) => p.value);
const nonNull = (a: (number | null)[]) => a.filter((v): v is number => v != null);
const on = { showMA: true, showEMA: true, showBB: true, showVolume: true };

describe("the new chart plots the old chart's values", () => {
  const s = buildChartSeries({ candles: timed, type: "stock", ...on });
  it("candles: the same open, high, low and close on every bar", () => {
    assert.equal(s.candles.length, bars.length);
    s.candles.forEach((c, i) => assert.deepEqual([c.open, c.high, c.low, c.close], [bars[i].open, bars[i].high, bars[i].low, bars[i].close]));
  });
  it("moving averages 10 and 30, and EMA 20: same values, from the same bar on", () => {
    assert.deepEqual(values(s.ma10), nonNull(OLD.ma10));
    assert.deepEqual(values(s.ma30), nonNull(OLD.ma30));
    assert.deepEqual(values(s.ema20), nonNull(OLD.ema20));
    assert.equal(s.ma10?.[0].time, timed[9].t); // MA10 starts on the 10th bar
    assert.equal(s.ma30?.[0].time, timed[29].t);
  });
  it("Bollinger bands (20, 2): same upper and lower values", () => {
    assert.deepEqual(values(s.bbUpper), nonNull(OLD.bb.upper));
    assert.deepEqual(values(s.bbLower), nonNull(OLD.bb.lower));
  });
  it("each point lands on its own bar's time", () => {
    const idx = (a: (number | null)[]) => a.flatMap((v, i) => (v == null ? [] : [timed[i].t]));
    assert.deepEqual(s.ma10?.map((p) => p.time), idx(OLD.ma10));
    assert.deepEqual(s.bbUpper?.map((p) => p.time), idx(OLD.bb.upper));
  });
  it("RSI: the same Wilder values the page worked out", () => {
    const rsi = rsiSeries(bars, 14);
    const r = buildChartSeries({ candles: timed, type: "stock", ...on, rsi });
    assert.deepEqual(values(r.rsi), nonNull(rsi));
  });
  it("custom formula: the same values the formula evaluator gives", () => {
    for (const f of ["sma(20)", "(high+low)/2", "ema(10)", "close*1.01"]) {
      const custom = computeCustomSeries(bars, f).series;
      assert.ok(custom, f);
      const r = buildChartSeries({ candles: timed, type: "stock", ...on, custom });
      assert.deepEqual(values(r.custom), nonNull(custom as (number | null)[]), f);
    }
  });
  it("volume: the old bars' volumes, coloured by direction", () => {
    assert.deepEqual(s.volume?.map((v) => v.value), bars.map((b) => b.volume));
    assert.deepEqual(s.volume?.map((v) => v.up), bars.map((b) => b.close >= b.open));
  });
  it("lines that are switched off are not built", () => {
    const off = buildChartSeries({ candles: timed, type: "stock", showMA: false, showEMA: false, showBB: false, showVolume: false });
    assert.deepEqual([off.ma10, off.ma30, off.ema20, off.bbUpper, off.bbLower, off.volume, off.custom, off.compare, off.rsi], new Array(9).fill(null));
  });
});

describe("the compare line", () => {
  const other = withTimes(buildHistory({ id: "Y", name: "Y", type: "stock", base: 500 }, 60), "2026-11-13");
  const bounds = chartBounds(bars);
  it("is the old chart's normalisation of the other symbol's closes into this chart's price band", () => {
    const got = compareValues(timed, other, bounds);
    const base = other[0].close;
    // CandleChart.tsx: min + ((c.close / base - 1) * 8 + 0.5) * range * 0.5 + range * 0.25
    const old = other.map((c) => bounds.min + ((c.close / base - 1) * 8 + 0.5) * bounds.range * 0.5 + bounds.range * 0.25);
    assert.deepEqual(got, old);
  });
  it("the price band is the highest high and lowest low, widened by Bollinger and custom values like the old chart", () => {
    const b = chartBounds(bars);
    assert.equal(b.max, Math.max(...bars.map((c) => c.high)));
    assert.equal(b.min, Math.min(...bars.map((c) => c.low)));
    const wide = chartBounds(bars, [[b.max + 100, null], [b.min - 50]]);
    assert.equal(wide.max, b.max + 100);
    assert.equal(wide.min, b.min - 50);
    assert.equal(wide.range, wide.max - wide.min);
  });
  it("is matched by date: a bar the other symbol does not have has no point, nothing is shifted", () => {
    const gappy = other.filter((_, i) => i !== 30);
    const got = compareValues(timed, gappy, bounds);
    assert.equal(got[30], null);
    assert.notEqual(got[29], null);
    assert.equal(got[31], compareValues(timed, other, bounds)[31]);
  });
  it("with no bars in common there is no line", () => {
    const far = other.map((c) => ({ ...c, t: c.t + 400 * DAY }));
    assert.ok(compareValues(timed, far, bounds).every((v) => v === null));
  });
  it("is part of the series only when asked", () => {
    const s = buildChartSeries({ candles: timed, type: "stock", ...on, compare: other });
    assert.equal(s.compare?.length, timed.length);
  });
});

describe("volume is never shown when it is not real", () => {
  const withVol: Candle[] = bars.map((b) => ({ ...b, volume: 12345 }));
  const noVol: Candle[] = bars.map((b) => ({ ...b, volume: 0 }));
  it("crypto: no volume, even though its bars carry (invented) numbers", () => {
    assert.equal(volumeAvailable(withVol, "crypto"), false);
    const s = buildChartSeries({ candles: withTimes(withVol, "2026-11-13"), type: "crypto", ...on });
    assert.equal(s.volume, null);
  });
  it("an index reports none: no volume", () => {
    assert.equal(volumeAvailable(noVol, "index"), false);
    assert.equal(buildChartSeries({ candles: withTimes(noVol, "2026-11-13"), type: "index", ...on }).volume, null);
  });
  it("a stock with real volume: shown", () => {
    assert.equal(volumeAvailable(withVol, "stock"), true);
  });
  it("the page says 'Volume not available' where it is not", () => {
    assert.equal(VOLUME_NOT_AVAILABLE, "Volume not available");
  });
});

describe("bar times", () => {
  it("real times are kept as they are", () => {
    const real = bars.slice(0, 5).map((b, i) => ({ ...b, t: isoToSec("2026-11-02") + i * DAY }));
    assert.deepEqual(withTimes(real, "2026-11-13").map((c) => c.t), real.map((c) => c.t));
  });
  it("a series with none gets weekday dates ending on the last weekday on or before today", () => {
    // 14 Nov 2026 is a Saturday: the last bar is Friday 13 Nov
    const t = withTimes(bars.slice(0, 7), "2026-11-14");
    const days = t.map((c) => new Date(c.t * 1000).toISOString().slice(0, 10));
    assert.deepEqual(days, ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].map((d) => d));
    assert.ok(t.every((c) => ![0, 6].includes(new Date(c.t * 1000).getUTCDay())));
  });
  it("mixed real and missing times are all treated as missing: never half real, half invented", () => {
    const mixed = bars.slice(0, 6).map((b, i) => (i < 3 ? { ...b, t: isoToSec("2026-01-05") + i * DAY } : b));
    const t = withTimes(mixed, "2026-11-13");
    assert.equal(t[t.length - 1].t, isoToSec("2026-11-13"));
  });
  it("bars whose time does not increase are dropped, so the chart never gets an unsorted or duplicated time", () => {
    const dup = bars.slice(0, 4).map((b, i) => ({ ...b, t: isoToSec("2026-11-02") + [0, 1, 1, 2][i] * DAY }));
    assert.equal(withTimes(dup, "2026-11-13").length, 3);
  });
  it("points skip missing values and keep their own times", () => {
    assert.deepEqual(toPoints([1, 2, 3], [null, 5, Number.NaN]), [{ time: 2, value: 5 }]);
  });
  it("the history's weekly and monthly bars keep their first day's time", async () => {
    const { aggregateCandles } = await import("./history");
    const real: Candle[] = Array.from({ length: 10 }, (_, i) => ({ t: isoToSec("2026-11-02") + i * DAY, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }));
    const weekly = aggregateCandles(real, 5);
    assert.deepEqual(weekly.map((w) => w.t), [real[0].t, real[5].t]);
  });
});

describe("a timed candle is a candle with a time", () => {
  it("type check only", () => {
    const c: TimedCandle = { t: 1, open: 1, high: 1, low: 1, close: 1, volume: 0 };
    assert.equal(c.t, 1);
  });
});

describe("defaultView: the range a chart opens on and Reset view returns to", () => {
  it("ends a little past the newest bar and starts `keep` bars before it", () => {
    const v = defaultView(271, 130);
    assert.equal(v.to, 270 + RIGHT_PAD);
    assert.equal(v.from, 271 - 130 - 0.5);
  });
  it("never starts before the first bar, whatever the history length", () => {
    assert.equal(defaultView(40, 130).from, -0.5);
    assert.equal(defaultView(0, 130).from, -0.5);
  });
  it("shows the newest candle: it is inside the range", () => {
    for (const [n, keep] of [[271, 130], [60, 60], [500, 22]]) {
      const v = defaultView(n, keep);
      assert.ok(v.from <= n - 1 && v.to >= n - 1);
    }
  });
});
