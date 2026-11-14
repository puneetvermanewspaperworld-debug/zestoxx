import { test, expect, type Page } from "@playwright/test";

/**
 * Step 1 of the chart tools: the Trade page chart is TradingView's Lightweight Charts and plots everything the old SVG chart did
 * (moving averages, EMA, Bollinger bands, volume, RSI, compare, the custom formula), and never invented volume. Data is mocked at the
 * network (daily bars shaped like Upstox's, 4-hour bars like CoinGecko's), so no token or database is needed.
 */
test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

const OPEN = new Date("2026-11-11T13:50:00+05:30");
const IST_MIDNIGHT = (iso: string) => Date.parse(`${iso}T00:00:00+05:30`);

/** n weekday bars ending 12 Nov 2026: [epoch ms at 00:00 IST, open, high, low, close, volume] */
function dailyBars(n: number, start: number, volume = 1_000_000) {
  const days: string[] = [];
  for (let d = Date.parse("2026-11-12T00:00:00Z"); days.length < n; d -= 86_400_000) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) days.unshift(new Date(d).toISOString().slice(0, 10));
  }
  return days.map((day, i) => {
    const c = start + i * 0.8 + Math.sin(i / 4) * 12;
    return [IST_MIDNIGHT(day), c - 2, c + 5, c - 5, c, volume === 0 ? 0 : volume + i * 100];
  });
}
/** 180 four-hour bars ending mid-November, like CoinGecko's 30-day OHLC: [time, open, high, low, close] */
function fourHourBars() {
  return Array.from({ length: 180 }, (_, i) => {
    const c = 90000 + i * 25 + Math.sin(i / 3) * 500;
    return [Date.UTC(2026, 9, 15, 8) + i * 4 * 3_600_000, c - 40, c + 90, c - 90, c];
  });
}

async function mock(page: Page) {
  await page.clock.install({ time: OPEN });
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/market-data?asset=equity", (r) =>
    r.fulfill({ json: { RELIANCE: { price: 1500, prevClose: 1490 }, TCS: { price: 4200, prevClose: 4100 }, NIFTY50: { price: 25250, prevClose: 25200 } } })
  );
  await page.route("**/api/market-data?asset=crypto", (r) => r.fulfill({ json: { BTC: { price: 91500, prevClose: 90500 } } }));
  await page.route("**/api/market-data?asset=equity-ohlc", (r) =>
    r.fulfill({ json: { RELIANCE: dailyBars(271, 1400), TCS: dailyBars(271, 4000), NIFTY50: dailyBars(271, 24500, 0) } })
  );
  await page.route("**/api/market-data?asset=crypto-ohlc", (r) => r.fulfill({ json: { BTC: fourHourBars() } }));
}

interface Summary {
  bars: number;
  volume: number;
  ma10: number;
  ma30: number;
  ema20: number;
  bb: number;
  custom: number;
  compare: number;
  rsi: number;
  lastClose: number | null;
  lastMa10: number | null;
  lastRsi: number | null;
}
const summary = async (page: Page): Promise<Summary> => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}");
const settle = (page: Page) => page.waitForTimeout(500);

