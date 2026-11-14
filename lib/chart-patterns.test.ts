import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MARK_COLOR, MAX_MARKED, PATTERNS, PATTERNS_NOTE, PATTERN_THRESHOLDS, detectPatterns, patternLabel, patternMarks } from "./chart/patterns";
import { NOT_ON_BRICKS, STUDY_MAP, computeStudy, studyAvailability } from "./chart/studies";
import type { Candle } from "./types";

const bar = (o: number, h: number, l: number, c: number): Candle => ({ open: o, high: h, low: l, close: c, volume: 0 });
const one = (b: Candle) => detectPatterns([b])[0];

describe("candlestick patterns: fixed, documented shape rules", () => {
  it("the thresholds are the documented ones", () => assert.deepEqual({ ...PATTERN_THRESHOLDS }, { dojiBody: 0.1, longShadow: 2, shortShadow: 0.5 }));
  it("doji: a body of at most 10% of the range", () => {
    assert.equal(one(bar(100, 110, 90, 101)), "doji"); // body 1 of 20: 5%
    assert.equal(one(bar(100, 110, 90, 102)), "doji"); // exactly 10%
    assert.notEqual(one(bar(100, 110, 90, 102.1)), "doji"); // just over
    assert.equal(one(bar(100, 110, 90, 100)), "doji"); // no body at all
  });
  it("hammer: lower shadow at least twice the body, upper at most half of it", () => {
    assert.equal(one(bar(100, 101.2, 95, 101)), "hammer"); // body 1, lower 5, upper 0.2
    assert.notEqual(one(bar(100, 101.6, 95, 101)), "hammer"); // upper 0.6 > 0.5
    assert.notEqual(one(bar(100, 101.2, 98.5, 101)), "hammer"); // lower 1.5 < 2
  });
  it("shooting star: the same upside down", () => {
    assert.equal(one(bar(101, 106, 99.8, 100)), "shootingStar"); // body 1, upper 5, lower 0.2
    assert.notEqual(one(bar(101, 106, 99.4, 100)), "shootingStar"); // lower 0.6 > 0.5
  });
  it("bullish engulfing: an up candle covering the previous down candle's body, and larger", () => {
    const r = detectPatterns([bar(105, 106, 99, 100), bar(99, 108, 98.5, 107)]);
    assert.equal(r[1], "bullEngulf");
    assert.equal(detectPatterns([bar(105, 106, 99, 100), bar(100, 106, 99.5, 105)])[1], null); // not larger (equal body)
    assert.equal(detectPatterns([bar(105, 106, 99, 100), bar(101, 108, 100, 107)])[1], null); // opens above the previous close
    assert.equal(detectPatterns([bar(100, 106, 99, 105), bar(99, 108, 98.5, 107)])[1], null); // the bar before was not a down candle
  });
  it("bearish engulfing: the mirror image", () => {
    const r = detectPatterns([bar(100, 106, 99, 105), bar(106, 107, 97, 98)]);
    assert.equal(r[1], "bearEngulf");
    assert.equal(detectPatterns([bar(105, 106, 99, 100), bar(106, 107, 97, 98)])[1], null); // the bar before was a down candle
  });
  it("no trend filter and no prediction: the same shape is the same pattern wherever it is", () => {
    const up = [bar(1, 2, 1, 2), bar(2, 3, 2, 3), bar(3, 4, 3, 4), bar(100, 101.2, 95, 101)];
    const down = [bar(4, 4, 3, 3), bar(3, 3, 2, 2), bar(2, 2, 1, 1), bar(100, 101.2, 95, 101)];
    assert.equal(detectPatterns(up)[3], "hammer");
    assert.equal(detectPatterns(down)[3], "hammer");
  });
  it("a bar that fits more than one shows the first in the list (doji before engulfing); no range, no pattern; the first bar cannot engulf", () => {
    assert.equal(detectPatterns([bar(105, 106, 99, 100), bar(99, 110, 90, 99.5)])[1], "doji");
    assert.equal(one(bar(5, 5, 5, 5)), null);
    assert.equal(detectPatterns([bar(99, 108, 98.5, 107)])[0], null);
    assert.deepEqual(detectPatterns([]), []);
  });
});

describe("how the patterns are shown: plain, neutral, labelled, never a signal", () => {
  const timed = Array.from({ length: 400 }, (_, i) => ({ ...bar(100, 110, 90, 101), t: 1000 + i })); // all dojis
  const found = detectPatterns(timed);
  const marks = patternMarks(timed, found);
  it("one grey circle above the bar, named for the pattern", () => {
    assert.ok(marks.every((m) => m.shape === "circle" && m.position === "aboveBar" && m.color === MARK_COLOR && m.text === "Doji"));
  });
  it("never an arrow, never a buy or sell colour, never words that read as advice", () => {
    for (const p of PATTERNS) assert.ok(!/buy|sell|signal|long|short|bullish!|entry|target|stop/i.test(p.label.replace(/bullish|bearish/i, "")), p.label);
    assert.ok(marks.every((m) => !/arrow/i.test(m.shape)));
    assert.ok(!["#10b981", "#34d399", "#f43f5e", "#f87171", "#58a15f", "#e0625a"].includes(MARK_COLOR.toLowerCase()));
    assert.match(MARK_COLOR, /^#[0-9a-f]{6}$/i);
  });
  it("only the latest bars are marked", () => {
    assert.equal(marks.length, MAX_MARKED);
    assert.equal(marks[0].time, timed[timed.length - MAX_MARKED].t);
    assert.equal(marks[marks.length - 1].time, timed[timed.length - 1].t);
  });
  it("labels are the pattern names", () => {
    assert.equal(patternLabel("shootingStar"), "Shooting star");
    assert.deepEqual(PATTERNS.map((p) => p.label), ["Doji", "Hammer", "Shooting star", "Bullish engulfing", "Bearish engulfing"]);
  });
  it("the note says plainly what they are", () => assert.match(PATTERNS_NOTE, /not buy or sell signals/));
});

describe("the patterns study", () => {
  const def = STUDY_MAP.patterns;
  it("is in the list as an educational study with a note, not experimental, with no line of its own", () => {
    assert.ok(def.marks);
    assert.equal(def.outputs.length, 0);
    assert.match(def.note ?? "", /not buy or sell signals/);
    assert.ok(!def.experimental);
    assert.match(def.name, /educational/i);
  });
  it("gives one code per bar: the pattern's place in the list, or null", () => {
    const r = computeStudy(def, [bar(100, 110, 90, 101), bar(100, 101.2, 95, 101), bar(100, 106, 99, 105)], {}).marks;
    assert.deepEqual(r.slice(0, 2), [1, 2]); // doji, hammer
  });
  it("is not for charts made of bricks", () => {
    assert.deepEqual(studyAvailability(def, { hasVolume: false, intraday: false, bricks: true }), { ok: false, reason: NOT_ON_BRICKS });
    assert.deepEqual(studyAvailability(def, { hasVolume: false, intraday: false }), { ok: true });
  });
});
