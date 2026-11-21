import { test, expect, type Page } from "@playwright/test";
import { mockMarket } from "./chart-helpers";

/**
 * The phone layout's density, held to numbers measured from a phone trading app's screenshots (sizes and spacing only: nothing else was taken
 * from it). The screenshots are 1080px wide; every number here is that measurement scaled to a 390px-wide screen, and each test allows 1px.
 *
 *   watchlist row 66.1  ·  symbol 14.9, regular  ·  name 12.0  ·  price 14.9, regular  ·  change 12.9  ·  search box 50.6  ·  tab strip 36.1
 *   tab bar 48.4  ·  Buy and Sell 49.5 tall, 164.7 wide, 20.6 apart  ·  sheet top to Buy 99.3  ·  link rows 70.8 apart  ·  depth rows 27.8
 *
 * Desktop (1000px and up) is not measured against any of it: it keeps its sizes (see type-scale.spec.ts).
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const portfolio = { watchlist: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "NIFTY50"], cash: 842_310.5, holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } }, orderLog: [], alerts: [], lists: [{ name: "Banks", symbols: ["HDFCBANK"] }] };
const near = (got: number, want: number, tol = 1) => expect(Math.abs(got - want), `${got} should be within ${tol}px of ${want}`).toBeLessThanOrEqual(tol);

async function open(page: Page, path = "/app/watchlist", dismiss = true) {
  await mockMarket(page);
  await page.route("**/api/portfolio", (r) => (r.request().method() === "PUT" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: portfolio })));
  await page.route("**/api/symbol-detail**", (r) => r.fulfill({ json: { source: "live", ltp: 1500, ohlc: { open: 1490, high: 1512, low: 1481 }, depth: { bids: [1, 2, 3, 4, 5].map((i) => ({ price: 1500 - i / 10, qty: 10 * i, orders: i })), asks: [1, 2, 3, 4, 5].map((i) => ({ price: 1500 + i / 10, qty: 10 * i, orders: i })), totalBuyQty: 150, totalSellQty: 150 } } }));
  await page.route("**/api/quotes**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/watchlist?symbols=**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/watchlist-search**", (r) => r.fulfill({ json: { results: [{ symbol: "SBIN", name: "State Bank of India", kind: "equity", fno: true }, { symbol: "RELAXO", name: "Relaxo Footwears Ltd", kind: "equity", fno: false }, { symbol: "ITC", name: "ITC Ltd", kind: "equity", fno: true }] } }));
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-content").waitFor();
  const x = page.getByTestId("guest-notice-dismiss");
  if (dismiss && (await x.count())) await x.click();
  await page.waitForTimeout(1200);
}

const box = async (page: Page, id: string) => (await page.getByTestId(id).boundingBox())!;
const style = (page: Page, id: string) => page.getByTestId(id).evaluate((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), weight: Number(getComputedStyle(e).fontWeight) }));

test.describe("the watchlist", () => {
  test("rows are 66px with the sizes and weights of a trading list: symbol 15, name 12, price 15, change 13, regular weight", async ({ page }) => {
    await open(page);
    near((await box(page, "wl-row-RELIANCE")).height, 66.1);
    near((await box(page, "wl-row-TCS")).y - (await box(page, "wl-row-RELIANCE")).y, 66.1); // the pitch: rows share a hairline, no gap
    const sym = await page.getByTestId("wl-open-RELIANCE").locator(".truncate").first().evaluate((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), weight: Number(getComputedStyle(e).fontWeight) }));
    near(sym.size, 14.9);
    expect(sym.weight).toBe(400);
    const name = await page.getByTestId("wl-open-RELIANCE").locator(".truncate").nth(1).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    near(name, 12.0);
    const price = await style(page, "wl-price-RELIANCE");
    near(price.size, 14.9);
    expect(price.weight).toBe(400);
    near((await style(page, "wl-chg-RELIANCE")).size, 12.9);
  });

  test("the list is flat and edge to edge: hairlines, no card, no gap between rows", async ({ page }) => {
    await open(page);
    const ul = await box(page, "wl-rows");
    near(ul.x, 0, 0.5);
    near(ul.width, 390, 0.5);
    const gaps = await page.getByTestId("wl-rows").locator("li").evaluateAll((els) => els.slice(1).map((e, i) => e.getBoundingClientRect().y - els[i].getBoundingClientRect().bottom));
    for (const g of gaps) expect(Math.abs(g)).toBeLessThanOrEqual(0.5);
    expect(await page.getByTestId("wl-rows").evaluate((e) => getComputedStyle(e).borderRadius)).toBe("0px");
  });

  test("the search box is 50px and the list chips sit in a 36px strip, 28px tall, with a 44px hit area", async ({ page }) => {
    await open(page);
    near((await box(page, "wl-search")).height, 50.6);
    const strip = await page.getByRole("tablist", { name: "Watchlists" }).evaluate((e) => e.parentElement!.getBoundingClientRect().height);
    near(strip, 36.1);
    const chip = page.getByTestId("wl-tab-My Watchlist");
    expect((await chip.boundingBox())!.height).toBeLessThan(36);
    const hit = await chip.evaluate((e) => ({ h: parseFloat(getComputedStyle(e, "::after").height), w: parseFloat(getComputedStyle(e, "::after").width) }));
    expect(hit.h).toBeGreaterThanOrEqual(44);
    expect(hit.w).toBeGreaterThanOrEqual(44);
  });

  test("Edit and the 5/250 count share one row", async ({ page }) => {
    await open(page);
    const count = await box(page, "wl-count");
    const edit = await box(page, "wl-edit");
    near(count.y + count.height / 2, edit.y + edit.height / 2, 3);
    expect(edit.x).toBeGreaterThan(count.x + count.width);
    await expect(page.getByTestId("wl-count")).toHaveText("5/250");
  });

  test("the sign-up note is one line, dismisses, and stays dismissed", async ({ page }) => {
    await open(page, "/app/watchlist", false);
    const note = page.getByTestId("guest-notice");
    await expect(note).toBeVisible();
    expect((await note.boundingBox())!.height).toBeLessThanOrEqual(38);
    await expect(note).toContainText("cookie");
    await page.getByTestId("guest-notice-dismiss").click();
    await expect(note).toHaveCount(0);
  });

  test("the bottom tab bar is 48px, with 13px labels", async ({ page }) => {
    await open(page);
    near((await box(page, "bottom-nav")).height, 48.4);
    expect((await style(page, "nav-orders")).size).toBe(13);
  });
});

