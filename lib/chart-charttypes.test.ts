import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHART_TYPES, MAX_BRICKS, ORDINAL_BASE, chartTypeInfo, drawingsAllowed, isChartType, ordinalTime, toHeikinAshi, toLineBreak, toRenko } from "./chart/charttypes";
import type { Candle } from "./types";

const bar = (o: number, h: number, l: number, c: number, t?: number, volume = 0): Candle => ({ open: o, high: h, low: l, close: c, volume, ...(t === undefined ? {} : { t }) });
const onClose = (closes: number[]): Candle[] => closes.map((c, i) => bar(c, c, c, c, 1000 + i * 60));
const oc = (bs: { open: number; close: number }[]) => bs.map((b) => `${b.open}>${b.close}`);

describe("the chart type list", () => {
  it("starts with candle, hollow candle, bar, line, area, baseline and Heikin Ashi, then the aggregated types", () => {
    assert.deepEqual(CHART_TYPES.map((t) => t.id), ["candle", "hollow", "bar", "line", "area", "baseline", "ha", "renko", "linebreak"]);
  });
  it("labels Renko and Line Break experimental, and nothing else; Kagi and Range bars are not offered", () => {
    assert.deepEqual(CHART_TYPES.filter((t) => t.experimental).map((t) => t.id), ["renko", "linebreak"]);
    assert.ok(!CHART_TYPES.some((t) => /kagi|range/i.test(t.id + t.label)));
  });
  it("drawing tools are off on Renko and Line Break only", () => {
    for (const t of CHART_TYPES) assert.equal(drawingsAllowed(t.id), t.id !== "renko" && t.id !== "linebreak", t.id);
  });
  it("recognises its own ids", () => {
    assert.ok(isChartType("ha"));
    assert.ok(!isChartType("kagi"));
    assert.equal(chartTypeInfo("renko").label, "Renko");
  });
});

describe("Heikin Ashi, by hand", () => {
  const ha = toHeikinAshi([bar(10, 12, 9, 11, 1, 5), bar(11, 14, 10, 13, 2, 6), bar(13, 15, 12, 12, 3, 7)]);
  it("close is the average of open, high, low and close", () => assert.deepEqual(ha.map((b) => b.close), [(10 + 12 + 9 + 11) / 4, (11 + 14 + 10 + 13) / 4, (13 + 15 + 12 + 12) / 4]));
  it("open is the middle of the previous Heikin Ashi open and close; the first is the middle of its own open and close", () => {
    assert.equal(ha[0].open, 10.5);
    assert.equal(ha[1].open, (10.5 + 10.5) / 2);
    assert.equal(ha[2].open, (10.5 + 12) / 2);
  });
  it("high and low are the extremes of the real high or low and the new open and close", () => {
    assert.deepEqual(ha.map((b) => [b.high, b.low]), [[12, 9], [14, 10], [15, 11.25]]);
  });
  it("keeps the times and the volume, and leaves its input alone", () => {
    assert.deepEqual(ha.map((b) => [b.t, b.volume]), [[1, 5], [2, 6], [3, 7]]);
    const input = [bar(1, 2, 0, 1)];
    toHeikinAshi(input);
    assert.deepEqual(input, [bar(1, 2, 0, 1)]);
    assert.deepEqual(toHeikinAshi([]), []);
  });
});

describe("Renko (experimental), by hand", () => {
  it("makes a brick for each full brick size, and turns round only after two bricks back", () => {
    // closes 100, 105, 112, 121, 133, 125, 115, 108, 98 with size 10
    const r = toRenko(onClose([100, 105, 112, 121, 133, 125, 115, 108, 98]), 10);
    assert.deepEqual(oc(r), ["100>110", "110>120", "120>130", "120>110", "110>100"]);
  });
  it("one bar can make several bricks, each keeping that bar's real time", () => {
    const r = toRenko([bar(100, 100, 100, 100, 5000), bar(100, 136, 100, 135, 5060)], 10);
    assert.deepEqual(oc(r), ["100>110", "110>120", "120>130"]);
    assert.deepEqual(r.map((b) => [b.t, b.src]), [[5060, 1], [5060, 1], [5060, 1]]); // no invented times
    assert.ok(r.every((b) => b.volume === 0));
  });
  it("a falling market makes down bricks, and turns up after two bricks", () => {
    // two down bricks (at 88 and 79); the last one opened at 90, so it turns up only when the close reaches 100 (at 101)
    const r = toRenko(onClose([100, 95, 88, 79, 81, 89, 92, 101]), 10);
    assert.deepEqual(oc(r), ["100>90", "90>80", "90>100"]);
  });
  it("bricks sit on the brick-size grid", () => {
    const r = toRenko(onClose([103, 118, 131, 142]), 10); // the first brick starts at 103 rounded to 100
    assert.equal(r[0].open, 100);
    assert.ok(r.every((b) => b.open % 10 === 0 && b.close % 10 === 0));
  });
  it("the brick size is an input, never worked out from the data: adding bars never changes the bricks already made", () => {
    const base = [100, 108, 114, 127, 122, 109, 96, 104, 118, 131];
    const all = toRenko(onClose(base), 10);
    for (let k = 3; k < base.length; k++) {
      const part = toRenko(onClose(base.slice(0, k)), 10);
      assert.deepEqual(part, all.slice(0, part.length), `first ${k} bars`);
    }
    assert.notDeepEqual(toRenko(onClose(base), 5), all); // another size is another chart
  });
  it("a bad size or no bars gives no bricks, and a size far too small stops at the cap", () => {
    for (const s of [0, -5, NaN, Infinity]) assert.deepEqual(toRenko(onClose([1, 2, 3]), s), []);
    assert.deepEqual(toRenko([], 5), []);
    assert.equal(toRenko(onClose([0, 1_000_000]), 1).length, MAX_BRICKS);
  });
});

describe("3-Line Break (experimental), by hand", () => {
  it("adds a line past the last close, and reverses only beyond the three-line extreme, drawn from the last line's open", () => {
    const r = toLineBreak(onClose([10, 11, 12, 13, 12.5, 11.5, 10.5, 9.5, 14]), 3);
    assert.deepEqual(oc(r), ["10>11", "11>12", "12>13", "12>9.5", "12>14"]);
  });
  it("a close inside the last lines' range adds nothing", () => {
    const r = toLineBreak(onClose([10, 11, 12, 11.5, 11.2, 11.8]), 3);
    assert.deepEqual(oc(r), ["10>11", "11>12"]);
  });
  it("starts at the first different close, and the number of lines is a parameter", () => {
    assert.deepEqual(toLineBreak(onClose([5, 5, 5]), 3), []);
    const two = toLineBreak(onClose([10, 12, 14, 11, 9]), 2);
    const three = toLineBreak(onClose([10, 12, 14, 11, 9]), 3);
    assert.ok(two.length >= three.length);
  });
  it("each line carries a real bar's time; no bar makes two lines", () => {
    const bars = onClose([10, 11, 12, 13, 9, 14, 8]);
    const r = toLineBreak(bars, 3);
    const srcs = r.map((b) => b.src);
    assert.equal(new Set(srcs).size, srcs.length);
    for (const b of r) assert.equal(b.t, bars[b.src].t);
  });
});

describe("the time the chart library gets for bricks", () => {
  it("is strictly increasing, one day apart, in brick order", () => {
    const times = [0, 1, 2, 3, 100].map(ordinalTime);
    assert.equal(times[0], ORDINAL_BASE);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
    assert.equal(ordinalTime(1) - ordinalTime(0), 86_400);
  });
});
