import { test, expect, type Page } from "@playwright/test";
import { mockMarket, openTrade } from "./chart-helpers";
import { measureShare } from "./screen-share";
import { simulateChain } from "../lib/options";

/**
 * The Trade chart screen on a phone. From the top: one header row, one interval bar (with the chart type, the studies and More at its end),
 * the chart with a full-height tool rail at its left, a studies legend in its top-left corner and a slim status bar under it, and a pull-up
 * drawer (Trade, Open Orders, Positions) that is collapsed to the two order buttons. The chart takes everything between the header and
 * the collapsed drawer, upright and sideways; the page does not scroll. The chart page is dark unless the light theme is chosen.
 */
const phone = (width: number, height: number) => ({ viewport: { width, height }, isMobile: true, hasTouch: true });
const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;

/** one finger from `from` to `to`, as real touch events */
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", p?: { x: number; y: number }) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
  await touch("touchStart", from);
  for (let s = 1; s <= steps; s++) {
    await touch("touchMove", { x: from.x + ((to.x - from.x) * s) / steps, y: from.y + ((to.y - from.y) * s) / steps });
    await page.waitForTimeout(12);
  }
  await touch("touchEnd");
  await page.waitForTimeout(350);
}
const view = async (page: Page) => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-view")) ?? "{}") as { from: number; to: number };
/** the left edge of the price axis, in page coordinates */
const axisLeft = async (page: Page) => {
  const plot = await box(page, "trade-chart");
  const w = Number(await page.getByTestId("trade-chart").getAttribute("data-axis-width"));
  return plot.x + plot.width - w;
};

/** an index chain whose nearest expiry is `nearest` (a day in November 2026) */
async function mockChain(page: Page, nearest: string) {
  await page.route("**/api/options-chain**", (r) => r.fulfill({ json: { ...simulateChain("NIFTY50", 25250, null), source: "live", expiry: nearest, expiries: [nearest, "2026-11-26"] } }));
}

