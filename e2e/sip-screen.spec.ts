import { test, expect } from "@playwright/test";
import { account, lastPut, openApp, phone, screen, typeKeepingFocus } from "./action-helpers";

/** Starting a Stock SIP as a full screen. */
test.use(phone());

const existing = (o: Record<string, unknown> = {}) => ({ symbol: "TCS", amount: 5000, frequency: "monthly", nextDate: "2026-12-01", anchorDay: 1, status: "active", installments: 0, createdAt: "x", ...o });

test("New SIP opens a screen: the stock, the amount with what it buys, the frequency, the first date and an honest note", async ({ page }) => {
  await openApp(page, "/app/orders?tab=sips");
  await page.getByTestId("sip-new").click();
  await expect(page).toHaveURL(/act=sip/);
  await expect(screen(page)).toBeVisible();
  await expect(page.getByTestId("action-label")).toHaveText("New Stock SIP");
  await expect(page.getByTestId("paper-badge")).toBeVisible();
  await expect(page.getByTestId("strip-price")).toHaveText("₹1,500"); // RELIANCE, the first stock
  await expect(page.getByTestId("sip-buys")).toHaveText("At ₹1,500 that buys 3 whole shares (₹4,500).");
  await page.getByTestId("sip-symbol").selectOption("TCS");
  await expect(page.getByTestId("strip-price")).toHaveText("₹4,200");
  await expect(page.getByTestId("sip-buys")).toHaveText("At ₹4,200 that buys 1 whole share (₹4,200).");
  const note = await page.getByTestId("sip-note").innerText();
  for (const part of ["whole shares", "while Zestoxx is open", "skipped, not bought later in a lump"]) expect(note).toContain(part);
  await expect(page.getByTestId("action-submit")).toHaveText("Start SIP · TCS · ₹5,000");
});

test("a multi-digit amount goes in with the field keeping focus", async ({ page }) => {
  await openApp(page, "/app/orders?tab=sips");
  await page.getByTestId("sip-new").click();
  expect(await typeKeepingFocus(page, page.getByTestId("sip-amount"), "12500")).toBe("12500");
});

test("a SIP is started: the result, saved with its schedule, and listed", async ({ page }) => {
  const { puts } = await openApp(page, "/app/orders?tab=sips");
  await page.getByTestId("sip-new").click();
  await page.getByTestId("sip-symbol").selectOption("TCS");
  await page.getByTestId("sip-amount").fill("8000");
  await page.getByTestId("freq-weekly").click();
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("result-status")).toHaveText("SIP started");
  await expect(page.getByTestId("result-line")).toContainText("₹8,000 of TCS weekly, from 11 Nov 2026");
  await expect.poll(() => lastPut(puts)?.sips?.[0]).toMatchObject({ symbol: "TCS", amount: 8000, frequency: "weekly", status: "active" });
  await page.getByTestId("result-sips").click();
  await expect(page).toHaveURL(/\/app\/orders\?tab=sips$/);
  await expect(page.getByText("TCS").first()).toBeVisible();
});

test("an empty or non-numeric amount, below the minimum, over the maximum, and a date in the past are refused with a message", async ({ page }) => {
  await openApp(page, "/app/orders?tab=sips");
  await page.getByTestId("sip-new").click();
  const err = page.getByTestId("sip-error");
  const submit = page.getByTestId("action-submit");
  for (const v of ["", "abc", "0"]) {
    await page.getByTestId("sip-amount").fill(v);
    await submit.click();
    await expect(err, `amount "${v}"`).toHaveText("Enter the amount to invest each time, in rupees.");
  }
  await page.getByTestId("sip-amount").fill("100");
  await submit.click();
  await expect(err).toHaveText("The minimum SIP amount is ₹500.");
  await page.getByTestId("sip-amount").fill("2000000");
  await submit.click();
  await expect(err).toContainText("The maximum SIP amount");
  await page.getByTestId("sip-amount").fill("5000");
  await page.getByTestId("sip-start").fill("2026-11-01");
  await submit.click();
  await expect(err).toHaveText("Pick a start date from today onwards.");
  await expect(page.getByTestId("result-status")).toHaveCount(0);
});

test("the limit on the number of SIPs is explained, and refused at the limit", async ({ page }) => {
  await openApp(page, "/app/orders?tab=sips", account({ sips: Array.from({ length: 20 }, () => existing()) }));
  await expect(page.getByTestId("sip-new")).toHaveCount(0); // the tab stops offering a new one at 20
  await page.goto("/app/orders?tab=sips&act=sip", { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-content").waitFor();
  await expect(page.getByTestId("sip-note")).toContainText("you have 20");
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("sip-error")).toHaveText("You can have up to 20 SIPs.");
});

test("back closes it and the SIPs tab is still showing", async ({ page }) => {
  await openApp(page, "/app/orders?tab=sips", account({ sips: [existing()] }));
  await page.getByTestId("sip-new").click();
  await expect(screen(page)).toBeVisible();
  await page.goBack();
  await expect(screen(page)).toHaveCount(0);
  await expect(page.getByTestId("orders-tab-sips")).toHaveAttribute("aria-selected", "true");
});
