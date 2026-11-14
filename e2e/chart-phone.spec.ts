import fs from "node:fs";
import { test, expect, type CDPSession, type Page } from "@playwright/test";
import { RELIANCE_BARS, openTrade, spot, stored, waitStored } from "./chart-helpers";

/**
 * Phone behaviour of the chart tools at 390 px, with real touch input (Chrome's own touch gestures, not mouse clicks):
 * the collapsible tool rail and floating quick bar, two-point tools placed by tap then tap, a pinch or two-finger pan never drawing,
 * the page not scrolling while a tool is active, and a vertical swipe on the chart scrolling the page when no tool is active.
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

const view = async (page: Page): Promise<{ from: number; to: number }> => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-view")) ?? "{}");

/** the scroll position of whatever scrolls the page (the app's main area on a phone, or the window) */
const scrollTop = (page: Page) =>
  page.evaluate(() => {
    let n: HTMLElement | null = document.querySelector('[data-testid="chart-with-tools"]') as HTMLElement;
    while (n) {
      const s = getComputedStyle(n);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && n.scrollHeight > n.clientHeight) return n.scrollTop;
      n = n.parentElement;
    }
    return window.scrollY;
  });

/** put the chart at the top of the screen so every tap lands inside the viewport */
async function show(page: Page) {
  await page.evaluate(() => document.querySelector('[data-testid="chart-with-tools"]')!.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
}
const cdpFor = async (page: Page): Promise<CDPSession> => page.context().newCDPSession(page);
/** one finger from `from` to `to`, as real touch events (start, a run of moves, end) */
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 14) {
  const cdp = await cdpFor(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", p?: { x: number; y: number }) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
  await touch("touchStart", from);
  for (let s = 1; s <= steps; s++) {
    await touch("touchMove", { x: from.x + ((to.x - from.x) * s) / steps, y: from.y + ((to.y - from.y) * s) / steps });
    await page.waitForTimeout(12);
  }
  await touch("touchEnd");
  await page.waitForTimeout(400);
}
const centreOfChart = async (page: Page) => {
  const b = (await page.getByTestId("drawing-layer").boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** tap at bar `i` and a fraction of the plot's height from the top (the floating quick bar sits in the top 30%, so taps go lower) */
const tapAt = async (page: Page, i: number, yFrac: number) => {
  const s = await spot(page, i, 1);
  const b = (await page.getByTestId("drawing-layer").boundingBox())!;
  await page.touchscreen.tap(s.x, b.y + yFrac * b.height);
};

async function openPhone(page: Page) {
  await openTrade(page);
  await show(page);
}
const pickTool = async (page: Page, tool: string) => {
  if ((await page.getByTestId("tool-rail").getAttribute("data-open")) !== "1") await page.getByTestId("rail-toggle").tap();
  await page.getByTestId(`tool-${tool}`).tap();
};

test("the tool rail starts collapsed on a phone, opens and closes, and every button is a 44 px target", async ({ page }) => {
  await openPhone(page);
  await expect(page.getByTestId("tool-rail")).toHaveAttribute("data-open", "0");
  await expect(page.getByTestId("tool-trend")).toHaveCount(0);
  await expect(page.getByTestId("quick-bar")).toBeVisible(); // the quick bar is always there
  await page.getByTestId("rail-toggle").tap();
  await expect(page.getByTestId("tool-rail")).toHaveAttribute("data-open", "1");
  for (const id of ["select", "hline", "trend", "ray", "rect", "channel", "text", "measure"]) {
    const b = await page.getByTestId(`tool-${id}`).boundingBox();
    expect(b!.width, id).toBeGreaterThanOrEqual(44);
    expect(b!.height, id).toBeGreaterThanOrEqual(44);
  }
  for (const id of ["undo", "redo", "magnet", "stay", "rail-toggle"]) {
    const b = await page.getByTestId(id).boundingBox();
    expect(b!.width, id).toBeGreaterThanOrEqual(44);
    expect(b!.height, id).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId("rail-toggle").tap();
  await expect(page.getByTestId("tool-rail")).toHaveAttribute("data-open", "0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("a two-point tool is placed by tap, then tap", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "trend");
  await expect(page.getByTestId("tool-hint")).toHaveText("Tap two points.");
  await tapAt(page, 250, 0.6);
  await page.waitForTimeout(200);
  expect(await stored(page)).toEqual([]); // one tap is a first point, not a drawing
  await tapAt(page, 262, 0.8);
  const [d] = await waitStored(page, 1);
  expect(d.kind).toBe("trend");
  expect(d.a!.time).toBeLessThan(d.b!.time);
  await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-tool", "select");
});

test("a pinch never draws, and a tap after it is still only a first point", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "trend");
  const cdp = await cdpFor(page);
  const c = await centreOfChart(page);
  const before = await view(page);
  await cdp.send("Input.synthesizePinchGesture", { x: c.x, y: c.y, scaleFactor: 1.7, gestureSourceType: "touch" });
  await page.waitForTimeout(500);
  expect(await stored(page)).toEqual([]);
  await expect(page.getByTestId("drawing-layer").locator("g[data-drawing]")).toHaveCount(0);
  expect(JSON.stringify(await view(page))).not.toBe(JSON.stringify(before)); // it zoomed the chart instead
  await tapAt(page, 255, 0.6); // one tap: a first point only
  await page.waitForTimeout(200);
  expect(await stored(page)).toEqual([]);
});

test("a two-finger pan never draws", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "ray");
  const cdp = await cdpFor(page);
  const c = await centreOfChart(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", pts: { x: number; y: number; id: number }[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
  await send("touchStart", [{ x: c.x - 30, y: c.y, id: 1 }, { x: c.x + 30, y: c.y, id: 2 }]);
  for (let s = 1; s <= 8; s++) await send("touchMove", [{ x: c.x - 30 + s * 10, y: c.y + s * 4, id: 1 }, { x: c.x + 30 + s * 10, y: c.y + s * 4, id: 2 }]);
  await send("touchEnd", []);
  await page.waitForTimeout(400);
  expect(await stored(page)).toEqual([]);
  await expect(page.getByTestId("drawing-layer").locator("g[data-drawing]")).toHaveCount(0);
  // and the next two taps are an ordinary ray, so nothing was left half-placed by the pan
  await tapAt(page, 250, 0.6);
  await tapAt(page, 260, 0.75);
  const [d] = await waitStored(page, 1);
  expect(d.kind).toBe("ray");
});

test("with a tool in hand a one-finger drag pans the chart and draws nothing", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "rect");
  const c = await centreOfChart(page);
  const before = await view(page);
  await swipe(page, { x: c.x - 60, y: c.y + 30 }, { x: c.x + 80, y: c.y + 30 });
  const after = await view(page);
  expect(after.from).toBeLessThan(before.from - 3); // dragged right: an earlier part of the chart
  expect(await stored(page)).toEqual([]);
});

