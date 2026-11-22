import { test, expect, type Page } from "@playwright/test";
import { mockMarket } from "./chart-helpers";

/**
 * Every order goes through one funds check: a buy needs the cash, a sell needs the shares. A resting limit or GTD order is checked when it is
 * placed (at its limit price) and again when it fills, and is cancelled with the reason if the account cannot do it by then.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const base = { watchlist: ["RELIANCE", "TCS"], holdings: {}, orderLog: [], alerts: [] };
const limit = (side: "buy" | "sell", qty: number, limitPrice: number) => ({ symbol: "RELIANCE", side, qty, limitPrice, time: "10:00:00 am", orderType: "LIMIT", placedDate: "2026-11-11" });

async function open(page: Page, portfolio: Record<string, unknown>) {
  await mockMarket(page);
  const puts: Record<string, unknown>[] = [];
  const px = { RELIANCE: 1500 };
  await page.route("**/api/portfolio", (r) => {
    if (r.request().method() === "PUT") {
      puts.push(JSON.parse(r.request().postData() ?? "{}"));
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: portfolio });
  });
  await page.route("**/api/market-data?asset=equity", (r) => r.fulfill({ json: { RELIANCE: { price: px.RELIANCE, prevClose: 1490 }, TCS: { price: 4200, prevClose: 4100 }, NIFTY50: { price: 25250, prevClose: 25200 } } }));
  await page.route("**/api/symbol-detail**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/quotes**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/watchlist?symbols=**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.goto("/app/watchlist", { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-content").waitFor();
  const x = page.getByTestId("guest-notice-dismiss");
  if (await x.count()) await x.click();
  await page.waitForTimeout(1000);
  return { puts, px };
}
const lastPut = (puts: Record<string, unknown>[]) => puts[puts.length - 1] as { cash?: number; holdings?: Record<string, { qty: number }>; openOrders?: unknown[] } | undefined;

async function orderPanel(page: Page, side: "buy" | "sell") {
  await page.getByTestId("wl-open-RELIANCE").click();
  await page.getByTestId(side === "buy" ? "sheet-buy" : "sheet-sell").click();
  return page.getByTestId("sheet-order-panel");
}
async function place(panel: ReturnType<Page["getByTestId"]>, kind: "Market" | "Limit" | "GTD", qty: string, price: string | null, side: "buy" | "sell") {
  await panel.getByRole("button", { name: kind, exact: true }).click();
  const spin = panel.getByRole("spinbutton");
  await spin.first().fill(qty);
  if (price !== null) await spin.nth(1).fill(price);
  await panel.getByRole("button", { name: side === "buy" ? "Paper buy" : "Paper sell", exact: true }).click();
}

test.describe("when it is placed", () => {
  test("a resting limit buy that the cash cannot cover is refused at its limit price, and nothing is saved", async ({ page }) => {
    const { puts } = await open(page, { ...base, cash: 1000 });
    const panel = await orderPanel(page, "buy");
    await place(panel, "Limit", "10", "1400", "buy");
    await expect(panel).toContainText("Not enough virtual cash: this needs ₹14,000 and you have ₹1,000");
    await page.waitForTimeout(1200);
    expect(lastPut(puts)?.openOrders ?? []).toEqual([]);
  });

  test("it is checked at the limit price, not the market price: a limit under the cash is accepted even when the market price is over it", async ({ page }) => {
    const { puts } = await open(page, { ...base, cash: 1000 });
    const panel = await orderPanel(page, "buy");
    await place(panel, "Limit", "1", "900", "buy"); // 900 fits in 1,000; the market price (1,500) would not
    await expect(panel).toContainText("Limit buy order placed");
    await expect.poll(() => (lastPut(puts)?.openOrders ?? []).length).toBe(1);
  });

  test("a resting limit sell with nothing held is refused", async ({ page }) => {
    const { puts } = await open(page, { ...base, cash: 1_000_000 });
    const panel = await orderPanel(page, "sell");
    await place(panel, "Limit", "1", "1600", "sell");
    await expect(panel).toContainText("You only hold 0 unit(s) of RELIANCE.");
    await page.waitForTimeout(1200);
    expect(lastPut(puts)?.openOrders ?? []).toEqual([]);
  });

  test("a GTD buy is checked the same way", async ({ page }) => {
    await open(page, { ...base, cash: 1000 });
    const panel = await orderPanel(page, "buy");
    await place(panel, "GTD", "10", "1400", "buy");
    await expect(panel).toContainText("Not enough virtual cash");
  });

  test("a market sell above the holding is refused, and the holding is untouched", async ({ page }) => {
    const { puts } = await open(page, { ...base, cash: 1000, holdings: { RELIANCE: { qty: 3, avgPrice: 1400 } } });
    const panel = await orderPanel(page, "sell");
    await place(panel, "Market", "4", null, "sell");
    await expect(panel).toContainText("You only hold 3 unit(s) of RELIANCE.");
    await page.waitForTimeout(1200);
    expect(lastPut(puts)?.holdings?.RELIANCE?.qty ?? 3).toBe(3);
  });
});