test.describe("the search results", () => {
  test("cover what is under them completely: full width, opaque, and no line of the list or the chips shows through or beside them", async ({ page }) => {
    await open(page);
    await page.getByTestId("wl-search-input").fill("rel");
    const results = page.getByTestId("wl-results");
    await expect(results).toBeVisible();
    const r = (await results.boundingBox())!;
    near(r.x, 0, 0.5);
    near(r.width, 390, 0.5);
    expect(await results.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 255, 255)");
    // every point inside the panel belongs to the panel, on a grid
    const stray = await results.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const bad: string[] = [];
      for (let y = b.top + 2; y < b.bottom - 1; y += 9) for (let x = 2; x < b.right - 1; x += 23) if (!el.contains(document.elementFromPoint(x, y))) bad.push(`${Math.round(x)},${Math.round(y)}`);
      return bad;
    });
    expect(stray).toEqual([]);
    // the list chips are above the search box now, so nothing of them is under the results
    const chips = (await page.getByRole("tablist", { name: "Watchlists" }).boundingBox())!;
    expect(chips.y + chips.height).toBeLessThanOrEqual((await box(page, "wl-search")).y);
  });

  test("tapping a result adds it and closes the panel", async ({ page }) => {
    await open(page);
    await page.getByTestId("wl-search-input").fill("rel");
    await page.getByTestId("wl-result-SBIN").click(); // a symbol My Watchlist can hold
    await expect(page.getByTestId("wl-results")).toHaveCount(0);
    await expect(page.getByTestId("wl-count")).toHaveText("6/250");
  });
});

test.describe("the row sheet", () => {
  test("Buy and Sell are 49.5px tall, 164.7px wide and 20.6px apart; the title is 19px regular", async ({ page }) => {
    await open(page);
    await page.getByTestId("wl-open-RELIANCE").click();
    const buy = await box(page, "sheet-buy");
    const sell = await box(page, "sheet-sell");
    near(buy.height, 49.5);
    near(buy.width, 164.7);
    near(sell.width, 164.7);
    near(sell.x - (buy.x + buy.width), 20.6);
    const title = await page.getByTestId("symbol-sheet").locator("h2").evaluate((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), weight: Number(getComputedStyle(e).fontWeight) }));
    near(title.size, 18.9);
    expect(title.weight).toBe(400);
  });

  test("the sheet's top to Buy is 99px; the two rows of links are 71px apart; depth rows are 28px apart", async ({ page }) => {
    await open(page);
    await page.getByTestId("wl-open-RELIANCE").click();
    const panelTop = await page.getByTestId("symbol-sheet").evaluate((e) => e.querySelector("h2")!.closest(".rounded-t-2xl")!.getBoundingClientRect().top);
    near((await box(page, "sheet-buy")).y - panelTop, 99.3);
    near((await box(page, "sheet-gtt")).y - (await box(page, "sheet-chart")).y, 70.8);
    const rows = await page.getByTestId("depth-levels").locator("> div > div").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    near(rows[2] - rows[1], 27.8);
  });

  test("the links are text at 14px, each 44px tall", async ({ page }) => {
    await open(page);
    await page.getByTestId("wl-open-RELIANCE").click();
    for (const id of ["sheet-chart", "sheet-chain", "sheet-alert", "sheet-notes", "sheet-gtt"]) {
      near((await style(page, id)).size, 14.2, 0.5);
      expect((await box(page, id)).height).toBeGreaterThanOrEqual(43.5);
    }
  });
});

test.describe("Portfolio and Orders", () => {
  test("their tab strips are 36px", async ({ page }) => {
    await open(page, "/app/portfolio");
    near((await page.getByRole("tablist").first().boundingBox())!.height, 36.1);
    await page.goto("/app/orders", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    near((await page.getByRole("tablist").first().boundingBox())!.height, 36.1);
  });
});

test.describe("at 360px", () => {
  test.use({ viewport: { width: 360, height: 800 } });
  test("nothing scrolls sideways, on the watchlist or in the sheet", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId("wl-open-RELIANCE").click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
