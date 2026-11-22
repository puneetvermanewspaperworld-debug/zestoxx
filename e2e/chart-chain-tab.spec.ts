import { test, expect, type Page } from "@playwright/test";
import { simulateChain } from "../lib/options";
import { mockMarket, openTrade } from "./chart-helpers";

/**
 * The index chart screen's own Option Chain tab is the same chain as the Options screen (centre columns pinned, the spot row, the controls and the
 * Summary and Levels lines), with the contract sheet from a tap: not the old table.
 */
const EXPIRIES = ["2026-11-12", "2026-11-19"];
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function openChain(page: Page) {
  await page.route("**/api/options-chain**", (r) => {
    const e = new URL(r.request().url()).searchParams.get("expiry") ?? EXPIRIES[0];
    return r.fulfill({ json: { ...simulateChain("NIFTY50", 25250, e, new Date("2026-11-11T08:20:00Z")), source: "live", expiry: e, expiries: EXPIRIES } });
  });
  await page.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await openTrade(page, "NIFTY50");
  await page.getByTestId("tab-chain").click();
  await expect(page.getByTestId("chain-spot-row")).toBeVisible({ timeout: 15_000 });
}

test.describe("on a phone", () => {
  test.use(phone);

  test("the tab shows the new chain, not the old table", async ({ page }) => {
    await openChain(page);
    const tab = page.getByTestId("chain-tab");
    await expect(tab.getByTestId("chain-view")).toBeVisible();
    await expect(tab.locator("table")).toHaveCount(0);
    await expect(tab.getByTestId("chain-scroll")).toBeVisible();
    for (const id of ["chain-view-oi", "chain-columns", "chain-change", "chain-spot-jump", "chain-summary-toggle", "chain-levels-toggle"]) await expect(tab.getByTestId(id)).toBeVisible();
    await expect(tab.getByText(/2nd highest/i)).toHaveCount(0); // the six stat cards are gone
    // the pinned centre: Call LTP, Strike and Put LTP in the middle of the screen
    const s = (await page.getByTestId("chain-strike-25250").boundingBox())!;
    expect(Math.abs(s.x + s.width / 2 - 195)).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("it opens with the spot row in the middle, and has an expiry dropdown that lists real expiries with days left", async ({ page }) => {
    await openChain(page);
    const sb = (await page.getByTestId("chain-scroll").boundingBox())!;
    const sp = (await page.getByTestId("chain-spot-row").boundingBox())!;
    expect(Math.abs(sp.y + sp.height / 2 - (sb.y + 32 + (sb.height - 32) / 2))).toBeLessThan(20);
    const sel = page.getByTestId("chain-expiry-select");
    expect(await sel.locator("option").allTextContents()).toEqual(["12 Nov · 1d", "19 Nov · 8d"]);
    await expect(sel).toHaveValue(EXPIRIES[0]);
    await sel.selectOption(EXPIRIES[1]);
    await expect(sel).toHaveValue(EXPIRIES[1]);
    await expect(page.getByTestId("chain-spot-row")).toBeVisible();
  });

  test("a tap on a cell opens the contract sheet, and Buy from it opens the order screen for that strike and expiry", async ({ page }) => {
    await openChain(page);
    await page.getByTestId("chain-ce-25300").click();
    await expect(page.getByTestId("contract-sheet")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "NIFTY 12 NOV 25300 CE" })).toBeVisible();
    await expect(page.getByTestId("option-sheet")).toHaveCount(0); // not the old order sheet
    await page.getByTestId("contract-buy").click();
    await expect(page).toHaveURL(new RegExp(`act=option&u=NIFTY50&x=${EXPIRIES[0]}&k=25300&t=CE&side=buy`));
    await expect(page.getByTestId("contract-strike")).toHaveText("25300");
    await page.getByTestId("action-back").click();
    await expect(page.getByTestId("contract-sheet")).toBeVisible(); // still open underneath
    await page.getByTestId("sheet-close").click();
    await page.getByTestId("tab-chart").click();
    await expect(page.getByTestId("trade-chart")).toBeVisible();
  });
});

test("a wide screen does not get the phone chain screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockMarket(page);
  await page.goto("/app/options");
  await expect(page.getByTestId("phone-options")).toHaveCount(0);
});
