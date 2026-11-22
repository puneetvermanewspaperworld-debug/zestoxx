import { test, expect } from "@playwright/test";
import { account, lastPut, openApp, openSheet, phone, screen, tick, typeKeepingFocus } from "./action-helpers";

/** Buy and Sell as a full screen over the page, named by the address, closed by the back arrow or the browser's back button. */
test.use(phone());

test.describe("opening and closing", () => {
  test("Buy opens a full screen for the symbol with the paper badge and the price strip; the inline order card is gone", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await expect(screen(page)).toBeVisible();
    await expect(page).toHaveURL(/act=order&s=RELIANCE&side=buy/);
    await expect(page.getByTestId("action-symbol")).toHaveText("RELIANCE");
    await expect(page.getByTestId("action-label")).toHaveText("Buy");
    await expect(page.getByTestId("paper-badge")).toHaveText("Paper trade");
    await expect(page.getByTestId("strip-exchange")).toHaveText("NSE");
    await expect(page.getByTestId("strip-price")).toHaveText("₹1,500");
    await expect(page.getByTestId("strip-pct")).toHaveText("+0.67%"); // (1500 - 1490) / 1490
    await expect(page.getByTestId("action-submit")).toHaveText("Buy RELIANCE · 1");
    // the old inline card and its line of text are not in the sheet any more
    await page.getByTestId("action-back").click();
    await expect(page.getByTestId("sheet-order-panel")).toHaveCount(0);
    await expect(page.getByText(/Opened for a paper/)).toHaveCount(0);
  });

  test("the back arrow closes it, and the sheet underneath is still open", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-sell").click();
    await expect(screen(page)).toBeVisible();
    await page.getByTestId("action-back").click();
    await expect(screen(page)).toHaveCount(0);
    await expect(page.getByTestId("symbol-sheet")).toBeVisible();
    await expect(page).not.toHaveURL(/act=/);
  });

  test("the browser's back button closes it too, with no reload: the open list tab and sheet are kept", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ lists: [{ name: "Z", symbols: ["RELIANCE"] }] }));
    await page.getByTestId("wl-tab-Z").click();
    await openSheet(page, "RELIANCE");
    await page.evaluate(() => ((window as unknown as { __kept: string }).__kept = "yes")); // gone if the page reloaded
    await page.getByTestId("sheet-buy").click();
    await expect(screen(page)).toBeVisible();
    await page.goBack();
    await expect(screen(page)).toHaveCount(0);
    await expect(page.getByTestId("symbol-sheet")).toBeVisible();
    await expect(page.getByTestId("wl-tab-Z")).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => (window as unknown as { __kept?: string }).__kept)).toBe("yes");
  });

  test("a reload on the screen brings it back, and an address that names nothing real opens nothing", async ({ page }) => {
    await openApp(page, "/app/watchlist?act=order&s=RELIANCE&side=sell&q=3");
    await expect(screen(page)).toBeVisible();
    await expect(page.getByTestId("order-qty")).toHaveValue("3"); // prefilled
    await expect(page.getByTestId("action-label")).toHaveText("Sell");
    await page.goto("/app/watchlist?act=order&s=IDX%20NIFTY%20PVT%20BANK&side=buy", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    await page.waitForTimeout(800);
    await expect(screen(page)).toHaveCount(0);
  });

  test("Escape closes it", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await expect(screen(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(screen(page)).toHaveCount(0);
  });
});

test.describe("typing", () => {
  test("a multi-digit quantity and a limit price go in with the field keeping focus, one character at a time", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ cash: 100_000_000 }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    expect(await typeKeepingFocus(page, page.getByTestId("order-qty"), "300")).toBe("300");
    await page.getByTestId("mode-limit").click();
    expect(await typeKeepingFocus(page, page.getByTestId("order-limit"), "1450.5")).toBe("1450.5");
    await expect(page.getByTestId("order-qty")).toHaveValue("300"); // the first field was not reset
    await expect(page.getByTestId("action-submit")).toHaveText("Buy RELIANCE · 300");
    await expect(page.getByTestId("funds-required")).toHaveText("₹4,35,150"); // 300 x 1450.50 (a rupee amount to the paisa: .00 is not shown)
  });
});