test("the page does not scroll while a tool is active, even on a vertical swipe over the chart", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "trend");
  const c = await centreOfChart(page);
  const top = await scrollTop(page);
  await swipe(page, { x: c.x, y: c.y + 70 }, { x: c.x, y: c.y - 90 }); // finger moves up: the page would scroll down
  expect(await scrollTop(page)).toBe(top);
  expect(await stored(page)).toEqual([]);
});

test("with no tool active a vertical swipe on the chart scrolls the page", async ({ page }) => {
  await openPhone(page);
  await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-tool", "select");
  const c = await centreOfChart(page);
  const top = await scrollTop(page);
  await swipe(page, { x: c.x, y: c.y + 80 }, { x: c.x, y: c.y - 120 });
  expect(await scrollTop(page)).toBeGreaterThan(top + 60);
});

test("control: the same swipe made off the chart scrolls the page, so the test above means something", async ({ page }) => {
  await openPhone(page);
  const top = await scrollTop(page);
  const heading = (await page.getByTestId("chart-with-tools").boundingBox())!;
  // start on the toolbox row above the chart (plain page content), 60 px from its top
  await swipe(page, { x: 195, y: heading.y + 60 }, { x: 195, y: heading.y - 140 });
  expect(await scrollTop(page)).toBeGreaterThan(top + 60);
});

