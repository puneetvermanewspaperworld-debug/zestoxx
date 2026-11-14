import { test, expect, type Page } from "@playwright/test";

/**
 * The dashboard's Market Movers card against a mocked /api/fno-movers (the same feed the Movers page uses): the top three gainers
 * and losers among all NSE stocks, the Live data / Last close badge, the closed-market note, a More link, and honest empty and
 * failed states. At 360px, no database or Upstox token needed.
 */
test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

const OPEN = new Date("2026-11-11T13:50:00+05:30"); // a Wednesday in market hours
const SHUT = new Date("2026-11-14T12:00:00+05:30"); // a Saturday

const stock = (symbol: string, changePct: number, ltp = 250) => ({ symbol, name: `${symbol} LTD`, ltp, change: Math.round(ltp * changePct) / 100, changePct, volume: 1_000_000, value: 2.5e8 });
const GAINERS = [stock("ANUP", 20.0, 2400), stock("RELIANCE", 4.2, 1500), stock("BBB", 3.9), stock("CCC", 3.1), stock("DDD", 2.2)];
const LOSERS = [stock("ZZZ", -7.5), stock("TCS", -3.3, 4100), stock("YYY", -2.1), stock("XXX", -1.4)];

type Mode = "ok" | "empty" | "unavailable";
async function mock(page: Page, mode: Mode = "ok") {
  await page.route("**/api/market-data**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/fiidii", (r) => r.fulfill({ json: { status: "empty", rows: [] } }));
  await page.route("**/api/fno-movers**", (r) => {
    const view = new URL(r.request().url()).searchParams.get("view");
    if (mode === "unavailable") return r.fulfill({ json: { source: "unavailable" } });
    if (view === "equity") {
      const data = mode === "empty" ? { gainers: [], losers: [], active: [], ranked: 0, scanned: 2000 } : { gainers: GAINERS, losers: LOSERS, active: [], ranked: 1800, scanned: 2000 };
      return r.fulfill({ json: { source: "live", asOf: "2026-11-11T08:20:00Z", data } });
    }
    return r.fulfill({ json: { source: "unavailable" } });
  });
}

const card = (page: Page) => page.getByTestId("market-movers-card");

test("shows the top three real gainers and losers from the all-NSE feed, ANUP +20.00% first", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mock(page);
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  const rows = card(page).getByTestId("mover-row");
  await expect(rows).toHaveCount(6);
  const text = await card(page).innerText();
  const [gain, lose] = text.toUpperCase().split("TOP LOSERS");
  expect(gain).toContain("ANUP");
  expect(gain).toContain("+20.00%");
  expect(gain).toContain("RELIANCE");
  expect(gain).toContain("BBB");
  expect(gain).not.toContain("CCC"); // only the top three
  expect(lose).toContain("ZZZ");
  expect(lose).toContain("-7.50%");
  expect(lose).toContain("TCS");
  expect(lose).toContain("YYY");
  expect(lose).not.toContain("XXX");
  expect(text).not.toContain("No gainers right now");
  expect(text).not.toContain("+-");
  // stocks the terminal charts link to their chart; the rest are plain text
  await expect(card(page).getByRole("link", { name: "RELIANCE" })).toHaveAttribute("href", "/app/trade/RELIANCE");
  await expect(card(page).getByRole("link", { name: "ANUP" })).toHaveCount(0);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
});

test("the Movers page lists the same gainers: one feed, so the two agree", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mock(page);
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await expect(card(page).getByTestId("mover-row")).toHaveCount(6);
  await page.goto("/app/movers", { waitUntil: "domcontentloaded" });
  const first = page.locator("tbody tr").first();
  await expect(first).toContainText("ANUP");
  await expect(first).toContainText("+20.00%");
});

test("a More link goes to the Movers page", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mock(page);
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  const more = card(page).getByRole("link", { name: /^More/ });
  await expect(more).toHaveAttribute("href", "/app/movers");
  await more.click();
  await expect(page).toHaveURL(/\/app\/movers$/);
});

test("market open: Live data badge and no closed-market note", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mock(page);
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await expect(card(page).getByTestId("data-badge")).toHaveText("Live data");
  await expect(card(page).getByTestId("movers-note")).toHaveCount(0);
});

test("market shut: Last close badge and the note 'Market closed, last close shown', never Live data", async ({ page }) => {
  await page.clock.install({ time: SHUT });
  await mock(page);
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await expect(card(page).getByTestId("mover-row")).toHaveCount(6);
  await expect(card(page).getByTestId("data-badge")).toHaveText("Last close");
  await expect(card(page).getByTestId("movers-note")).toHaveText("Market closed, last close shown");
  await expect(card(page).getByText("Live data")).toHaveCount(0);
});

test("with no real gainers or losers, it says so", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mock(page, "empty");
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await expect(card(page)).toContainText("No gainers right now");
  await expect(card(page)).toContainText("No losers right now");
  await expect(card(page).getByTestId("mover-row")).toHaveCount(0);
});

test("with the feed unavailable it says so and lists nothing", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mock(page, "unavailable");
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await expect(card(page).getByTestId("movers-unavailable")).toHaveText("Live market data is unavailable right now");
  await expect(card(page).getByTestId("mover-row")).toHaveCount(0);
  await expect(card(page).getByTestId("data-badge")).toHaveCount(0);
});

test("no demo symbols or crypto ever appear as movers", async ({ page }) => {
  await page.clock.install({ time: OPEN });
  await mock(page);
  await page.route("**/api/market-data?asset=crypto", (r) => r.fulfill({ json: { BTC: { price: 99000, prevClose: 90000 }, ETH: { price: 3000, prevClose: 3300 } } }));
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await expect(card(page).getByTestId("mover-row")).toHaveCount(6);
  expect(await card(page).innerText()).not.toMatch(/BTC|ETH|SOL|SENSEX|NIFTY|BANKNIFTY/);
});
