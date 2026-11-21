/**
 * Screenshots and numbers for the phone type scale, run by hand against a running `next start`:
 *
 *   npx next start -p 3400
 *   BASE=http://localhost:3400 OUT=docs/ui-polish/before npx tsx --tsconfig tsconfig.json scripts/ui-polish-shots.ts
 *
 * For each phone size it opens the watchlist, the row sheet with the GTT form open, the Portfolio page and the F&O analyzer, takes a screenshot of
 * each, and measures: how far the sheet scrolls, the page's height, the text sizes in use (by characters of text), the smallest text, inputs under
 * 16px, and sideways scroll. The market and the server are mocked as in the e2e tests (the F&O analyzer reads whatever the running server gives it).
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockMarket } from "../e2e/chart-helpers";

const BASE = process.env.BASE ?? "http://localhost:3400";
const OUT = process.env.OUT ?? "docs/ui-polish/out";
fs.mkdirSync(OUT, { recursive: true });

const portfolio = {
  watchlist: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "NIFTY50", "BANKNIFTY", "BTC"],
  cash: 842_310.5,
  holdings: { RELIANCE: { qty: 10, avgPrice: 1400 }, TCS: { qty: 4, avgPrice: 4050 }, INFY: { qty: 25, avgPrice: 1790 }, HDFCBANK: { qty: 15, avgPrice: 1650 } },
  orderLog: ["RELIANCE", "TCS", "INFY", "HDFCBANK"].map((s, i) => ({ id: String(i), symbol: s, side: "buy", qty: 5 + i, price: 1000 + i * 100, mode: "market", time: "10:00:00 am", orderType: "MARKET", status: "filled", date: "2026-11-02" })),
  alerts: [],
  lists: [{ name: "Banks", symbols: ["HDFCBANK", "SBIN"] }],
};

async function prepare(page: Page, p: string) {
  await mockMarket(page);
  await page.route("**/api/portfolio", (r) => (r.request().method() === "PUT" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: portfolio })));
  await page.route("**/api/symbol-detail**", (r) => r.fulfill({ json: { source: "live", ltp: 1500, ohlc: { open: 1490, high: 1512, low: 1481 }, depth: { bids: [{ price: 1499.9, qty: 120, orders: 3 }, { price: 1499.85, qty: 80, orders: 2 }, { price: 1499.8, qty: 40, orders: 1 }, { price: 1499.75, qty: 90, orders: 2 }, { price: 1499.7, qty: 70, orders: 2 }], asks: [{ price: 1500.05, qty: 60, orders: 1 }, { price: 1500.1, qty: 30, orders: 1 }, { price: 1500.15, qty: 55, orders: 2 }, { price: 1500.2, qty: 85, orders: 3 }, { price: 1500.25, qty: 45, orders: 1 }], totalBuyQty: 400, totalSellQty: 275 } } }));
  await page.route("**/api/quotes**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/watchlist?symbols=**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-content").waitFor({ timeout: 30_000 });
  const x = page.getByTestId("guest-notice-dismiss");
  if (await x.count()) await x.click();
  await page.waitForTimeout(2500);
}

/** runs in the page */
function stats() {
  const hist: Record<string, number> = {};
  let smallest = 999;
  const below11: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? "").trim();
    const el = n.parentElement;
    if (!t || !el) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none") continue;
    const px = parseFloat(s.fontSize);
    hist[px + "px"] = (hist[px + "px"] ?? 0) + t.length;
    smallest = Math.min(smallest, px);
    if (px < 11 && below11.length < 8) below11.push(`${px}px "${t.slice(0, 30)}"`);
  }
  const inputs = Array.from(document.querySelectorAll("input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea")).filter((e) => (e as HTMLElement).offsetParent !== null);
  const under16 = inputs.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length;
  const shell = document.querySelector('[data-testid="app-content"]') as HTMLElement | null;
  const scroller = (shell?.closest(".overflow-y-auto") as HTMLElement | null) ?? document.documentElement;
  return {
    hist,
    smallest,
    below11,
    inputs: inputs.length,
    inputsUnder16: under16,
    sidewaysScroll: Math.max(document.documentElement.scrollWidth - window.innerWidth, scroller.scrollWidth - scroller.clientWidth),
    pageHeight: scroller.scrollHeight,
    viewHeight: scroller.clientHeight,
  };
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const result: Record<string, unknown> = {};
  for (const [w, h] of [[360, 800], [390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const key = `${w}x${h}`;
    const out: Record<string, unknown> = {};

    let page = await ctx.newPage();
    await prepare(page, "/app/watchlist");
    await page.screenshot({ path: path.join(OUT, `${key}-watchlist.png`) });
    out.watchlist = await page.evaluate(stats);

    // the row sheet, GTT form open: how far its own scroll box scrolls
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-gtt").click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `${key}-row-sheet-gtt.png`) });
    out.rowSheet = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="symbol-sheet"] .overflow-y-auto') as HTMLElement;
      const panel = box.parentElement as HTMLElement;
      return { scrollHeight: box.scrollHeight, clientHeight: box.clientHeight, scrollsBy: box.scrollHeight - box.clientHeight, panelHeight: panel.getBoundingClientRect().height, viewport: window.innerHeight };
    });
    out.rowSheetStats = await page.evaluate(stats);
    await page.close();

    for (const [name, p] of [["portfolio", "/app/portfolio"], ["fno", "/app/fno"]] as const) {
      page = await ctx.newPage();
      await prepare(page, p);
      if (name === "fno") await page.waitForSelector("#fno-und", { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `${key}-${name}.png`) });
      out[name] = await page.evaluate(stats);
      await page.close();
    }
    result[key] = out;
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "numbers.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