test("with no tool active a horizontal drag still pans the chart", async ({ page }) => {
  await openPhone(page);
  const c = await centreOfChart(page);
  const before = await view(page);
  await swipe(page, { x: c.x - 60, y: c.y + 30 }, { x: c.x + 80, y: c.y + 30 });
  expect((await view(page)).from).toBeLessThan(before.from - 3);
});

test("a selected drawing's handles are 44 px or more, and a touch drag on one moves it without scrolling the page", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "trend");
  await tapAt(page, 253, 0.8);
  await tapAt(page, 264, 0.55);
  const [before] = await waitStored(page, 1);
  const hb = await page.getByTestId("handle-b").boundingBox();
  expect(hb!.width).toBeGreaterThanOrEqual(44);
  expect(hb!.height).toBeGreaterThanOrEqual(44);
  const cdp = await cdpFor(page);
  const top = await scrollTop(page);
  const x = hb!.x + hb!.width / 2;
  const y = hb!.y + hb!.height / 2;
  const send = (type: "touchStart" | "touchMove" | "touchEnd", pts: { x: number; y: number }[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })) });
  await send("touchStart", [{ x, y }]);
  for (let s = 1; s <= 8; s++) await send("touchMove", [{ x: x - s * 6, y: y + s * 9 }]); // mostly downwards: a page scroll if the page got it
  await send("touchEnd", []);
  await expect.poll(async () => (await stored(page))[0].b!.price).toBeLessThan(before.b!.price);
  expect((await stored(page))[0].a).toEqual(before.a);
  expect(await scrollTop(page)).toBe(top);
});

test("the quick bar: undo and redo, delete the selected drawing, done", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "hline");
  await tapAt(page, 255, 0.6);
  await waitStored(page, 1);
  await expect(page.getByTestId("quick-delete")).toBeVisible();
  await page.getByTestId("quick-delete").tap();
  await waitStored(page, 0);
  await page.getByTestId("undo").tap();
  await waitStored(page, 1);
  await page.getByTestId("redo").tap();
  await waitStored(page, 0);
  await pickTool(page, "trend");
  await expect(page.getByTestId("done")).toBeVisible();
  await page.getByTestId("done").tap();
  await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-tool", "select");
  await expect(page.getByTestId("done")).toHaveCount(0);
});

