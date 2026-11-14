import { test, expect, type Page } from "@playwright/test";

/**
 * Integrity fixes, in the browser: no invented news, real depth or a message on the Trade page, honest dashboard
 * movers, "Paper buy" / "Paper sell" labels, and short notes where the shut market leaves values blank.
 * Everything is mocked at the network, so it needs no Upstox token and no database.
 */
test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

const OPEN = new Date("2026-11-11T13:50:00+05:30"); // a Wednesday in market hours
const SHUT = new Date("2026-11-14T12:00:00+05:30"); // a Saturday

async function quotes(page: Page, equity: Record<string, { price: number; prevClose: number }>) {
  await page.route("**/api/market-data?asset=equity", (r) => r.fulfill({ json: equity }));
  await page.route("**/api/market-data?asset=crypto", (r) =>
    r.fulfill({ json: { BTC: { price: 99000, prevClose: 90000 }, ETH: { price: 3000, prevClose: 3300 }, SOL: { price: 180, prevClose: 170 } } })
  );
  await page.route("**/api/market-data?asset=*-ohlc", (r) => r.fulfill({ json: {} }));
}

test("News page and dashboard card say news is not connected, with no headlines", async ({ page }) => {
  await quotes(page, {});
  await page.goto("/app/news", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("News is not connected yet").first()).toBeVisible();
  for (const invented of ["Market Desk", "Bourse Wire", "CoinLedger", "RBI holds repo", "2h ago"]) {
    await expect(page.getByText(invented)).toHaveCount(0);
  }
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("News is not connected yet")).toBeVisible();
  await expect(page.getByText("Market Desk")).toHaveCount(0);
});

/** n daily bars ending yesterday, wobbling upward: [time, open, high, low, close, volume] */
const dailyBars = (n: number, start = 4000) =>
  Array.from({ length: n }, (_, i) => {
    const c = start + i * 2 + Math.sin(i / 2) * 15;
    return [Date.UTC(2026, 10, 12) - (n - i) * 86_400_000, c - 3, c + 6, c - 6, c, 1_000_000];
  });
/** 4-hour bars like CoinGecko's, for 30 days */
const fourHourBars = () => Array.from({ length: 180 }, (_, i) => {
  const c = 90000 + i * 20 + Math.sin(i / 3) * 400;
  return [Date.UTC(2026, 9, 15, 8) + i * 4 * 3_600_000, c - 50, c + 100, c - 100, c];
});

test("Pulse page: says what the scores are based on; a score only with a real quote AND real history; otherwise Loading or Not enough price history", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await quotes(page, {
    TCS: { price: 4200, prevClose: 4100 }, // quote + 120 real bars  -> a score
    RELIANCE: { price: 1500, prevClose: 1490 }, // quote, no history   -> Loading
    SBIN: { price: 800, prevClose: 790 }, // quote + 30 bars          -> Not enough price history
  });
  await page.route("**/api/market-data?asset=equity-ohlc", (r) => r.fulfill({ json: { TCS: dailyBars(120), SBIN: dailyBars(30, 780) } }));
  await page.route("**/api/market-data?asset=crypto-ohlc", (r) => r.fulfill({ json: { BTC: fourHourBars() } }));
  await page.goto("/app/pulse", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Pulse scores are based on price momentum \(day change\) and RSI positioning\./)).toBeVisible();
  await expect(page.getByText(/News is not part of the score/)).toBeVisible();
  await page.waitForTimeout(800);

  const card = (id: string) => page.getByTestId(`pulse-card-${id}`);
  await expect(card("TCS").getByTestId("pulse-no-score")).toHaveCount(0);
  await expect(card("TCS")).toContainText(/RSI \d+/);
  await expect(card("RELIANCE").getByTestId("pulse-no-score")).toHaveText("Loading");
  await expect(card("SBIN").getByTestId("pulse-no-score")).toHaveText("Not enough price history");
  // crypto: 30 days of 4-hour bars become about 30 daily bars, fewer than Wilder's RSI needs
  await expect(card("BTC").getByTestId("pulse-no-score")).toHaveText("Not enough price history");
  // no feed at all: Loading, never a score from the invented starting bars
  await expect(card("NIFTY50").getByTestId("pulse-no-score")).toHaveText("Loading");
  await expect(card("SENSEX").getByTestId("pulse-no-score")).toHaveText("Loading");
});

test("Trade page Pulse pill: Loading with a quote but no real history, a score once real history arrives", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await quotes(page, { RELIANCE: { price: 1500, prevClose: 1490 } });
  await page.goto("/app/trade/RELIANCE", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pulse-pill")).toHaveText(/Pulse · Loading/);

  const withHistory = await page.context().newPage();
  await withHistory.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await withHistory.clock.install({ time: OPEN });
  await quotes(withHistory, { RELIANCE: { price: 1500, prevClose: 1490 } });
  await withHistory.route("**/api/market-data?asset=equity-ohlc", (r) => r.fulfill({ json: { RELIANCE: dailyBars(150, 1400) } }));
  await withHistory.goto("/app/trade/RELIANCE", { waitUntil: "domcontentloaded" });
  await expect(withHistory.getByTestId("pulse-pill")).toHaveText(/^\s*Pulse \d+ · (Bullish|Neutral|Bearish)$/);
});

