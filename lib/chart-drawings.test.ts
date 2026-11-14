import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DAY, logicalToTime, makeViewport, pixelToAnchor, anchorToPixel, timeToLogical, type Viewport } from "./chart/coords";
import {
  cloneDrawing,
  createDrawing,
  dragHandle,
  moveDrawing,
  newId,
  parseDrawings,
  pointsNeeded,
  priceOnLine,
  rangeLabel,
  rangeStats,
  type Anchor,
  type Drawing,
} from "./chart/drawings";
import { MAGNET_PX, snapToCandle, type SnapBar } from "./chart/snap";
import { HANDLE_RADIUS, bodyHit, distToSegment, hitTest, shapeOf } from "./chart/hit";
import { canRedo, canUndo, commit, deleteAll, initialHistory, lockAll, redo, undo, without, withUpdated, MAX_STEPS } from "./chart/history";
import { createAutosaver, localDrawingStore, storageKey, type StorageLike, type Timers } from "./chart/storage";
import { measure, measureText } from "./chart/measure";

const D0 = Date.UTC(2026, 9, 5) / 1000; // Mon 5 Oct 2026
const dailyTimes = Array.from({ length: 40 }, (_, i) => D0 + i * DAY);

/** A stand-in for a chart: bar i is at x = 20 + 10 i, price p at y = 500 - 0.5 p (so 100 -> 450, 900 -> 50). */
function fakeChart(times: readonly number[], opts: { xPerBar?: number; x0?: number; pxPerPrice?: number; y0?: number } = {}): Viewport {
  const xpb = opts.xPerBar ?? 10;
  const x0 = opts.x0 ?? 20;
  const k = opts.pxPerPrice ?? 0.5;
  const y0 = opts.y0 ?? 500;
  return makeViewport({
    times,
    width: 400,
    height: 480,
    logicalToX: (l) => x0 + l * xpb,
    xToLogical: (x) => (x - x0) / xpb,
    priceToY: (p) => y0 - k * p,
    yToPrice: (y) => (y0 - y) / k,
  });
}

describe("time and price to pixel, both ways", () => {
  const vp = fakeChart(dailyTimes);
  it("a bar's time lands on its bar's x, and x gives the time back", () => {
    assert.equal(vp.timeToX(dailyTimes[0]), 20);
    assert.equal(vp.timeToX(dailyTimes[7]), 90);
    assert.equal(vp.xToTime(90), dailyTimes[7]);
  });
  it("a time between two bars is interpolated, and a time past the last bar (a ray) is extrapolated", () => {
    assert.equal(vp.timeToX(dailyTimes[3] + DAY / 2), 20 + 35);
    assert.equal(vp.timeToX(dailyTimes[39] + 5 * DAY), 20 + 10 * 44);
    assert.equal(vp.timeToX(dailyTimes[0] - 2 * DAY), 0);
  });
  it("time round-trips through pixels, including between bars and beyond both ends", () => {
    for (const t of [dailyTimes[0] - 3 * DAY, dailyTimes[0], dailyTimes[5] + 12345, dailyTimes[20] + DAY / 3, dailyTimes[39], dailyTimes[39] + 9 * DAY]) {
      const x = vp.timeToX(t) as number;
      assert.ok(Math.abs((vp.xToTime(x) as number) - t) <= 1, `${t}`);
    }
  });
  it("price round-trips through pixels", () => {
    for (const p of [0, 12.5, 100, 987.65, 1500]) assert.ok(Math.abs((vp.yToPrice(vp.priceToY(p) as number) as number) - p) < 1e-9);
    assert.equal(vp.priceToY(100), 450);
  });
  it("a pixel point and an anchor convert both ways", () => {
    const a: Anchor = { time: dailyTimes[10] + 3600, price: 412.5 };
    const p = anchorToPixel(vp, a)!;
    const back = pixelToAnchor(vp, p.x, p.y)!;
    assert.ok(Math.abs(back.time - a.time) <= 1);
    assert.ok(Math.abs(back.price - a.price) < 1e-9);
  });
  it("fractional bar indexes: logical <-> time", () => {
    assert.equal(timeToLogical(dailyTimes, dailyTimes[4]), 4);
    assert.equal(logicalToTime(dailyTimes, 4.5), dailyTimes[4] + DAY / 2);
    assert.equal(timeToLogical([], 5), null);
    assert.equal(logicalToTime([], 5), null);
    assert.equal(timeToLogical(dailyTimes, Number.NaN), null);
  });
  it("uneven bar spacing (weekends) is followed: a Friday-to-Monday gap is one bar", () => {
    const times = [D0, D0 + DAY, D0 + 4 * DAY, D0 + 5 * DAY]; // Mon, Tue, Fri, Sat-ish
    assert.equal(timeToLogical(times, D0 + 2.5 * DAY), 1 + 1.5 / 3);
    assert.equal(logicalToTime(times, 1 + 1.5 / 3), D0 + 2.5 * DAY);
  });
});

