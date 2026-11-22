import { test, expect, type Page } from "@playwright/test";
import { simulateChain, type OptionChain } from "../lib/options";
import { account, openApp, phone } from "./action-helpers";

/**
 * Tapping a Call or Put cell of the phone's chain opens the contract's sheet first (name, premium and change, Buy, Sell, View chart, and what the chain and
 * the contract's quote really carry), like the row sheet in the watchlist. Buy and Sell from it open the option order screen for that strike and expiry.
 */
const EXPIRIES = ["2026-11-12", "2026-11-19"];
const chain = (): OptionChain => {
  const c = simulateChain("RELIANCE", 1500, EXPIRIES[0], new Date("2026-11-11T08:20:00Z"));
  // live-looking legs: each has the exchange's instrument key
  for (const r of c.rows) { r.call.key = `NSE_FO|C${r.strike}`; r.put.key = `NSE_FO|P${r.strike}`; }
  return { ...c, underlying: "RELIANCE", source: "live", expiry: EXPIRIES[0], expiries: EXPIRIES } as OptionChain;
};
const liveQuote = { source: "live", ltp: 18.35, change: 2.1, changePct: 12.92, open: 16.5, high: 19.4, low: 15.9, prevClose: 16.25, bids: [{ qty: 500, price: 18.3, orders: 3 }, { qty: 1000, price: 18.25, orders: 5 }], asks: [{ qty: 500, price: 18.4, orders: 2 }, { qty: 1500, price: 18.45, orders: 4 }], totalBuyQty: 40000, totalSellQty: 52000, volume: 123000, oi: 410000, avgPrice: 17.8, lowerCircuit: 0, upperCircuit: 0 };

async function open(page: Page, w: number, h: number, quote: unknown = { source: "unavailable" }, c: OptionChain | null = chain()) {
  await page.setViewportSize({ width: w, height: h });
  await openApp(page, "/app/options", account(), async (p) => {
    await p.route("**/api/options-chain**", (r) => r.fulfill({ json: c ?? { source: "unavailable" } }));
    await p.route("**/api/option-quote**", (r) => r.fulfill({ json: quote }));
    await p.route("**/api/option-candles**", (r) => r.fulfill({ json: { source: "live", candles: Array.from({ length: 30 }, (_, i) => ({ t: `2026-11-11T${String(9 + Math.floor(i / 12)).padStart(2, "0")}:${String((i % 12) * 5).padStart(2, "0")}:00+05:30`, o: 16 + i * 0.05, h: 16.5 + i * 0.05, l: 15.8 + i * 0.05, c: 16.2 + i * 0.07, v: 1000 })) } }));
  });
  await page.getByTestId("chain-spot-row").waitFor();
}
const sheet = (page: Page) => page.getByTestId("contract-sheet");
const screen = (page: Page) => page.getByTestId("action-screen");