test("Trade page order book: real depth for a listed stock", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await quotes(page, { RELIANCE: { price: 1500, prevClose: 1490 } });
  await page.route("**/api/symbol-depth**", (r) =>
    r.fulfill({
      json: {
        source: "live",
        bids: [{ price: 1499.9, qty: 120, orders: 3 }, { price: 1499.85, qty: 80, orders: 2 }],
        asks: [{ price: 1500.05, qty: 60, orders: 1 }],
      },
    })
  );
  await page.goto("/app/trade/RELIANCE", { waitUntil: "domcontentloaded" });
  const ladder = page.getByTestId("depth-ladder");
  await expect(ladder).toBeVisible();
  const t = await ladder.innerText();
  for (const v of ["1,499.9", "120", "1,500.05", "60"]) expect(t).toContain(v);
  await expect(page.getByTestId("depth-message")).toHaveCount(0);
});

test("Trade page order book: a message, not a ladder, for an index", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await quotes(page, { NIFTY50: { price: 25250, prevClose: 25200 } });
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unsupported" } }));
  await page.goto("/app/trade/NIFTY50", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("depth-message")).toHaveText("Depth not available for this symbol");
  await expect(page.getByTestId("depth-ladder")).toHaveCount(0);
});

test("Trade page order book: an empty book with the market shut says when it is available", async ({ page }) => {
  await page.clock.install({ time: SHUT });
  await quotes(page, { RELIANCE: { price: 1500, prevClose: 1490 } });
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "live", bids: [], asks: [] } }));
  await page.goto("/app/trade/RELIANCE", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("depth-message")).toHaveText("Available when the market is open");
});

test("the order panel says Paper buy and Paper sell", async ({ page }) => {
  await quotes(page, { RELIANCE: { price: 1500, prevClose: 1490 } });
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.goto("/app/trade/RELIANCE", { waitUntil: "domcontentloaded" });
  // on a phone the ticket sits behind a trigger button; on any width its buttons carry the paper labels
  const buy = page.getByRole("button", { name: "Paper buy", exact: true });
  const sell = page.getByRole("button", { name: "Paper sell", exact: true });
  if (!(await buy.first().isVisible())) {
    await page.getByRole("button", { name: /trade|order|buy/i }).first().click({ timeout: 4000 }).catch(() => {});
  }
  await expect(buy.first()).toBeVisible();
  await expect(sell.first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Buy$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Sell$/ })).toHaveCount(0);
});

const equityMovers = {
  source: "live",
  asOf: "2026-11-13T10:00:00Z",
  data: {
    gainers: [
      { symbol: "TCS", name: "TATA CONSULTANCY", ltp: 4200, change: 100, changePct: 2.4, volume: 1000000, value: 4.2e9 },
      { symbol: "FLAT", name: "FLAT CO", ltp: 100, change: 0, changePct: 0, volume: 10, value: 1000 },
    ],
    losers: [],
    active: [],
    ranked: 2,
    scanned: 2,
  },
};

test("Movers with the market shut: the last-close note appears and blank changes read -- , not 0.00", async ({ page }) => {
  await page.clock.install({ time: SHUT });
  await quotes(page, {});
  await page.route("**/api/fno-movers**", (r) => r.fulfill({ json: equityMovers }));
  await page.goto("/app/movers", { waitUntil: "domcontentloaded" });
  const note = page.getByTestId("movers-note");
  await expect(note).toContainText("Market closed, last close shown");
  await expect(note).toContainText("available when the market is open");
  const flat = page.locator("tr", { hasText: "FLAT" });
  await expect(flat.getByText("0.00")).toHaveCount(0);
  await expect(flat.locator("td:visible", { hasText: "--" })).toHaveCount(1); // the visible Chg % cell (the Chg column is hidden on a phone)
  await expect(page.locator("tr", { hasText: "TCS" })).toContainText("+2.40%");
});

test("Movers with the market open has no closed note", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await quotes(page, {});
  await page.route("**/api/fno-movers**", (r) => r.fulfill({ json: equityMovers }));
  await page.goto("/app/movers", { waitUntil: "domcontentloaded" });
  await expect(page.locator("tr", { hasText: "TCS" })).toBeVisible();
  await expect(page.getByTestId("movers-note")).toHaveCount(0);
});

test("no page scrolls sideways at 360px", async ({ page }) => {
  await quotes(page, { TCS: { price: 4200, prevClose: 4100 } });
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unsupported" } }));
  await page.route("**/api/fno-movers**", (r) => r.fulfill({ json: equityMovers }));
  for (const path of ["/app/news", "/app/dashboard", "/app/pulse", "/app/trade/NIFTY50", "/app/movers"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, path).toBeLessThanOrEqual(0);
  }
});