describe("drawings stay where they belong when the view changes", () => {
  const a: Anchor = { time: dailyTimes[10], price: 400 };
  it("zoomed: the anchor is untouched and only its pixels change", () => {
    const before = anchorToPixel(fakeChart(dailyTimes), a)!;
    const zoomed = anchorToPixel(fakeChart(dailyTimes, { xPerBar: 25, pxPerPrice: 1 }), a)!;
    assert.notDeepEqual(before, zoomed);
    const back = pixelToAnchor(fakeChart(dailyTimes, { xPerBar: 25, pxPerPrice: 1 }), zoomed.x, zoomed.y)!;
    assert.ok(Math.abs(back.time - a.time) <= 1 && Math.abs(back.price - a.price) < 1e-9);
  });
  it("resized: a wider or taller plot area moves the pixels, not the anchor", () => {
    const wide = anchorToPixel(fakeChart(dailyTimes, { x0: 60, y0: 700 }), a)!;
    const back = pixelToAnchor(fakeChart(dailyTimes, { x0: 60, y0: 700 }), wide.x, wide.y)!;
    assert.ok(Math.abs(back.time - a.time) <= 1 && Math.abs(back.price - a.price) < 1e-9);
  });
  it("another timeframe: on weekly bars the same time lands at the same x when the weekly bar is five times as wide", () => {
    const weeklyTimes = Array.from({ length: 8 }, (_, i) => D0 + i * 7 * DAY);
    const dailyVp = fakeChart(dailyTimes, { xPerBar: 10, x0: 20 });
    const weeklyVp = fakeChart(weeklyTimes, { xPerBar: 70, x0: 20 });
    for (const t of [D0 + 3 * DAY, D0 + 10 * DAY + 5000, D0 + 21 * DAY]) assert.ok(Math.abs((dailyVp.timeToX(t) as number) - (weeklyVp.timeToX(t) as number)) < 1e-6);
  });
  it("a drawing's stored form has no pixels in it at all", () => {
    const d = createDrawing("trend", [a, { time: dailyTimes[20], price: 450 }])!;
    assert.deepEqual(Object.keys(d).sort(), ["a", "b", "color", "dash", "id", "kind", "locked", "width"]);
    assert.ok(JSON.stringify(d).indexOf('"x"') < 0 && JSON.stringify(d).indexOf('"y"') < 0);
  });
});

