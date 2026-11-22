import { test, expect } from "@playwright/test";
import { account, openApp, phone } from "./action-helpers";

/**
 * The balance is not in the phone's top bar (it keeps the market status); it is on Portfolio and Account, and in the order screens' funds line.
 * The eye hides the balance and the profit and loss as **** and ***, is remembered on the device, and is the same on every page.
 */
const held = account({ cash: 987_165.1, holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } } });

test.describe("on a phone", () => {
  test.use(phone(390, 844));

  test("the phone's top bar has the brand and the market status, and no wallet balance", async ({ page }) => {
    await openApp(page, "/app/watchlist", held);
    await expect(page.getByTestId("top-bar")).toBeVisible();
    await expect(page.getByTestId("top-bar")).toContainText("ZESTOXX");
    await expect(page.getByTestId("top-bar")).toContainText(/Market (Open|Closed)|Holiday|Muhurat/);
    await expect(page.getByTestId("top-bar-cash")).toBeHidden();
    await expect(page.getByTestId("top-bar").getByText(/₹9,87,165/)).toBeHidden();
    // no balance anywhere on the Watchlist or the Explore page either
    await expect(page.getByText(/₹9,87,165/).filter({ visible: true })).toHaveCount(0);
  });

  test("the balance is on Portfolio and on Account, and in the order screen's funds line", async ({ page }) => {
    await openApp(page, "/app/portfolio", held);
    await expect(page.getByTestId("pf-cash")).toHaveText("₹9,87,165.10");
    await page.goto("/app/account");
    await expect(page.getByTestId("acct-cash")).toHaveText("₹9,87,165.10");
    await expect(page.getByTestId("acct-total")).toHaveText("₹10,02,165.10"); // cash + 10 x 1,500
    await expect(page.getByTestId("acct-pnl")).toHaveText("+₹1,000.00");
    await page.goto("/app/watchlist?act=order&s=RELIANCE&side=buy");
    await expect(page.getByTestId("funds-available")).toHaveText("₹9,87,165.10");
  });

  test("the eye on Portfolio hides the balance and the P&L, is remembered, and is the same on Account", async ({ page }) => {
    await openApp(page, "/app/portfolio", held);
    const eye = page.getByTestId("privacy-eye");
    expect((await eye.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await expect(eye).toHaveAttribute("aria-pressed", "false");
    await eye.click();
    await expect(eye).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("pf-cash")).toHaveText("****");
    await expect(page.getByTestId("pf-total")).toHaveText("****");
    await expect(page.getByTestId("pf-pnl")).toHaveText("***");
    await page.reload();
    await expect(page.getByTestId("pf-cash")).toHaveText("****"); // remembered on this device
    // Account follows, and has its own eye
    await page.goto("/app/account");
    for (const [id, mask] of [["acct-cash", "****"], ["acct-total", "****"], ["acct-pnl", "***"]] as const) await expect(page.getByTestId(id)).toHaveText(mask);
    await expect(page.getByTestId("privacy-eye")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("privacy-eye").click();
    await expect(page.getByTestId("acct-cash")).toHaveText("₹9,87,165.10");
    // and back on Portfolio it is shown again
    await page.goto("/app/portfolio");
    await expect(page.getByTestId("pf-cash")).toHaveText("₹9,87,165.10");
  });

  test("hidden, the order screen's funds line still shows what you can spend", async ({ page }) => {
    await openApp(page, "/app/account", held);
    await page.getByTestId("privacy-eye").click();
    await page.goto("/app/watchlist?act=order&s=RELIANCE&side=buy");
    await expect(page.getByTestId("funds-available")).toHaveText("₹9,87,165.10");
  });

  test("the dashboard's balance card has the eye on a phone, and hides the values", async ({ page }) => {
    await openApp(page, "/app/dashboard", held);
    await page.getByTestId("privacy-eye").click();
    await expect(page.getByText("Virtual Cash").locator("xpath=following-sibling::div[1]")).toHaveText("****");
  });
});

test("desktop keeps the balance in its top bar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page, "/app/watchlist", held);
  await expect(page.getByTestId("top-bar-cash")).toBeVisible();
  await expect(page.getByTestId("top-bar-cash")).toContainText("₹9,87,165.10");
});