for (const [w, h] of [
  [360, 800],
  [390, 844],
] as const) {
  test.describe(`upright ${w}x${h}`, () => {
    test.use(phone(w, h));

    test("the chart takes everything between the header and the collapsed drawer, and the page does not scroll", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const m = await measureShare(page);
      console.log(`share ${w}x${h}`, JSON.stringify({ share: m.share, chartTop: m.chartTop, chart: m.chart }));
      expect(m.share).toBeGreaterThanOrEqual(70);
      expect(m.pageScroll).toBe(0);
      expect(m.coveredPx).toBe(0);
      // header, interval bar: two rows stand above the plot, nothing else
      const header = await box(page, "trade-header");
      const controls = await box(page, "chart-controls");
      expect(header.y).toBeLessThan(2);
      expect(header.height).toBeLessThanOrEqual(54);
      expect(controls.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
      expect(controls.height).toBeLessThanOrEqual(46);
      expect(m.chartTop).toBeLessThanOrEqual(controls.y + controls.height + 2);
      // the drawer is the last thing on the screen and starts where the chart card ends
      const card = await box(page, "chart-with-tools");
      const drawer = await box(page, "drawer-collapsed");
      expect(card.y + card.height).toBeLessThanOrEqual(drawer.y + 1);
      expect(Math.round(drawer.y + drawer.height)).toBe(h);
      expect(drawer.height).toBeLessThanOrEqual(58);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // the licence's link and whole notice are under the chart, not behind a tap
      await expect(page.getByTestId("chart-attribution")).toContainText("TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc.");
      await expect(page.getByTestId("chart-attribution").getByRole("link", { name: "TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc." })).toHaveAttribute("href", "https://www.tradingview.com/");
      // and it is one line, all of it on screen
      const one = await page.getByTestId("chart-attribution").evaluate((el) => ({ h: el.getBoundingClientRect().height, over: el.scrollWidth > el.clientWidth + 1, right: el.getBoundingClientRect().right }));
      expect(one.h, "one line of 10px text").toBeLessThanOrEqual(14);
      expect(one.over, "the line is not cut off").toBe(false);
      expect(one.right).toBeLessThanOrEqual(w + 0.5);
    });

    test("the header is one row: back, symbol, price and change; the app's own bars are gone", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      for (const id of ["trade-back", "header-price", "header-change"]) await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId("trade-header").getByRole("heading", { name: "RELIANCE" })).toBeVisible();
      await expect(page.getByTestId("expiry-today")).toHaveCount(0); // a stock has no expiry tag
      await expect(page.getByRole("link", { name: /ZESTOXX/ })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
      const rows = await page.getByTestId("trade-header").locator("> *").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(Math.max(...rows) - Math.min(...rows)).toBeLessThan(12);
    });

    test("an index that expires today shows an Expiry today tag", async ({ page }) => {
      await mockChain(page, "2026-11-11"); // the test clock is Wed 11 Nov 2026, 13:50 IST
      await openTrade(page, "NIFTY50");
      await expect(page.getByTestId("expiry-today")).toHaveText("Expiry today");
      const tag = await box(page, "expiry-today");
      const header = await box(page, "trade-header");
      expect(tag.y).toBeGreaterThanOrEqual(header.y);
      expect(tag.x + tag.width).toBeLessThanOrEqual(w);
    });

    test("an index whose nearest expiry is later has no Expiry today tag", async ({ page }) => {
      await mockChain(page, "2026-11-12");
      await openTrade(page, "NIFTY50");
      await expect(page.getByTestId("paper-buy-call")).toBeEnabled({ timeout: 15_000 });
      await expect(page.getByTestId("expiry-today")).toHaveCount(0);
    });

    test("one interval bar: 1m 5m 15m 30m 1h D and a dropdown, then chart type, studies and More as icons, all in the same row", async ({ page }) => {
      const seen: string[] = [];
      await openTrade(page, "RELIANCE", { seen });
      const bar = page.getByTestId("chart-controls");
      const row = (await bar.boundingBox())!;
      for (const id of ["ibar-1m", "ibar-5m", "ibar-15m", "ibar-30m", "ibar-1h", "ibar-1D", "interval-button", "chart-type-button", "studies-button", "more-button"]) {
        const b = (await bar.getByTestId(id).boundingBox())!;
        expect(b.height, id).toBeGreaterThanOrEqual(43.5);
        expect(b.width, id).toBeGreaterThanOrEqual(43.5);
        expect(Math.abs(b.y - row.y), id).toBeLessThan(6); // one row
      }
      // the three icons stay in sight at the end of the bar; the intervals scroll if the screen is narrow
      for (const id of ["chart-type-button", "studies-button", "more-button"]) {
        const b = (await bar.getByTestId(id).boundingBox())!;
        expect(b.x + b.width, id).toBeLessThanOrEqual(w + 0.5);
      }
      // no Compare, Alert, grid or settings buttons on the bar: they are in More
      for (const id of ["compare-button", "alert-button", "grid-button", "settings-button", "scale-button", "fullscreen-button"]) await expect(page.getByTestId(id)).toHaveCount(0);
      await expect(bar.getByTestId("ibar-1D")).toHaveAttribute("aria-checked", "true");
      await bar.getByTestId("ibar-5m").click();
      await expect(bar.getByTestId("ibar-5m")).toHaveAttribute("aria-checked", "true");
      await expect.poll(() => seen.some((s) => s.includes("interval=5m"))).toBe(true);
      await bar.getByTestId("interval-button").click();
      await page.getByTestId("interval-2h").click();
      await expect(bar.getByTestId("interval-button")).toContainText("2h");
      await expect.poll(() => seen.some((s) => s.includes("interval=2h"))).toBe(true);
    });

    test("More holds Compare, Alert, the formula, grid, magnet, scale, settings, fullscreen and the Pulse pill", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await page.getByTestId("more-button").click();
      const sheet = page.getByTestId("more-sheet");
      for (const id of ["compare-button", "alert-button", "grid-button", "crosshair-magnet-button", "settings-button", "scale-button", "fullscreen-button", "formula-input", "pulse-pill"]) await expect(sheet.getByTestId(id)).toBeVisible();
      await sheet.getByTestId("grid-button").click();
      await expect(page.getByTestId("trade-chart")).toHaveAttribute("data-grid", "0");
      await sheet.getByTestId("crosshair-magnet-button").click();
      await expect(page.getByTestId("trade-chart")).toHaveAttribute("data-magnet", "1");
      await sheet.getByTestId("formula-input").fill("sma(5)");
      await expect.poll(async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").custom).toBeGreaterThan(0);
      await sheet.getByTestId("formula-input").fill("sma(");
      await expect(sheet.getByTestId("formula-error")).toBeVisible();
      await sheet.getByTestId("compare-button").click();
      await page.getByTestId("compare-TCS").click();
      await expect(sheet.getByTestId("compare-button")).toContainText("TCS");
      await expect.poll(async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").compare).toBeGreaterThan(0);
    });

    test("the tool rail is a full-height column at the left of the plot, every button 44 px, scrolling, in the order asked for", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const rail = page.getByTestId("tool-rail");
      const rb = (await rail.boundingBox())!;
      const plot = await box(page, "trade-chart");
      // beside the plot (it takes room, it does not cover candles) and as tall as it
      expect(plot.x).toBeGreaterThanOrEqual(rb.x + rb.width - 1);
      expect(Math.abs(rb.y - plot.y)).toBeLessThan(4);
      expect(rb.height).toBeGreaterThanOrEqual(plot.height - 2);
      expect(await rail.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
      expect(await rail.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true); // more buttons than fit: it scrolls
      const order = ["tool-trend", "tool-channel", "tool-fib", "tool-text", "tool-brush", "tool-measure", "rail-zoom", "magnet", "stay", "lock-all", "hide-all", "rail-delete", "rail-undo", "rail-redo"];
      const tops = await rail.evaluate((el, ids) => ids.map((id) => (el.querySelector(`[data-testid="${id}"]`) as HTMLElement).getBoundingClientRect().top), order);
      expect([...tops].sort((a, b) => a - b)).toEqual(tops); // in that order, top to bottom
      for (const id of ["tool-select", ...order, "tool-pin-mode"]) {
        const b = await page.getByTestId(id).evaluate((el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }));
        expect(b.w, id).toBeGreaterThanOrEqual(44);
        expect(b.h, id).toBeGreaterThanOrEqual(44);
      }
      // the drawing controls are not in a toolbar menu or sheet any more
      for (const id of ["rail-menu", "drawings-sheet", "chart-toolbox", "rail-toggle", "quick-bar"]) await expect(page.getByTestId(id)).toHaveCount(0);
    });

    test("the rail's actions: magnet, stay, lock all, hide all and delete work, and delete shows the count", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await expect(page.getByTestId("rail-delete")).toBeDisabled();
      await expect(page.getByTestId("lock-all")).toBeDisabled();
      await page.getByTestId("magnet").click();
      await expect(page.getByTestId("magnet")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("stay").click();
      await expect(page.getByTestId("stay")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("stay").click();
      await expect(page.getByTestId("stay")).toHaveAttribute("aria-pressed", "false");
      // draw two levels
      await page.getByTestId("tool-hline").scrollIntoViewIfNeeded();
      await page.getByTestId("tool-hline").click();
      const layer = (await page.getByTestId("drawing-layer").boundingBox())!;
      // (the style bar of a selected drawing floats at the foot of the plot, so the taps are in its upper half)
      await page.touchscreen.tap(layer.x + layer.width * 0.4, layer.y + layer.height * 0.3);
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("data-count", "1");
      await page.getByTestId("tool-hline").click();
      await page.touchscreen.tap(layer.x + layer.width * 0.4, layer.y + layer.height * 0.45);
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("data-count", "2");
      await expect(page.getByTestId("rail-delete").getByText("2")).toBeVisible();
      await page.getByTestId("lock-all").click();
      await expect(page.getByTestId("lock-all")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("lock-all").click();
      await page.getByTestId("hide-all").click();
      await expect(page.getByTestId("hide-all")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("hide-all").click();
      // delete: the selected drawing (the last one drawn is selected), and with nothing selected, all of them
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("aria-label", "Delete the selected drawing");
      await page.getByTestId("rail-delete").click();
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("data-count", "1");
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("aria-label", "Delete all drawings (1)");
      // with nothing selected one tap does not delete: it asks first
      await page.getByTestId("rail-delete").click();
      await expect(page.getByTestId("delete-all-sheet")).toBeVisible();
      await expect(page.getByTestId("delete-all-sheet")).toContainText("Delete all drawings?");
      for (const id of ["delete-all-confirm", "delete-all-cancel"]) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(43.5);
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("data-count", "1");
      await page.getByTestId("delete-all-cancel").click();
      await expect(page.getByTestId("delete-all-sheet")).toHaveCount(0);
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("data-count", "1"); // cancelled: still there
      await page.getByTestId("rail-delete").click();
      await page.getByTestId("delete-all-confirm").click();
      await expect(page.getByTestId("delete-all-sheet")).toHaveCount(0);
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("data-count", "0");
      await expect(page.getByTestId("rail-delete")).toBeDisabled();
      // undo brings the last deletions back, one step at a time
      await page.getByTestId("rail-undo").click();
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("data-count", "1");
      await page.getByTestId("rail-undo").click();
      await expect(page.getByTestId("rail-delete")).toHaveAttribute("data-count", "2");
    });

    test("zoom: drag across the plot and the chart shows only those bars", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const before = await view(page);
      await page.getByTestId("rail-zoom").click();
      await expect(page.getByTestId("rail-zoom")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("zoom-layer")).toBeVisible();
      const plot = await box(page, "trade-chart");
      const y = plot.y + plot.height / 2;
      await page.mouse.move(plot.x + plot.width * 0.3, y);
      await page.mouse.down();
      await page.mouse.move(plot.x + plot.width * 0.55, y, { steps: 8 });
      await page.mouse.up();
      await expect(page.getByTestId("zoom-layer")).toHaveCount(0); // one zoom, then it lets go
      await expect.poll(async () => (await view(page)).to - (await view(page)).from).toBeLessThan((before.to - before.from) * 0.5);
      await page.getByTestId("auto-button").click();
      await expect.poll(async () => (await view(page)).to - (await view(page)).from).toBeGreaterThan((before.to - before.from) * 0.8);
    });

    test("studies are a small legend in the top-left corner of the plot: a line each with its name and value, one tap opens them to edit or remove", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const legend = page.getByTestId("study-legend");
      await expect(legend).toHaveAttribute("data-line", "corner");
      const plot = await box(page, "trade-chart");
      const lb = (await legend.boundingBox())!;
      expect(lb.x).toBeLessThan(plot.x + 12);
      expect(lb.y).toBeLessThan(plot.y + 12);
      expect(lb.height).toBeGreaterThanOrEqual(43.5);
      // clear of the price axis
      expect(lb.x + lb.width).toBeLessThanOrEqual((await axisLeft(page)) - 4);
      // a line per study, each with a name and a number
      await expect(legend).toContainText("SMA (10)");
      await expect(legend).toContainText("SMA (30)");
      await expect(legend).toContainText("Volume");
      await expect(page.locator('[data-testid^="legend-value-"]').first()).toHaveText(/\d/);
      // no chips over the plot
      await expect(page.locator('[data-testid^="legend-edit-"]')).toHaveCount(0);
      await expect(page.locator('[data-testid^="legend-remove-"]')).toHaveCount(0);
      // tap: the studies, to edit or remove
      await legend.click();
      await expect(page.getByTestId("studies-sheet")).toBeVisible();
      const removes = page.locator('[data-testid^="current-remove-"]');
      const n = await removes.count();
      expect(n).toBe(3);
      await removes.first().click();
      await expect(removes).toHaveCount(n - 1);
      await page.getByTestId("sheet-close").click();
      await expect(page.locator('[data-testid^="legend-"][data-study]')).toHaveCount(n - 1);
    });

    test("nothing floating over the plot reaches the price axis", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const edge = (await axisLeft(page)) - 2;
      // a drawing selected: its style bar floats at the foot of the plot
      await page.getByTestId("tool-hline").click();
      const layer = (await page.getByTestId("drawing-layer").boundingBox())!;
      await page.touchscreen.tap(layer.x + layer.width * 0.4, layer.y + layer.height * 0.5);
      await expect(page.getByTestId("properties-overlay")).toBeVisible();
      for (const id of ["properties-overlay", "quick-bar", "study-legend"]) {
        const b = await page.getByTestId(id).boundingBox();
        if (b) expect(b.x + b.width, id).toBeLessThanOrEqual(edge);
      }
      // the crosshair readout too
      await page.mouse.move(layer.x + layer.width * 0.5, layer.y + layer.height * 0.5);
      if ((await page.getByTestId("crosshair-readout").count()) > 0) {
        const ro = (await page.getByTestId("crosshair-readout").boundingBox())!;
        expect(ro.x + ro.width).toBeLessThanOrEqual(edge);
      }
    });

    test("the bottom bar inside the chart: Date Range, the time in IST, log and auto, slim", async ({ page }) => {
      const seen: string[] = [];
      await openTrade(page, "RELIANCE", { seen });
      const status = page.getByTestId("chart-status-bar");
      const sb = (await status.boundingBox())!;
      expect(sb.height).toBeLessThanOrEqual(46);
      const plot = await box(page, "trade-chart");
      expect(sb.y).toBeGreaterThanOrEqual(plot.y + plot.height - 1);
      const card = await box(page, "chart-with-tools");
      expect(sb.y + sb.height).toBeLessThanOrEqual(card.y + card.height + 1);
      await expect(status.getByTestId("date-range-button")).toContainText("Date Range");
      await expect(status.getByTestId("ist-clock")).toContainText(/^13:5\d:\d\d IST$/);
      await status.getByTestId("log-button").click();
      await expect(page.getByTestId("trade-chart")).toHaveAttribute("data-scale", "log");
      await status.getByTestId("log-button").click();
      await expect(page.getByTestId("trade-chart")).toHaveAttribute("data-scale", "normal");
      // Date Range opens the ranges; one of them loads its candles
      await status.getByTestId("date-range-button").click();
      for (const r of ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "All"]) expect((await page.getByTestId(`range-${r}`).boundingBox())!.height, r).toBeGreaterThanOrEqual(43.5);
      await page.getByTestId("range-5D").click();
      await expect(page.getByTestId("range-sheet")).toHaveCount(0);
      await expect(page.getByTestId("ibar-15m")).toHaveAttribute("aria-checked", "true");
      await expect.poll(() => seen.some((s) => s.includes("interval=15m") && s.includes("range=5D"))).toBe(true);
      await expect(status.getByTestId("date-range-button")).toContainText("5D");
    });

    test("collapsed, the drawer shows only Paper buy and Paper sell", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const drawer = page.getByTestId("drawer-collapsed");
      await expect(drawer.getByTestId("paper-buy")).toHaveText("Paper buy");
      await expect(drawer.getByTestId("paper-sell")).toHaveText("Paper sell");
      await expect(drawer.getByTestId("paper-buy-call")).toHaveCount(0);
      await expect(drawer.getByRole("button")).toHaveCount(3); // the arrow and the two order buttons, nothing else
      await expect(page.getByTestId("drawer")).toHaveCount(0);
      for (const id of ["paper-buy", "paper-sell", "drawer-toggle"]) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(43.5);
    });

    test("on an index the collapsed drawer shows Paper buy Call and Paper buy Put, which open the order sheet at the at-the-money strike", async ({ page }) => {
      await openTrade(page, "NIFTY50");
      const drawer = page.getByTestId("drawer-collapsed");
      await expect(drawer.getByTestId("paper-buy-call")).toHaveText("Paper buy Call");
      await expect(drawer.getByTestId("paper-buy-put")).toHaveText("Paper buy Put");
      await expect(drawer.getByTestId("paper-buy")).toHaveCount(0);
      await expect(drawer.getByTestId("paper-buy-call")).toBeEnabled({ timeout: 15_000 });
      await page.getByTestId("tab-chain").click();
      const atmRow = page.getByTestId("chain-tab").locator("tr.bg-blue-50");
      await expect(atmRow).toHaveCount(1, { timeout: 15_000 });
      const atm = Number((await atmRow.locator("td.font-semibold").innerText()).trim());
      await page.getByTestId("tab-chart").click();
      for (const [id, side] of [
        ["paper-buy-call", "CE"],
        ["paper-buy-put", "PE"],
      ] as const) {
        await page.getByTestId(id).click();
        const dialog = page.getByTestId("action-screen"); // Paper buy Call/Put opens the full-screen order screen for the at-the-money contract
        await expect(dialog).toBeVisible();
        const title = await page.getByTestId("action-symbol").innerText();
        expect(Number(title.match(/(\d+) (?:CE|PE)$/)?.[1])).toBe(atm);
        expect(title).toContain(side);
        const d = (await dialog.boundingBox())!;
        expect([Math.round(d.x), Math.round(d.y), Math.round(d.width), Math.round(d.height)]).toEqual([0, 0, w, h]);
        await page.getByTestId("action-back").click();
        await expect(dialog).toHaveCount(0);
      }
    });

    test("dragging the drawer up opens Trade, Open Orders and Positions for the symbol; the chart does not move; dragging down closes it", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const plot0 = await box(page, "trade-chart");
      const grip = await box(page, "drawer-grip");
      await swipe(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, { x: grip.x + grip.width / 2, y: grip.y - 320 });
      const drawer = page.getByTestId("drawer");
      await expect(drawer).toHaveAttribute("data-open", "1");
      for (const t of ["trade", "orders", "positions"]) await expect(page.getByTestId(`drawer-tab-${t}`)).toBeVisible();
      await expect(page.getByTestId("drawer-tab-trade")).toHaveAttribute("aria-selected", "true");
      // the Trade tab is a Buy and a Sell button (the order form is the full screen they open), with what is held
      await expect(drawer.getByTestId("drawer-trade")).toBeVisible();
      await expect(drawer.getByTestId("drawer-held")).toContainText("You don't hold RELIANCE");
      for (const id of ["drawer-buy", "drawer-sell"]) expect((await drawer.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(43.5);
      await expect(drawer.getByText("Paper Trade")).toHaveCount(0);
      for (const name of ["Market", "Limit", "GTD"]) await expect(drawer.getByRole("button", { name, exact: true })).toHaveCount(0);
      // the chart behind it is where it was
      const plot1 = await box(page, "trade-chart");
      expect([plot1.x, plot1.y, plot1.width, plot1.height]).toEqual([plot0.x, plot0.y, plot0.width, plot0.height]);
      // down again
      const pg = await box(page, "drawer-panel-grip");
      await swipe(page, { x: pg.x + pg.width / 2, y: pg.y + pg.height / 2 }, { x: pg.x + pg.width / 2, y: pg.y + 380 });
      await expect(page.getByTestId("drawer")).toHaveCount(0);
      // the arrow opens it again; the Paper sell button opens the sell screen, and closing that leaves the chart as it was
      await page.getByTestId("drawer-toggle").click();
      await expect(page.getByTestId("drawer")).toHaveAttribute("data-open", "1");
      await page.getByTestId("drawer-close").click();
      await expect(page.getByTestId("drawer")).toHaveCount(0);
      await page.getByTestId("paper-sell").click();
      await expect(page.getByTestId("action-screen")).toBeVisible();
      await expect(page.getByTestId("action-label")).toHaveText("Sell");
      await page.getByTestId("action-back").click();
      await expect(page.getByTestId("action-screen")).toHaveCount(0);
      await expect(page.getByTestId("trade-chart")).toBeVisible();
    });

    test("a market buy shows under Positions, a limit order under Open Orders until it is cancelled", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await page.getByTestId("drawer-toggle").click();
      const drawer = page.getByTestId("drawer");
      await expect(page.getByTestId("drawer-tab-positions")).toHaveText("Positions");
      await drawer.getByTestId("drawer-buy").click();
      await page.getByTestId("action-submit").click();
      await expect(page.getByTestId("result-line")).toContainText("Bought 1 RELIANCE");
      await page.getByTestId("action-done").click();
      await expect(page.getByTestId("action-screen")).toHaveCount(0);
      await expect(page.getByTestId("drawer-tab-positions")).toHaveText("Positions (1)"); // the drawer was kept open underneath
      await page.getByTestId("drawer-tab-positions").click();
      const pos = page.getByTestId("position-RELIANCE");
      await expect(pos).toBeVisible();
      await expect(pos).toContainText("1");
      await expect(pos.getByTestId("position-pnl")).toBeVisible();
      // a limit order well under the price rests
      await page.getByTestId("drawer-tab-orders").click();
      await expect(page.getByTestId("no-open-orders")).toBeVisible();
      await page.getByTestId("drawer-tab-trade").click();
      await drawer.getByTestId("drawer-buy").click();
      await page.getByTestId("mode-limit").click();
      await page.getByTestId("order-limit").fill("1200");
      await page.getByTestId("action-submit").click();
      await expect(page.getByTestId("result-status")).toContainText("Order placed");
      await page.getByTestId("action-done").click();
      await expect(page.getByTestId("drawer-tab-orders")).toHaveText("Open Orders (1)");
      await page.getByTestId("drawer-tab-orders").click();
      const row = page.locator('[data-testid^="open-order-"]');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("BUY");
      await expect(row).toContainText("1,200");
      expect((await row.getByRole("button", { name: /Cancel/ }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
      await row.getByRole("button", { name: /Cancel/ }).click();
      await expect(page.getByTestId("no-open-orders")).toBeVisible();
      await expect(page.getByTestId("drawer-tab-orders")).toHaveText("Open Orders");
    });

    test("the chart page is dark by default; the light theme is still one tap away, and is remembered", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-theme", "dark");
      await expect(page.getByTestId("trade-chart")).toHaveAttribute("data-theme", "dark");
      const bg = (id: string) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).backgroundColor);
      // the whole screen is dark, not only the chart: the header, the bars, the drawer
      expect(await page.getByTestId("trade-screen").getAttribute("class")).toContain("zx-dark");
      expect(await bg("trade-screen")).toBe("rgb(14, 22, 38)");
      expect(await bg("trade-header")).not.toBe("rgb(255, 255, 255)");
      expect(await bg("drawer-collapsed")).not.toBe("rgb(255, 255, 255)");
      await page.getByTestId("more-button").click();
      await page.getByTestId("settings-button").click();
      await expect(page.getByTestId("theme-dark")).toHaveAttribute("aria-checked", "true");
      await page.getByTestId("theme-light").click();
      await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-theme", "light");
      await page.getByTestId("sheet-close").last().click();
      await page.getByTestId("sheet-close").click();
      expect(await page.getByTestId("trade-screen").getAttribute("class")).not.toContain("zx-dark");
      await expect.poll(() => bg("trade-header")).toBe("rgb(255, 255, 255)");
      // remembered on this device
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByTestId("trade-chart").waitFor();
      await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-theme", "light");
    });

    test("a stock has the Option Chain button, and the chain's prices open the contract as a full screen", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await page.getByTestId("tab-chain").click();
      const chain = page.getByTestId("chain-tab");
      await expect(chain).toBeVisible();
      const first = chain.getByRole("button").filter({ hasText: /\d/ }).first();
      await expect(first).toBeVisible({ timeout: 15_000 });
      await first.click();
      const d = await box(page, "option-sheet");
      expect([Math.round(d.width), Math.round(d.height)]).toEqual([w, h]);
      await page.getByTestId("option-sheet").getByRole("button", { name: "Close" }).first().click();
      await page.getByTestId("tab-chart").click();
      await expect(page.getByTestId("trade-chart")).toBeVisible();
    });

    test("crypto has no Option Chain button", async ({ page }) => {
      await mockMarket(page);
      await page.goto("/app/trade/BTC", { waitUntil: "domcontentloaded" });
      await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
      await expect.poll(async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").bars ?? 0, { timeout: 20_000 }).toBeGreaterThan(20);
      await expect(page.getByTestId("tab-chain")).toHaveCount(0);
      expect((await measureShare(page)).share).toBeGreaterThanOrEqual(70);
    });

    test("every control on the chart screen is at least 44 px", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const small = await page.evaluate(() => {
        const out: string[] = [];
        const root = document.querySelector('[data-testid="trade-screen"]')!;
        for (const el of root.querySelectorAll<HTMLElement>("button, [role=tab], [role=radio], select, input, a[href]")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (el.closest('[data-testid="chart-attribution"]')) continue; // the licence's link, a line of text
          if (r.height < 43.5 || r.width < 43.5) out.push(`${el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent?.slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return out;
      });
      expect(small).toEqual([]);
    });

    test("back goes to the page before", async ({ page }) => {
      await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
      await openTrade(page, "RELIANCE");
      await page.getByTestId("trade-back").click();
      await expect(page).toHaveURL(/\/app\/dashboard/);
    });
  });
}

test.describe("sideways 844x390", () => {
  test.use(phone(844, 390));

  test("the chart takes the whole screen under one toolbar row, with Paper buy and Paper sell in it, and the page does not scroll", async ({ page }) => {
    await openTrade(page, "RELIANCE");
    const m = await measureShare(page);
    console.log("share 844x390", JSON.stringify({ share: m.share, chartTop: m.chartTop, chart: m.chart }));
    expect(m.share).toBeGreaterThanOrEqual(70);
    expect(m.pageScroll).toBe(0);
    expect(m.coveredPx).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight && document.body.scrollHeight <= window.innerHeight)).toBe(true);
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // the header, the interval bar, the icons and the order buttons share one row
    const row = await box(page, "chart-controls");
    expect(row.height).toBeLessThanOrEqual(46);
    expect(row.y).toBeLessThan(2);
    for (const id of ["trade-back", "ibar-5m", "chart-type-button", "studies-button", "more-button", "paper-buy", "paper-sell", "drawer-toggle"]) {
      const b = await box(page, id);
      expect(Math.abs(b.y - row.y), id).toBeLessThan(6);
      expect(b.height, id).toBeGreaterThanOrEqual(43.5);
      expect(b.width, id).toBeGreaterThanOrEqual(43.5);
      expect(b.x + b.width, id).toBeLessThanOrEqual(844.5);
    }
    await expect(page.getByTestId("chart-controls").getByTestId("paper-buy")).toHaveText("Paper buy");
    await expect(page.getByTestId("chart-controls").getByTestId("paper-sell")).toHaveText("Paper sell");
    await expect(page.getByTestId("trade-header")).toBeVisible();
    await expect(page.getByRole("link", { name: /ZESTOXX/ })).toHaveCount(0);
    // the drawer is pull-up only: no row of its own
    await expect(page.getByTestId("drawer-collapsed")).toHaveCount(0);
    await expect(page.getByTestId("drawer")).toHaveCount(0);
    // the rail is a full-height column, the status bar and the licence line are the last things on the screen
    const rail = await box(page, "tool-rail");
    const plot = await box(page, "trade-chart");
    expect(Math.abs(rail.y - plot.y)).toBeLessThan(4);
    expect(rail.height).toBeGreaterThanOrEqual(plot.height - 2);
    const sb = await box(page, "chart-status-bar");
    const attr = await box(page, "chart-attribution");
    expect(sb.y).toBeGreaterThanOrEqual(plot.y + plot.height - 1);
    expect(sb.y + sb.height).toBeLessThanOrEqual(attr.y + 1);
    expect(attr.y + attr.height).toBeLessThanOrEqual(390.5);
    await expect(page.getByTestId("chart-attribution")).toContainText("TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc.");
  });

  test("the Paper buy button opens the buy screen; the arrow pulls the drawer up, and it closes again", async ({ page }) => {
    await openTrade(page, "RELIANCE");
    await page.getByTestId("paper-buy").click();
    await expect(page.getByTestId("action-screen")).toBeVisible();
    await page.getByTestId("action-back").click();
    await expect(page.getByTestId("action-screen")).toHaveCount(0);
    await page.getByTestId("drawer-toggle").click();
    await expect(page.getByTestId("drawer")).toHaveAttribute("data-open", "1");
    await expect(page.getByTestId("drawer-tab-trade")).toHaveAttribute("aria-selected", "true");
    await page.getByTestId("drawer-buy").click();
    await expect(page.getByTestId("action-screen")).toBeVisible();
    await page.getByTestId("action-back").click();
    await expect(page.getByTestId("drawer")).toHaveAttribute("data-open", "1"); // still open underneath
    await page.getByTestId("drawer-close").click();
    await expect(page.getByTestId("drawer")).toHaveCount(0);
  });

  test("the drawer opens over the chart sideways too", async ({ page }) => {
    await openTrade(page, "RELIANCE");
    await page.getByTestId("drawer-toggle").click();
    const d = await box(page, "drawer");
    expect(d.y).toBeGreaterThanOrEqual(0);
    expect(d.y + d.height).toBeGreaterThanOrEqual(389);
    expect(d.y + d.height).toBeLessThanOrEqual(390.5);
    await expect(page.getByTestId("drawer-tab-positions")).toBeVisible();
    await page.getByTestId("drawer-tab-positions").click();
    await expect(page.getByTestId("no-positions")).toBeVisible();
  });

  test("an index has Paper buy Call and Paper buy Put in the toolbar row, and the first one still opens the order sheet", async ({ page }) => {
    await openTrade(page, "NIFTY50");
    const row = await box(page, "chart-controls");
    for (const id of ["paper-buy-call", "paper-buy-put"]) {
      const b = await box(page, id);
      expect(Math.abs(b.y - row.y), id).toBeLessThan(6);
      expect(b.height, id).toBeGreaterThanOrEqual(43.5);
    }
    await expect(page.getByTestId("paper-buy")).toHaveCount(0);
    await expect(page.getByTestId("paper-buy-call")).toBeEnabled({ timeout: 15_000 });
    await page.getByTestId("paper-buy-call").click();
    await expect(page.getByTestId("action-screen")).toBeVisible();
  });

  test("More and the Option Chain button work sideways", async ({ page }) => {
    await openTrade(page, "RELIANCE");
    await page.getByTestId("more-button").click();
    await expect(page.getByTestId("more-sheet").getByTestId("grid-button")).toBeVisible();
    await page.getByTestId("sheet-close").click();
    await page.getByTestId("tab-chain").click();
    await expect(page.getByTestId("chain-tab")).toBeVisible();
    const first = page.getByTestId("chain-tab").getByRole("button").filter({ hasText: /\d/ }).first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.click();
    const d = await box(page, "option-sheet");
    expect([Math.round(d.width), Math.round(d.height)]).toEqual([844, 390]);
  });
});

test.describe("a wide screen keeps its layout", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("the desktop controls, the three-column layout and the light default theme are there, with the licence's whole notice under the chart", async ({ page }) => {
    await openTrade(page, "RELIANCE");
    await expect(page.getByTestId("trade-screen")).toHaveCount(0);
    await expect(page.getByTestId("chart-toolbox")).toBeVisible();
    await expect(page.getByTestId("scale-button")).toBeVisible();
    await expect(page.getByTestId("interval-button")).toBeVisible();
    await expect(page.getByTestId("drawer")).toHaveCount(0);
    await expect(page.getByTestId("watchlist-card")).toBeVisible();
    await expect(page.getByTestId("chart-attribution")).toContainText("TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc.");
    await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-theme", "light"); // the desktop default is as it was: light
  });
});