test("Trade page badge: Live data while the market is open, Last close once it is shut, never Live data while shut", async ({ page }) => {
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.clock.install({ time: OPEN });
  await quotes(page, { RELIANCE: { price: 1500, prevClose: 1490 } });
  await page.goto("/app/trade/RELIANCE", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("data-badge")).toHaveText("Live data");

  const shut = await page.context().newPage();
  await shut.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await shut.clock.install({ time: SHUT });
  await quotes(shut, { RELIANCE: { price: 1500, prevClose: 1490 } });
  await shut.goto("/app/trade/RELIANCE", { waitUntil: "domcontentloaded" });
  await expect(shut.getByTestId("data-badge")).toHaveText("Last close");
  await expect(shut.getByText("Live data")).toHaveCount(0);
});

test("Trade page badge: crypto is Live data even while the Indian market is shut", async ({ page }) => {
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unsupported" } }));
  await page.clock.install({ time: SHUT });
  await quotes(page, {});
  await page.goto("/app/trade/BTC", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("data-badge")).toHaveText("Live data");
});

test("News page: the sentence has its lead-in", async ({ page }) => {
  await quotes(page, {});
  await page.goto("/app/news", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Pulse scores are based on price momentum (day change) and RSI positioning.")).toBeVisible();
  await expect(page.getByText(/^Price momentum \(day change\)/)).toHaveCount(0);
});

const CHAIN = (() => {
  const rows = [];
  for (let k = 24800; k <= 25700; k += 50) {
    const leg = (up: boolean) => ({ ltp: Math.max(5, up ? 25250 - k + 80 : k - 25250 + 80), prevClose: 80, oi: 100000, prevOi: 90000, volume: 5000, iv: 16, key: `NSE_FO|${up ? 1 : 2}${k}` });
    rows.push({ strike: k, call: leg(true), put: leg(false) });
  }
  return { underlying: "NIFTY50", spot: 25250, expiry: "2026-11-17", expiries: ["2026-11-17"], lotSize: 65, rows, vix: 16, source: "live" };
})();

for (const [label, time, expected] of [["open", OPEN, "Live data"], ["shut", SHUT, "Last close"]] as const) {
  test(`badges with the market ${label}: Movers and the options chain say "${expected}"`, async ({ page }) => {
    await page.clock.install({ time });
    await quotes(page, { NIFTY50: { price: 25250, prevClose: 25200 } });
    await page.route("**/api/fno-movers**", (r) => r.fulfill({ json: equityMovers }));
    await page.route("**/api/options-chain**", (r) => r.fulfill({ json: CHAIN }));
    await page.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
    await page.route("**/api/option-candles**", (r) => r.fulfill({ json: { source: "unavailable" } }));

    // Movers
    await page.goto("/app/movers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("tr", { hasText: "TCS" })).toBeVisible();
    const movers = page.getByTestId("data-badge");
    await expect(movers).toContainText(expected);
    if (expected === "Live data") await expect(movers).toContainText("IST");
    else await expect(movers).not.toContainText("IST");

    // options chain
    await page.goto("/app/options", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("data-badge").first()).toHaveText(expected);
    await expect(page.getByText(expected === "Live data" ? "Last close" : "Live data", { exact: true })).toHaveCount(0);

  });
}

test("option sheet badge: a live contract quote says Last close when the market is shut, Live data when open", async ({ page }) => {
  const liveQuote = { source: "live", ltp: 80, change: 1, changePct: 1.2, open: 79, high: 82, low: 78, prevClose: 79, bids: [{ qty: 65, price: 79.95, orders: 1 }], asks: [{ qty: 65, price: 80.05, orders: 1 }], totalBuyQty: 65, totalSellQty: 65, volume: 1000, oi: 5000, avgPrice: 80, lowerCircuit: 0, upperCircuit: 0 };
  for (const [time, expected] of [[OPEN, "Live data"], [SHUT, "Last close"]] as const) {
    const p = await page.context().newPage();
    await p.clock.install({ time });
    await quotes(p, { NIFTY50: { price: 25250, prevClose: 25200 } });
    await p.route("**/api/options-chain**", (r) => r.fulfill({ json: CHAIN }));
    await p.route("**/api/option-quote**", (r) => r.fulfill({ json: liveQuote }));
    await p.route("**/api/option-candles**", (r) => r.fulfill({ json: { source: "unavailable" } }));
    await p.goto("/app/options", { waitUntil: "domcontentloaded" });
    await p.locator("table tbody tr").nth(8).locator("button").first().click();
    await p.waitForSelector("#order-sheet-title");
    await expect(p.getByRole("dialog").getByTestId("data-badge")).toHaveText(expected);
    await p.close();
  }
});
