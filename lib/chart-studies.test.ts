import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bollingerBands, emaSeries, maSeries, rsiSeries } from "./indicators";
import { INTRADAY_ONLY, MAX_PERIOD, REQUIRES_VOLUME, STUDIES, STUDY_MAP, checkParams, computeStudy, defaultParams, emaOf, highestOf, lowestOf, searchStudies, smaOf, stdevOf, studyAvailability, studyTitle, trueRange, wilderOf, type Num } from "./chart/studies";
import { AD_FIXTURE, ADX_FIXTURE, ATR_FIXTURE, BB_FIXTURE, CCI_FIXTURE, ROC_FIXTURE, STOCH_FIXTURE, WILLR_FIXTURE } from "./chart/fixtures/stockcharts";
import type { Candle } from "./types";

const bars = (f: { high: Num[]; low: Num[]; close: Num[]; volume?: Num[] }): Candle[] => f.close.map((c, i) => ({ open: c as number, high: f.high[i] as number, low: f.low[i] as number, close: c as number, volume: (f.volume?.[i] as number) ?? 0 }));
const run = (id: string, b: Candle[], p: Record<string, number> = {}) => computeStudy(STUDY_MAP[id], b, p);

/** every published value must be matched, and a null in the published column must be a null in ours */
function matches(ours: Num[], published: Num[], tol: number, label: string) {
  assert.equal(ours.length, published.length, `${label}: length`);
  let compared = 0;
  published.forEach((v, i) => {
    if (v === null) {
      assert.equal(ours[i], null, `${label}[${i}] should have no value yet`);
    } else {
      assert.ok(ours[i] !== null && Math.abs((ours[i] as number) - v) <= tol, `${label}[${i}]: ${ours[i]} vs published ${v}`);
      compared++;
    }
  });
  assert.ok(compared >= 5, `${label}: compared ${compared} values`);
}

describe("studies checked against published worked examples (StockCharts ChartSchool spreadsheets, numbers only)", () => {
  it("Average True Range (14): true range and ATR match", () => {
    const b = bars(ATR_FIXTURE);
    matches(trueRange(b), ATR_FIXTURE.tr, 1e-4, "TR");
    matches(run("atr", b, { n: 14 }).atr, ATR_FIXTURE.atr, 1e-4, "ATR");
  });
  it("Stochastic Oscillator: the 14-day %K matches; the smoothed %K and %D are plain averages of it", () => {
    const b = bars(STOCH_FIXTURE);
    const r = run("stoch", b, { n: 14, smooth: 1, d: 1 });
    matches(r.k, STOCH_FIXTURE.k14, 1e-4, "%K(14)");
    const slow = run("stoch", b, { n: 14, smooth: 3, d: 3 });
    const k = STOCH_FIXTURE.k14 as number[];
    for (let i = 15; i < k.length; i++) assert.ok(Math.abs((slow.k[i] as number) - (k[i] + k[i - 1] + k[i - 2]) / 3) < 1e-4);
    assert.equal(slow.k[14], null); // needs three %K values
    for (let i = 17; i < k.length; i++) assert.ok(Math.abs((slow.d[i] as number) - ((slow.k[i] as number) + (slow.k[i - 1] as number) + (slow.k[i - 2] as number)) / 3) < 1e-9);
  });
  it("Average Directional Index (14): +DI, -DI and ADX match, from the first value on", () => {
    const b = bars(ADX_FIXTURE);
    const r = run("adx", b, { n: 14 });
    matches(r.plusDi, ADX_FIXTURE.plusDi, 1e-3, "+DI");
    matches(r.minusDi, ADX_FIXTURE.minusDi, 1e-3, "-DI");
    matches(r.adx, ADX_FIXTURE.adx, 1e-3, "ADX");
  });
  it("Commodity Channel Index (20) matches", () => matches(run("cci", bars(CCI_FIXTURE), { n: 20 }).cci, CCI_FIXTURE.cci20, 1e-3, "CCI"));
  it("Williams %R (14) matches", () => matches(run("willr", bars(WILLR_FIXTURE), { n: 14 }).r, WILLR_FIXTURE.r14, 1e-4, "%R"));
  it("Rate of Change (12) matches", () => matches(run("roc", bars({ high: ROC_FIXTURE.close, low: ROC_FIXTURE.close, close: ROC_FIXTURE.close }), { n: 12 }).roc, ROC_FIXTURE.roc12, 1e-4, "ROC"));
  it("Accumulation/Distribution line matches", () => matches(run("ad", bars(AD_FIXTURE)).ad, AD_FIXTURE.line, 0.01, "A/D"));
  it("Bollinger Bands (20, 2): middle, upper and lower match, and the deviation is the population one", () => {
    const b = bars({ high: BB_FIXTURE.close, low: BB_FIXTURE.close, close: BB_FIXTURE.close });
    const r = run("bb", b, { n: 20, k: 2 });
    matches(r.mid, BB_FIXTURE.middle, 1e-4, "middle");
    matches(r.upper, BB_FIXTURE.upper, 1e-4, "upper");
    matches(r.lower, BB_FIXTURE.lower, 1e-4, "lower");
    matches(stdevOf(BB_FIXTURE.close, 20), BB_FIXTURE.stdev, 1e-4, "stdev");
  });
  it("Bollinger %b and BandWidth follow from the published bands", () => {
    const b = bars({ high: BB_FIXTURE.close, low: BB_FIXTURE.close, close: BB_FIXTURE.close });
    const pb = run("bbpb", b, { n: 20, k: 2 }).pb;
    const bw = run("bbw", b, { n: 20, k: 2 }).bw;
    for (let i = 19; i < b.length; i++) {
      const u = BB_FIXTURE.upper[i] as number;
      const l = BB_FIXTURE.lower[i] as number;
      assert.ok(Math.abs((pb[i] as number) - ((BB_FIXTURE.close[i] as number) - l) / (u - l)) < 1e-4);
      assert.ok(Math.abs((bw[i] as number) - (100 * (u - l)) / (BB_FIXTURE.middle[i] as number)) < 1e-3);
    }
    assert.equal(pb[18], null);
  });
});

