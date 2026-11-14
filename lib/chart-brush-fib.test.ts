import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DAY, makeViewport, type Viewport } from "./chart/coords";
import { FIB_RATIOS, MAX_BRUSH_POINTS, cloneDrawing, cloneOffset, createDrawing, dragHandle, fibLabel, fibLevels, fibPrice, moveDrawing, parseDrawings, pointsNeeded, thinPoints, type Anchor, type Drawing } from "./chart/drawings";
import { HANDLE_RADIUS, hitTest, shapeOf } from "./chart/hit";
import { canUndo, commit, initialHistory, undo } from "./chart/history";
import { localDrawingStore, type StorageLike } from "./chart/storage";

const D0 = Date.UTC(2026, 9, 5) / 1000;
const times = Array.from({ length: 60 }, (_, i) => D0 + i * DAY);
/** bar i at x = 20 + 10 i; price p at y = 500 - 0.5 p */
const chart = (xpb = 10): Viewport =>
  makeViewport({ times, width: 600, height: 480, logicalToX: (l) => 20 + l * xpb, xToLogical: (x) => (x - 20) / xpb, priceToY: (p) => 500 - 0.5 * p, yToPrice: (y) => (500 - y) / 0.5 });
const at = (i: number, price: number): Anchor => ({ time: times[i], price });
const memory = (): StorageLike => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe("Fibonacci retracement", () => {
  it("has a line at each of the usual ratios", () => {
    assert.deepEqual([...FIB_RATIOS], [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
    assert.deepEqual(FIB_RATIOS.map(fibLabel), ["0", "0.236", "0.382", "0.5", "0.618", "0.786", "1"]);
  });
  it("0 is where the move ended and 1 is where it started, an up move retracing downward", () => {
    const a = at(5, 100);
    const b = at(20, 120);
    assert.equal(fibPrice(a, b, 0), 120);
    assert.equal(fibPrice(a, b, 1), 100);
    assert.equal(fibPrice(a, b, 0.5), 110);
    assert.ok(Math.abs(fibPrice(a, b, 0.618) - (120 - 20 * 0.618)) < 1e-9);
  });
  it("a down move retraces upward", () => {
    const a = at(5, 120);
    const b = at(20, 100);
    assert.equal(fibPrice(a, b, 0), 100);
    assert.equal(fibPrice(a, b, 1), 120);
    assert.ok(Math.abs(fibPrice(a, b, 0.382) - (100 + 20 * 0.382)) < 1e-9);
  });
  it("lists every level with its price", () => {
    const l = fibLevels(at(0, 200), at(10, 400));
    assert.equal(l.length, 7);
    assert.deepEqual(l.map((x) => x.ratio), [...FIB_RATIOS]);
    assert.equal(l[0].price, 400);
    assert.equal(l[6].price, 200);
  });
  it("is placed with two points and is made of two anchors only", () => {
    assert.equal(pointsNeeded("fib"), 2);
    assert.equal(createDrawing("fib", [at(1, 100)]), null);
    const d = createDrawing("fib", [at(1, 100), at(9, 150)], "F")!;
    assert.deepEqual(Object.keys(d).sort(), ["a", "b", "color", "dash", "id", "kind", "locked", "width"]);
  });
  const fib = createDrawing("fib", [at(10, 100), at(30, 500)], "F")!; // a: x 120, y 450; b: x 320, y 250 (the move is 200 px high)
  it("is drawn with a line per ratio, from its left point out to the right edge, plus the diagonal", () => {
    const s = shapeOf(fib, chart())!;
    assert.equal(s.levels!.length, 7);
    assert.equal(s.segments.length, 8);
    s.levels!.forEach((l, i) => {
      assert.equal(l.y, 500 - 0.5 * l.price);
      assert.equal(s.segments[i][0].x, 120);
      assert.equal(s.segments[i][1].x, 600);
    });
    assert.deepEqual(s.handles.map((h) => h.id), ["a", "b"]);
  });
  it("is hit on any of its lines and not between them", () => {
    const vp = chart();
    const s = shapeOf(fib, vp)!;
    const y05 = s.levels![3].y;
    assert.deepEqual(hitTest([fib], vp, { x: 450, y: y05 }, { tolerance: 8 }), { id: "F", part: "body" });
    assert.equal(hitTest([fib], vp, { x: 450, y: (s.levels![3].y + s.levels![4].y) / 2 }, { tolerance: 8 }), null);
    assert.equal(hitTest([fib], vp, { x: 60, y: y05 }, { tolerance: 8 }), null); // left of where it starts
  });
  it("has two 44 px handles, one at each end of the move", () => {
    const vp = chart();
    const hit = hitTest([fib], vp, { x: 120 + HANDLE_RADIUS - 1, y: 450 }, { tolerance: 16, selectedId: "F" });
    assert.deepEqual(hit, { id: "F", part: "handle", handle: "a" });
    assert.notDeepEqual(hitTest([fib], vp, { x: 120 + HANDLE_RADIUS + 12, y: 450 }, { tolerance: 0, selectedId: "F" }), { id: "F", part: "handle", handle: "a" });
  });
  it("dragging a handle moves that end only", () => {
    const moved = dragHandle(fib, "b", at(40, 600)) as Extract<Drawing, { kind: "fib" }>;
    assert.deepEqual(moved.b, at(40, 600));
    assert.deepEqual(moved.a, at(10, 100));
    assert.equal(dragHandle(fib, "x", at(40, 600)), fib);
  });
  it("moves and clones as a whole", () => {
    const m = moveDrawing(fib, 2 * DAY, 10) as Extract<Drawing, { kind: "fib" }>;
    assert.deepEqual([m.a, m.b], [{ time: D0 + 12 * DAY, price: 110 }, { time: D0 + 32 * DAY, price: 510 }]);
    const c = cloneDrawing(fib, "F2", DAY, -5);
    assert.equal(c.id, "F2");
    assert.equal(c.locked, false);
  });
  it("keeps its place when the chart is zoomed: same anchors, different pixels", () => {
    const wide = shapeOf(fib, chart(10))!;
    const tight = shapeOf(fib, chart(20))!;
    assert.notEqual(wide.handles[0].x, tight.handles[0].x);
    assert.equal(wide.levels![2].y, tight.levels![2].y);
    assert.deepEqual(fib, createDrawing("fib", [at(10, 100), at(30, 500)], "F"));
  });
  it("survives a save and a reload exactly", async () => {
    const store = localDrawingStore(memory());
    await store.save("RELIANCE", [fib]);
    assert.deepEqual(await store.load("RELIANCE"), [fib]);
  });
});

describe("freehand brush", () => {
  const stroke = (n: number): Anchor[] => Array.from({ length: n }, (_, i) => at(i % 60, 100 + Math.sin(i / 5) * 20 + i * 0.1));
  it("is drawn by dragging, so it needs no tapped points", () => assert.equal(pointsNeeded("brush"), 0));
  it("is made from the points of the stroke, and needs at least two", () => {
    assert.equal(createDrawing("brush", []), null);
    assert.equal(createDrawing("brush", [at(1, 100)]), null);
    assert.equal(createDrawing("brush", [at(1, 100), { time: NaN, price: 1 }]), null);
    const d = createDrawing("brush", stroke(10), "B")!;
    assert.equal(d.kind, "brush");
    assert.equal((d as Extract<Drawing, { kind: "brush" }>).points.length, 10);
  });
  it("a long stroke is thinned to a fixed size, in order, keeping its first and last point and inventing none", () => {
    const long = stroke(1000);
    const t = thinPoints(long);
    assert.equal(t.length, MAX_BRUSH_POINTS);
    assert.equal(t[0], long[0]);
    assert.equal(t[t.length - 1], long[999]);
    let last = -1;
    for (const p of t) {
      const i = long.indexOf(p);
      assert.ok(i > last, "in order");
      last = i;
    }
    assert.deepEqual(thinPoints(stroke(50)), stroke(50)); // a short stroke is left alone
    assert.equal((createDrawing("brush", long)! as Extract<Drawing, { kind: "brush" }>).points.length, MAX_BRUSH_POINTS);
  });
  const brush = createDrawing("brush", [at(10, 100), at(15, 300), at(20, 200), at(30, 400)], "B")!; // x 120, 170, 220, 320
  it("is drawn as a path through its points", () => {
    const s = shapeOf(brush, chart())!;
    assert.deepEqual(s.path!.map((p) => p.x), [120, 170, 220, 320]);
    assert.equal(s.segments.length, 3);
    assert.deepEqual(s.handles, []); // a stroke has no handles: it is moved whole
  });
  it("is hit near its stroke and not away from it", () => {
    const vp = chart();
    const [p0, p1] = shapeOf(brush, vp)!.path!;
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    assert.deepEqual(hitTest([brush], vp, mid, { tolerance: 8 }), { id: "B", part: "body" });
    assert.equal(hitTest([brush], vp, { x: mid.x + 60, y: mid.y }, { tolerance: 8 }), null);
    assert.equal(hitTest([brush], vp, { x: p0.x, y: p0.y }, { tolerance: 8, selectedId: "B" })?.part, "body"); // selected: still no handle to catch
  });
  it("moves and clones by time and price, every point", () => {
    const m = moveDrawing(brush, DAY, 5) as Extract<Drawing, { kind: "brush" }>;
    assert.deepEqual(m.points.map((p) => p.price), [105, 305, 205, 405]);
    assert.equal(m.points[0].time, D0 + 11 * DAY);
    const c = cloneDrawing(brush, "B2", 3 * DAY, -10) as Extract<Drawing, { kind: "brush" }>;
    assert.equal(c.points[3].price, 390);
    assert.equal(c.id, "B2");
    const o = cloneOffset(brush, times);
    assert.equal(o.dTime, 3 * DAY);
    assert.ok(o.dPrice < 0);
  });
  it("dragging a handle changes nothing", () => assert.equal(dragHandle(brush, "a", at(1, 1)), brush));
  it("is stored by (time, price) only, and survives a save and a reload", async () => {
    const stored = JSON.stringify(brush);
    assert.ok(!/"x"|"y"/.test(stored));
    const store = localDrawingStore(memory());
    await store.save("TCS", [brush]);
    assert.deepEqual(await store.load("TCS"), [brush]);
  });
  it("a hand-edited or damaged stroke is dropped, never repaired", () => {
    const good = JSON.parse(JSON.stringify(brush));
    assert.equal(parseDrawings([good]).length, 1);
    assert.equal(parseDrawings([{ ...good, points: [good.points[0]] }]).length, 0); // one point is not a stroke
    assert.equal(parseDrawings([{ ...good, points: [...good.points, { time: "x", price: 1 }] }]).length, 0);
    assert.equal(parseDrawings([{ ...good, points: "nope" }]).length, 0);
    assert.equal(parseDrawings([{ ...good, points: Array.from({ length: 401 }, () => good.points[0]) }]).length, 0);
  });
  it("adding a stroke is one undo step", () => {
    const h = commit(initialHistory(), [brush]);
    assert.ok(canUndo(h));
    assert.deepEqual(undo(h).present, []);
  });
});
