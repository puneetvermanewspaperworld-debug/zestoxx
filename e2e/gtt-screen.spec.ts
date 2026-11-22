import { test, expect } from "@playwright/test";
import { account, lastPut, openApp, openSheet, phone, screen, typeKeepingFocus } from "./action-helpers";

/** Create GTT, Edit GTT and Delete GTT as one full screen. */
test.use(phone());

// placed a few seconds before the test clock starts, so the next-visit check leaves it alone
const placedAtMs = Date.parse("2026-11-11T13:49:45+05:30");
const gtt = (o: Record<string, unknown> = {}) => ({ symbol: "RELIANCE", side: "sell", qty: 5, limitPrice: 1450, time: "10:00:00 am", orderType: "GTT", placedDate: "2026-11-11", trigger: "below", placedAtMs, ...o });
const held = { RELIANCE: { qty: 10, avgPrice: 1400 } };

test.describe("create", () => {
  test("Create GTT opens a screen with the shell, a live LTP hint, the limit price equal to the trigger, and an honest note", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ holdings: held }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-gtt").click();
    await expect(page).toHaveURL(/act=gtt&s=RELIANCE/);
    await expect(page.getByTestId("action-label")).toHaveText("Create GTT");
    await expect(page.getByTestId("paper-badge")).toBeVisible();
    await expect(page.getByTestId("strip-price")).toHaveText("₹1,500");
    await page.getByTestId("gtt-trigger").fill("1350");
    await expect(page.getByTestId("gtt-away")).toHaveText("10.00% below LTP · Stop-loss");
    await expect(page.getByTestId("gtt-limit")).toHaveText("₹1,350"); // the engine fills at the trigger
    await page.getByTestId("gtt-trigger").fill("1650");
    await expect(page.getByTestId("gtt-away")).toHaveText("10.00% above LTP · Target");
    const note = await page.getByTestId("gtt-note").innerText();
    for (const part of ["simulated", "not guaranteed", "first candle that crossed", "marked simulated"]) expect(note).toContain(part);
    // nothing the engine does not have
    for (const word of ["OCO", "Product", "CNC", "MIS"]) await expect(screen(page).getByText(word, { exact: false })).toHaveCount(0);
    await expect(page.getByTestId("gtt-delete")).toHaveCount(0); // a new GTT has nothing to delete
  });

  test("a trigger and a quantity go in one character at a time with the field keeping focus", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ holdings: { RELIANCE: { qty: 1000, avgPrice: 1400 } } }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-gtt").click();
    expect(await typeKeepingFocus(page, page.getByTestId("gtt-trigger"), "1450")).toBe("1450");
    expect(await typeKeepingFocus(page, page.getByTestId("gtt-qty"), "300")).toBe("300");
    expect(await page.getByTestId("gtt-trigger").inputValue()).toBe("1450");
    await expect(page.getByTestId("action-submit")).toHaveText("Create GTT · RELIANCE · 300");
  });

  test("a stop-loss is created, saved with its trigger direction and placed time, and listed under GTT", async ({ page }) => {
    const { puts } = await openApp(page, "/app/watchlist", account({ holdings: held }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-gtt").click();
    await page.getByTestId("gtt-trigger").fill("1450");
    await page.getByTestId("gtt-qty").fill("5");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("result-status")).toHaveText("GTT created");
    await expect(page.getByTestId("result-line")).toContainText("Stop-loss: sell 5 RELIANCE when the price reaches ₹1,450");
    await expect.poll(() => lastPut(puts)?.openOrders?.[0]).toMatchObject({ orderType: "GTT", trigger: "below", limitPrice: 1450, qty: 5, side: "sell" });
    expect(typeof lastPut(puts)?.openOrders?.[0].placedAtMs).toBe("number");
    await page.getByTestId("result-gtt-list").click();
    await expect(page).toHaveURL(/\/app\/orders\?tab=gtt$/);
    await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(1);
  });

  test("empty, zero and fractional values, a trigger at the price, too many shares and too little cash are refused with a message", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ cash: 1000, holdings: held }));
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-gtt").click();
    const err = page.getByTestId("gtt-error");
    const submit = page.getByTestId("action-submit");
    await submit.click();
    await expect(err).toHaveText("Enter a trigger price above 0.");
    await page.getByTestId("gtt-trigger").fill("0");
    await submit.click();
    await expect(err).toHaveText("Enter a trigger price above 0.");
    await page.getByTestId("gtt-trigger").fill("1450");
    for (const q of ["", "0", "2.5"]) {
      await page.getByTestId("gtt-qty").fill(q);
      await submit.click();
      await expect(err, `quantity "${q}"`).toHaveText("Enter a whole quantity of 1 or more.");
    }
    await page.getByTestId("gtt-qty").fill("1");
    await page.getByTestId("gtt-trigger").fill("1500");
    await submit.click();
    await expect(err).toContainText("too close");
    await page.getByTestId("gtt-trigger").fill("1450");
    await page.getByTestId("gtt-qty").fill("11");
    await submit.click();
    await expect(err).toContainText("hold 10");
    await page.getByTestId("side-buy").click();
    await page.getByTestId("gtt-trigger").fill("1600");
    await page.getByTestId("gtt-qty").fill("5");
    await expect(page.getByTestId("funds-required")).toHaveText("₹8,000");
    await submit.click();
    await expect(err).toContainText("Not enough virtual cash");
  });

  test("with no live price it says so and places nothing", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ lists: [{ name: "Z", symbols: ["SLEEPY"] }] }), async (p) => {
      await p.route("**/api/quotes**", (r) => r.fulfill({ json: { source: "live", quotes: { SLEEPY: { state: "none", prevClose: 88, name: "Sleepy" } } } }));
    });
    await page.goto("/app/watchlist?act=gtt&s=SLEEPY", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    await expect(page.getByTestId("gtt-no-price")).toContainText("No recent trades");
    await expect(page.getByTestId("strip-price")).toHaveText("No recent trades");
    await page.getByTestId("gtt-trigger").fill("90");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("gtt-error")).toContainText("no live price");
  });
});

