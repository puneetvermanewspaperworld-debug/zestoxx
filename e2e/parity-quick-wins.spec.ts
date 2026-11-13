import { test, expect, type Page } from "@playwright/test";
import { bsm } from "../lib/fno/pricing";

/**
 * parity-quick-wins, in the browser at 360px with the network mocked (no Upstox token, no database):
 *  2.1 Watchlist | Options toggle, 4.6 tapping a Movers row opens the option sheet, 17.3 Paper sell Call / Put,
 *  20.1 Futures gainers card, 20.2 FII/DII summary card, 19.4 Nifty % column.
 */
test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

const OPEN = new Date("2026-11-11T13:50:00+05:30"); // a Wednesday in market hours

async function noSideScroll(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${label} scrolls sideways by ${over}px`).toBeLessThanOrEqual(0);
}

/** A live option chain around 25,250 with real-looking prices. */
function chain(underlying: string, expiry: string) {
  const spot = 25250;
  const T = 6 / 365;
  const leg = (type: "CE" | "PE", k: number) => {
    const p = Math.round(bsm(type, spot, k, T, 0.16, 0.065, 0.013).price * 20) / 20;
    return { ltp: p, prevClose: p * 0.98, oi: 100000, prevOi: 90000, volume: 5000, iv: 16, key: `NSE_FO|${type === "CE" ? 1 : 2}${k}` };
  };
  const rows = [];
  for (let k = 24800; k <= 25700; k += 50) rows.push({ strike: k, call: leg("CE", k), put: leg("PE", k) });
  return { underlying, spot, expiry, expiries: [expiry], lotSize: 65, rows, vix: 16, source: "live" };
}

async function mockQuotes(page: Page) {
  await page.route("**/api/market-data?asset=equity", (r) => r.fulfill({ json: { NIFTY50: { price: 25250, prevClose: 25200 }, BANKNIFTY: { price: 52000, prevClose: 51800 } } }));
  await page.route("**/api/market-data?asset=crypto", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/market-data?asset=*-ohlc", (r) => r.fulfill({ json: {} }));
}

test("2.1 the Watchlist page has a Watchlist | Options toggle that switches to /app/options", async ({ page }) => {
  await mockQuotes(page);
  await page.route("**/api/options-chain**", (r) => r.fulfill({ json: chain("NIFTY50", "2026-11-17") }));
  await page.goto("/app/watchlist", { waitUntil: "domcontentloaded" });
  const toggle = page.getByRole("navigation", { name: "Watchlist or Options" });
  await expect(toggle).toBeVisible();
  await expect(toggle.getByRole("link", { name: "Watchlist" })).toHaveAttribute("aria-current", "page");
  await noSideScroll(page, "watchlist");
  await toggle.getByRole("link", { name: "Options" }).click();
  await expect(page).toHaveURL(/\/app\/options$/);
  await expect(page.getByRole("navigation", { name: "Watchlist or Options" }).getByRole("link", { name: "Options" })).toHaveAttribute("aria-current", "page");
});

const optionMovers = {
  source: "live",
  asOf: "2026-11-11T08:20:00Z",
  data: {
    contracts: [
      { symbol: "NIFTY", expiry: "2026-11-17", strike: 25250, type: "CE", ltp: 120.5, change: 5.5, changePct: 4.78, volume: 900000, value: 7.0e9, lot: 65 },
      { symbol: "NIFTY", expiry: "2026-11-17", strike: 25200, type: "PE", ltp: 80.25, change: -4.25, changePct: -5.03, volume: 700000, value: 3.5e9, lot: 65 },
    ],
    underlyings: ["NIFTY"],
    scanned: 100,
  },
};

async function openOptionMovers(page: Page) {
  await page.route("**/api/fno-movers**", (r) => {
    const view = new URL(r.request().url()).searchParams.get("view");
    return r.fulfill({ json: view === "options" ? optionMovers : { source: "unavailable" } });
  });
  await page.goto("/app/movers", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /^F&O/ }).click();
  await page.getByRole("tab", { name: /^Options/ }).click();
}

test("4.6 tapping a Movers option row opens the option sheet for that contract", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mockQuotes(page);
  await page.route("**/api/options-chain**", (r) => {
    expect(new URL(r.request().url()).searchParams.get("underlying")).toBe("NIFTY");
    return r.fulfill({ json: chain("NIFTY", "2026-11-17") });
  });
  await page.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/option-candles**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await openOptionMovers(page);
  await expect(page.locator("tr", { hasText: "25200" })).toBeVisible();
  await noSideScroll(page, "movers");
  // tap the second row (a put), not the first, so the sheet is proved to follow the row tapped
  await page.locator("tr", { hasText: "25200" }).locator("td").nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const title = dialog.locator("#order-sheet-title");
  await expect(title).toContainText("25200");
  await expect(title).toContainText("PE");
  await expect(dialog.getByRole("button", { name: /^(Paper )?sell$/i }).first()).toBeVisible();
});

test("4.6 a row whose live chain can't be loaded says so instead of opening another contract", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mockQuotes(page);
  await page.route("**/api/options-chain**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await openOptionMovers(page);
  await page.locator("tr", { hasText: "25250" }).locator("td").nth(1).click();
  await expect(page.getByTestId("mover-sheet-unavailable")).toContainText("isn't available right now");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