describe("the studies that were already on the chart give the same values as before", () => {
  const series = Array.from({ length: 120 }, (_, i): Candle => {
    const c = 100 + Math.sin(i / 5) * 8 + i * 0.1;
    return { open: c - 0.4, high: c + 1.2, low: c - 1.1, close: c, volume: 1000 + i };
  });
  const same = (a: Num[], b: Num[]) => assert.deepEqual(a.map((v) => (v === null ? null : Math.round(v * 1e9) / 1e9)), b.map((v) => (v === null ? null : Math.round(v * 1e9) / 1e9)));
  it("SMA, EMA, Bollinger Bands and RSI equal lib/indicators.ts", () => {
    same(run("sma", series, { n: 10 }).sma, maSeries(series, 10));
    same(run("sma", series, { n: 30 }).sma, maSeries(series, 30));
    same(run("ema", series, { n: 20 }).ema, emaSeries(series, 20));
    const bb = bollingerBands(series, 20, 2);
    const r = run("bb", series, { n: 20, k: 2 });
    same(r.upper, bb.upper);
    same(r.mid, bb.mid);
    same(r.lower, bb.lower);
    same(run("rsi", series, { n: 14 }).rsi, rsiSeries(series, 14));
  });
});

describe("studies checked by hand from their definitions", () => {
  const mk = (o: number, h: number, l: number, c: number, v = 0, t?: number): Candle => ({ open: o, high: h, low: l, close: c, volume: v, ...(t === undefined ? {} : { t }) });

  it("moving averages: SMA needs n values, EMA starts from their average", () => {
    assert.deepEqual(smaOf([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
    const e = emaOf([2, 4, 6, 8], 2);
    assert.deepEqual(e, [null, 3, 3 + (6 - 3) * (2 / 3), (3 + (6 - 3) * (2 / 3)) + (8 - (3 + (6 - 3) * (2 / 3))) * (2 / 3)]);
    assert.deepEqual(wilderOf([2, 4, 6, 8], 2), [null, 3, (3 + 6) / 2, (4.5 + 8) / 2]);
  });
  it("rolling highest and lowest", () => {
    assert.deepEqual(highestOf([1, 3, 2, 5, 4], 3), [null, null, 3, 5, 5]);
    assert.deepEqual(lowestOf([4, 3, 5, 1, 2], 3), [null, null, 3, 1, 1]);
  });
  it("true range: the widest of high-low and the gaps from the previous close", () => {
    const b = [mk(0, 11, 9, 10), mk(0, 13, 10, 12), mk(0, 12, 10, 11)];
    assert.deepEqual(trueRange(b), [2, 3, 2]);
    assert.deepEqual(trueRange(b, "none"), [null, 3, 2]);
  });
  it("MACD(2, 3, 2): the line, the signal and the histogram", () => {
    const b = [10, 12, 11, 13, 15, 14].map((c) => mk(c, c, c, c));
    const k2 = 2 / 3;
    const e2 = [null, 11, 11 * k2 + 11 * (1 - k2)] as Num[];
    e2.push(13 * k2 + (e2[2] as number) * (1 - k2));
    e2.push(15 * k2 + (e2[3] as number) * (1 - k2));
    e2.push(14 * k2 + (e2[4] as number) * (1 - k2));
    const e3 = [null, null, 11, 12, 13.5, 13.75] as Num[];
    const macd = e2.map((v, i) => (v !== null && e3[i] !== null ? v - (e3[i] as number) : null));
    const sig3 = (macd[2] as number + (macd[3] as number)) / 2;
    const sig4 = (macd[4] as number) * k2 + sig3 * (1 - k2);
    const sig5 = (macd[5] as number) * k2 + sig4 * (1 - k2);
    const r = run("macd", b, { fast: 2, slow: 3, signal: 2 });
    r.macd.forEach((v, i) => assert.ok(macd[i] === null ? v === null : Math.abs((v as number) - (macd[i] as number)) < 1e-12));
    assert.deepEqual(r.signal.slice(0, 3), [null, null, null]);
    [sig3, sig4, sig5].forEach((s, j) => assert.ok(Math.abs((r.signal[3 + j] as number) - s) < 1e-12));
    assert.ok(Math.abs((r.hist[5] as number) - ((macd[5] as number) - sig5)) < 1e-12);
    assert.equal(r.hist[2], null);
  });
  it("Keltner Channels: EMA of the close, plus and minus the multiplier times the ATR", () => {
    const b = [mk(0, 11, 9, 10), mk(0, 13, 10, 12), mk(0, 12, 10, 11)];
    const r = run("keltner", b, { n: 2, atr: 2, k: 1 });
    assert.deepEqual(r.mid, [null, 11, 11]);
    assert.deepEqual(r.upper, [null, 13.5, 13.25]);
    assert.deepEqual(r.lower, [null, 8.5, 8.75]);
  });
  it("Aroon(3): bars since the highest high and the lowest low", () => {
    const highs = [5, 7, 6, 4, 3, 8];
    const lows = [1, 2, 1.5, 0.5, 0.4, 3];
    const r = run("aroon", highs.map((h, i) => mk(h, h, lows[i], h)), { n: 3 });
    assert.deepEqual(r.up.slice(0, 3), [null, null, null]);
    [r.up[3], r.up[4], r.up[5]].forEach((v, i) => assert.ok(Math.abs((v as number) - [100 / 3, 0, 100][i]) < 1e-9));
    [r.down[3], r.down[4], r.down[5]].forEach((v, i) => assert.ok(Math.abs((v as number) - [100, 100, 200 / 3][i]) < 1e-9));
  });
  it("Balance of Power: (close - open) / (high - low), smoothed; a flat bar is 0, not a guess", () => {
    const r = run("bop", [mk(10, 12, 8, 11), mk(11, 13, 9, 9), mk(9, 9, 9, 9)], { n: 2 });
    assert.deepEqual(r.bop, [null, (0.25 - 0.5) / 2, (-0.5 + 0) / 2]);
  });
  it("On Balance Volume: adds the volume on an up close, takes it off on a down close, nothing on an equal close", () => {
    const r = run("obv", [10, 11, 10.5, 10.5, 12].map((c, i) => mk(c, c, c, c, [5, 7, 3, 4, 9][i])));
    assert.deepEqual(r.obv, [0, 7, 4, 4, 13]);
  });
  it("Donchian Channels: the highest high, the lowest low and the middle", () => {
    const hs = [1, 3, 2, 5, 4];
    const ls = [0, 1, 1, 2, 2];
    const r = run("donchian", hs.map((h, i) => mk(h, h, ls[i], h)), { n: 3 });
    assert.deepEqual(r.upper, [null, null, 3, 5, 5]);
    assert.deepEqual(r.lower, [null, null, 0, 1, 1]);
    assert.deepEqual(r.mid, [null, null, 1.5, 3, 3]);
  });
  it("Awesome Oscillator: on a steady climb the 5-bar and 34-bar averages of the midpoint are 14.5 apart", () => {
    const r = run("ao", Array.from({ length: 40 }, (_, i) => mk(i, i + 0.5, i - 0.5, i)));
    assert.equal(r.ao[32], null);
    for (let i = 33; i < 40; i++) assert.ok(Math.abs((r.ao[i] as number) - 14.5) < 1e-9);
  });
  const DAY = 86_400;
  it("VWAP: volume-weighted typical price, starting again each day", () => {
    const b = [mk(0, 12, 8, 10, 100, 100 * DAY + 3600), mk(0, 13, 9, 12, 300, 100 * DAY + 7200), mk(0, 20, 20, 20, 50, 101 * DAY + 3600), mk(0, 30, 30, 30, 0, 102 * DAY + 3600)];
    const v = run("vwap", b).vwap;
    assert.equal(v[0], 10);
    assert.ok(Math.abs((v[1] as number) - (10 * 100 + (34 / 3) * 300) / 400) < 1e-12);
    assert.equal(v[2], 20); // a new day: not blended with yesterday
    assert.equal(v[3], null); // no volume yet that day: no value, not a made-up one
  });
  it("Supertrend (experimental): one side at a time, the lower band never falls in an up trend, and a big fall turns it", () => {
    const closes = [...Array.from({ length: 20 }, (_, i) => 100 + i), 95, 80, 70, 65, 64, 63];
    const b = closes.map((c) => mk(c, c + 1, c - 1, c));
    const r = run("supertrend", b, { n: 5, k: 2 });
    const firstValue = r.up.findIndex((v, i) => v !== null || r.down[i] !== null);
    assert.ok(firstValue >= 4);
    for (let i = firstValue; i < b.length; i++) assert.ok((r.up[i] === null) !== (r.down[i] === null), `exactly one side at ${i}`);
    assert.ok(r.up[firstValue] !== null); // starts as an up trend
    let prev = -Infinity;
    for (let i = firstValue; i < 20; i++) {
      assert.ok((r.up[i] as number) >= prev);
      prev = r.up[i] as number;
    }
    assert.ok(r.down[b.length - 1] !== null); // the fall turned it
    assert.ok((r.down[b.length - 1] as number) > closes[b.length - 1]); // and a down trend's line sits above the price
  });
  it("Volume is the feed's volume and nothing else", () => {
    assert.deepEqual(run("volume", [mk(1, 1, 1, 1, 5), mk(1, 1, 1, 1, 0)]).volume, [5, 0]);
  });
  it("a zero range is no value, not a made-up one (Stochastic, Williams %R)", () => {
    const flat = Array.from({ length: 20 }, () => mk(5, 5, 5, 5));
    assert.ok(run("stoch", flat).k.every((v) => v === null));
    assert.ok(run("willr", flat).r.every((v) => v === null));
  });
});

describe("study parameters are checked, never silently changed", () => {
  const rsi = STUDY_MAP.rsi;
  it("a period must be a whole number from 1 to the maximum", () => {
    assert.deepEqual(checkParams(rsi, { n: 14 }), { ok: true, values: { n: 14 } });
    assert.deepEqual(checkParams(rsi, { n: "21" }), { ok: true, values: { n: 21 } });
    for (const bad of [0, -3, 0.5, 14.5, MAX_PERIOD + 1, 100000, "", "abc", NaN, Infinity, null, undefined]) {
      const r = checkParams(rsi, { n: bad });
      assert.equal(r.ok, false, String(bad));
      if (!r.ok) assert.match(r.message, /Period must be/);
    }
    assert.equal(checkParams(rsi, { n: MAX_PERIOD }).ok, true);
    assert.equal(checkParams(rsi, { n: 1 }).ok, true);
  });
  it("the message says what is allowed", () => {
    const r = checkParams(rsi, { n: 0.5 });
    assert.ok(!r.ok && r.message === `Period must be a whole number from 1 to ${MAX_PERIOD}.`);
    const m = checkParams(STUDY_MAP.bb, { n: 20, k: 11 });
    assert.ok(!m.ok && m.message === "Deviations must be from 0.1 to 10.");
  });
  it("a multiplier may have decimals", () => {
    assert.deepEqual(checkParams(STUDY_MAP.bb, { n: 20, k: 2.5 }), { ok: true, values: { n: 20, k: 2.5 } });
    assert.equal(checkParams(STUDY_MAP.bb, { n: 20, k: 0.05 }).ok, false);
  });
  it("MACD's fast period must be shorter than its slow one", () => {
    const r = checkParams(STUDY_MAP.macd, { fast: 26, slow: 12, signal: 9 });
    assert.ok(!r.ok && r.message === "Fast must be shorter than Slow.");
    assert.equal(checkParams(STUDY_MAP.macd, { fast: 12, slow: 26, signal: 9 }).ok, true);
  });
  it("every study's own defaults pass the check, and a study with no parameters has nothing to check", () => {
    for (const s of STUDIES) assert.equal(checkParams(s, defaultParams(s)).ok, true, s.id);
    assert.deepEqual(checkParams(STUDY_MAP.obv, {}), { ok: true, values: {} });
  });
  it("a title shows the parameters", () => {
    assert.equal(studyTitle(rsi, { n: 14 }), "RSI (14)");
    assert.equal(studyTitle(STUDY_MAP.macd, { fast: 12, slow: 26, signal: 9 }), "MACD (12, 26, 9)");
    assert.equal(studyTitle(STUDY_MAP.vwap, {}), "VWAP");
  });
  it("every study computes on a real-looking series with its defaults and gives one value per bar", () => {
    const series = Array.from({ length: 150 }, (_, i): Candle => {
      const c = 100 + Math.sin(i / 7) * 6;
      return { t: 86_400 * (100 + Math.floor(i / 5)) + (i % 5) * 900, open: c, high: c + 1, low: c - 1, close: c + 0.3, volume: 500 + i };
    });
    for (const s of STUDIES) {
      const out = computeStudy(s, series, {});
      for (const o of s.outputs) {
        assert.equal(out[o.key].length, series.length, `${s.id}.${o.key}`);
        assert.ok(out[o.key].some((v) => v !== null), `${s.id}.${o.key} has values`);
        assert.ok(out[o.key].every((v) => v === null || Number.isFinite(v)), `${s.id}.${o.key} is finite`);
      }
    }
  });
});

describe("when a study cannot be shown", () => {
  it("volume studies and VWAP need real volume: an index (no volume) says 'Requires volume'", () => {
    for (const id of ["volume", "obv", "ad", "vwap"]) {
      assert.deepEqual(studyAvailability(STUDY_MAP[id], { hasVolume: false, intraday: true }), { ok: false, reason: REQUIRES_VOLUME }, id);
      assert.deepEqual(studyAvailability(STUDY_MAP[id], { hasVolume: false, intraday: false }), { ok: false, reason: REQUIRES_VOLUME }, id);
    }
    assert.equal(REQUIRES_VOLUME, "Requires volume");
  });
  it("VWAP is for intraday bars only, even when there is volume", () => {
    assert.deepEqual(studyAvailability(STUDY_MAP.vwap, { hasVolume: true, intraday: false }), { ok: false, reason: INTRADAY_ONLY });
    assert.deepEqual(studyAvailability(STUDY_MAP.vwap, { hasVolume: true, intraday: true }), { ok: true });
  });
  it("volume studies work on daily bars with volume; price studies never need volume", () => {
    assert.deepEqual(studyAvailability(STUDY_MAP.obv, { hasVolume: true, intraday: false }), { ok: true });
    for (const s of STUDIES.filter((x) => !x.needs)) assert.deepEqual(studyAvailability(s, { hasVolume: false, intraday: false }), { ok: true }, s.id);
  });
  it("only the three studies with no published reference are experimental", () => {
    assert.deepEqual(STUDIES.filter((s) => s.experimental).map((s) => s.id).sort(), ["ao", "donchian", "supertrend"]);
  });
  it("there is no ATR Bands study", () => assert.equal(STUDIES.some((s) => /atr bands/i.test(s.name)), false));
});

describe("the study search", () => {
  it("finds by any part of the name, case-insensitively, and an empty search lists them all", () => {
    assert.equal(searchStudies("").length, STUDIES.length);
    assert.deepEqual(searchStudies("rsi").map((s) => s.id), ["rsi"]);
    assert.ok(searchStudies("BOLLINGER").map((s) => s.id).includes("bb"));
    assert.ok(searchStudies("moving average").map((s) => s.id).includes("sma"));
    assert.deepEqual(searchStudies("zzzz"), []);
  });
});