test.describe("edit and delete", () => {
  async function ordersGtt(page: import("@playwright/test").Page) {
    await page.getByTestId("nav-orders").click();
    await page.getByTestId("orders-tab-gtt").click();
  }

  test("Edit GTT opens the same screen filled in, says the placed time resets, and saving replaces it: one GTT with the new trigger, the old one in the history as cancelled", async ({ page }) => {
    const { puts } = await openApp(page, "/app/watchlist", account({ holdings: held, openOrders: [gtt()] }));
    await ordersGtt(page);
    await page.locator('[data-testid^="edit-order-"]').click();
    await expect(page).toHaveURL(/act=gtt&s=RELIANCE&e=/);
    await expect(page.getByTestId("action-label")).toHaveText("Edit GTT");
    await expect(page.getByTestId("gtt-trigger")).toHaveValue("1450");
    await expect(page.getByTestId("gtt-qty")).toHaveValue("5");
    await expect(page.getByTestId("gtt-edit-note")).toContainText("the time it was placed resets");
    await page.getByTestId("gtt-trigger").fill("1400");
    await expect(page.getByTestId("action-submit")).toHaveText("Save GTT · RELIANCE · 5");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("result-status")).toHaveText("GTT saved (the old one was cancelled)");
    await expect.poll(() => (lastPut(puts)?.openOrders ?? []).filter((o) => o.orderType === "GTT").map((o) => o.limitPrice)).toEqual([1400]);
    expect(lastPut(puts)?.openOrders?.[0].placedAtMs as number).toBeGreaterThan(placedAtMs); // the clock restarted
    await page.getByTestId("result-gtt-list").click();
    await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(1);
    await page.getByTestId("orders-tab-executed").click();
    await expect(page.locator('[data-testid^="log-order-"]').first()).toContainText("Cancelled");
  });

  test("Delete this GTT asks first, and then the GTT list is empty", async ({ page }) => {
    const { puts } = await openApp(page, "/app/watchlist", account({ holdings: held, openOrders: [gtt()] }));
    await ordersGtt(page);
    await page.locator('[data-testid^="edit-order-"]').click();
    await page.getByTestId("gtt-delete").click();
    await expect(page.getByTestId("gtt-delete-confirm")).toBeVisible();
    await expect(page.getByTestId("result-status")).toHaveCount(0); // not yet
    await page.getByTestId("gtt-delete-confirm").click();
    await expect(page.getByTestId("result-status")).toHaveText("GTT deleted");
    await expect.poll(() => (lastPut(puts)?.openOrders ?? []).length).toBe(0);
    await page.getByTestId("result-gtt-list").click();
    await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(0);
  });

  test("keeping it instead of deleting changes nothing", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ holdings: held, openOrders: [gtt()] }));
    await ordersGtt(page);
    await page.locator('[data-testid^="edit-order-"]').click();
    await page.getByTestId("gtt-delete").click();
    await page.getByRole("button", { name: "Keep it" }).click();
    await expect(page.getByTestId("gtt-delete")).toBeVisible();
    await page.getByTestId("action-back").click();
    await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(1);
  });

  test("an edit address for a GTT that is not open (a reload gives new references) says so", async ({ page }) => {
    await openApp(page, "/app/orders?act=gtt&s=RELIANCE&e=12345", account({ holdings: held, openOrders: [gtt()] }));
    await expect(page.getByTestId("gtt-missing")).toContainText("no longer open");
  });

  test("the browser's back button from an edit returns to the GTT list, still on its tab", async ({ page }) => {
    await openApp(page, "/app/watchlist", account({ holdings: held, openOrders: [gtt()] }));
    await ordersGtt(page);
    await page.locator('[data-testid^="edit-order-"]').click();
    await expect(screen(page)).toBeVisible();
    await page.goBack();
    await expect(screen(page)).toHaveCount(0);
    await expect(page.getByTestId("orders-tab-gtt")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(1);
  });
});