for (const [w, h] of [[360, 800], [390, 844]] as const) {
  test.describe(`${w}x${h}`, () => {
    test.use(phone(w, h));

    test("a tap on a cell opens the contract sheet first, with the contract's name, premium and change; the order screen is not open yet", async ({ page }) => {
      await open(page, w, h, liveQuote);
      await page.getByTestId("chain-pe-1380").click();
      await expect(sheet(page)).toBeVisible();
      await expect(screen(page)).toHaveCount(0);
      await expect(page.getByRole("dialog", { name: "RELIANCE 12 NOV 1380 PE" })).toBeVisible();
      await expect(page.getByTestId("contract-sheet-name")).toHaveText("Put option");
      await expect(page.getByTestId("contract-sheet-price")).toHaveText("18.35");
      await expect(page.getByTestId("contract-sheet-change")).toHaveText("+2.10 (+12.92%)");
      // a cell of the Call side opens a Call
      await page.getByTestId("sheet-close").click();
      await expect(sheet(page)).toHaveCount(0);
      await page.locator('[data-col="oi"][data-k="1520"][data-t="CE"]').click();
      await expect(page.getByRole("dialog", { name: "RELIANCE 12 NOV 1520 CE" })).toBeVisible();
    });

    test("Buy and Sell open the option order screen for that strike and expiry; back returns to the sheet", async ({ page }) => {
      await open(page, w, h, liveQuote);
      await page.getByTestId("chain-pe-1380").click();
      await page.getByTestId("contract-buy").click();
      await expect(screen(page)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`act=option&u=RELIANCE&x=${EXPIRIES[0]}&k=1380&t=PE&side=buy`));
      await expect(page.getByTestId("contract-strike")).toHaveText("1380");
      await expect(page.getByTestId("contract-expiry")).toHaveText("12 Nov 2026");
      await expect(page.getByTestId("action-label")).toHaveText("Buy");
      await page.getByTestId("action-back").click();
      await expect(screen(page)).toHaveCount(0);
      await expect(sheet(page)).toBeVisible(); // the sheet underneath was never closed
      await page.getByTestId("contract-sell").click();
      await expect(page).toHaveURL(/k=1380&t=PE&side=sell/);
      await expect(page.getByTestId("action-label")).toHaveText("Sell");
    });

    test("View chart opens the contract's chart", async ({ page }) => {
      await open(page, w, h, liveQuote);
      await page.getByTestId("chain-ce-1500").click();
      await page.getByTestId("contract-chart").click();
      await expect(screen(page)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`act=ochart&u=RELIANCE&x=${EXPIRIES[0]}&k=1500&t=CE`));
      await expect(page.getByTestId("action-label")).toHaveText("Chart");
      await expect(page.getByTestId("action-symbol")).toHaveText("RELIANCE 12 NOV 1500 CE");
      await expect(page.getByTestId("contract-chart-plot").locator("svg")).toBeVisible(); // the intraday line
      await expect(page.getByTestId("strip-price")).toHaveText("₹18.35");
      await page.getByTestId("action-back").click();
      await expect(sheet(page)).toBeVisible();
    });

    test("only the real data is shown, as the chain and the quote carry it", async ({ page }) => {
      const c = chain();
      const leg = c.rows.find((r) => r.strike === 1380)!.put;
      await open(page, w, h, liveQuote, c);
      await page.getByTestId("chain-pe-1380").click();
      const data = page.getByTestId("contract-data");
      await expect(data).toBeVisible();
      await expect(page.getByTestId("contract-data-oi")).toHaveText(new RegExp(`^${(leg.oi / 1e5).toFixed(2)} L$|^${(leg.oi / 1e7).toFixed(2)} Cr$|^${(leg.oi / 1e3).toFixed(1)}k$`));
      await expect(page.getByTestId("contract-data-oichg")).toContainText("%");
      await expect(page.getByTestId("contract-data-volume")).toBeVisible();
      await expect(page.getByTestId("contract-data-iv")).toHaveText(`${leg.iv.toFixed(2)}%`);
      await expect(page.getByTestId("contract-data-delta")).toHaveText(leg.delta!.toFixed(2));
      for (const g of ["theta", "vega", "gamma"]) await expect(page.getByTestId(`contract-data-${g}`)).toBeVisible();
      await expect(page.getByTestId("contract-data-bid")).toHaveText("18.30"); // the live quote's best bid and ask
      await expect(page.getByTestId("contract-data-ask")).toHaveText("18.40");
      await expect(page.getByTestId("contract-data-lot")).toHaveText(String(c.lotSize));
      // the day's range and the depth, from the live quote
      await expect(page.getByTestId("contract-range-low")).toHaveText("Low 15.90");
      await expect(page.getByTestId("contract-range-high")).toHaveText("High 19.40");
      await expect(page.getByTestId("contract-depth-levels")).toContainText("18.25");
      await expect(page.getByTestId("contract-depth-levels")).toContainText("1500");
    });

    test("with no live quote: no range or depth is made up, and a missing value is left out", async ({ page }) => {
      const c = chain();
      for (const r of c.rows) for (const l of [r.call, r.put]) { delete l.delta; delete l.gamma; delete l.theta; delete l.vega; l.iv = 0; delete l.bid; delete l.ask; }
      await open(page, w, h, { source: "unavailable" }, c);
      await page.getByTestId("chain-pe-1380").click();
      await expect(page.getByTestId("contract-range-unavailable")).toBeVisible();
      await expect(page.getByTestId("contract-depth-levels")).toHaveCount(0);
      await expect(page.getByTestId("contract-depth")).toContainText(/depth/i);
      for (const id of ["iv", "delta", "theta", "vega", "gamma", "bid", "ask"]) await expect(page.getByTestId(`contract-data-${id}`)).toHaveCount(0);
      await expect(page.getByTestId("contract-data-oi")).toBeVisible();
      // Buy and Sell still work at the chain's premium
      await expect(page.getByTestId("contract-buy")).toBeEnabled();
    });

    test("a simulated chain says so on the sheet", async ({ page }) => {
      await open(page, w, h, { source: "unavailable" }, null);
      await page.getByTestId("chain-pe-1380").click();
      await expect(page.getByTestId("contract-simulated")).toContainText("simulated");
    });

    test("the actions are only what the engine supports for a contract: Buy, Sell and View chart; no alert, GTT or notes", async ({ page }) => {
      await open(page, w, h, liveQuote);
      await page.getByTestId("chain-pe-1380").click();
      const s = sheet(page);
      for (const name of [/Set alert/, /Create GTT/, /Add notes|Edit notes/]) await expect(s.getByRole("button", { name })).toHaveCount(0);
      for (const id of ["contract-buy", "contract-sell", "contract-chart"]) await expect(page.getByTestId(id)).toBeVisible();
    });

    test("it fits the screen: inside the viewport, no sideways scroll, every control 44px", async ({ page }) => {
      await open(page, w, h, liveQuote);
      await page.getByTestId("chain-pe-1380").click();
      const panel = (await sheet(page).locator("div.relative").first().boundingBox())!;
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(w + 0.5);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      for (const id of ["contract-buy", "contract-sell", "contract-chart", "sheet-close"]) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(43.5);
      // the backdrop closes it too
      await page.mouse.click(w / 2, 20);
      await expect(sheet(page)).toHaveCount(0);
    });
  });
}
