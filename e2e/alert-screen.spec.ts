import { test, expect } from "@playwright/test";
import { account, lastPut, openApp, openSheet, phone, recordAdded, sawAdded, screen, tick, typeKeepingFocus } from "./action-helpers";

/** Set, edit and delete a price alert as one full screen. */
test.use(phone());

const alertRow = (o: Record<string, unknown> = {}) => ({ id: "a1", symbol: "RELIANCE", condition: "above", target: 1600, createdAt: "10:00:00 am", ...o });

test.describe("set", () => {
  test("Set alert opens a screen with the live price, the choice of side, the distance to the target and an honest note", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-alert").click();
    await expect(page).toHaveURL(/act=alert&s=RELIANCE/);
    await expect(page.getByTestId("action-label")).toHaveText("Set alert");
    await expect(page.getByTestId("paper-badge")).toBeVisible();
    await expect(page.getByTestId("strip-price")).toHaveText("₹1,500.00");
    await page.getByTestId("alert-target").fill("1650");
    await expect(page.getByTestId("alert-away")).toHaveText("10.00% above the live price");
    await page.getByTestId("cond-below").click();
    await page.getByTestId("alert-target").fill("1350");
    await expect(page.getByTestId("alert-away")).toHaveText("10.00% below the live price");
    await expect(page.getByTestId("alert-note")).toContainText("fires once");
    await expect(page.getByTestId("alert-note")).toContainText("while Zestoxx is open");
    await expect(page.getByTestId("alert-delete")).toHaveCount(0);
    // only the two sides the engine has
    await expect(page.getByRole("radiogroup", { name: "Condition" }).getByRole("radio")).toHaveCount(2);
  });

  test("a multi-digit target goes in one character at a time with the field keeping focus", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-alert").click();
    expect(await typeKeepingFocus(page, page.getByTestId("alert-target"), "1625.5")).toBe("1625.5");
  });

  test("an alert is set, saved, listed under Orders, and fires once while the app is open", async ({ page }) => {
    const { puts, px } = await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-alert").click();
    await page.getByTestId("alert-target").fill("1600");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("result-status")).toHaveText("Alert set");
    await expect(page.getByTestId("result-line")).toHaveText("Alert me when RELIANCE goes above ₹1,600.00");
    await expect.poll(() => lastPut(puts)?.alerts?.[0]).toMatchObject({ symbol: "RELIANCE", condition: "above", target: 1600 });
    await page.getByTestId("result-alert-list").click();
    await expect(page).toHaveURL(/\/app\/orders\?tab=alerts$/);
    await expect(page.locator('[data-testid^="alert-row-"]')).toHaveCount(1);
    px.RELIANCE = 1610;
    await recordAdded(page);
    await tick(page);
    await sawAdded(page, /RELIANCE is now above ₹1,600/);
    await expect.poll(() => lastPut(puts)?.alerts, { timeout: 15_000 }).toEqual([]);
  });

  test("an empty or zero target, and a target the price has already passed, are refused with a message", async ({ page }) => {
    await openApp(page);
    await openSheet(page, "RELIANCE");
    await page.getByTestId("sheet-alert").click();
    const err = page.getByTestId("alert-error");
    await page.getByTestId("action-submit").click();
    await expect(err).toHaveText("Enter a target price above 0.");
    await page.getByTestId("alert-target").fill("0");
    await page.getByTestId("action-submit").click();
    await expect(err).toHaveText("Enter a target price above 0.");
    await page.getByTestId("alert-target").fill("1400"); // above 1,400 is true already
    await page.getByTestId("action-submit").click();
    await expect(err).toContainText("The price is already at or above ₹1,400.00");
    await page.getByTestId("cond-below").click();
    await page.getByTestId("alert-target").fill("1600"); // below 1,600 is true already
    await page.getByTestId("action-submit").click();
    await expect(err).toContainText("The price is already at or below ₹1,600.00");
    await expect(page.getByTestId("result-status")).toHaveCount(0);
  });

  test("with no live price it says so, and still lets you set a target", async ({ page }) => {
    const { puts } = await openApp(page, "/app/watchlist", account(), async (p) => {
      await p.route("**/api/quotes**", (r) => r.fulfill({ json: { source: "live", quotes: { SLEEPY: { state: "none", prevClose: 88, name: "Sleepy" } } } }));
    });
    await page.goto("/app/watchlist?act=alert&s=SLEEPY", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    await expect(page.getByTestId("alert-no-price")).toContainText("No recent trades");
    await page.getByTestId("alert-target").fill("90");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("result-status")).toHaveText("Alert set");
    await expect.poll(() => lastPut(puts)?.alerts?.[0]).toMatchObject({ symbol: "SLEEPY", target: 90 });
  });
});

