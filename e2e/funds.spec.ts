import { test, expect, type Page } from "@playwright/test";
import { buildOverview, rowsForTile, type FundRow } from "../lib/mf/overview";
import { isTileId } from "../lib/mf/overview";

/**
 * The Mutual Funds pages at 360px with the data API mocked (no database, no AMFI). Informational only: no purchase, no SIP set-up.
 */
test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

const fund = (code: number, name: string, category: string, r: Partial<FundRow> = {}): FundRow => ({
  code, name, amc: "Test Mutual Fund", category, nav: 100 + code, navDate: "2026-11-12", ret1m: null, ret6m: null, ret1y: null, ret3y: null, ret5y: null, ...r,
});
const FUNDS: FundRow[] = [
  fund(101, "Alpha Large Cap Fund - Direct Plan - Growth", "Equity Scheme - Large Cap Fund", { ret1m: 1.2, ret6m: 5.5, ret1y: 14.25, ret3y: 12.5, ret5y: 13.1 }),
  fund(102, "Beta Bluechip Fund - Direct Plan - Growth", "Equity Scheme - Large Cap Fund", { ret1m: 0.4, ret6m: 3.1, ret1y: 18.75, ret3y: 9.2, ret5y: null }),
  fund(103, "Gamma Large Cap Fund - Direct Plan - Growth", "Equity Schemes - Large Cap Fund", { ret1y: null, ret3y: 15.0 }),
  fund(104, "Delta Mid Cap Fund - Direct Plan - Growth", "Equity Scheme - Mid Cap Fund", { ret1y: 22.0, ret3y: 18.0 }),
  fund(105, "Epsilon Balanced Fund - Direct Plan - Growth", "Hybrid Scheme - Aggressive Hybrid Fund", { ret1y: 11.0, ret3y: 11.5 }),
  fund(106, "Zeta Money Market Fund - Direct Plan - Growth", "Debt Scheme - Money Market Fund", { ret1y: 6.8, ret3y: 6.2 }),
  fund(107, "Eta Nifty 50 Index Fund - Direct Plan - Growth", "Index Funds - Equity Funds", { ret1y: 13.0, ret3y: null }), // no 3-year figure yet
];

async function mockApi(page: Page, mode: "ok" | "empty" | "unavailable" = "ok") {
  await page.route("**/api/market-data**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/mf/overview", (r) =>
    r.fulfill({ json: mode === "ok" ? { status: "ok", asOf: "2026-11-12", tiles: buildOverview(FUNDS) } : { status: mode, asOf: null, tiles: [] } })
  );
  await page.route("**/api/mf/list**", (r) => {
    const tile = new URL(r.request().url()).searchParams.get("tile") ?? "";
    if (mode !== "ok" || !isTileId(tile)) return r.fulfill({ json: { status: mode === "ok" ? "empty" : mode, rows: [] } });
    return r.fulfill({ json: { status: "ok", rows: rowsForTile(FUNDS, tile) } });
  });
  await page.route("**/api/mf/scheme/**", (r) => {
    const code = Number(new URL(r.request().url()).pathname.split("/").pop());
    const f = FUNDS.find((x) => x.code === code);
    if (mode !== "ok") return r.fulfill({ status: 200, json: { status: mode } });
    if (!f) return r.fulfill({ status: 404, json: { status: "notfound" } });
    const series = Array.from({ length: 300 }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 12) - (299 - i) * 86_400_000).toISOString().slice(0, 10), nav: 80 + i * 0.1 + Math.sin(i / 8) * 2 }));
    return r.fulfill({ json: { status: "ok", scheme: { ...f, isin: "INF000000001" }, series, returns: { "1m": f.ret1m, "6m": f.ret6m, "1y": f.ret1y, "3y": f.ret3y, "5y": f.ret5y } } });
  });
}

