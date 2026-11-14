import { test, expect, type Page } from "@playwright/test";
import { RELIANCE_BARS, TODAY, candleRows, layerBox, mockMarket, openTrade, spot, stored, type MockOpts, waitStored } from "./chart-helpers";
import { timeToLogical, DAY } from "../lib/chart/coords";
import { toChartSeconds } from "../lib/chart/intervals";

/**
 * Interval and range controls: only intervals and ranges with real data, candles fetched on demand (with a Loading state, an error state
 * and a cache), times on the Indian clock, crypto and simulated symbols limited to what they have, and a drawing made on the daily chart
 * landing on the right day on an intraday chart. The mocked clock is Wed 11 Nov 2026, 13:50 IST (the market is open).
 */
test.use({ viewport: { width: 1280, height: 1000 } });

const series = async (page: Page) => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}");
const attr = (page: Page, name: string) => page.getByTestId("trade-chart").getAttribute(name);
const pickInterval = async (page: Page, id: string) => {
  await page.getByTestId("interval-button").click();
  await page.getByTestId(`interval-${id}`).click();
};
/** the chart plots the rows, and once the live price has started the current bar (a couple of seconds after the page opens) one more */
const plotted = (page: Page, rows: number) => expect.poll(async () => { const n = (await series(page)).bars; return n === rows || n === rows + 1; }, { timeout: 15_000 }).toBe(true);
const requests = (seen: string[]) => seen.map((s) => new URLSearchParams(s)).map((p) => `${p.get("symbol")}|${p.get("interval")}|${p.get("range")}`);

test("until something is chosen the usual daily view is shown; the controls say so", async ({ page }) => {
  await openTrade(page);
  await expect(page.getByTestId("interval-button")).toHaveText(/1D/);
  await expect(page.getByTestId("tz-note")).toHaveText("Times in IST");
  for (const r of ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "All"]) await expect(page.getByTestId(`range-${r}`)).toHaveAttribute("aria-pressed", "false");
  expect(await attr(page, "data-intraday")).toBe("0");
});

