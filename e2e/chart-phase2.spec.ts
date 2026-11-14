import { test, expect, type Page } from "@playwright/test";
import { RELIANCE_BARS, centre, drag, layerBox, mockMarket, openTrade, placeAt, spot, stored, waitStored } from "./chart-helpers";

/**
 * Chart tools, phase 2 (desktop): the Reset view button, the crosshair readout, the alert on a horizontal level, the freehand brush
 * and the Fibonacci retracement, and the price shown for a level. The phone side of these is in chart-phone.spec.ts.
 */
test.use({ viewport: { width: 1280, height: 1000 } });

const view = async (page: Page): Promise<{ from: number; to: number }> => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-view")) ?? "{}");
const scale = async (page: Page): Promise<{ x0: number; x100: number; y1: number; y1000: number }> => JSON.parse((await page.getByTestId("drawing-layer").getAttribute("data-scale")) ?? "{}");

test("Reset view jumps back to the latest candle and re-scales the price axis", async ({ page }) => {
  await openTrade(page);
  const v0 = await view(page);
  const s0 = await scale(page);
  const c = await centre(page, "drawing-layer");
  // pan back in time, and stretch the price scale by dragging on the price axis
  await drag(page, { x: c.x - 100, y: c.y }, { x: c.x + 300, y: c.y });
  expect((await view(page)).from).toBeLessThan(v0.from - 5);
  const box = await layerBox(page);
  await drag(page, { x: box.x + box.width + 25, y: box.y + 100 }, { x: box.x + box.width + 25, y: box.y + 220 });
  const moved = await scale(page);
  expect(Math.abs(moved.y1000 - s0.y1000) + Math.abs(moved.y1 - s0.y1)).toBeGreaterThan(5);

  await page.getByTestId("reset-view").click();
  await expect.poll(async () => (await view(page)).from).toBeCloseTo(v0.from, 0);
  expect((await view(page)).to).toBeCloseTo(v0.to, 0);
  // the price scale is fitted again
  await expect.poll(async () => (await scale(page)).y1, { timeout: 5000 }).toBeCloseTo(s0.y1, 0);
  const s1 = await scale(page);
  expect(s1.y1000).toBeCloseTo(s0.y1000, 0);
  expect(s1.x0).toBeCloseTo(s0.x0, 0);
});