test.describe("the result", () => {
  test("a market buy fills at the live price: the result, the new cash, then the order in Orders and the shares in Portfolio", async ({ page }) => {
    const { puts } = await openApp(page, "/app/watchlist", account({ cash: 100_000 }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await page.getByTestId("order-qty").fill("2");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("result-status")).toHaveText("Order filled");
    await expect(page.getByTestId("result-line")).toContainText("Bought 2 RELIANCE at ₹1,500 (₹3,000)");
    await expect(page.getByTestId("result-cash")).toContainText("₹97,000");
    await expect.poll(() => lastPut(puts)?.cash).toBe(97_000);
    await page.getByTestId("result-orders").click();
    await expect(page).toHaveURL(/\/app\/orders\?tab=executed/);
    await expect(screen(page)).toHaveCount(0);
    await expect(page.locator('[data-testid^="log-order-"]').first()).toContainText("BUY 2 RELIANCE");
    await page.getByTestId("nav-portfolio").click();
    await page.getByTestId("pf-tab-positions").click(); // bought today: a Position until it settles
    await expect(page.getByTestId("pf-row-RELIANCE")).toContainText("2 @ ₹1,500");
  });

  test("it can go to Portfolio from the result, and back from there returns to the page the screen was opened over", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ cash: 100_000 }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await page.getByTestId("action-submit").click();
    await page.getByTestId("result-portfolio").click();
    await expect(page).toHaveURL(/\/app\/portfolio\?tab=positions$/);
    await expect(page.getByTestId("pf-row-RELIANCE")).toBeVisible(); // it opens on the tab where the new shares are
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/watchlist$/);
  });

  test("a limit order rests: pending, with its price and validity, and it is in Open orders", async ({ page }) => {
    const { puts } = await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await page.getByTestId("order-qty").fill("5");
    await page.getByTestId("mode-limit").click();
    await page.getByTestId("order-limit").fill("1400");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("result-status")).toContainText("waiting for its price");
    await expect(page.getByTestId("result-line")).toContainText("Limit buy 5 RELIANCE at ₹1,400");
    await expect(page.getByTestId("result-validity")).toContainText("Valid today");
    await expect.poll(() => (lastPut(puts)?.openOrders ?? []).length).toBe(1);
    expect(lastPut(puts)?.openOrders?.[0]).toMatchObject({ orderType: "LIMIT", qty: 5, limitPrice: 1400, side: "buy" });
    await page.getByTestId("result-orders").click();
    await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(1);
  });

  test("a limit order valid until a date is a GTD order", async ({ page }) => {
    const { puts } = await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await page.getByTestId("mode-limit").click();
    await page.getByTestId("order-limit").fill("1400");
    await page.getByTestId("validity-date").click();
    await page.getByTestId("order-expiry").fill("2026-11-20");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("result-line")).toContainText("GTD buy 1 RELIANCE");
    await expect(page.getByTestId("result-validity")).toContainText("Valid until");
    await expect.poll(() => lastPut(puts)?.openOrders?.[0]).toMatchObject({ orderType: "GTD", expiryDate: "2026-11-20" });
  });

  test("Done closes the screen and the sheet is still there", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await page.getByTestId("action-submit").click();
    await page.getByTestId("action-done").click();
    await expect(screen(page)).toHaveCount(0);
    await expect(page.getByTestId("symbol-sheet")).toBeVisible();
  });
});

