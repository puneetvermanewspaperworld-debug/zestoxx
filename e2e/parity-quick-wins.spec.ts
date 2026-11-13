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

test("17.3 /app/options has Paper sell Call and Paper sell Put buttons that open the order sheet on the ATM strike", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mockQuotes(page);
  await page.route("**/api/options-chain**", (r) => r.fulfill({ json: chain("NIFTY50", "2026-11-17") }));
  await page.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/option-candles**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.goto("/app/options", { waitUntil: "domcontentloaded" });
  const sellCall = page.getByRole("button", { name: /^Paper sell Call/ });
  const sellPut = page.getByRole("button", { name: /^Paper sell Put/ });
  await expect(sellCall).toBeVisible();
  await expect(sellPut).toBeVisible();
  await noSideScroll(page, "options");
  await sellCall.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#order-sheet-title")).toContainText("25250 CE");
  await expect(dialog.getByTestId("sell-not-held")).toContainText("short selling isn't supported");
  await page.keyboard.press("Escape");
  await sellPut.click();
  await expect(page.locator("#order-sheet-title")).toContainText("25250 PE");
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

const futuresRes = (gainers: unknown[]) => ({ source: "live", asOf: "2026-11-11T08:20:00Z", data: { gainers, losers: [], scanned: gainers.length } });
const fut = (symbol: string, changePct: number, ltp = 1500) => ({ symbol, name: symbol, expiry: "2026-11-25", ltp, change: changePct * 10, changePct, volume: 1000, lot: 100, isIndex: false });

function fiiRows() {
  return [
    { date: "2026-11-11", cash: { fii: { buy: 9000, sell: 8000, net: 1000 }, dii: { buy: 7000, sell: 7600, net: -600 } }, idxFut: null, provisional: false },
    { date: "2026-11-12", cash: { fii: { buy: 10000, sell: 13401, net: -3401 }, dii: { buy: 12000, sell: 11525, net: 475 } }, idxFut: null, provisional: true },
  ];
}

test("20.1 the dashboard has a Futures gainers card from the Movers feed, only futures that are up", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mockQuotes(page);
  await page.route("**/api/fiidii", (r) => r.fulfill({ json: { status: "empty", rows: [] } }));
  await page.route("**/api/fno-movers**", (r) =>
    r.fulfill({ json: futuresRes([fut("TATASTEEL", 4.21, 168), fut("DOWNCO", -1.5), fut("SBIN", 2.05, 812)]) })
  );
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("futures-gainers-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("TATASTEEL");
  await expect(card).toContainText("+4.21%");
  await expect(card).toContainText("SBIN");
  await expect(card).not.toContainText("DOWNCO");
  expect(await card.innerText()).not.toContain("+-");
  await noSideScroll(page, "dashboard");
});

test("20.2 the dashboard has an FII/DII summary card with the latest stored day", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mockQuotes(page);
  await page.route("**/api/fno-movers**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/fiidii", (r) => r.fulfill({ json: { status: "ok", rows: fiiRows() } }));
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("fii-dii-card");
  await expect(card).toContainText("−₹3,401 Cr");
  await expect(card).toContainText("+₹475 Cr");
  await expect(card).toContainText("12 Nov 2026");
  await expect(card).toContainText("provisional");
  await noSideScroll(page, "dashboard");
});

test("20.2 with nothing stored the FII/DII card says 'Data not available yet'", async ({ page }) => {
  await mockQuotes(page);
  await page.route("**/api/fno-movers**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/fiidii", (r) => r.fulfill({ json: { status: "empty", rows: [] } }));
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("fii-dii-card")).toContainText("Data not available yet");
  await expect(page.getByTestId("futures-gainers-card")).toContainText("not available right now");
});