async function noSideScroll(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${label} scrolls sideways by ${over}px`).toBeLessThanOrEqual(0);
}

const DISCLAIMER = "Mutual fund investments are subject to market risks. Past performance does not guarantee future returns. Zestoxx does not distribute or recommend funds.";

test("category grid: the eleven tiles with real counts, the coverage label, the disclaimer, and no buy button", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app/funds", { waitUntil: "domcontentloaded" });
  const labels = ["Equity Funds", "Equity Hybrid", "Tax Saver", "Large Cap", "Mid Cap", "Small Cap", "Debt Funds", "Money Market Funds", "Index Funds", "FoFs", "Others"];
  const ids = ["equity", "equity-hybrid", "tax-saver", "large-cap", "mid-cap", "small-cap", "debt", "money-market", "index", "fof", "others"];
  for (const [i, l] of labels.entries()) await expect(page.getByTestId(`tile-${ids[i]}`)).toContainText(l);
  await expect(page.getByTestId("tile-large-cap")).toContainText("3 funds"); // both naming generations of the category
  await expect(page.getByTestId("tile-equity")).toContainText("4 funds");
  await expect(page.getByTestId("tile-small-cap")).toContainText("0 funds");
  await expect(page.getByTestId("mf-coverage").first()).toHaveText("Direct plans, Growth option");
  await expect(page.getByTestId("mf-disclaimer")).toHaveText(DISCLAIMER);
  await expect(page.getByRole("button", { name: /invest|buy|purchase|start sip/i })).toHaveCount(0);
  await expect(page.getByText(/invest now/i)).toHaveCount(0);
  await noSideScroll(page, "funds");
  await page.getByTestId("mf-mixes").screenshot({ path: "test-results/funds-mixes.png" });
  await page.getByTestId("tile-large-cap").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/funds-grid.png" });
});

test("sample mixes: category splits with real past returns and a monthly figure, no fund named", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app/funds", { waitUntil: "domcontentloaded" });
  const mix = page.getByTestId("mix-five-lakh-five-years");
  await expect(mix).toContainText("Aiming for ₹5 lakh in 5 years");
  await expect(mix).toContainText("40% Large Cap");
  await expect(mix).toContainText("40% Equity Hybrid");
  await expect(mix).toContainText("20% Debt Funds");
  await expect(mix).toContainText("3Y 12.5%"); // the median of Large Cap's 3-year returns (12.5, 9.2, 15.0)
  await expect(mix).toContainText(/a month for 5 years would reach ₹5,00,000/);
  // a mix that needs a category with no stored figure says so instead of inventing one
  await expect(page.getByTestId("mix-twenty-five-lakh-ten-years")).toContainText("Return figures need more stored history");
  for (const f of FUNDS) await expect(page.getByTestId("mf-mixes")).not.toContainText(f.name);
});

test("category list: sorted by return, re-sortable, searchable, rows open the fund", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app/funds/category/large-cap", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mf-coverage")).toHaveText("Direct plans, Growth option");
  await expect(page.getByTestId("mf-list").locator("li a")).toHaveCount(3);
  const names = () => page.getByTestId("mf-list").locator("li a").locator("span.block.break-words").allInnerTexts();
  // default: 1 year, best first, the fund with no 1-year figure last
  expect(await names()).toEqual(["Beta Bluechip Fund - Direct Plan - Growth", "Alpha Large Cap Fund - Direct Plan - Growth", "Gamma Large Cap Fund - Direct Plan - Growth"]);
  await page.getByRole("button", { name: "3Y", exact: true }).click();
  expect(await names()).toEqual(["Gamma Large Cap Fund - Direct Plan - Growth", "Alpha Large Cap Fund - Direct Plan - Growth", "Beta Bluechip Fund - Direct Plan - Growth"]);
  await page.getByLabel("Search funds").fill("bluechip");
  expect(await names()).toEqual(["Beta Bluechip Fund - Direct Plan - Growth"]);
  await noSideScroll(page, "category list");
  await page.getByRole("link", { name: /Beta Bluechip/ }).click();
  await expect(page).toHaveURL(/\/app\/funds\/102$/);
  await expect(page.getByTestId("mf-name")).toHaveText("Beta Bluechip Fund - Direct Plan - Growth");
});

test("scheme page: NAV, chart, returns table with -- for missing history, and the disclaimer", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app/funds/102", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mf-name")).toBeVisible();
  await expect(page.getByTestId("nav-chart")).toBeVisible();
  const t = page.getByTestId("mf-returns");
  await expect(t.locator("tr", { hasText: "1 month" })).toContainText("+0.40%");
  await expect(t.locator("tr", { hasText: "1 year" })).toContainText("+18.75%");
  await expect(t.locator("tr", { hasText: "3 years (a year)" })).toContainText("+9.20%");
  await expect(t.locator("tr", { hasText: "5 years (a year)" })).toContainText("--");
  await page.getByRole("button", { name: "3Y", exact: true }).click();
  await expect(page.getByTestId("nav-chart")).toBeVisible();
  await expect(page.getByTestId("mf-disclaimer")).toHaveText(DISCLAIMER);
  await expect(page.getByRole("button", { name: /invest|buy|purchase|start sip/i })).toHaveCount(0);
  await noSideScroll(page, "scheme page");
  await page.getByTestId("nav-chart").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/funds-scheme.png" });
});

test("calculator: monthly SIP and one-time, the ₹100 to ₹10,00,000 slider, bounds, the fund's past return filled in and editable", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app/funds/102", { waitUntil: "domcontentloaded" });
  const calc = page.getByTestId("mf-calc");
  await expect(calc.locator("#mf-rate")).toHaveValue("9.2"); // this fund's past 3-year return
  await expect(calc).toContainText("may not repeat");
  await calc.locator("#mf-amount").fill("5000");
  await calc.locator("#mf-years").fill("10");
  await calc.locator("#mf-rate").fill("12");
  const result = page.getByTestId("mf-calc-result");
  await expect(result).toContainText("₹6,00,000"); // invested: 5000 x 120
  const m = Math.pow(1.12, 1 / 12) - 1;
  const fv = Math.round(5000 * ((Math.pow(1 + m, 120) - 1) / m) * (1 + m));
  await expect(result).toContainText(fv.toLocaleString("en-IN"));
  await expect(calc).toContainText("Your own figure.");
  // one time
  await calc.getByRole("button", { name: "One time" }).click();
  await calc.locator("#mf-amount").fill("100000");
  await calc.locator("#mf-years").fill("5");
  await calc.locator("#mf-rate").fill("10");
  await expect(result).toContainText(Math.round(100000 * Math.pow(1.1, 5)).toLocaleString("en-IN"));
  // slider ends
  const slider = calc.getByLabel("Amount slider");
  await slider.fill("0");
  await expect(calc.locator("#mf-amount")).toHaveValue("100");
  await slider.fill("1");
  await expect(calc.locator("#mf-amount")).toHaveValue("1000000");
  // bounds: a typed amount below 100 is worked out as 100
  await calc.locator("#mf-amount").fill("5");
  await expect(result).toContainText("₹100");
  await calc.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/funds-calc.png" });
});

test("empty and failed data say 'Data not available yet' on every page, never numbers", async ({ page }) => {
  for (const mode of ["empty", "unavailable"] as const) {
    const p = await page.context().newPage();
    await mockApi(p, mode);
    for (const path of ["/app/funds", "/app/funds/category/large-cap", "/app/funds/102"]) {
      await p.goto(path, { waitUntil: "domcontentloaded" });
      await expect(p.getByTestId("mf-empty")).toHaveText("Data not available yet");
      await expect(p.getByTestId("mf-disclaimer")).toBeVisible();
    }
    await p.close();
  }
});

test("a fund that is not stored says so", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app/funds/999", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mf-empty")).toHaveText("This fund is not in the stored list.");
});

test("Mutual Funds is in the navigation", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /More/ }).click();
  await page.getByRole("link", { name: "Mutual Funds" }).click();
  await expect(page).toHaveURL(/\/app\/funds$/);
});
