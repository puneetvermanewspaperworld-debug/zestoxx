import { test, expect, type Page } from "@playwright/test";
import { layerBox, openTrade, spot } from "./chart-helpers";
import { tick } from "./action-helpers";

/**
 * The price axis of the chart, by touch and by mouse. A finger on the axis stretches or squeezes the price range; a finger on the plot moves it,
 * and a horizontal drag and a pinch still pan and zoom the time axis. Auto (the status bar's button, or a double tap on the axis) fits the range again,
 * and while the range is set by hand the button says so. The range survives price ticks and is fitted again for another timeframe. Real touch events
 * (Chrome's own gestures through the DevTools protocol), because a mouse never took the path that failed: the library took a vertical touch drag on
 * the axis for a page scroll.
 */
interface Range {
  lo: number;
  hi: number;
  auto: boolean;
}
const range = async (page: Page): Promise<Range> => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-price-range")) ?? "null");
const view = async (page: Page) => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-view")) ?? "{}") as { from: number; to: number };
const width = (r: Range) => r.hi - r.lo;

async function touches(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", pts: { x: number; y: number; id: number }[] = []) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  return {
    /** one finger from `from` by (dx, dy) */
    async drag(from: { x: number; y: number }, dx: number, dy: number, steps = 12) {
      await send("touchStart", [{ ...from, id: 1 }]);
      for (let s = 1; s <= steps; s++) {
        await send("touchMove", [{ x: from.x + (dx * s) / steps, y: from.y + (dy * s) / steps, id: 1 }]);
        await page.waitForTimeout(16);
      }
      await send("touchEnd");
      await page.waitForTimeout(300);
    },
    /** two fingers on a horizontal line, `from` apart to `to` apart */
    async pinch(centre: { x: number; y: number }, from: number, to: number, steps = 10) {
      await send("touchStart", [{ x: centre.x - from / 2, y: centre.y, id: 1 }, { x: centre.x + from / 2, y: centre.y, id: 2 }]);
      for (let s = 1; s <= steps; s++) {
        const d = from + ((to - from) * s) / steps;
        await send("touchMove", [{ x: centre.x - d / 2, y: centre.y, id: 1 }, { x: centre.x + d / 2, y: centre.y, id: 2 }]);
        await page.waitForTimeout(16);
      }
      await send("touchEnd");
      await page.waitForTimeout(300);
    },
  };
}

/** the middle of the price axis, and of the plot, in page coordinates */
async function where(page: Page) {
  const b = (await page.getByTestId("trade-chart").boundingBox())!;
  const aw = Number(await page.getByTestId("trade-chart").getAttribute("data-axis-width"));
  return { axis: { x: b.x + b.width - aw / 2, y: b.y + b.height * 0.4 }, plot: { x: b.x + (b.width - aw) / 2, y: b.y + b.height * 0.5 }, aw, box: b };
}

