import { test, expect, type Page } from "@playwright/test";
import { hydrated } from "./hydrate";

/**
 * The MTF calculator at 360px, with the live price mocked at the network (no Upstox token needed). The numbers are the worked
 * example of section D: price 839, exit 892, own ₹1,00,000, funding 60%, 10 days, interest 15%.
 */
test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

const row = (symbol: string, ltp: number) => ({ symbol, name: symbol + " LTD", ltp, change: 0, changePct: 0, volume: 1000 });

async function mock(page: Page) {
  await page.route("**/api/market-data**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/watchlist?**", (r) => {
    const symbols = new URL(r.request().url()).searchParams.get("symbols") ?? "";
    const prices: Record<string, number> = { RELIANCE: 839, TCS: 4100 };
    return r.fulfill({ json: { source: "live", asOf: new Date().toISOString(), rows: symbols.split(",").filter((s) => prices[s]).map((s) => row(s, prices[s])) } });
  });
  await page.route("**/api/watchlist-search**", (r) => r.fulfill({ json: { results: [{ symbol: "TCS", name: "Tata Consultancy Services" }] } }));
}

async function setWorkedExample(page: Page) {
  await page.fill("#mtf-exit", "892");
  await page.fill("#mtf-own", "100000");
  await page.fill("#mtf-days", "10");
  await page.fill("#mtf-funding", "60");
  await page.fill("#mtf-rate", "15");
}

const cell = (page: Page, label: string, col: 1 | 2) => page.getByTestId("mtf-results").locator("tr", { has: page.getByRole("rowheader", { name: label, exact: true }) }).locator("td").nth(col - 1);

test("the price fills from the live quote, and the worked example comes out as the spec says", async ({ page }) => {
  await mock(page);
  await page.goto("/app/mtf", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mtf-price")).toHaveValue("839");
  await expect(page.getByText(/Live price of RELIANCE/)).toBeVisible();
  await setWorkedExample(page);

  await expect(cell(page, "Quantity", 1)).toHaveText("297");
  await expect(cell(page, "Quantity", 2)).toHaveText("119");
  await expect(cell(page, "Gross profit", 1)).toHaveText("+₹15,741");
  await expect(cell(page, "Gross profit", 2)).toHaveText("+₹6,307");
  await expect(cell(page, "Interest", 1)).toHaveText("₹614");
  await expect(cell(page, "Interest", 2)).toHaveText("₹0");
  await expect(page.getByTestId("mtf-results")).toContainText("2.50x");
  const risk = page.getByTestId("mtf-risk");
  await expect(risk).toContainText("40.0%");
  await expect(risk).toContainText("₹629");
  await expect(risk).toContainText("25.0% fall");
});

test("the side-by-side table has every row the spec names, for both choices", async ({ page }) => {
  await mock(page);
  await page.goto("/app/mtf", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mtf-price")).toHaveValue("839");
  const t = page.getByTestId("mtf-results");
  await expect(t.getByRole("columnheader", { name: "With MTF" })).toBeVisible();
  await expect(t.getByRole("columnheader", { name: "Without MTF" })).toBeVisible();
  for (const label of ["Position value", "Quantity", "Gross profit", "Interest", "Charges", "Net profit", "Net return on own capital", "Breakeven price"]) {
    await expect(t.getByRole("rowheader", { name: label, exact: true })).toBeVisible();
  }
});

test("a grid of net profit at -20, -10, -5, 0, +5, +10 and +20% for both choices, with losses shown", async ({ page }) => {
  await mock(page);
  await page.goto("/app/mtf", { waitUntil: "domcontentloaded" });
  await setWorkedExample(page);
  const rows = page.getByTestId("mtf-grid").locator("tbody tr");
  await expect(rows).toHaveCount(7);
  const first = await rows.nth(0).innerText();
  expect(first).toContain("−20%");
  const losses = await rows.nth(0).locator("td").allInnerTexts();
  expect(losses.every((t) => t.startsWith("−₹"))).toBe(true);
  const gains = await rows.nth(6).locator("td").allInnerTexts();
  expect(gains.every((t) => t.startsWith("+₹"))).toBe(true);
});

test("the wording: 'See how MTF works', never 'Buy with MTF', and the risk text is shown in full", async ({ page }) => {
  await mock(page);
  await page.goto("/app/mtf", { waitUntil: "domcontentloaded" });
  const how = page.getByRole("button", { name: "See how MTF works" });
  await expect(how).toBeVisible();
  await how.click();
  await expect(page.locator("#mtf-how")).toContainText("pledged to the broker");
  await expect(page.getByText("Buy with MTF")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /buy|apply|invest/i })).toHaveCount(0);
  await expect(page.getByTestId("mtf-warning")).toHaveText(
    "MTF magnifies losses as well as gains. Interest accrues daily. Shares are pledged to your broker. Eligible stocks and funding vary by broker. This is a calculator, not an offer."
  );
  await expect(page.getByText("Illustrative. Your broker sets this for each stock.")).toBeVisible();
  await expect(page.getByText("Check your broker's rate.")).toBeVisible();
});