async function open(page: Page, symbol = "RELIANCE") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await mock(page);
  await page.goto(`/app/trade/${symbol}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(async () => (await summary(page)).bars, { timeout: 20_000 }).toBeGreaterThan(0);
  await settle(page);
  return errors;
}

const toggle = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();

test("a real chart is drawn, with the real history and the live price on the last bar", async ({ page }) => {
  const errors = await open(page);
  const canvas = page.getByTestId("trade-chart").locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(150);
  await expect.poll(async () => (await summary(page)).bars).toBe(271);
  await expect.poll(async () => (await summary(page)).lastClose).toBe(1500); // the live quote lands on the last bar
  expect(errors).toEqual([]);
});

const view = async (page: Page): Promise<{ from: number; to: number }> => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-view")) ?? "{}");

test("it opens on the latest bars (about 30), also after the real history replaces the simulated starting bars", async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await view(page)).to).toBeGreaterThanOrEqual(271 - 1); // the last of the 271 real bars is in sight
  const v = await view(page);
  expect(v.to - v.from).toBeGreaterThan(28);
  expect(v.to - v.from).toBeLessThan(40);
  // the weekly view opens on its own last 26 bars
  await page.getByRole("button", { name: "W", exact: true }).click();
  await expect.poll(async () => (await view(page)).to).toBeGreaterThanOrEqual(Math.ceil(271 / 5) - 1);
});

test("every indicator of the old chart is plotted and can be switched on and off", async ({ page }) => {
  await open(page);
  // moving averages are on by default: MA10 starts on bar 10, MA30 on bar 30
  let s = await summary(page);
  expect([s.ma10, s.ma30, s.ema20, s.bb, s.rsi]).toEqual([262, 242, 0, 0, 0]);
  expect(s.volume).toBe(271);
  await toggle(page, "EMA");
  await toggle(page, "BB");
  await toggle(page, "RSI");
  await expect.poll(async () => (await summary(page)).rsi).toBe(271 - 14); // Wilder's RSI(14) starts on the 15th bar
  s = await summary(page);
  expect([s.ema20, s.bb]).toEqual([271 - 19, 271 - 19]);
  expect(s.lastRsi).toBeGreaterThan(0);
  expect(s.lastRsi).toBeLessThan(100);
  await toggle(page, "MA");
  await expect.poll(async () => (await summary(page)).ma10).toBe(0);
  await toggle(page, "Vol");
  await expect.poll(async () => (await summary(page)).volume).toBe(0);
  await toggle(page, "RSI");
  await expect.poll(async () => (await summary(page)).rsi).toBe(0);
});

test("weekly and monthly timeframes aggregate the daily bars", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "W", exact: true }).click();
  await expect.poll(async () => (await summary(page)).bars).toBe(Math.ceil(271 / 5));
  await page.getByRole("button", { name: "M", exact: true }).click();
  await expect.poll(async () => (await summary(page)).bars).toBe(Math.ceil(271 / 21));
  await page.getByRole("button", { name: "D", exact: true }).click();
  await expect.poll(async () => (await summary(page)).bars).toBe(271);
});

test("compare and the custom formula are plotted", async ({ page }) => {
  await open(page);
  await page.locator("select").filter({ hasText: "Compare vs" }).selectOption("TCS");
  await expect.poll(async () => (await summary(page)).compare).toBe(271);
  await expect(page.getByText(/dashed amber line = TCS normalized for comparison/)).toBeVisible();
  await page.getByPlaceholder(/Custom formula/).fill("sma(20)");
  await expect.poll(async () => (await summary(page)).custom).toBeGreaterThan(200);
  await page.getByPlaceholder(/Custom formula/).fill("close*");
  await expect(page.getByText("Couldn't parse that formula.")).toBeVisible();
});

test("crypto: no volume bars (its volume is not real), and the chart says so", async ({ page }) => {
  await open(page, "BTC");
  await expect(page.getByTestId("volume-note")).toHaveText("Volume not available");
  expect((await summary(page)).volume).toBe(0);
  // 30 days of 4-hour bars are cut to daily bars
  const s = await summary(page);
  expect(s.bars).toBeGreaterThanOrEqual(30);
  expect(s.bars).toBeLessThanOrEqual(32);
  await toggle(page, "Vol");
  await expect(page.getByTestId("volume-note")).toHaveCount(0);
});

test("an index has no volume either: the chart says so", async ({ page }) => {
  await open(page, "NIFTY50");
  await expect(page.getByTestId("volume-note")).toHaveText("Volume not available");
  expect((await summary(page)).volume).toBe(0);
});

test("a stock with real volume shows it and no 'not available' note", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("volume-note")).toHaveCount(0);
  expect((await summary(page)).volume).toBe(271);
});

test("attribution: a small TradingView Lightweight Charts link and the notice, and no TradingView logo", async ({ page }) => {
  await open(page);
  const note = page.getByTestId("chart-attribution");
  await expect(note).toBeVisible();
  const link = note.getByRole("link", { name: "Charts by TradingView Lightweight Charts" });
  await expect(link).toHaveAttribute("href", "https://www.tradingview.com/");
  await expect(note).toContainText("TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc.");
  // the library's own logo link is switched off: ours is the only link to tradingview.com on the page
  expect(await page.locator('a[href*="tradingview.com"]').count()).toBe(1);
});

test("fits at 360px: no sideways scroll", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await toggle(page, "RSI");
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByTestId("trade-chart").screenshot({ path: "test-results/trade-chart-360.png" });
});
