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

test("Pulse page says what the scores are based on, and lists no score for a symbol without a real quote", async ({ page }) => {
  await quotes(page, { TCS: { price: 4200, prevClose: 4100 } });
  await page.goto("/app/pulse", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Based on: Price momentum/)).toBeVisible();
  await expect(page.getByText(/News is not part of the score/)).toBeVisible();
  await expect(page.getByText(/No live quote yet, so no score:/)).toBeVisible();
});

test("dashboard movers: a down symbol is never a gainer, nothing prints +-, no crypto in the Indian movers", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await quotes(page, {
    SENSEX: { price: 81000, prevClose: 81073 }, // -0.09%
    TCS: { price: 4200, prevClose: 4100 },
    SBIN: { price: 800, prevClose: 812 },
  });
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const card = page.locator("div", { has: page.getByRole("heading", { name: /Market Movers/ }) }).last();
  const text = await card.innerText();
  expect(text).not.toContain("+-");
  const [gainers, losers = ""] = text.toUpperCase().split("TOP LOSERS");
  expect(gainers).toContain("TCS");
  expect(gainers).not.toContain("SENSEX");
  expect(losers).toContain("SENSEX");
  expect(losers).toContain("SBIN");
  expect(text).not.toMatch(/BTC|ETH|SOL/);
  expect(await page.locator("body").innerText()).not.toContain("+-");
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
