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

async function mock(page: Page, live = true) {
  await page.clock.install({ time: OPEN });
  await page.route("**/api/candles**", (r) => r.fulfill({ status: 502, json: { source: "unavailable" } })); // these tests are about the usual daily view
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/market-data?asset=equity", (r) =>
    r.fulfill({ json: !live ? {} : { RELIANCE: { price: 1500, prevClose: 1490 }, TCS: { price: 4200, prevClose: 4100 }, NIFTY50: { price: 25250, prevClose: 25200 } } })
  );
  await page.route("**/api/market-data?asset=crypto", (r) => r.fulfill({ json: { BTC: { price: 91500, prevClose: 90500 } } }));
  await page.route("**/api/market-data?asset=equity-ohlc", (r) =>
    r.fulfill({ json: !live ? {} : { RELIANCE: dailyBars(271, 1400), TCS: dailyBars(271, 4000), NIFTY50: dailyBars(271, 24500, 0) } })
  );
  await page.route("**/api/market-data?asset=crypto-ohlc", (r) => r.fulfill({ json: { BTC: fourHourBars() } }));
}

interface Summary {
  bars: number;
  volume: number;
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

async function open(page: Page, symbol = "RELIANCE", live = true) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await mock(page, live);
  await page.goto(`/app/trade/${symbol}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(async () => (await summary(page)).bars, { timeout: 20_000 }).toBeGreaterThan(0);
  await settle(page);
  return errors;
}

/** each study as plotted: its id, panes, how many values each output has, and the last one */
interface PlottedStudy {
  uid: number;
  id: string;
  available: boolean;
  reason: string | null;
  pane: number | null;
  values: Record<string, number>;
  last: Record<string, number | null>;
}
const plotted = async (page: Page): Promise<PlottedStudy[]> => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-studies")) ?? "[]");
const addStudy = async (page: Page, id: string) => {
  await page.getByTestId("studies-button").click();
  await page.getByTestId(`add-${id}`).click();
  await page.keyboard.press("Escape");
};
const removeStudy = (page: Page, uid: number) => page.getByTestId(`legend-remove-${uid}`).click();

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
});

test("every indicator of the old chart is plotted and can be switched on and off", async ({ page }) => {
  await open(page);
  // moving averages are on by default: MA10 starts on bar 10, MA30 on bar 30
  const s = await summary(page);
  let st = await plotted(page);
  expect(st.map((x) => [x.id, x.values.sma ?? x.values.volume])).toEqual([["sma", 262], ["sma", 242], ["volume", 271]]);
  expect(s.volume).toBe(271);
  await addStudy(page, "ema");
  await addStudy(page, "bb");
  await addStudy(page, "rsi");
  await expect.poll(async () => (await plotted(page)).length).toBe(6);
  st = await plotted(page);
  const by = (id: string) => st.find((x) => x.id === id)!;
  expect(by("rsi").values.rsi).toBe(271 - 14); // Wilder's RSI(14) starts on the 15th bar
  expect(by("ema").values.ema).toBe(271 - 19);
  expect(by("bb").values.upper).toBe(271 - 19);
  expect(by("rsi").pane).toBe(1); // in a pane of its own
  expect(by("rsi").last.rsi).toBeGreaterThan(0);
  expect(by("rsi").last.rsi).toBeLessThan(100);
  await removeStudy(page, 1);
  await removeStudy(page, 2);
  await expect.poll(async () => (await plotted(page)).filter((x) => x.id === "sma").length).toBe(0);
  await removeStudy(page, 3);
  await expect.poll(async () => (await summary(page)).volume).toBe(0);
  await removeStudy(page, by("rsi").uid);
  await expect.poll(async () => (await plotted(page)).some((x) => x.id === "rsi")).toBe(false);
});

test("on the app's own daily series (no live feed) weekly and monthly aggregate the daily bars", async ({ page }) => {
  await open(page, "RELIANCE", false);
  const daily = (await summary(page)).bars;
  expect(daily).toBeGreaterThan(100);
  const pick = async (id: string) => {
    await page.getByTestId("interval-button").click();
    await page.getByTestId(`interval-${id}`).click();
  };
  await pick("1W");
  await expect.poll(async () => (await summary(page)).bars).toBe(Math.ceil(daily / 5));
  await pick("1M");
  await expect.poll(async () => (await summary(page)).bars).toBe(Math.ceil(daily / 21));
  await pick("1D");
  await expect.poll(async () => (await summary(page)).bars).toBe(daily);
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
  await expect(page.getByTestId("volume-note")).toHaveText("Requires volume");
  expect((await summary(page)).volume).toBe(0);
  // 30 days of 4-hour bars are cut to daily bars
  const s = await summary(page);
  expect(s.bars).toBeGreaterThanOrEqual(30);
  expect(s.bars).toBeLessThanOrEqual(32);
  await removeStudy(page, 3); // take the Volume study off: nothing left to explain
  await expect(page.getByTestId("volume-note")).toHaveCount(0);
});

test("an index has no volume either: the chart says so", async ({ page }) => {
  await open(page, "NIFTY50");
  await expect(page.getByTestId("volume-note")).toHaveText("Requires volume");
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
  await addStudy(page, "rsi");
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByTestId("trade-chart").screenshot({ path: "test-results/trade-chart-360.png" });
});