describe("magnet: snap to a candle's open, high, low or close", () => {
  const vp = fakeChart(dailyTimes);
  const bars: SnapBar[] = dailyTimes.map((t, i) => ({ t, open: 400 + i, high: 430 + i, low: 380 + i, close: 410 + i }));
  const y = (p: number) => vp.priceToY(p) as number;
  it("snaps to the nearest of the four prices of the nearest bar, and takes that bar's time", () => {
    const raw = { time: dailyTimes[5] + DAY / 4, price: 437 }; // bar 5: o405 h435 l385 c415; the high is nearest
    assert.deepEqual(snapToCandle(raw, bars, vp), { time: dailyTimes[5], price: 435 });
    assert.deepEqual(snapToCandle({ time: dailyTimes[5], price: 384 }, bars, vp), { time: dailyTimes[5], price: 385 });
    assert.deepEqual(snapToCandle({ time: dailyTimes[5], price: 412 }, bars, vp), { time: dailyTimes[5], price: 415 });
    assert.deepEqual(snapToCandle({ time: dailyTimes[5], price: 401 }, bars, vp), { time: dailyTimes[5], price: 405 });
  });
  it("the nearest bar is the one at the point's x: halfway rounds to the nearer bar", () => {
    assert.equal(snapToCandle({ time: dailyTimes[8] - DAY * 0.4, price: 438 }, bars, vp).time, dailyTimes[8]);
    assert.equal(snapToCandle({ time: dailyTimes[8] - DAY * 0.6, price: 437 }, bars, vp).time, dailyTimes[7]);
  });
  it("does not snap to something far away: beyond the threshold the point is left alone", () => {
    const raw = { time: dailyTimes[5], price: 700 };
    assert.deepEqual(snapToCandle(raw, bars, vp), raw);
    const justOut = { time: dailyTimes[5], price: 435 + (MAGNET_PX + 3) / 0.5 };
    assert.deepEqual(snapToCandle(justOut, bars, vp), justOut);
    const justIn = { time: dailyTimes[5], price: 435 + (MAGNET_PX - 3) / 0.5 };
    assert.equal(snapToCandle(justIn, bars, vp).price, 435);
  });
  it("a point past the last bar snaps to the last bar; no bars, no change", () => {
    assert.equal(snapToCandle({ time: dailyTimes[39] + 6 * DAY, price: 470 }, bars, vp).time, dailyTimes[39]);
    const raw = { time: 5, price: 5 };
    assert.deepEqual(snapToCandle(raw, [], vp), raw);
    assert.ok(y(435) < y(385)); // sanity: the high is above the low on screen
  });
});