test("choosing 5 minutes fetches that interval's candles for its usual range and plots them with the time of day", async ({ page }) => {
  const seen: string[] = [];
  await openTrade(page, "RELIANCE", { seen });
  await pickInterval(page, "5m");
  await expect.poll(() => attr(page, "data-intraday")).toBe("1");
  expect(requests(seen)).toContain("RELIANCE|5m|1D");
  const rows = candleRows("RELIANCE", "5m", "1D");
  expect(rows.length).toBe(55); // 09:15 to 13:45, the bars that have started before 13:50
  await plotted(page, 55);
  await expect(page.getByTestId("range-1D")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("interval-button")).toHaveText(/5m/);
  // the crosshair readout shows the time of day on the Indian clock: bar 10 of the session is 10:05
  const s = await spot(page, 10, 1);
  const box = await layerBox(page);
  await page.mouse.move(s.x, box.y + box.height * 0.5, { steps: 4 });
  await expect(page.getByTestId("ro-date")).toContainText("11 Nov 2026 10:05");
  const bar = rows[10];
  await expect(page.getByTestId("ro-open")).toHaveText(bar[1].toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
});

test("choosing a range fetches that range, and brings an interval that suits it", async ({ page }) => {
  const seen: string[] = [];
  await openTrade(page, "RELIANCE", { seen });
  await page.getByTestId("range-5D").click();
  await expect.poll(() => requests(seen)).toContain("RELIANCE|15m|5D");
  await expect(page.getByTestId("interval-button")).toHaveText(/15m/);
  await plotted(page, candleRows("RELIANCE", "15m", "5D").length);
  // a range that suits the interval keeps it
  await page.getByTestId("range-1M").click();
  await expect.poll(() => requests(seen)).toContain("RELIANCE|15m|1M");
  await expect(page.getByTestId("interval-button")).toHaveText(/15m/);
  // one that does not (1 minute is not offered for a month) gets its usual interval
  await page.getByTestId("range-All").click();
  await expect.poll(() => requests(seen)).toContain("RELIANCE|1M|All");
  await expect(page.getByTestId("interval-button")).toHaveText(/1M/);
  expect(await attr(page, "data-intraday")).toBe("0");
});

test("picking an interval a range does not offer moves to that interval's usual range", async ({ page }) => {
  const seen: string[] = [];
  await openTrade(page, "RELIANCE", { seen });
  await page.getByTestId("range-1D").click();
  await pickInterval(page, "1W");
  await expect.poll(() => requests(seen)).toContain("RELIANCE|1W|5Y");
  await expect(page.getByTestId("range-5Y")).toHaveAttribute("aria-pressed", "true");
});

test("shows 'Loading' while the candles are on their way, keeps the old chart under it, and clears it when they arrive", async ({ page }) => {
  const opts: MockOpts = { candleDelayMs: 1500 };
  await openTrade(page, "RELIANCE", opts);
  const before = (await series(page)).bars;
  await pickInterval(page, "15m");
  await expect(page.getByTestId("chart-loading")).toBeVisible();
  await expect(page.getByTestId("chart-loading")).toContainText("15 minutes");
  expect((await series(page)).bars).toBe(before); // the daily chart is still there, not blank
  await expect(page.getByTestId("chart-loading")).toHaveCount(0, { timeout: 10_000 });
  await plotted(page, candleRows("RELIANCE", "15m", "5D").length);
});

test("an error says so, offers 'Try again', and recovers", async ({ page }) => {
  const opts: MockOpts = { candles: "fail" };
  await openTrade(page, "RELIANCE", opts);
  await pickInterval(page, "30m");
  await expect(page.getByTestId("chart-error")).toBeVisible();
  await expect(page.getByTestId("chart-error")).toContainText("did not answer");
  const retry = page.getByTestId("chart-retry");
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  opts.candles = "ok";
  await retry.click();
  await expect(page.getByTestId("chart-error")).toHaveCount(0);
  await plotted(page, candleRows("RELIANCE", "30m", "1M").length);
});

test("an interval already seen comes from memory: it is not asked for again", async ({ page }) => {
  const seen: string[] = [];
  await openTrade(page, "RELIANCE", { seen });
  await pickInterval(page, "5m");
  await plotted(page, 55);
  await pickInterval(page, "15m");
  await plotted(page, candleRows("RELIANCE", "15m", "1D").length);
  const before = requests(seen).length;
  await pickInterval(page, "5m");
  await plotted(page, 55);
  expect(requests(seen).length).toBe(before);
});

test("the choice is remembered on this device", async ({ page }) => {
  const seen: string[] = [];
  await openTrade(page, "RELIANCE", { seen });
  await pickInterval(page, "1h"); // the default range (a year) allows hourly bars, so it stays
  await expect(page.getByTestId("range-1Y")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("range-3M").click();
  await expect(page.getByTestId("interval-button")).toHaveText(/1h/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect(page.getByTestId("interval-button")).toHaveText(/1h/);
  await expect(page.getByTestId("range-3M")).toHaveAttribute("aria-pressed", "true");
  await plotted(page, candleRows("RELIANCE", "1h", "3M").length);
});

test("an index has no volume on any interval: it says 'Requires volume' and plots none", async ({ page }) => {
  await openTrade(page, "NIFTY50");
  await pickInterval(page, "15m");
  await plotted(page, candleRows("NIFTY50", "15m", "5D").length);
  expect((await series(page)).volume).toBe(0);
  await expect(page.getByTestId("volume-note")).toHaveText("Requires volume");
});

test("a stock's intraday bars carry their real volume", async ({ page }) => {
  await openTrade(page, "RELIANCE");
  await pickInterval(page, "15m");
  await plotted(page, candleRows("RELIANCE", "15m", "5D").length);
  const real = candleRows("RELIANCE", "15m", "5D").length;
  await expect.poll(async () => (await series(page)).volume).toBeGreaterThanOrEqual(real);
});

test("crypto is daily only: other intervals are listed but cannot be chosen, and there are no range buttons", async ({ page }) => {
  await mockMarket(page);
  await page.goto("/app/trade/BTC", { waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect(page.getByTestId("range-row")).toHaveCount(0);
  await expect(page.getByTestId("tz-note")).toHaveCount(0); // crypto is UTC, not IST
  await page.getByTestId("interval-button").click();
  for (const id of ["1m", "5m", "15m", "30m", "1h", "1W", "1M"]) {
    await expect(page.getByTestId(`interval-${id}`)).toBeDisabled();
    await expect(page.getByTestId(`interval-${id}`)).toContainText("Daily data only");
  }
  await expect(page.getByTestId("interval-1D")).toBeEnabled();
});

test("a symbol on the simulated series has no intraday: those intervals say 'Needs live data', and daily, weekly and monthly work", async ({ page }) => {
  await mockMarket(page, { live: false });
  await page.goto("/app/trade/RELIANCE", { waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await page.getByTestId("drawing-layer").waitFor({ timeout: 15_000 });
  await expect(page.getByTestId("range-row")).toHaveCount(0);
  await page.getByTestId("interval-button").click();
  for (const id of ["1m", "5m", "15m", "30m", "1h"]) {
    await expect(page.getByTestId(`interval-${id}`)).toBeDisabled();
    await expect(page.getByTestId(`interval-${id}`)).toContainText("Needs live data");
  }
  const daily = (await series(page)).bars;
  await page.getByTestId("interval-1W").click();
  await expect.poll(async () => (await series(page)).bars).toBeLessThan(daily / 3);
  await expect(page.getByTestId("interval-button")).toHaveText(/1W/);
});

test("controls and menu rows are 44 px targets", async ({ page }) => {
  await openTrade(page);
  for (const id of ["interval-button", "chart-type-button", "range-1D", "range-All"]) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.height, id).toBeGreaterThanOrEqual(44);
    expect(b.width, id).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId("interval-button").click();
  for (const id of ["1m", "5m", "15m", "30m", "1h", "1D", "1W", "1M"]) expect((await page.getByTestId(`interval-${id}`).boundingBox())!.height, id).toBeGreaterThanOrEqual(44);
});

test("a drawing made on the daily chart lands on the right day on an intraday chart", async ({ page }) => {
  await openTrade(page, "RELIANCE");
  // a text note made on the daily chart, just right of bar 262's centre (that bar's day plus part of a bar)
  await page.getByTestId("tool-text").click();
  const s = await spot(page, 262, 1500);
  await page.mouse.click(s.x + 3, s.y);
  await page.keyboard.press("Enter");
  const [d] = await waitStored(page, 1);
  const noteTime = d.at!.time;
  const barTime = toChartSeconds(RELIANCE_BARS[262][0]);
  const dayOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  expect(dayOf(noteTime)).toBe(dayOf(barTime)); // made on that day
  // now the 15 minute chart over five sessions
  await pickInterval(page, "15m");
  await page.getByTestId("range-5D").click();
  await plotted(page, candleRows("RELIANCE", "15m", "5D").length);
  await page.waitForTimeout(600);
  const times = candleRows("RELIANCE", "15m", "5D").map((r) => toChartSeconds(r[0]));
  // the note's day is on this chart only if it is one of the five sessions; use the latest one so it is
  const latestDay = dayOf(times[times.length - 1]);
  // re-anchor the note on the latest session's day at the same offset, as if it had been drawn on that day of the daily chart
  const anchorTime = Math.floor(times[times.length - 1] / DAY) * DAY + (noteTime - Math.floor(noteTime / DAY) * DAY);
  await page.evaluate(([t]) => {
    const key = "zestoxx:drawings:v1:RELIANCE";
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.drawings[0].at.time = t;
    localStorage.setItem(key, JSON.stringify(raw));
  }, [anchorTime] as const);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("drawing-layer").waitFor({ timeout: 30_000 });
  await plotted(page, times.length);
  await page.waitForTimeout(800);
  expect((await stored(page))[0].at!.time).toBe(anchorTime); // the stored (time, price) is untouched
  const logical = timeToLogical(times, anchorTime) as number;
  expect(dayOf(times[Math.round(logical)])).toBe(latestDay); // the nearest bar to it is on its own day
  expect(Math.floor(times[Math.round(logical)] / DAY)).toBe(Math.floor(anchorTime / DAY));
  // and the note is drawn at exactly that bar's place on screen
  const sc = JSON.parse((await page.getByTestId("drawing-layer").getAttribute("data-scale"))!) as { x0: number; x100: number };
  const box = await layerBox(page);
  const expectedX = box.x + sc.x0 + ((sc.x100 - sc.x0) * logical) / 100;
  const note = page.locator('[data-testid="drawing-layer"] g[data-drawing] rect').first();
  const nb = (await note.boundingBox())!;
  expect(Math.abs(nb.x - expectedX)).toBeLessThan(2);
  expect(TODAY).toBe("2026-11-11");
});

test("the live price starts and moves the current candle: it opens at the price, has no volume of its own, and the finished candles are left alone", async ({ page }) => {
  await openTrade(page, "RELIANCE");
  await pickInterval(page, "5m");
  const rows = candleRows("RELIANCE", "5m", "1D");
  // the bar for 13:50 is not in the feed's rows yet; the live price (1,500) starts it a moment after the page opens
  await expect.poll(async () => (await series(page)).bars, { timeout: 15_000 }).toBe(rows.length + 1);
  const s = await series(page);
  expect(s.lastClose).toBe(1500);
  const box = await layerBox(page);
  const last = await spot(page, rows.length, 1);
  await page.mouse.move(last.x, box.y + box.height * 0.5, { steps: 4 });
  await expect(page.getByTestId("ro-date")).toContainText("13:50");
  for (const k of ["open", "high", "low", "close"]) await expect(page.getByTestId(`ro-${k}`)).toHaveText("1,500.00");
  // the candle before it is exactly the feed's
  const prev = await spot(page, rows.length - 1, 1);
  await page.mouse.move(prev.x, box.y + box.height * 0.5, { steps: 4 });
  await expect(page.getByTestId("ro-close")).toHaveText(rows[rows.length - 1][4].toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
});
