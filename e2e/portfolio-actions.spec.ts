import { test, expect } from "@playwright/test";
import { simulateChain } from "../lib/options";
import { makeContractId } from "../lib/contract";
import { account, lastPut, openApp, phone, screen } from "./action-helpers";

/** Exit and Add on the phone's Portfolio rows: each opens the Buy/Sell screen, filled in. */
test.use(phone());

const held = account({ holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } } });

test("Exit opens Sell with the whole holding filled in, and selling it empties the row", async ({ page }) => {
  const { puts } = await openApp(page, "/app/portfolio", held);
  await expect(page.getByTestId("pf-row-RELIANCE")).toBeVisible();
  await page.getByTestId("pf-exit-RELIANCE").click();
  await expect(screen(page)).toBeVisible();
  await expect(page).toHaveURL(/act=order&s=RELIANCE&side=sell&q=10/);
  await expect(page.getByTestId("action-label")).toHaveText("Sell");
  await expect(page.getByTestId("order-qty")).toHaveValue("10");
  await expect(page.getByTestId("action-submit")).toHaveText("Sell RELIANCE · 10");
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("result-status")).toHaveText("Order filled");
  await expect.poll(async () => { await page.clock.runFor(3000); return lastPut(puts)?.holdings?.RELIANCE; }).toBeUndefined();
  expect(lastPut(puts)?.holdings).toBeDefined(); // a save did go out, with it gone
  await page.getByTestId("action-done").click();
  await expect(page.getByTestId("pf-row-RELIANCE")).toHaveCount(0);
});

test("Add opens Buy for the same symbol, and closing it leaves the portfolio as it was", async ({ page }) => {
  await openApp(page, "/app/portfolio", held);
  await page.getByTestId("pf-add-RELIANCE").click();
  await expect(page).toHaveURL(/act=order&s=RELIANCE&side=buy/);
  await expect(page.getByTestId("action-label")).toHaveText("Buy");
  await expect(page.getByTestId("order-qty")).toHaveValue("1");
  await page.getByTestId("action-back").click();
  await expect(screen(page)).toHaveCount(0);
  await expect(page.getByTestId("phone-portfolio")).toBeVisible();
  await expect(page.getByTestId("pf-row-RELIANCE")).toBeVisible();
});

test("a part of what is held: Exit sells the whole of it, even when it is shown across Holdings and Positions", async ({ page }) => {
  // 10 settled shares plus 5 bought today: Exit on either row is the whole 15
  const blob = account({ holdings: { RELIANCE: { qty: 15, avgPrice: 1400 } }, orderLog: [{ id: "t1", symbol: "RELIANCE", side: "buy", qty: 5, price: 1450, mode: "market", time: "01:50:00 pm", orderType: "MARKET", status: "filled", date: "2026-11-11" }] });
  await openApp(page, "/app/portfolio", blob);
  await expect(page.getByTestId("pf-row-RELIANCE")).toContainText("10 @"); // the settled part is Holdings
  await page.getByTestId("pf-exit-RELIANCE").click();
  await expect(page).toHaveURL(/side=sell&q=15/);
  await page.getByTestId("action-back").click();
  await page.getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-row-RELIANCE")).toContainText("5 @"); // today's 5 are Positions
  await page.getByTestId("pf-exit-RELIANCE").click();
  await expect(page).toHaveURL(/side=sell&q=15/);
});

test("with nothing held the sell screen says so, and pressing Sell refuses", async ({ page }) => {
  await openApp(page, "/app/watchlist?act=order&s=TCS&side=sell");
  await expect(screen(page)).toBeVisible();
  await expect(page.getByTestId("sell-not-held")).toBeVisible();
  await expect(page.getByTestId("sell-not-held")).toContainText("You don't hold TCS");
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("order-error")).toHaveText("You only hold 0 unit(s) of TCS.");
});

test("an option contract: Exit opens the option screen on that contract, Sell, in lots", async ({ page }) => {
  const EXPIRY = "2026-11-26";
  const chain = { ...simulateChain("NIFTY50", 25250, EXPIRY, new Date("2026-11-11T08:20:00Z")), source: "live", expiry: EXPIRY, expiries: [EXPIRY] };
  const row = chain.rows.find((r) => r.strike === 25250)!;
  const id = makeContractId({ underlying: chain.underlying, expiry: EXPIRY, strike: 25250, type: "CE", key: row.call.key });
  const blob = account({ holdings: { [id]: { qty: chain.lotSize * 2, avgPrice: row.call.ltp } } });
  await openApp(page, "/app/portfolio?tab=positions", blob, async (p) => {
    await p.route("**/api/options-chain**", (r) => r.fulfill({ json: chain }));
    await p.route("**/api/option-expiries**", (r) => r.fulfill({ json: { source: "live", expiries: [EXPIRY], lot: chain.lotSize } }));
    await p.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
    await p.route("**/api/option-marks**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  });
  await page.getByTestId("pf-tab-positions").click();
  await page.getByTestId("pf-exit-NIFTY 26 NOV 25250 CE").click();
  await expect(page).toHaveURL(/act=option&u=NIFTY50&x=2026-11-26&k=25250&t=CE&side=sell/);
  await expect(page.getByTestId("action-label")).toHaveText("Sell");
  await expect(page.getByTestId("contract-strike")).toHaveText("25250");
  await expect(page.getByTestId("funds-available")).toHaveText(String(chain.lotSize * 2)); // what you hold
});

test("Exit and Add have a 44px hit area and fit a 360px screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openApp(page, "/app/portfolio", held);
  for (const id of ["pf-exit-RELIANCE", "pf-add-RELIANCE"]) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(43.5);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("the chart drawer's Trade tab says what is held, and its Sell opens the sell screen for the whole symbol", async ({ page }) => {
  await openApp(page, "/app/trade/RELIANCE", held);
  await page.getByTestId("drawer-toggle").click();
  await expect(page.getByTestId("drawer-held")).toContainText("You hold 10 of RELIANCE");
  await page.getByTestId("drawer-sell").click();
  await expect(page).toHaveURL(/act=order&s=RELIANCE&side=sell/);
  await expect(page.getByTestId("funds-available")).toHaveText("10");
});
