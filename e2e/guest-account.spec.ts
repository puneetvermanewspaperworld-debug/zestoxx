import { test, expect, type Page } from "@playwright/test";
import { hydrated } from "./hydrate";

/**
 * The guest-account screens: the cookie notice, and "Reset my paper account". The database and the cookie itself are covered by
 * lib/guest.test.ts (two cookies never see each other's data, through every route that touches user data); here the API is mocked.
 */
test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });

async function mock(page: Page, opts: { resetStatus?: number } = {}) {
  const seen: string[] = [];
  await page.route("**/api/portfolio", (r) => {
    seen.push(r.request().method());
    return r.fulfill({ json: r.request().method() === "GET" ? null : { ok: true } });
  });
  await page.route("**/api/account/reset", (r) => {
    seen.push("RESET");
    return r.fulfill({ status: opts.resetStatus ?? 200, json: opts.resetStatus && opts.resetStatus >= 400 ? { error: "reset failed" } : { ok: true } });
  });
  await page.route("**/api/market-data**", (r) => r.fulfill({ json: {} }));
  return seen;
}

test("a short notice says the app uses a cookie to keep a guest's paper account; it can be dismissed and stays dismissed", async ({ page }) => {
  await mock(page);
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  const notice = page.getByTestId("guest-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("cookie");
  await expect(notice).toContainText("paper account");
  const x = (await page.getByTestId("guest-notice-dismiss").boundingBox())!;
  expect(x.width).toBeGreaterThanOrEqual(43.5);
  expect(x.height).toBeGreaterThanOrEqual(43.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await hydrated(page.getByTestId("guest-notice-dismiss"));
  await page.getByTestId("guest-notice-dismiss").click();
  await expect(notice).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("app-content").waitFor();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("guest-notice")).toHaveCount(0);
});

test("the Portfolio page has a Paper account panel with the notice and Reset my paper account, which asks first", async ({ page }) => {
  const seen = await mock(page);
  await page.goto("/app/portfolio", { waitUntil: "domcontentloaded" });
  const panel = page.getByTestId("account-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("cookie on this device");
  const reset = page.getByTestId("reset-account");
  await expect(reset).toHaveText("Reset my paper account");
  expect((await reset.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await hydrated(reset);
  await reset.click();
  await expect(page.getByTestId("reset-account-question")).toContainText("clears your balance, holdings, orders, alerts, SIPs and watchlists");
  for (const id of ["reset-account-confirm", "reset-account-cancel"]) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(43.5);
  // cancel: nothing was sent
  await page.getByTestId("reset-account-cancel").click();
  await expect(page.getByTestId("reset-account-question")).toHaveCount(0);
  expect(seen).not.toContain("RESET");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("confirming the reset asks the server once and reloads the page; nothing is saved over it in between", async ({ page }) => {
  const seen = await mock(page);
  await page.goto("/app/portfolio", { waitUntil: "domcontentloaded" });
  await hydrated(page.getByTestId("reset-account"));
  await page.getByTestId("reset-account").click();
  const reload = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  const puts = seen.filter((s) => s === "PUT").length;
  await page.getByTestId("reset-account-confirm").click();
  await reload;
  expect(seen.filter((s) => s === "RESET").length).toBe(1);
  expect(seen.filter((s) => s === "PUT").length).toBe(puts); // no autosave between the reset and the reload
  // after the reload the page is the fresh account
  await expect(page.getByTestId("account-panel")).toBeVisible();
});

test("if the server cannot reset the account the page says so and stays as it was", async ({ page }) => {
  await mock(page, { resetStatus: 500 });
  await page.goto("/app/portfolio", { waitUntil: "domcontentloaded" });
  await hydrated(page.getByTestId("reset-account"));
  await page.getByTestId("reset-account").click();
  await page.getByTestId("reset-account-confirm").click();
  await expect(page.getByTestId("reset-account-error")).toBeVisible();
  await expect(page.getByTestId("reset-account-confirm")).toBeEnabled();
});