test.describe("when it fills", () => {
  const tick = async (page: Page) => {
    await page.clock.runFor(30_000);
    await page.clock.runFor(5_000);
    await page.waitForTimeout(400);
  };
  /** the message shows for a few seconds, so start waiting for it before the clock runs */
  const messageSeen = (page: Page, text: RegExp) => page.getByText(text).waitFor({ timeout: 30_000 });
  const savedOrders = (puts: Record<string, unknown>[]) => (lastPut(puts)?.openOrders ?? []).length;

  test("a resting buy that is no longer affordable is cancelled with the reason, and the account is untouched", async ({ page }) => {
    const { puts, px } = await open(page, { ...base, cash: 1000, openOrders: [limit("buy", 10, 1450)] });
    px.RELIANCE = 1440; // crosses the limit
    const seen = messageSeen(page, /Limit \(day\) buy 10 RELIANCE was cancelled when it triggered: not enough virtual cash/);
    await tick(page);
    await seen;
    await page.getByTestId("nav-orders").click();
    await page.getByTestId("orders-tab-executed").click();
    await expect(page.locator('[data-testid^="log-order-"]').first()).toContainText("Cancelled");
    await expect.poll(() => savedOrders(puts), { timeout: 15_000 }).toBe(0); // the saved account no longer has it
    expect(lastPut(puts)?.cash).toBe(1000);
    expect(Object.keys(lastPut(puts)?.holdings ?? {})).toEqual([]);
  });

  test("a resting sell with no shares to sell is cancelled, and no cash appears from nowhere", async ({ page }) => {
    const { puts, px } = await open(page, { ...base, cash: 1000, openOrders: [limit("sell", 5, 1480)] });
    px.RELIANCE = 1520; // crosses the limit
    const seen = messageSeen(page, /was cancelled when it triggered: you no longer hold enough/);
    await tick(page);
    await seen;
    await expect.poll(() => savedOrders(puts), { timeout: 15_000 }).toBe(0);
    expect(lastPut(puts)?.cash).toBe(1000);
  });

  test("an order the account can still afford fills at its limit price", async ({ page }) => {
    const { puts, px } = await open(page, { ...base, cash: 100_000, openOrders: [limit("buy", 5, 1450)] });
    px.RELIANCE = 1440;
    await tick(page);
    await expect.poll(() => lastPut(puts)?.cash, { timeout: 15_000 }).toBe(100_000 - 5 * 1450);
    expect(lastPut(puts)?.holdings?.RELIANCE?.qty).toBe(5);
  });

  test("two resting orders that fire together cannot both spend the same cash: the first fills, the second is cancelled", async ({ page }) => {
    const { puts, px } = await open(page, { ...base, cash: 10_000, openOrders: [limit("buy", 5, 1450), limit("buy", 5, 1450)] });
    px.RELIANCE = 1440;
    const seen = messageSeen(page, /was cancelled when it triggered: not enough virtual cash/);
    await tick(page);
    await seen;
    await expect.poll(() => lastPut(puts)?.cash, { timeout: 15_000 }).toBe(10_000 - 5 * 1450);
    expect(lastPut(puts)?.holdings?.RELIANCE?.qty).toBe(5);
    await expect.poll(() => savedOrders(puts), { timeout: 15_000 }).toBe(0);
  });
});
