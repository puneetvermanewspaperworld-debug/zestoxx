import { test, expect, type Page } from "@playwright/test";
import { simulateChain } from "../lib/options";
import { makeContractId } from "../lib/contract";
import { account, lastPut, openApp, phone } from "./action-helpers";

/** Buying and selling an option contract as a full screen, in lots. */
test.use(phone());

const EXPIRY = "2026-11-26";
const chain = { ...simulateChain("NIFTY50", 25250, EXPIRY, new Date("2026-11-11T08:20:00Z")), source: "live", expiry: EXPIRY, expiries: [EXPIRY] };
const row = chain.rows.find((r) => r.strike === 25250)!;
const LOT = chain.lotSize;
const PREMIUM = row.call.ltp;
const callId = makeContractId({ underlying: chain.underlying, expiry: EXPIRY, strike: 25250, type: "CE", key: row.call.key });
const address = (side: "buy" | "sell", extra = "") => `/app/options?act=option&u=NIFTY50&x=${EXPIRY}&k=25250&t=CE&side=${side}${extra}`;

async function open(page: Page, path: string, blob = account()) {
  return openApp(page, path, blob, async (p) => {
    await p.route("**/api/options-chain**", (r) => r.fulfill({ json: chain }));
    await p.route("**/api/option-expiries**", (r) => r.fulfill({ json: { source: "live", expiries: [EXPIRY], lot: LOT } }));
    await p.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  });
}
const screen = (page: Page) => page.getByTestId("action-screen");

test("the contract is shown: strike, type, expiry, lot size, and the lots-to-quantity relation", async ({ page }) => {
  await open(page, address("buy"));
  await expect(screen(page)).toBeVisible();
  await expect(page.getByTestId("action-label")).toHaveText("Buy");
  await expect(page.getByTestId("action-symbol")).toContainText("25250 CE");
  await expect(page.getByTestId("paper-badge")).toBeVisible();
  await expect(page.getByTestId("strip-exchange")).toHaveText("NSE F&O");
  await expect(page.getByTestId("contract-strike")).toHaveText("25250");
  await expect(page.getByTestId("contract-expiry")).toHaveText("26 Nov 2026");
  await expect(page.getByTestId("contract-lot")).toHaveText(String(LOT));
  await expect(page.getByTestId("order-qty-units")).toHaveText(String(LOT)); // 1 lot
  await page.getByTestId("order-lots").fill("3");
  await expect(page.getByTestId("order-qty-units")).toHaveText(String(3 * LOT));
  await expect(page.getByText(`3 lots × ${LOT} per lot`)).toBeVisible();
  // only what the engine does: a market order, in lots; no limit price, product or validity
  for (const word of ["Limit", "Validity", "Product", "Trigger"]) await expect(screen(page).getByText(word, { exact: false })).toHaveCount(0);
  await expect(page.getByTestId("option-simulated")).toBeVisible(); // this test's chain has no live contract feed, and the screen says so
});

test("a buy fills in lots at the premium: the result, the cash, and the contract in Positions", async ({ page }) => {
  const { puts } = await open(page, address("buy"), account({ cash: 10_000_000 }));
  await page.getByTestId("order-lots").fill("2");
  const required = 2 * LOT * PREMIUM;
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("result-status")).toHaveText("Order filled");
  await expect(page.getByTestId("result-line")).toContainText(`Bought 2 lots (${2 * LOT})`);
  await expect.poll(() => lastPut(puts)?.cash).toBeCloseTo(10_000_000 - required, 1);
  expect(Object.keys(lastPut(puts)?.holdings ?? {})).toEqual([callId]);
  expect(lastPut(puts)?.holdings?.[callId].qty).toBe(2 * LOT);
  await page.getByTestId("result-portfolio").click();
  await expect(page).toHaveURL(/\/app\/portfolio\?tab=positions$/);
  await expect(page.getByTestId("pf-rows-positions")).toContainText("25250");
});

test("selling a contract that is not held is refused: there is no short selling", async ({ page }) => {
  await open(page, address("sell"));
  await expect(page.getByTestId("sell-not-held")).toBeVisible();
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("order-error")).toContainText("short selling isn't supported");
});

test("a contract that is held is sold in lots, and the holding comes down", async ({ page }) => {
  const { puts } = await open(page, address("sell"), account({ holdings: { [callId]: { qty: 2 * LOT, avgPrice: 50 } } }));
  await expect(page.getByTestId("funds-available")).toHaveText(String(2 * LOT));
  await page.getByTestId("order-lots").fill("1");
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("result-line")).toContainText(`Sold 1 lot (${LOT})`);
  await expect.poll(() => lastPut(puts)?.holdings?.[callId]?.qty).toBe(LOT);
});

test("empty, zero and fractional lots are refused; so is a buy the cash cannot cover", async ({ page }) => {
  await open(page, address("buy"), account({ cash: 100 }));
  const err = page.getByTestId("order-error");
  for (const v of ["", "0", "1.5", "x"]) {
    await page.getByTestId("order-lots").fill(v);
    await page.getByTestId("action-submit").click();
    await expect(err, `lots "${v}"`).toHaveText("Enter a whole number of lots, 1 or more.");
  }
  await page.getByTestId("order-lots").fill("1");
  await expect(page.getByTestId("funds-short")).toHaveText("Not enough virtual cash for this order.");
  await page.getByTestId("action-submit").click();
  await expect(err).toContainText("Not enough virtual cash: this needs");
  await expect(page.getByTestId("result-status")).toHaveCount(0);
});

test("a contract that is not in the chain says so", async ({ page }) => {
  await open(page, `/app/options?act=option&u=NIFTY50&x=${EXPIRY}&k=99999&t=CE&side=buy`);
  await expect(page.getByTestId("option-missing")).toContainText("not in the option chain");
});

test("from the contract sheet: Buy and Sell open the screen, back returns to the sheet", async ({ page }) => {
  await open(page, "/app/options");
  const cell = page.locator("table button").filter({ hasText: /\d/ }).first();
  await cell.waitFor({ timeout: 20_000 });
  await cell.click();
  await expect(page.getByTestId("option-sheet")).toBeVisible();
  await expect(page.getByTestId("option-buy")).toBeVisible();
  await page.getByTestId("option-buy").click();
  await expect(screen(page)).toBeVisible();
  await expect(page).toHaveURL(/act=option/);
  await page.getByTestId("action-back").click();
  await expect(screen(page)).toHaveCount(0);
  await expect(page.getByTestId("option-sheet")).toBeVisible(); // the sheet underneath was never closed
  await page.getByTestId("option-sell").click();
  await expect(page.getByTestId("action-label")).toHaveText("Sell");
});