test("a typed price overrides the live one; searching switches stock and refills the price", async ({ page }) => {
  await mock(page);
  await page.goto("/app/mtf", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mtf-price")).toHaveValue("839");
  await page.fill("#mtf-price", "900");
  await expect(page.getByText("Your own price.")).toBeVisible();
  await page.fill("#mtf-search", "tcs");
  await page.getByRole("option").getByRole("button", { name: /TCS/ }).click();
  await expect(page.locator("#mtf-price")).toHaveValue("4100");
  await expect(page.getByText(/Live price of TCS/)).toBeVisible();
});

test("editing a delivery charge changes the charges and the net profit", async ({ page }) => {
  await mock(page);
  await page.goto("/app/mtf", { waitUntil: "domcontentloaded" });
  await setWorkedExample(page);
  const before = await cell(page, "Charges", 1).innerText();
  await page.locator("details summary").click();
  await page.fill("#mtf-ch-brokeragePerOrder", "100");
  const after = await cell(page, "Charges", 1).innerText();
  expect(after).not.toBe(before);
  expect(Number(after.replace(/[^\d]/g, ""))).toBeGreaterThan(Number(before.replace(/[^\d]/g, "")) + 150);
});

test("without a live price the page asks for one instead of inventing it", async ({ page }) => {
  await page.route("**/api/market-data**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/watchlist?**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.goto("/app/mtf", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Live price not available right now. Type the price.")).toBeVisible();
  await expect(page.locator("#mtf-price")).toHaveValue("");
  await expect(page.getByText("Enter a price and an expected exit price")).toBeVisible();
  await page.fill("#mtf-price", "500");
  await page.fill("#mtf-exit", "550");
  await expect(page.getByTestId("mtf-results")).toBeVisible();
});

test("an amount too small for one share says so", async ({ page }) => {
  await mock(page);
  await page.goto("/app/mtf", { waitUntil: "domcontentloaded" });
  await page.fill("#mtf-own", "100");
  await expect(page.getByText(/less than the price of one share/)).toBeVisible();
});

for (const width of [360, 390]) {
  test(`no sideways scroll at ${width}px, with results, the grid and the charges panel open`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mock(page);
    await page.goto("/app/mtf", { waitUntil: "domcontentloaded" });
    await setWorkedExample(page);
    await page.getByRole("button", { name: "See how MTF works" }).click();
    await page.locator("details summary").click();
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
    const tooWide = await page.evaluate(() => [...document.querySelectorAll("table")].filter((t) => t.getBoundingClientRect().right > window.innerWidth + 1).length);
    expect(tooWide).toBe(0);
    await page.getByTestId("mtf-results").screenshot({ path: `test-results/mtf-${width}-results.png` });
    await page.getByTestId("mtf-grid").screenshot({ path: `test-results/mtf-${width}-grid.png` });
  });
}

test("MTF is in the navigation", async ({ page }) => {
  await mock(page);
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  // The tab bar is part of the server-rendered page and only works once the page has hydrated: a tap before that is lost (it is not
  // queued), which is what made this test fail now and then on a busy machine. So wait for hydration, then tap once.
  const more = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /More/ });
  await hydrated(more);
  await more.click();
  const sheet = page.getByRole("dialog", { name: "All pages" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("link", { name: "MTF", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/mtf$/, { timeout: 20_000 });
});