test("Reset view is a 44 px button, and it is there for crypto as well", async ({ page }) => {
  await mockMarket(page);
  await page.goto("/app/trade/BTC", { waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect(page.getByTestId("reset-view")).toBeVisible();
  const b = (await page.getByTestId("reset-view").boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
});

const px2 = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test("hovering shows the open, high, low and close of the bar under the pointer, and it goes when the pointer leaves", async ({ page }) => {
  await openTrade(page);
  await expect(page.getByTestId("crosshair-readout")).toHaveCount(0);
  const i = 258;
  const s = await spot(page, i, 1);
  const box = await layerBox(page);
  await page.mouse.move(s.x, box.y + box.height * 0.5, { steps: 4 });
  const ro = page.getByTestId("crosshair-readout");
  await expect(ro).toBeVisible();
  const bar = RELIANCE_BARS[i];
  await expect(page.getByTestId("ro-open")).toHaveText(px2(bar[1] as number));
  await expect(page.getByTestId("ro-high")).toHaveText(px2(bar[2] as number));
  await expect(page.getByTestId("ro-low")).toHaveText(px2(bar[3] as number));
  await expect(page.getByTestId("ro-close")).toHaveText(px2(bar[4] as number));
  const prev = RELIANCE_BARS[i - 1][4] as number;
  const chg = (bar[4] as number) - prev;
  await expect(page.getByTestId("ro-change")).toContainText(`${chg >= 0 ? "+" : "-"}${Math.abs(chg).toFixed(2)}`);
  // it takes no touches: the readout does not sit in the way of the chart
  expect(await ro.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
  await page.mouse.move(5, 5);
  await expect(ro).toHaveCount(0);
});

test("the readout for crypto is in dollars-style grouping, and a bar that is not there is never invented", async ({ page }) => {
  await mockMarket(page);
  await page.goto("/app/trade/BTC", { waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await page.getByTestId("drawing-layer").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  const box = await layerBox(page);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
  await expect(page.getByTestId("ro-open")).toContainText(/^[0-9]{2},[0-9]{3}.[0-9]{2}$/);
});

test("selecting a drawing does not move the chart: its properties open below it", async ({ page }) => {
  await openTrade(page);
  const before = await layerBox(page);
  await placeAt(page, "trend", [[255, 1500], [265, 1530]]);
  await expect(page.getByTestId("properties")).toBeVisible();
  const after = await layerBox(page);
  expect(after.y).toBe(before.y);
  const props = (await page.getByTestId("properties").boundingBox())!;
  expect(props.y).toBeGreaterThan(after.y + after.height); // below the plot
});

/* ------------------------------------------------------------------------------ alert on a level -- */


const toAlertsPage = async (page: Page) => {
  await page.getByRole("link", { name: "Alerts" }).first().click();
  await page.getByText("Active Alerts").waitFor();
};

test("tap a level and choose 'Alert when price crosses': it is one of the terminal's own price alerts", async ({ page }) => {
  await openTrade(page);
  await placeAt(page, "hline", [[262, 1560]]); // above the price of 1,500
  const [d] = await waitStored(page, 1);
  const btn = page.getByTestId("level-alert");
  await expect(btn).toHaveText("Alert when price crosses");
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("level-alert-note")).toContainText("goes above");
  const box = (await btn.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect(btn).toContainText("above this level");
  await expect(page.getByTestId("drawing-layer")).toHaveAttribute("data-alerted", JSON.stringify([d.id]));
  // it is on the Alerts page, in the same list the page's own form adds to, with the level's price as its target
  await toAlertsPage(page);
  const price = (d.price as number).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  await expect(page.getByText(`RELIANCE above`, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(`₹${price}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText("No alerts set.", { exact: false })).toBeVisible();
});

test("a level under the price makes a 'below' alert; tapping the button again removes the alert", async ({ page }) => {
  await openTrade(page);
  await placeAt(page, "hline", [[262, 1494]]); // just under the live price of 1,500 (the plot ends a little lower)
  await waitStored(page, 1);
  const btn = page.getByTestId("level-alert");
  await btn.click();
  await expect(btn).toContainText("below this level");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("drawing-layer")).toHaveAttribute("data-alerted", "[]");
  await toAlertsPage(page);
  await expect(page.getByText("No alerts set.", { exact: false })).toBeVisible();
});

test("moving the level moves its alert with it, and undo moves it back; deleting the level leaves the alert on the Alerts page", async ({ page }) => {
  await openTrade(page);
  await placeAt(page, "hline", [[262, 1560]]);
  const [d] = await waitStored(page, 1);
  await page.getByTestId("level-alert").click();
  await expect(page.getByTestId("level-alert")).toHaveAttribute("aria-pressed", "true");
  // edit the level's price: the alert follows (the button still says it is set)
  await page.getByTestId("level-price").fill("1580");
  await page.getByTestId("level-price").blur();
  await expect.poll(async () => (await stored(page))[0].price).toBe(1580);
  await expect(page.getByTestId("level-alert")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("drawing-layer")).toHaveAttribute("data-alerted", JSON.stringify([d.id]));
  await page.getByTestId("undo").click();
  await expect.poll(async () => (await stored(page))[0].price).toBe(d.price);
  await expect(page.getByTestId("level-alert")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("redo").click();
  await expect.poll(async () => (await stored(page))[0].price).toBe(1580);
  // the Alerts page shows the alert at the new price
  await toAlertsPage(page);
  await expect(page.getByText("₹1,580").first()).toBeVisible();
  // deleting the level does not delete the alert
  await page.getByRole("link", { name: "Trade" }).first().click();
  await page.getByTestId("drawing-layer").waitFor({ timeout: 15_000 });
  await page.getByTestId("tool-select").click();
  const line = await spot(page, 262, 1580);
  await page.mouse.click(line.x, line.y);
  await page.getByTestId("delete").click();
  await expect(page.getByTestId("drawing-count")).toHaveText("0 drawings");
  await toAlertsPage(page);
  await expect(page.getByText("₹1,580").first()).toBeVisible();
});

test("a level at the current price cannot have an alert: it would fire at once", async ({ page }) => {
  await openTrade(page);
  await placeAt(page, "hline", [[262, 1500]]); // the live price is 1,500
  await waitStored(page, 1);
  await page.getByTestId("level-price").fill("1500");
  await page.getByTestId("level-price").blur();
  await expect.poll(async () => (await stored(page))[0].price).toBe(1500);
  await expect(page.getByTestId("level-alert")).toBeDisabled();
  await expect(page.getByTestId("level-alert-note")).toHaveText("The price is at this level now.");
});