for (const [w, h] of [[390, 844], [360, 800]] as const) {
  test.describe(`touch at ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });

    test("the price axis is at least 44px wide, and the last candles are outside it", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const { aw, box } = await where(page);
      expect(aw).toBeGreaterThanOrEqual(44);
      // the plot ends where the axis begins: nothing of the candles is under the touch zone
      const layer = await layerBox(page);
      expect(layer.x + layer.width).toBeLessThanOrEqual(box.x + box.width - aw + 1);
    });

    test("dragging up on the price axis stretches the range, dragging down squeezes it; auto goes off", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const t = await touches(page);
      const { axis } = await where(page);
      const start = await range(page);
      expect(start.auto).toBe(true);
      await expect(page.getByTestId("auto-button")).toHaveAttribute("data-auto", "1");
      await t.drag(axis, 0, -150);
      const up = await range(page);
      expect(width(up), "dragging up shows fewer prices: the candles are taller").toBeLessThan(width(start) * 0.9);
      expect(up.auto).toBe(false);
      await t.drag(axis, 0, 300);
      const down = await range(page);
      expect(width(down), "dragging down shows more prices").toBeGreaterThan(width(up) * 1.2);
      expect(down.auto).toBe(false);
    });

    test("dragging the plot up or down moves the price range without changing its size; a horizontal drag still pans the time axis and a pinch still zooms it", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const t = await touches(page);
      const { plot, axis } = await where(page);
      // a horizontal pan: the bars move and the price scale is left alone (auto stays on, and fits what comes into view)
      const v0 = await view(page);
      const r0 = await range(page);
      await t.drag(plot, 120, 0);
      const v1 = await view(page);
      expect(Math.abs(v1.from - v0.from), "the bars moved").toBeGreaterThan(3);
      const r1 = await range(page);
      expect(r1.auto, "a sideways pan does not take the price scale off auto").toBe(true);
      expect(r0.auto).toBe(true);
      // a pinch: more or fewer bars in view
      const span0 = v1.to - v1.from;
      await t.pinch(plot, 80, 200);
      const v2 = await view(page);
      expect(v2.to - v2.from, "spreading two fingers zooms in").toBeLessThan(span0 * 0.85);
      // now the price range: squeeze it by hand first so there is room to move, then drag the plot
      await t.drag(axis, 0, 200);
      const before = await range(page);
      await t.drag(plot, 0, 120);
      const moved = await range(page);
      expect(Math.abs(moved.lo - before.lo), "the range moved").toBeGreaterThan(width(before) * 0.05);
      expect(width(moved), "and kept its size").toBeCloseTo(width(before), 0);
      expect(moved.auto).toBe(false);
    });

    test("Auto fits the range again, and says whether it is on; a double tap on the axis does the same", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const t = await touches(page);
      const { axis } = await where(page);
      const start = await range(page);
      await t.drag(axis, 0, -150);
      const button = page.getByTestId("auto-button");
      await expect(button).toHaveAttribute("data-auto", "0");
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByTestId("auto-off-dot")).toBeVisible();
      await button.tap();
      await page.waitForTimeout(300);
      const back = await range(page);
      expect(back.auto).toBe(true);
      expect(back.lo).toBeCloseTo(start.lo, 0);
      expect(back.hi).toBeCloseTo(start.hi, 0);
      await expect(button).toHaveAttribute("data-auto", "1");
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("auto-off-dot")).toHaveCount(0);
      // by double tap
      await t.drag(axis, 0, -150);
      expect((await range(page)).auto).toBe(false);
      await page.touchscreen.tap(axis.x, axis.y);
      await page.waitForTimeout(60);
      await page.touchscreen.tap(axis.x, axis.y);
      await page.waitForTimeout(300);
      const again = await range(page);
      expect(again.auto).toBe(true);
      expect(again.hi).toBeCloseTo(start.hi, 0);
      await expect(button).toHaveAttribute("data-auto", "1");
    });

    test("a price tick does not reset a range set by hand; another timeframe does", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const t = await touches(page);
      const { axis } = await where(page);
      await t.drag(axis, 0, -150);
      const set = await range(page);
      expect(set.auto).toBe(false);
      await tick(page); // the app's price pulls and ticks
      const after = await range(page);
      expect(after.auto).toBe(false);
      expect(after.lo).toBeCloseTo(set.lo, 1);
      expect(after.hi).toBeCloseTo(set.hi, 1);
      // another timeframe fits the new data again
      await page.getByTestId("ibar-5m").click();
      await expect.poll(async () => (await range(page)).auto, { timeout: 15_000 }).toBe(true);
      await expect(page.getByTestId("auto-button")).toHaveAttribute("data-auto", "1");
    });

    test("with a drawing tool in hand, a drag on the axis still scales the price and draws nothing", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const t = await touches(page);
      const { axis } = await where(page);
      const drawings = () => page.getByTestId("drawing-layer").locator("svg").getAttribute("data-drawings");
      for (const tool of ["trend", "measure", "brush"]) {
        await page.getByTestId(`tool-${tool}`).tap();
        const before = await range(page);
        await t.drag(axis, 0, -100);
        const after = await range(page);
        expect(width(after), `${tool}: the range changed`).toBeLessThan(width(before) * 0.95);
        expect(await drawings(), `${tool}: nothing was drawn`).toBe("0");
        await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-tool", tool);
        await page.getByTestId("auto-button").tap(); // back to auto for the next one
        await page.waitForTimeout(200);
      }
    });

    test("with Brush in hand a finger on the plot draws and leaves the price range alone, while the axis next to it still scales", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const t = await touches(page);
      const { plot, axis } = await where(page);
      await page.getByTestId("tool-brush").tap();
      const start = await range(page);
      await t.drag(plot, 40, -120);
      const after = await range(page);
      expect(after.lo).toBeCloseTo(start.lo, 1);
      expect(after.hi).toBeCloseTo(start.hi, 1);
      expect(after.auto, "the stroke did not take the scale off auto").toBe(true);
      expect(await page.getByTestId("drawing-layer").locator("svg").getAttribute("data-drawings")).toBe("1");
      await t.drag(axis, 0, -120);
      expect((await range(page)).auto).toBe(false);
    });

    test("a level (and its alert) stays where it is while the axis is dragged next to it", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const t = await touches(page);
      await page.getByTestId("tool-hline").tap();
      const s = await spot(page, 258, 1);
      const layer = await layerBox(page);
      await page.touchscreen.tap(s.x, layer.y + layer.height * 0.55);
      const levels = () => page.getByTestId("drawing-layer").getAttribute("data-levels");
      await expect.poll(levels).not.toBe("[]");
      const level = await levels();
      const btn = page.getByTestId("level-alert");
      await btn.scrollIntoViewIfNeeded();
      await btn.tap();
      const alerted = await page.getByTestId("drawing-layer").getAttribute("data-alerted");
      expect(alerted).not.toBe("[]");
      // drag the axis, starting level with the line
      const { axis } = await where(page);
      const y = layer.y + layer.height * 0.55;
      const r0 = await range(page);
      await t.drag({ x: axis.x, y }, 0, -120);
      expect(width(await range(page))).toBeLessThan(width(r0)); // the axis scaled
      expect(await levels(), "the level is still at its price").toBe(level);
      expect(await page.getByTestId("drawing-layer").getAttribute("data-alerted")).toBe(alerted);
    });
  });
}

test.describe("with a mouse on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("dragging the price axis scales it, and a double click on the axis fits it again", async ({ page }) => {
    await openTrade(page, "RELIANCE");
    const { axis } = await where(page);
    const start = await range(page);
    await page.mouse.move(axis.x, axis.y);
    await page.mouse.down();
    await page.mouse.move(axis.x, axis.y - 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const scaled = await range(page);
    expect(width(scaled)).not.toBeCloseTo(width(start), 0);
    expect(scaled.auto).toBe(false);
    await page.mouse.dblclick(axis.x, axis.y);
    await page.waitForTimeout(300);
    const back = await range(page);
    expect(back.auto).toBe(true);
    expect(back.hi).toBeCloseTo(start.hi, 0);
  });
});