test.describe("refusals", () => {
  test("empty, zero and fractional quantities, an empty limit price and a date out of range are refused with a message", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    const err = page.getByTestId("order-error");
    for (const q of ["", "0", "1.5", "abc"]) {
      await page.getByTestId("order-qty").fill(q);
      await page.getByTestId("action-submit").click();
      await expect(err, `quantity "${q}"`).toHaveText("Enter a whole quantity of 1 or more.");
    }
    await page.getByTestId("order-qty").fill("1");
    await page.getByTestId("mode-limit").click();
    await page.getByTestId("order-limit").fill("");
    await page.getByTestId("action-submit").click();
    await expect(err).toHaveText("Enter a limit price above 0.");
    await page.getByTestId("order-limit").fill("1400");
    await page.getByTestId("validity-date").click();
    await page.getByTestId("order-expiry").fill("2031-01-01");
    await page.getByTestId("action-submit").click();
    await expect(err).toContainText("Pick an expiry date between");
    await expect(page.getByTestId("result-status")).toHaveCount(0); // nothing was placed
  });

  test("not enough cash: the funds line turns red and pressing says how much it needs and what there is", async ({ page }) => {
    const { puts } = await openApp(page, "/app/watchlist", account({ cash: 1000 }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await expect(page.getByTestId("funds-required")).toHaveText("₹1,500");
    await expect(page.getByTestId("funds-available")).toHaveText("₹1,000");
    await expect(page.getByTestId("funds-short")).toHaveText("Not enough virtual cash for this order.");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("order-error")).toHaveText("Not enough virtual cash: this needs ₹1,500 and you have ₹1,000.");
    await page.waitForTimeout(1200);
    expect(lastPut(puts)?.cash ?? 1000).toBe(1000);
    expect(lastPut(puts)?.openOrders ?? []).toEqual([]);
  });

  test("selling what is not held: the hold line says 0 and pressing refuses", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-sell").click();
    await expect(page.getByTestId("funds-available")).toHaveText("0");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("order-error")).toHaveText("You only hold 0 unit(s) of RELIANCE.");
  });

  test("a resting limit buy is checked at its limit price, as in the engine: refused when the limit's cost is over the cash", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ cash: 1000 }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await page.getByTestId("order-qty").fill("10");
    await page.getByTestId("mode-limit").click();
    await page.getByTestId("order-limit").fill("1400");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("order-error")).toHaveText("Not enough virtual cash: this needs ₹14,000 and you have ₹1,000.");
  });
});

test.describe("the market and the price", () => {
  test("when the market is closed it says a market order fills at the last price", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await expect(page.getByTestId("order-market-closed")).toHaveCount(0); // the test clock is a Wednesday afternoon
    await page.clock.setSystemTime(new Date("2026-11-14T10:00:00+05:30")); // a Saturday
    await page.clock.runFor(31_000);
    await expect(page.getByTestId("order-market-closed")).toContainText("fills at the last price");
  });

  test("a sell shows what you hold and what you would receive", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } } }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-sell").click();
    await page.getByTestId("order-qty").fill("4");
    await expect(page.getByTestId("funds-available")).toHaveText("10");
    await expect(page.getByTestId("order-funds")).toContainText("₹6,000");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("result-line")).toContainText("Sold 4 RELIANCE at ₹1,500 (₹6,000)");
  });

  test("a resting order from this screen fills later at its limit price while the app is open, and is cancelled with a reason if the account cannot do it", async ({ page }) => {
    const { puts, px } = await openApp(page, "/app/watchlist", account({ cash: 10_000 }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-buy").click();
    await page.getByTestId("order-qty").fill("5");
    await page.getByTestId("mode-limit").click();
    await page.getByTestId("order-limit").fill("1450");
    await page.getByTestId("action-submit").click();
    await page.getByTestId("action-done").click();
    // spend the cash elsewhere first: a market buy of 4 (6,000), so the 7,250 limit buy can no longer be covered
    await page.getByTestId("sheet-buy").click();
    await page.getByTestId("order-qty").fill("4");
    await page.getByTestId("action-submit").click();
    await page.getByTestId("action-done").click();
    px.RELIANCE = 1440;
    const seen = page.getByText(/was cancelled when it triggered: not enough virtual cash/).waitFor({ timeout: 30_000 });
    await tick(page);
    await seen;
    await expect.poll(() => lastPut(puts)?.cash, { timeout: 15_000 }).toBe(4_000);
  });
});
