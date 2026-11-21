import { test, expect, type Page } from "@playwright/test";
import { mockMarket, openTrade } from "./chart-helpers";
import { measureShare } from "./screen-share";

/**
 * The Trade chart screen on a phone: the chart takes most of the screen, the controls are one interval bar, one toolbar row and a slim
 * status bar (the rest is in a More sheet), the fixed Paper buy / Paper sell bar never covers the plot or the rows under it, and a phone
 * turned sideways gives the chart the whole screen with no page scroll.
 */
const phone = (width: number, height: number) => ({ viewport: { width, height }, isMobile: true, hasTouch: true });

const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;

/** the page's scroller on a phone (the app's content area) */
const scrollToEnd = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="app-content"]') as HTMLElement;
    el.scrollTop = el.scrollHeight;
  });

for (const [w, h] of [
  [360, 800],
  [390, 844],
] as const) {
  test.describe(`upright ${w}x${h}`, () => {
    test.use(phone(w, h));

    test("the chart is at least 65% of the screen, right under the header, and nothing covers it", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const m = await measureShare(page);
      console.log(`share ${w}x${h}`, JSON.stringify({ share: m.share, chartTop: m.chartTop, chart: m.chart }));
      expect(m.share).toBeGreaterThanOrEqual(65);
      expect(m.coveredPx).toBe(0);
      // header, interval bar and toolbar are all that stand above the plot
      const header = await box(page, "trade-header");
      expect(header.y).toBeLessThan(4);
      expect(m.chartTop).toBeLessThanOrEqual(150);
      // the whole chart screen is visible on opening: the Paper bar starts where the chart block ends
      const bar = await box(page, "paper-bar");
      const chartBlock = await box(page, "chart-block");
      expect(chartBlock.y + chartBlock.height).toBeLessThanOrEqual(bar.y + 1);
      const plot = await box(page, "trade-chart");
      expect(plot.y + plot.height).toBeLessThanOrEqual(bar.y);
      // no sideways scroll
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test("the app's top bar, ticker and tab bar are left off this screen", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await expect(page.getByRole("link", { name: /ZESTOXX/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "More", exact: true })).toHaveCount(0); // the tab bar's More; the chart's is "More chart options"
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
      await expect(page.getByTestId("trade-header")).toBeVisible();
    });

    test("every row under the chart can be scrolled clear of the Paper bar", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await scrollToEnd(page);
      await page.waitForTimeout(300);
      const bar = await box(page, "paper-bar");
      const last = await box(page, "watchlist-card");
      expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 0.5);
      // and the order book and recent orders are reachable too
      await expect(page.getByText("Recent Orders")).toBeVisible();
      await expect(page.getByText("Order Book")).toBeVisible();
    });

    test("Compare, Alert, the formula, grid, magnet and settings are in one toolbar row and a More sheet", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const bar = page.getByTestId("chart-controls");
      const row = await bar.boundingBox();
      // one row, not many: no taller than a finger
      expect(row!.height).toBeLessThanOrEqual(46);
      for (const id of ["chart-type-button", "studies-button", "compare-button", "alert-button", "more-button"]) {
        const b = (await bar.getByTestId(id).boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(43.5);
        expect(b.width).toBeGreaterThanOrEqual(43.5);
        expect(Math.abs(b.y - row!.y)).toBeLessThan(6);
      }
      // none of the old rows are on the screen
      for (const id of ["grid-button", "crosshair-magnet-button", "settings-button", "scale-button", "fullscreen-button", "formula-input", "chart-toolbox"]) await expect(page.getByTestId(id)).toHaveCount(0);
      await page.getByTestId("more-button").click();
      const sheet = page.getByTestId("more-sheet");
      for (const id of ["grid-button", "crosshair-magnet-button", "settings-button", "scale-button", "fullscreen-button", "formula-input", "pulse-pill", "chart-notice"]) await expect(sheet.getByTestId(id)).toBeVisible();
      // the grid and magnet switches work from here
      await sheet.getByTestId("grid-button").click();
      await expect(page.getByTestId("trade-chart")).toHaveAttribute("data-grid", "0");
      await sheet.getByTestId("crosshair-magnet-button").click();
      await expect(page.getByTestId("trade-chart")).toHaveAttribute("data-magnet", "1");
      // the formula
      await sheet.getByTestId("formula-input").fill("sma(5)");
      await expect.poll(async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").custom).toBeGreaterThan(0);
      await sheet.getByTestId("formula-input").fill("sma(");
      await expect(sheet.getByTestId("formula-error")).toBeVisible();
      // the full notice is the licence's text
      await expect(sheet.getByTestId("chart-notice")).toContainText("Copyright (c) 2025 TradingView, Inc.");
      await page.getByTestId("sheet-close").click();
      await expect(page.getByTestId("more-sheet")).toHaveCount(0);
    });

    test("Compare and Alert work from the toolbar", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await page.getByTestId("compare-button").click();
      await page.getByTestId("compare-TCS").click();
      await expect(page.getByTestId("compare-button")).toContainText("TCS");
      await expect.poll(async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").compare).toBeGreaterThan(0);
      await page.getByTestId("compare-button").click();
      await page.getByTestId("compare-none").click();
      await expect(page.getByTestId("compare-button")).not.toContainText("TCS");
    });

    test("the study chips are one scrolling line inside the chart, not a row each", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const legend = page.getByTestId("study-legend");
      await expect(legend).toHaveAttribute("data-line", "1");
      const chart = await box(page, "trade-chart");
      const lb = (await legend.boundingBox())!;
      // inside the plot's box, one chip tall
      expect(lb.y).toBeGreaterThanOrEqual(chart.y - 1);
      expect(lb.y + lb.height).toBeLessThan(chart.y + chart.height / 2);
      expect(lb.height).toBeLessThanOrEqual(46);
      const tops = await legend.locator('[data-testid^="legend-"][data-study]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(tops.length).toBeGreaterThanOrEqual(2);
      expect(new Set(tops).size).toBe(1);
      // a fourth, fifth study scroll sideways instead of adding rows
      for (const id of ["rsi", "macd"]) {
        await page.getByTestId("studies-button").click();
        await page.getByTestId(`add-${id}`).click();
        await page.getByTestId("sheet-close").click();
      }
      const lb2 = (await legend.boundingBox())!;
      expect(lb2.height).toBeLessThanOrEqual(46);
    });

    test("the drawing controls (hide all, lock all, delete all, count) are in the tool rail's menu", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      for (const id of ["hide-all", "lock-all", "delete-all", "drawing-count", "chart-toolbox"]) await expect(page.getByTestId(id)).toHaveCount(0);
      const menu = page.getByTestId("rail-menu");
      const rail = await box(page, "tool-rail");
      const mb = (await menu.boundingBox())!;
      expect(mb.x - rail.x).toBeLessThan(12); // on the left edge of the chart
      expect(mb.height).toBeGreaterThanOrEqual(43.5);
      await menu.click();
      const sheet = page.getByTestId("drawings-sheet");
      for (const id of ["hide-all", "lock-all", "delete-all", "drawing-count"]) await expect(sheet.getByTestId(id)).toBeVisible();
      await expect(sheet.getByTestId("drawing-count")).toHaveText("0 drawings");
      await sheet.getByTestId("hide-all").click();
      await expect(sheet.getByTestId("hide-all")).toHaveAttribute("aria-pressed", "true");
    });

    test("a selected drawing's style bar floats over the plot's foot and leaves the tool rail and the page free", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await page.getByTestId("rail-toggle").tap();
      await page.getByTestId("tool-hline").tap();
      const layer = (await page.getByTestId("drawing-layer").boundingBox())!;
      await page.touchscreen.tap(layer.x + layer.width * 0.6, layer.y + layer.height * 0.55);
      const panel = page.getByTestId("properties-overlay");
      await expect(panel).toBeVisible();
      const pb = (await panel.boundingBox())!;
      const rail = (await page.getByTestId("tool-rail").boundingBox())!;
      const plot = await box(page, "trade-chart");
      // right of the rail, inside the plot, and the plot did not move or shrink
      expect(pb.x).toBeGreaterThanOrEqual(rail.x + 44);
      expect(pb.y).toBeGreaterThanOrEqual(plot.y);
      expect(pb.y + pb.height).toBeLessThanOrEqual(plot.y + plot.height + 1);
      const after = await box(page, "trade-chart");
      expect(after.height).toBe(plot.height);
      // the rail's last tool can still be tapped
      await page.getByTestId("tool-brush").tap();
      await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-tool", "brush");
    });

    test("interval bar: 1m 5m 15m 30m 1h D and a dropdown for the rest", async ({ page }) => {
      const seen: string[] = [];
      await openTrade(page, "RELIANCE", { seen });
      const bar = page.getByTestId("interval-bar");
      for (const id of ["1m", "5m", "15m", "30m", "1h", "1D"]) {
        const b = (await bar.getByTestId(`ibar-${id}`).boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(43.5);
        expect(b.width).toBeGreaterThanOrEqual(43.5);
      }
      await expect(bar.getByTestId("ibar-1D")).toHaveAttribute("aria-checked", "true");
      await bar.getByTestId("ibar-5m").click();
      await expect(bar.getByTestId("ibar-5m")).toHaveAttribute("aria-checked", "true");
      await expect.poll(() => seen.some((s) => s.includes("interval=5m"))).toBe(true);
      // an interval with no button of its own is in the dropdown, and then shows on the bar
      await bar.getByTestId("interval-button").click();
      await page.getByTestId("interval-2h").click();
      await expect(page.getByTestId("interval-sheet")).toHaveCount(0);
      await expect(bar.getByTestId("interval-button")).toContainText("2h");
      await expect.poll(() => seen.some((s) => s.includes("interval=2h"))).toBe(true);
    });

    test("the slim bottom bar has the date range, the time in IST, log and auto, inside the chart card", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      const status = page.getByTestId("chart-status-bar");
      const sb = (await status.boundingBox())!;
      expect(sb.height).toBeLessThanOrEqual(46);
      const plot = await box(page, "trade-chart");
      expect(sb.y).toBeGreaterThanOrEqual(plot.y + plot.height - 1); // under the plot
      const card = await box(page, "chart-with-tools");
      expect(sb.y + sb.height).toBeLessThanOrEqual(card.y + card.height + 1); // inside the same card
      await expect(status.getByTestId("range-1M")).toBeVisible();
      await expect(status.getByTestId("ist-clock")).toContainText(/^13:5\d:\d\d IST$/);
      // log
      await status.getByTestId("log-button").click();
      await expect(page.getByTestId("trade-chart")).toHaveAttribute("data-scale", "log");
      await expect(status.getByTestId("log-button")).toHaveAttribute("aria-pressed", "true");
      await status.getByTestId("log-button").click();
      await expect(page.getByTestId("trade-chart")).toHaveAttribute("data-scale", "normal");
      // auto: jump back to the latest candle
      const view = async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-view")) ?? "{}") as { from: number; to: number };
      const before = await view();
      await page.getByTestId("trade-chart").hover();
      await page.mouse.wheel(0, 0);
      await status.getByTestId("auto-button").click();
      await expect.poll(async () => (await view()).to).toBeGreaterThanOrEqual(before.to - 0.5);
      // a range changes the interval's window
      await status.getByTestId("range-1M").click();
      await expect(status.getByTestId("range-1M")).toHaveAttribute("aria-pressed", "true");
    });

    test("an index has Paper buy Call and Paper buy Put, which open the order sheet at the at-the-money strike", async ({ page }) => {
      await openTrade(page, "NIFTY50");
      const call = page.getByTestId("paper-buy-call");
      const put = page.getByTestId("paper-buy-put");
      await expect(call).toHaveText("Paper buy Call");
      await expect(put).toHaveText("Paper buy Put");
      for (const b of [call, put]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
      await expect(call).toBeEnabled({ timeout: 15_000 });
      const bar = await box(page, "paper-bar");
      const plot = await box(page, "trade-chart");
      expect(plot.y + plot.height).toBeLessThanOrEqual(bar.y);
      // the at-the-money strike is the one the chain marks (the strike nearest the spot of the chain on screen)
      await page.getByTestId("tab-chain").click();
      const atmRow = page.getByTestId("chain-tab").locator("tr.bg-blue-50");
      await expect(atmRow).toHaveCount(1, { timeout: 15_000 });
      const atm = Number((await atmRow.locator("td.font-semibold").innerText()).trim());
      expect(atm).toBeGreaterThan(1000);
      await page.getByTestId("tab-chart").click();
      for (const [btn, side] of [
        [call, "CE"],
        [put, "PE"],
      ] as const) {
        await btn.click();
        const dialog = page.getByTestId("option-sheet");
        await expect(dialog).toBeVisible();
        const title = await dialog.getByRole("heading").first().innerText();
        expect(title).toContain(side);
        expect(Number(title.match(/(\d+) (?:CE|PE)$/)?.[1])).toBe(atm);
        // the order sheet is a full screen on a phone
        const d = (await dialog.boundingBox())!;
        expect(d.x).toBe(0);
        expect(d.y).toBe(0);
        expect(Math.round(d.width)).toBe(w);
        expect(Math.round(d.height)).toBe(h);
        // its tabs, including Option Chain, are at the top
        await expect(dialog.getByRole("tab", { name: "Option Chain" })).toBeVisible();
        await dialog.getByRole("button", { name: "Close" }).first().click();
        await expect(dialog).toHaveCount(0);
      }
    });

    test("a stock has no Call / Put buttons, but has the Option Chain tab", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await expect(page.getByTestId("paper-buy-call")).toHaveCount(0);
      await expect(page.getByTestId("paper-buy-put")).toHaveCount(0);
      await expect(page.getByTestId("tab-chain")).toBeVisible();
      await expect(page.getByTestId("tab-chart")).toHaveAttribute("aria-selected", "true");
    });

    test("the Option Chain tab shows the chain; tapping a price opens the contract as a full screen", async ({ page }) => {
      await openTrade(page, "NIFTY50");
      await page.getByTestId("tab-chain").click();
      await expect(page.getByTestId("tab-chain")).toHaveAttribute("aria-selected", "true");
      const chain = page.getByTestId("chain-tab");
      await expect(chain).toBeVisible();
      const first = chain.getByRole("button").filter({ hasText: /\d/ }).first();
      await expect(first).toBeVisible({ timeout: 15_000 });
      await first.click();
      const dialog = page.getByTestId("option-sheet");
      await expect(dialog).toBeVisible();
      const d = (await dialog.boundingBox())!;
      expect(Math.round(d.width)).toBe(w);
      expect(Math.round(d.height)).toBe(h);
      await dialog.getByRole("button", { name: "Close" }).first().click();
      // back to the chart
      await page.getByTestId("tab-chart").click();
      await expect(page.getByTestId("trade-chart")).toBeVisible();
    });

    test("Crypto has no Option Chain tab", async ({ page }) => {
      await mockMarket(page);
      await page.goto("/app/trade/BTC", { waitUntil: "domcontentloaded" });
      await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
      await expect.poll(async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").bars ?? 0, { timeout: 20_000 }).toBeGreaterThan(20);
      await expect(page.getByTestId("tab-chain")).toHaveCount(0);
      await expect(page.getByTestId("trade-chart")).toBeVisible();
      expect((await measureShare(page)).share).toBeGreaterThanOrEqual(65);
    });

    test("Paper buy opens the order ticket", async ({ page }) => {
      await openTrade(page, "RELIANCE");
      await page.getByTestId("paper-buy").click();
      const sheet = page.getByRole("dialog", { name: "Paper trade ticket" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).toHaveCount(0);
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
          if (el.closest('[data-testid="watchlist-card"]')) continue; // the watchlist's own rows, not part of the chart screen
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

  test("the chart takes the whole screen under one slim toolbar, and the page does not scroll", async ({ page }) => {
    await openTrade(page, "RELIANCE");
    const m = await measureShare(page);
    console.log("share 844x390", JSON.stringify({ share: m.share, chartTop: m.chartTop, chart: m.chart }));
    expect(m.share).toBeGreaterThanOrEqual(70);
    expect(m.pageScroll).toBe(0);
    expect(m.coveredPx).toBe(0);
    expect(m.chartTop).toBeLessThanOrEqual(50);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight && document.body.scrollHeight <= window.innerHeight)).toBe(true);
    // a swipe or wheel on the page does not move it
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // one toolbar row: back, symbol, intervals, chart type, studies, More, and the Paper buttons
    const row = await box(page, "landscape-toolbar");
    expect(row.height).toBeLessThanOrEqual(46);
    for (const id of ["trade-back", "ibar-5m", "chart-type-button", "studies-button", "more-button", "paper-buy", "paper-sell"]) {
      const b = await box(page, id);
      expect(Math.abs(b.y - row.y)).toBeLessThan(6);
      expect(b.height).toBeGreaterThanOrEqual(43.5);
      expect(b.x + b.width).toBeLessThanOrEqual(844 + 0.5);
    }
    // the shell's own chrome is gone
    await expect(page.getByRole("link", { name: /ZESTOXX/ })).toHaveCount(0);
    // the status bar is still there, under the plot
    await expect(page.getByTestId("chart-status-bar")).toBeVisible();
    const plot = await box(page, "trade-chart");
    const sb = await box(page, "chart-status-bar");
    expect(sb.y).toBeGreaterThanOrEqual(plot.y + plot.height - 1);
    expect(sb.y + sb.height).toBeLessThanOrEqual(390 + 0.5);
  });

  test("Paper buy opens the ticket; More holds the rest, and an index shows Call and Put there", async ({ page }) => {
    await openTrade(page, "NIFTY50");
    await page.getByTestId("paper-buy").click();
    const sheet = page.getByRole("dialog", { name: "Paper trade ticket" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("more-button").click();
    await expect(page.getByTestId("more-sheet").getByTestId("paper-buy-call")).toBeVisible();
    await expect(page.getByTestId("more-sheet").getByTestId("paper-buy-put")).toBeVisible();
    await expect(page.getByTestId("more-sheet").getByTestId("grid-button")).toBeVisible();
  });

  test("the Option Chain button opens the chain, and the contract is a full screen", async ({ page }) => {
    await openTrade(page, "RELIANCE");
    await page.getByTestId("tab-chain").click();
    await expect(page.getByTestId("chain-tab")).toBeVisible();
    const first = page.getByTestId("chain-tab").getByRole("button").filter({ hasText: /\d/ }).first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.click();
    const d = (await box(page, "option-sheet"))!;
    expect(Math.round(d.width)).toBe(844);
    expect(Math.round(d.height)).toBe(390);
  });
});

test.describe("a wide screen is unchanged", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("the desktop controls and the three-column layout are still there", async ({ page }) => {
    await openTrade(page, "RELIANCE");
    await expect(page.getByTestId("trade-screen")).toHaveCount(0);
    await expect(page.getByTestId("chart-toolbox")).toBeVisible();
    await expect(page.getByTestId("scale-button")).toBeVisible();
    await expect(page.getByTestId("interval-button")).toBeVisible();
    await expect(page.getByTestId("paper-bar")).toHaveCount(0);
    await expect(page.getByTestId("watchlist-card")).toBeVisible();
    // the licence's line under the chart still has the whole notice on a wide screen
    await expect(page.getByTestId("chart-attribution")).toContainText("TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc.");
  });
});