test("390 px screenshot with several drawings", async ({ page }) => {
  await openPhone(page);
  await page.getByTestId("stay").tap(); // stay in drawing mode: switch tools without reopening anything
  await pickTool(page, "hline");
  await tapAt(page, 258, 0.45);
  await pickTool(page, "trend");
  await tapAt(page, 252, 0.85);
  await tapAt(page, 264, 0.62);
  await pickTool(page, "rect");
  await tapAt(page, 262, 0.9);
  await tapAt(page, 269, 0.66);
  await pickTool(page, "text");
  await tapAt(page, 254, 0.46);
  await page.getByLabel("Note text").fill("Support");
  await page.keyboard.press("Enter");
  await page.getByTestId("done").tap();
  await page.getByTestId("rail-toggle").tap(); // collapse the rail for the picture
  const ds = await waitStored(page, 4);
  expect(ds.map((d) => d.kind).sort()).toEqual(["hline", "rect", "text", "trend"]);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  fs.mkdirSync("docs/chart-tools", { recursive: true });
  await page.getByTestId("chart-with-tools").screenshot({ path: "docs/chart-tools/chart-tools-390.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

/* ------------------------------------------------------------------------------------------ phase 2 -- */

/** the price as the readout writes it: two decimals, Indian digit grouping */
const px2 = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** hold one finger still on the chart for `ms`, then (optionally) lift it */
async function press(page: Page, at: { x: number; y: number }, ms: number, lift = true) {
  const cdp = await cdpFor(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
  await page.waitForTimeout(ms);
  if (lift) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return cdp;
}

test("a long press shows a crosshair with the open, high, low and close of that bar", async ({ page }) => {
  await openPhone(page);
  await expect(page.getByTestId("crosshair-readout")).toHaveCount(0);
  const s = await spot(page, 250, 1);
  const b = (await page.getByTestId("drawing-layer").boundingBox())!;
  const cdp = await press(page, { x: s.x, y: b.y + b.height * 0.6 }, 900, false);
  const ro = page.getByTestId("crosshair-readout");
  await expect(ro).toBeVisible();
  // the numbers are one real bar's: find it in the data the page was given
  const got = ["open", "high", "low", "close"].map((k) => page.getByTestId(`ro-${k}`));
  const texts = await Promise.all(got.map((g) => g.innerText()));
  const row = RELIANCE_BARS.find((r) => px2(r[1] as number) === texts[0]);
  expect(row, "an open price that is in the data").toBeTruthy();
  expect([px2(row![2] as number), px2(row![3] as number), px2(row![4] as number)]).toEqual([texts[1], texts[2], texts[3]]);
  expect(Math.abs(RELIANCE_BARS.indexOf(row!) - 250)).toBeLessThanOrEqual(1); // the bar under the finger
  await expect(page.getByTestId("ro-date")).toContainText("2026");
  // a readout is not a tool: nothing was drawn, and the page's own scroll and the chart's view did not move
  expect(await stored(page)).toEqual([]);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
});

test("a pan or a swipe on the chart does not bring up the readout", async ({ page }) => {
  await openPhone(page);
  const c = await centreOfChart(page);
  await swipe(page, { x: c.x - 60, y: c.y + 30 }, { x: c.x + 80, y: c.y + 30 });
  await expect(page.getByTestId("crosshair-readout")).toHaveCount(0);
  await swipe(page, { x: c.x, y: c.y + 80 }, { x: c.x, y: c.y - 100 });
  await expect(page.getByTestId("crosshair-readout")).toHaveCount(0);
});

test("a long press with a drawing tool in hand does not place anything", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "trend");
  const s = await spot(page, 250, 1);
  const b = (await page.getByTestId("drawing-layer").boundingBox())!;
  await press(page, { x: s.x, y: b.y + b.height * 0.6 }, 1000);
  await page.waitForTimeout(400);
  await page.getByTestId("done").tap();
  expect(await stored(page)).toEqual([]);
});

test("on a phone: tap a level, tap 'Alert when price crosses', and the level carries a bell", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "hline");
  await tapAt(page, 258, 0.5);
  await waitStored(page, 1);
  const btn = page.getByTestId("level-alert");
  await btn.scrollIntoViewIfNeeded();
  const b = (await btn.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  await btn.tap();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("drawing-layer")).not.toHaveAttribute("data-alerted", "[]");
  await show(page);
  await page.getByTestId("chart-with-tools").screenshot({ path: "docs/chart-tools/level-alert-390.png" });
  await btn.tap();
  await expect(btn).toHaveAttribute("aria-pressed", "false");
});

test("on a phone the brush draws a finger drag, the page does not scroll, and a pinch with the brush draws nothing", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "brush");
  const c = await centreOfChart(page);
  const top = await scrollTop(page);
  const v0 = await view(page);
  // one finger: a wavy stroke
  const cdp = await cdpFor(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", p?: { x: number; y: number }) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
  await touch("touchStart", { x: c.x - 70, y: c.y + 40 });
  for (let i = 1; i <= 20; i++) {
    await touch("touchMove", { x: c.x - 70 + i * 7, y: c.y + 40 - Math.sin(i / 3) * 30 - i * 2 });
    await page.waitForTimeout(12);
  }
  await touch("touchEnd");
  const [d] = await waitStored(page, 1);
  expect(d.kind).toBe("brush");
  expect((d as unknown as { points: unknown[] }).points.length).toBeGreaterThan(8);
  expect(await scrollTop(page)).toBe(top); // the page did not scroll under the finger
  expect(await view(page)).toEqual(v0); // and the chart did not pan
  // a pinch with the brush in hand: it zooms the chart, and draws nothing
  await pickTool(page, "brush");
  await cdp.send("Input.synthesizePinchGesture", { x: c.x, y: c.y, scaleFactor: 1.7, gestureSourceType: "touch" });
  await page.waitForTimeout(500);
  expect((await stored(page)).length).toBe(1);
});

test("on a phone a Fibonacci retracement is two taps", async ({ page }) => {
  await openPhone(page);
  await pickTool(page, "fib");
  await tapAt(page, 252, 0.4);
  await tapAt(page, 266, 0.8);
  const [d] = await waitStored(page, 1);
  expect(d.kind).toBe("fib");
  await expect(page.getByTestId("fib-label")).toHaveCount(7);
});