describe("hit-testing", () => {
  const vp = fakeChart(dailyTimes);
  const at = (i: number, price: number): Anchor => ({ time: dailyTimes[i], price });
  const trend = createDrawing("trend", [at(5, 300), at(25, 500)], "T")!; // x 70..270, y 350..250
  const hline = createDrawing("hline", [at(0, 600)], "H")!; // y 200
  const rect = createDrawing("rect", [at(10, 700), at(20, 600)], "R")!; // x 120..220, y 150..200
  const text = { ...createDrawing("text", [at(30, 800)], "X")!, text: "Support" } as Drawing; // at x 320, y 100
  const all = [hline, trend, rect, text];
  const mouse = { tolerance: 8 };
  const touch = { tolerance: 16 };

  it("a point on a line is a hit and one away from it is not", () => {
    assert.deepEqual(hitTest([trend], vp, { x: 170, y: 300 }, mouse), { id: "T", part: "body" });
    assert.equal(hitTest([trend], vp, { x: 170, y: 330 }, mouse), null);
  });
  it("a finger gets a wider margin than a mouse", () => {
    const p = { x: 170, y: 300 + 12 };
    assert.equal(hitTest([trend], vp, p, mouse), null);
    assert.deepEqual(hitTest([trend], vp, p, touch), { id: "T", part: "body" });
  });
  it("a horizontal level is hit along its whole width", () => {
    assert.deepEqual(hitTest([hline], vp, { x: 5, y: 203 }, mouse), { id: "H", part: "body" });
    assert.deepEqual(hitTest([hline], vp, { x: 390, y: 197 }, mouse), { id: "H", part: "body" });
    assert.equal(hitTest([hline], vp, { x: 200, y: 230 }, mouse), null);
  });
  it("a range box is hit anywhere inside it; a text note anywhere in its box", () => {
    assert.deepEqual(hitTest([rect], vp, { x: 170, y: 175 }, mouse), { id: "R", part: "body" });
    assert.equal(hitTest([rect], vp, { x: 300, y: 175 }, mouse), null);
    assert.deepEqual(hitTest([text], vp, { x: 340, y: 100 }, mouse), { id: "X", part: "body" });
    assert.equal(hitTest([text], vp, { x: 340, y: 160 }, mouse), null);
  });
  it("a ray is hit past its second point, out to the right", () => {
    const ray = createDrawing("ray", [at(5, 300), at(15, 350)], "Y")!; // from (70, 350) through (170, 325): 25 px up per 100 px right
    assert.deepEqual(hitTest([ray], vp, { x: 70 + 400, y: 350 - 100 }, mouse), { id: "Y", part: "body" });
    assert.equal(hitTest([ray], vp, { x: 70 - 40, y: 350 + 20 }, mouse), null); // not to the left of its start
  });
  it("a channel is hit on either line and between them", () => {
    const ch = createDrawing("channel", [at(5, 300), at(25, 300)], "C")!; // offset 4% = 12 -> 6 px above
    assert.deepEqual(hitTest([ch], vp, { x: 150, y: 350 }, mouse), { id: "C", part: "body" });
    assert.deepEqual(hitTest([ch], vp, { x: 150, y: 347 }, mouse), { id: "C", part: "body" });
  });
  it("the topmost (latest) drawing wins where two overlap", () => {
    const under = createDrawing("rect", [at(10, 700), at(20, 600)], "under")!;
    const over = createDrawing("rect", [at(12, 690), at(18, 610)], "over")!;
    assert.equal(hitTest([under, over], vp, { x: 170, y: 175 }, mouse)?.id, "over");
  });
  it("handles are hit within 22 px: a 44 px target", () => {
    assert.equal(HANDLE_RADIUS * 2, 44);
    const s = shapeOf(trend, vp)!;
    const b = s.handles.find((h) => h.id === "b")!;
    assert.deepEqual(hitTest(all, vp, { x: b.x + 20, y: b.y + 8 }, { ...mouse, selectedId: "T" }), { id: "T", part: "handle", handle: "b" });
    assert.notEqual((hitTest(all, vp, { x: b.x + 30, y: b.y + 30 }, { ...mouse, selectedId: "T" }) as { part?: string } | null)?.part, "handle");
  });
  it("a handle beats the body under it, but only for the selected drawing", () => {
    const a = shapeOf(trend, vp)!.handles.find((h) => h.id === "a")!;
    assert.equal(hitTest(all, vp, a, mouse)?.part, "body");
    assert.equal((hitTest(all, vp, a, { ...mouse, selectedId: "T" }) as { handle?: string }).handle, "a");
  });
  it("a locked drawing can be selected but has no handles", () => {
    const locked = { ...trend, locked: true };
    const a = shapeOf(locked, vp)!.handles.find((h) => h.id === "a")!;
    assert.equal(hitTest([locked], vp, a, { ...mouse, selectedId: "T" })?.part, "body");
  });
  it("a rectangle has four handles, a channel three, a level one", () => {
    assert.deepEqual(shapeOf(rect, vp)!.handles.map((h) => h.id), ["a", "b", "c", "d"]);
    assert.deepEqual(shapeOf(createDrawing("channel", [at(5, 300), at(25, 320)])!, vp)!.handles.map((h) => h.id), ["a", "b", "o"]);
    assert.deepEqual(shapeOf(hline, vp)!.handles.map((h) => h.id), ["p"]);
  });
  it("distance to a segment", () => {
    assert.equal(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
    assert.equal(distToSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
    assert.equal(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 5);
  });
  it("a drawing that cannot be placed (off the scales) is never hit", () => {
    const broken: Viewport = { ...vp, priceToY: () => null };
    assert.equal(shapeOf(trend, broken), null);
    assert.equal(hitTest([trend], broken, { x: 100, y: 100 }, mouse), null);
    assert.equal(bodyHit({ kind: "trend", segments: [], handles: [] }, { x: 1, y: 1 }, 8), false);
  });
});

describe("editing drawings", () => {
  const a: Anchor = { time: D0, price: 100 };
  const b: Anchor = { time: D0 + 10 * DAY, price: 120 };
  it("each tool needs the number of points the spec gives it", () => {
    assert.deepEqual(["hline", "text", "trend", "ray", "rect", "channel", "measure", "select"].map((t) => pointsNeeded(t as never)), [1, 1, 2, 2, 2, 2, 2, 0]);
  });
  it("creating from too few or non-finite points gives nothing", () => {
    assert.equal(createDrawing("trend", [a]), null);
    assert.equal(createDrawing("hline", []), null);
    assert.equal(createDrawing("rect", [a, { time: Number.NaN, price: 1 }]), null);
  });
  it("a range box's label is its height in points and per cent of its lower price", () => {
    assert.deepEqual(rangeStats({ time: 0, price: 200 }, { time: 1, price: 250 }), { points: 50, pct: 25 });
    assert.equal(rangeLabel({ time: 0, price: 250 }, { time: 1, price: 200 }), "Height 50.00 pts (25.00%)");
    assert.equal(rangeLabel({ time: 0, price: 100.5 }, { time: 1, price: 101.34 }), "Height 0.84 pts (0.84%)");
  });
  it("dragging a rectangle's corner moves the right sides", () => {
    const r = createDrawing("rect", [a, b], "r")! as Extract<Drawing, { kind: "rect" }>; // a = top-left? a is (D0, 100), b is (D0+10d, 120)
    const c = dragHandle(r, "c", { time: D0 + 2 * DAY, price: 130 }) as typeof r;
    assert.deepEqual([c.a.time, c.b.price, c.a.price, c.b.time], [D0 + 2 * DAY, 130, 100, D0 + 10 * DAY]);
    const d = dragHandle(r, "d", { time: D0 + 12 * DAY, price: 90 }) as typeof r;
    assert.deepEqual([d.b.time, d.a.price, d.a.time, d.b.price], [D0 + 12 * DAY, 90, D0, 120]);
  });
  it("dragging a channel's width handle sets the offset from the line", () => {
    const ch = createDrawing("channel", [a, b], "c")! as Extract<Drawing, { kind: "channel" }>;
    const mid = D0 + 5 * DAY;
    const moved = dragHandle(ch, "o", { time: mid, price: priceOnLine(a, b, mid) + 17 }) as typeof ch;
    assert.ok(Math.abs(moved.offset - 17) < 1e-9);
    assert.ok(Math.abs(priceOnLine(a, b, mid) - 110) < 1e-9);
  });
  it("dragging an endpoint moves only that endpoint; a level moves by its handle", () => {
    const t = createDrawing("trend", [a, b], "t")! as Extract<Drawing, { kind: "trend" }>;
    const m = dragHandle(t, "b", { time: D0 + 20 * DAY, price: 150 }) as typeof t;
    assert.deepEqual([m.a, m.b], [a, { time: D0 + 20 * DAY, price: 150 }]);
    const h = createDrawing("hline", [a], "h")!;
    assert.equal((dragHandle(h, "p", { time: 0, price: 333 }) as { price: number }).price, 333);
  });
  it("moving and cloning shift by time and price, and a clone has a new id and is unlocked", () => {
    const t = { ...createDrawing("trend", [a, b], "t")!, locked: true } as Drawing;
    const moved = moveDrawing(t, DAY, 5) as Extract<Drawing, { kind: "trend" }>;
    assert.deepEqual([moved.a.time, moved.a.price, moved.b.price], [D0 + DAY, 105, 125]);
    const c = cloneDrawing(t, "copy", 2 * DAY, 3) as Extract<Drawing, { kind: "trend" }>;
    assert.equal(c.id, "copy");
    assert.equal(c.locked, false);
    assert.deepEqual([c.a.time, c.a.price], [D0 + 2 * DAY, 103]);
    assert.equal((moveDrawing(createDrawing("hline", [a], "h")!, DAY, 7) as { price: number }).price, 107);
  });
  it("ids are unique", () => {
    assert.equal(new Set(Array.from({ length: 500 }, () => newId())).size, 500);
  });
});

describe("undo and redo", () => {
  const d = (id: string): Drawing => createDrawing("hline", [{ time: 0, price: 1 }], id)!;
  it("undo and redo walk back and forth through the steps", () => {
    let h = initialHistory();
    h = commit(h, [d("a")]);
    h = commit(h, [d("a"), d("b")]);
    h = commit(h, [d("a"), d("b"), d("c")]);
    assert.deepEqual(h.present.map((x) => x.id), ["a", "b", "c"]);
    h = undo(h);
    assert.deepEqual(h.present.map((x) => x.id), ["a", "b"]);
    h = undo(undo(h));
    assert.deepEqual(h.present, []);
    assert.equal(canUndo(h), false);
    h = redo(h);
    assert.deepEqual(h.present.map((x) => x.id), ["a"]);
    h = redo(redo(h));
    assert.deepEqual(h.present.map((x) => x.id), ["a", "b", "c"]);
    assert.equal(canRedo(h), false);
  });
  it("a new change after an undo drops the redo steps", () => {
    let h = commit(commit(initialHistory(), [d("a")]), [d("a"), d("b")]);
    h = undo(h);
    h = commit(h, [d("z")]);
    assert.equal(canRedo(h), false);
    assert.deepEqual(h.present.map((x) => x.id), ["z"]);
  });
  it("committing the same drawings again adds no step; undo and redo at the ends do nothing", () => {
    const h = commit(initialHistory(), [d("a")]);
    assert.equal(commit(h, [d("a")]), h);
    assert.equal(undo(initialHistory()).present.length, 0);
    assert.equal(redo(h), h);
  });
  it("a gesture is one step: many live updates, one commit, one undo", () => {
    let h = commit(initialHistory(), [d("a")]);
    const start = h.present;
    // the layer edits a live copy while dragging and commits once at the end
    const end = withUpdated(start, "a", { color: "#ff0000" } as never);
    h = commit(h, end);
    assert.equal(h.past.length, 2);
    assert.equal(undo(h).present[0].color, start[0].color);
  });
  it("history is capped", () => {
    let h = initialHistory();
    for (let i = 0; i < MAX_STEPS + 40; i++) h = commit(h, [{ ...d("a"), color: `#${(i + 4096).toString(16)}` }]);
    assert.equal(h.past.length, MAX_STEPS);
  });
  it("bulk actions: lock all, delete all and delete one are each undoable steps", () => {
    let h = commit(initialHistory(), [d("a"), d("b")]);
    h = commit(h, lockAll(h.present));
    assert.ok(h.present.every((x) => x.locked));
    h = commit(h, without(h.present, "a"));
    assert.deepEqual(h.present.map((x) => x.id), ["b"]);
    h = commit(h, deleteAll());
    assert.deepEqual(h.present, []);
    h = undo(h);
    assert.deepEqual(h.present.map((x) => x.id), ["b"]);
    h = undo(undo(h));
    assert.ok(h.present.every((x) => !x.locked));
    assert.equal(lockAll([{ ...d("a"), locked: true }], true)[0].locked, true);
  });
});

describe("saving and reloading", () => {
  const memory = (): StorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };
  const a: Anchor = { time: D0, price: 100 };
  const b: Anchor = { time: D0 + 10 * DAY, price: 120 };
  const sample = (): Drawing[] => [
    createDrawing("hline", [a], "h")!,
    createDrawing("trend", [a, b], "t")!,
    createDrawing("ray", [a, b], "y")!,
    { ...createDrawing("rect", [a, b], "r")!, midline: true } as Drawing,
    createDrawing("channel", [a, b], "c")!,
    { ...createDrawing("text", [a], "x")!, text: "Resistance" } as Drawing,
    createDrawing("fib", [a, b], "f")!,
    createDrawing("brush", [a, { time: D0 + 3 * DAY, price: 105 }, b], "b")!,
  ];

  it("every kind of drawing survives a save and a reload exactly", async () => {
    const st = memory();
    const store = localDrawingStore(st);
    const ds = sample().map((d, i) => ({ ...d, color: "#2563eb", width: ((i % 4) + 1) as 1, dash: (["solid", "dashed", "dotted"] as const)[i % 3], locked: i === 1 }) as Drawing);
    await store.save("RELIANCE", ds);
    assert.deepEqual(await store.load("RELIANCE"), ds);
  });
  it("is per symbol and per version: another symbol sees nothing", async () => {
    const st = memory();
    const store = localDrawingStore(st);
    await store.save("RELIANCE", sample());
    assert.deepEqual(await store.load("TCS"), []);
    assert.equal(storageKey("RELIANCE"), "zestoxx:drawings:v1:RELIANCE");
    assert.deepEqual([...st.data.keys()], [storageKey("RELIANCE")]);
  });
  it("saving no drawings removes the key", async () => {
    const st = memory();
    const store = localDrawingStore(st);
    await store.save("X", sample());
    await store.save("X", []);
    assert.equal(st.data.size, 0);
  });
  it("corrupt, wrong-version or hand-edited data loads as nothing or drops only the bad drawings", async () => {
    const st = memory();
    const store = localDrawingStore(st);
    st.setItem(storageKey("A"), "{not json");
    assert.deepEqual(await store.load("A"), []);
    st.setItem(storageKey("B"), JSON.stringify({ v: 99, drawings: sample() }));
    assert.deepEqual(await store.load("B"), []);
    st.setItem(storageKey("C"), JSON.stringify({ v: 1, drawings: [...sample(), { kind: "trend", id: "bad", color: "#fff", a: { time: "x", price: 1 }, b: a }, { kind: "alien" }, null, 5] }));
    assert.equal((await store.load("C")).length, sample().length);
  });
  it("storage that is missing or throws never breaks anything", async () => {
    assert.deepEqual(await localDrawingStore(null).load("X"), []);
    await localDrawingStore(null).save("X", sample());
    const throwing: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
    assert.deepEqual(await localDrawingStore(throwing).load("X"), []);
    await localDrawingStore(throwing).save("X", sample());
  });
  it("parseDrawings validates every field", () => {
    assert.deepEqual(parseDrawings("nope"), []);
    const ok = parseDrawings([{ kind: "hline", id: "h", color: "#abc", width: 9, dash: "wavy", locked: "yes", price: 5 }])[0];
    assert.deepEqual([ok.width, ok.dash, ok.locked], [2, "solid", false]); // bad style values fall back; they are not guessed
    assert.deepEqual(parseDrawings([{ kind: "hline", id: "h", color: "javascript:alert(1)", price: 5 }]), []);
    assert.deepEqual(parseDrawings([{ kind: "hline", id: "h", color: "#abc", price: Number.POSITIVE_INFINITY }]), []);
  });

  describe("autosave", () => {
    const fakeTimers = () => {
      let next = 1;
      const pending = new Map<number, { fn: () => void; ms: number }>();
      const timers: Timers = { set: (fn, ms) => (pending.set(next, { fn, ms }), next++), clear: (h) => void pending.delete(h as number) };
      return { timers, pending, fire: () => [...pending.values()].forEach((p) => (pending.clear(), p.fn())) };
    };
    it("a burst of changes is one write, of the last state, after the delay", async () => {
      const st = memory();
      const saves: number[] = [];
      const store = localDrawingStore(st);
      const spy = { load: store.load, save: async (s: string, d: Drawing[]) => (saves.push(d.length), store.save(s, d)) };
      const ft = fakeTimers();
      const saver = createAutosaver(spy, "RELIANCE", 600, ft.timers);
      saver.schedule(sample().slice(0, 1));
      saver.schedule(sample().slice(0, 2));
      saver.schedule(sample().slice(0, 3));
      assert.equal(ft.pending.size, 1);
      assert.equal([...ft.pending.values()][0].ms, 600);
      assert.equal(saves.length, 0);
      ft.fire();
      await Promise.resolve();
      await Promise.resolve();
      assert.deepEqual(saves, [3]);
      assert.equal((await store.load("RELIANCE")).length, 3);
    });
    it("flush writes at once and leaves nothing pending; cancel forgets", async () => {
      const st = memory();
      const store = localDrawingStore(st);
      const ft = fakeTimers();
      const saver = createAutosaver(store, "A", 600, ft.timers);
      saver.schedule(sample());
      assert.equal(saver.pending, true);
      await saver.flush();
      assert.equal(saver.pending, false);
      assert.equal(ft.pending.size, 0);
      assert.equal((await store.load("A")).length, sample().length);
      saver.schedule(sample().slice(0, 1));
      saver.cancel();
      await saver.flush();
      assert.equal((await store.load("A")).length, sample().length);
    });
  });

  it("storage is browser-only and in one module: nothing in the chart code touches the database or the network", () => {
    for (const f of ["lib/chart/storage.ts", "lib/chart/drawings.ts", "lib/chart/history.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      assert.doesNotMatch(src, /prisma|fetch\(|\/api\//i, f);
    }
    assert.match(fs.readFileSync("lib/chart/storage.ts", "utf8"), /localStorage/);
  });
});

describe("the measure tool", () => {
  const a: Anchor = { time: dailyTimes[2], price: 25000 };
  const b: Anchor = { time: dailyTimes[9], price: 25250 };
  it("points, per cent, candles and time between two points", () => {
    const m = measure(a, b, dailyTimes);
    assert.equal(m.points, 250);
    assert.ok(Math.abs(m.pct - 1) < 1e-9);
    assert.equal(m.candles, 7);
    assert.equal(m.calendarDays, 7);
    assert.deepEqual([m.fromTime, m.toTime], [dailyTimes[2], dailyTimes[9]]);
  });
  it("is signed by direction, and the candle and day counts are not", () => {
    const m = measure(b, a, dailyTimes);
    assert.ok(m.points < 0 && m.pct < 0);
    assert.equal(m.candles, 7);
    assert.deepEqual([m.fromTime, m.toTime], [dailyTimes[2], dailyTimes[9]]);
  });
  it("an index also gives rupees per lot of a future: points moved times the lot size from the feed", () => {
    assert.equal(measure(a, b, dailyTimes, 65, true).rupeesPerLot, 250 * 65);
    assert.equal(measure(b, a, dailyTimes, 65, true).rupeesPerLot, 250 * 65);
  });
  it("with no lot size, or for a stock, there is no rupee figure: never a guess", () => {
    assert.equal(measure(a, b, dailyTimes, null, true).rupeesPerLot, null);
    assert.equal(measure(a, b, dailyTimes, 0, true).rupeesPerLot, null);
    assert.equal(measure(a, b, dailyTimes, 65, false).rupeesPerLot, null);
  });
  it("counts candles across a weekend as bars, not days", () => {
    const times = [D0, D0 + DAY, D0 + 4 * DAY, D0 + 5 * DAY];
    const m = measure({ time: times[1], price: 1 }, { time: times[3], price: 2 }, times);
    assert.equal(m.candles, 2);
    assert.equal(m.calendarDays, 4);
  });
  it("the text is signed and plural-aware", () => {
    assert.deepEqual(measureText(measure(a, b, dailyTimes)), { move: "+250.00 pts (+1.00%)", time: "7 candles · 7 days" });
    assert.deepEqual(measureText(measure(b, { time: b.time + DAY, price: b.price - 12.5 }, dailyTimes)), { move: "-12.50 pts (-0.05%)", time: "1 candle · 1 day" });
  });
});
