/**
 * Measures our phone layout in CSS pixels at 390px wide (the width the Zerodha comparison is made at), and takes the screenshots, for the
 * watchlist, the row sheet, Portfolio and Orders. Run by hand against a running `next start`:
 *
 *   npx next start -p 3400
 *   BASE=http://localhost:3400 OUT=docs/ui-density/before npx tsx --tsconfig tsconfig.json scripts/ui-density-measure.ts
 *
 * Screenshots are taken at 3x so their pixels line up with the 1080px-wide phone screenshots they are compared with (1170 / 1080 = 390 / 360).
 * The market and the server are mocked as in the e2e tests.
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockMarket } from "../e2e/chart-helpers";

const BASE = process.env.BASE ?? "http://localhost:3400";
const OUT = process.env.OUT ?? "docs/ui-density/out";
const VW = Number(process.env.VW ?? 390);
const VH = Number(process.env.VH ?? 844);
const TAG = `${VW}x${VH}`;
fs.mkdirSync(OUT, { recursive: true });

const portfolio = {
  watchlist: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "NIFTY50"],
  cash: 842_310.5,
  holdings: { RELIANCE: { qty: 10, avgPrice: 1400 }, TCS: { qty: 4, avgPrice: 4050 } },
  orderLog: [
    { id: "1", symbol: "RELIANCE", side: "buy", qty: 10, price: 1400, mode: "market", time: "10:00:00 am", orderType: "MARKET", status: "filled", date: "2026-11-02" },
    { id: "2", symbol: "TCS", side: "buy", qty: 4, price: 4050, mode: "market", time: "10:05:00 am", orderType: "MARKET", status: "filled", date: "2026-11-02" },
  ],
  openOrders: [{ symbol: "INFY", side: "buy", qty: 5, limitPrice: 1700, time: "10:00:00 am", orderType: "LIMIT", placedDate: "2026-11-11" }],
  alerts: [{ id: "a1", symbol: "NIFTY50", condition: "above", target: 26000, createdAt: "10:00:00 am" }],
};

async function prepare(page: Page, p: string, dismissNotice: boolean) {
  await mockMarket(page);
  await page.route("**/api/portfolio", (r) => (r.request().method() === "PUT" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: portfolio })));
  await page.route("**/api/symbol-detail**", (r) => r.fulfill({ json: { source: "live", ltp: 1500, ohlc: { open: 1490, high: 1512, low: 1481 }, depth: { bids: [1, 2, 3, 4, 5].map((i) => ({ price: 1500 - i / 10, qty: 10 * i, orders: i })), asks: [1, 2, 3, 4, 5].map((i) => ({ price: 1500 + i / 10, qty: 10 * i, orders: i })), totalBuyQty: 150, totalSellQty: 150 } } }));
  await page.route("**/api/quotes**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/watchlist-search**", (r) => r.fulfill({ json: { results: [{ symbol: "RELIANCE", name: "Reliance Industries Ltd", kind: "equity", fno: true }, { symbol: "RELAXO", name: "Relaxo Footwears Ltd", kind: "equity", fno: false }, { symbol: "NIFTYBEES", name: "Nippon Nifty ETF", kind: "etf", fno: false }] } }));
  await page.route("**/api/watchlist?symbols=**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-content").waitFor({ timeout: 30_000 });
  const x = page.getByTestId("guest-notice-dismiss");
  if (dismissNotice && (await x.count())) await x.click();
  await page.waitForTimeout(2500);
}

/** runs in the page: size, weight and box of the first element matching each selector */
function probe(sel: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(sel)) {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) {
      out[k] = null;
      continue;
    }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out[k] = { top: +r.top.toFixed(1), height: +r.height.toFixed(1), width: +r.width.toFixed(1), font: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight };
  }
  return out;
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const res: Record<string, unknown> = {};

  // ---- watchlist, as a first-time visitor sees it (the sign-up note is showing)
  let page = await ctx.newPage();
  await prepare(page, "/app/watchlist", false);
  await page.screenshot({ path: path.join(OUT, `${TAG}-watchlist-with-note.png`) });
  res.watchlistWithNote = await page.evaluate(probe, {
    banner: '[data-testid="guest-notice"]',
    topBar: "header",
    ticker: ".ticker-strip",
    title: "h1",
    search: '[data-testid="wl-search"] > div',
    chips: '[role="tablist"][aria-label="Watchlists"]',
    count: '[data-testid="wl-count"]',
    row1: '[data-testid="wl-row-RELIANCE"]',
    row2: '[data-testid="wl-row-TCS"]',
    symbol: '[data-testid="wl-open-RELIANCE"] .truncate',
    name: '[data-testid="wl-open-RELIANCE"] .truncate + .truncate',
    price: '[data-testid="wl-price-RELIANCE"]',
    change: '[data-testid="wl-chg-RELIANCE"]',
    edit: '[data-testid="wl-edit"]',
    nav: '[data-testid="bottom-nav"]',
    navItem: '[data-testid="nav-orders"]',
  });
  await page.getByTestId("guest-notice-dismiss").click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${TAG}-watchlist.png`) });
  res.watchlist = await page.evaluate(probe, {
    title: "h1",
    search: '[data-testid="wl-search"] > div',
    chips: '[role="tablist"][aria-label="Watchlists"]',
    count: '[data-testid="wl-count"]',
    row1: '[data-testid="wl-row-RELIANCE"]',
    row2: '[data-testid="wl-row-TCS"]',
    nav: '[data-testid="bottom-nav"]',
  });
  // the search dropdown over the chips
  await page.getByTestId("wl-search-input").fill("rel");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${TAG}-watchlist-search-open.png`) });

  // ---- the row sheet
  await page.getByTestId("wl-search-input").fill("");
  await page.getByTestId("wl-open-RELIANCE").click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${TAG}-row-sheet.png`) });
  res.rowSheet = await page.evaluate(probe, {
    panel: '[data-testid="symbol-sheet"] > div:nth-child(2)',
    titleBar: '[data-testid="symbol-sheet"] h2',
    name: '[data-testid="sheet-name"]',
    price: '[data-testid="sheet-price"]',
    change: '[data-testid="sheet-change"]',
    buy: '[data-testid="sheet-buy"]',
    sell: '[data-testid="sheet-sell"]',
    chart: '[data-testid="sheet-chart"]',
    gtt: '[data-testid="sheet-gtt"]',
    depth: '[data-testid="depth-levels"]',
    depthRow: '[data-testid="depth-levels"] > div > div:nth-child(2)',
    depthRow2: '[data-testid="depth-levels"] > div > div:nth-child(3)',
    day: '[data-testid="day-range"]',
  });
  await page.close();

  // ---- portfolio, orders
  for (const [key, p, sel] of [
    ["portfolio", "/app/portfolio", { tabs: '[role="tablist"]', tab: '[role="tab"]', row: '[data-testid="pf-row-RELIANCE"]', cardLabel: "main .uppercase", title: "h1" }],
    ["orders", "/app/orders", { tabs: '[role="tablist"]', tab: '[role="tab"]', row: '[data-testid^="open-order-"]', title: "h1" }],
  ] as const) {
    page = await ctx.newPage();
    await prepare(page, p, true);
    if (key === "orders") {
      await page.getByTestId("orders-tab-alerts").click().catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(OUT, `${TAG}-${key}.png`) });
    res[key] = await page.evaluate(probe, sel as unknown as Record<string, string>);
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, `${TAG}-measurements.json`), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