test.describe("the list, edit and delete", () => {
  test("the alerts list opens the screen for Edit: filled in, the created time resets, and saving replaces it", async ({ page }) => {
    const { puts } = await openApp(page, "/app/orders?tab=alerts", account({ alerts: [alertRow()] }));
    await page.getByTestId("alert-edit-a1").click();
    await expect(page).toHaveURL(/act=alert&s=RELIANCE&e=a1/);
    await expect(page.getByTestId("action-label")).toHaveText("Edit alert");
    await expect(page.getByTestId("alert-target")).toHaveValue("1600");
    await expect(page.getByTestId("alert-edit-note")).toContainText("the time it was created resets");
    await page.getByTestId("alert-target").fill("1700");
    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("result-status")).toHaveText("Alert saved (the old one was deleted)");
    await expect.poll(() => (lastPut(puts)?.alerts ?? []).map((a) => a.target)).toEqual([1700]);
    expect(lastPut(puts)?.alerts?.[0].id).not.toBe("a1");
    await page.getByTestId("result-alert-list").click();
    await expect(page.locator('[data-testid^="alert-row-"]')).toHaveCount(1);
    await expect(page.getByTestId("alert-list")).toContainText("₹1,700.00");
  });

  test("Delete this alert asks first, then it is gone from the list", async ({ page }) => {
    const { puts } = await openApp(page, "/app/orders?tab=alerts", account({ alerts: [alertRow()] }));
    await page.getByTestId("alert-edit-a1").click();
    await page.getByTestId("alert-delete").click();
    await expect(page.getByTestId("result-status")).toHaveCount(0);
    await page.getByTestId("alert-delete-confirm").click();
    await expect(page.getByTestId("result-status")).toHaveText("Alert deleted");
    await expect.poll(() => (lastPut(puts)?.alerts ?? []).length).toBe(0);
    await page.getByTestId("result-alert-list").click();
    await expect(page.getByTestId("no-alerts")).toBeVisible();
  });

  test("Delete on the list removes an alert at once", async ({ page }) => {
    const { puts } = await openApp(page, "/app/orders?tab=alerts", account({ alerts: [alertRow()] }));
    await page.getByTestId("alert-remove-a1").click();
    await expect(page.getByTestId("no-alerts")).toBeVisible();
    await expect.poll(() => (lastPut(puts)?.alerts ?? []).length).toBe(0);
  });

  test("New alert on the list picks a symbol and opens the screen for it", async ({ page }) => {
    await openApp(page, "/app/orders?tab=alerts");
    await page.getByTestId("alert-symbol").selectOption("TCS");
    await page.getByTestId("alert-new").click();
    await expect(page.getByTestId("action-symbol")).toHaveText("TCS");
    await expect(page.getByTestId("strip-price")).toHaveText("₹4,200.00");
  });

  test("an edit address for an alert that is not set says so; back closes it and the list keeps its tab", async ({ page }) => {
    await openApp(page, "/app/orders?tab=alerts", account({ alerts: [alertRow()] }));
    await page.getByTestId("alert-edit-a1").click();
    await expect(screen(page)).toBeVisible();
    await page.goBack();
    await expect(screen(page)).toHaveCount(0);
    await expect(page.getByTestId("orders-tab-alerts")).toHaveAttribute("aria-selected", "true");
    await page.goto("/app/orders?act=alert&s=RELIANCE&e=nope", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("alert-missing")).toContainText("no longer set");
  });
});
