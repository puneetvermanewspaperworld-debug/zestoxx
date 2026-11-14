import { test, expect, type Page } from "@playwright/test";
import { RELIANCE_BARS, layerBox, openTrade, placeAt, spot, waitStored } from "./chart-helpers";
import { toHeikinAshi, toRenko } from "../lib/chart/charttypes";

/** The chart type menu: the types and their order, remembering the choice on this device, Heikin Ashi's values, Renko's fixed brick size, and the drawing tools being off on Renko and Line Break. */
test.use({ viewport: { width: 1280, height: 1000 } });

const px2 = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const series = async (page: Page) => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}");
const chartType = (page: Page) => page.getByTestId("trade-chart").getAttribute("data-chart-type");
const openMenu = async (page: Page) => {
  await page.getByTestId("chart-type-button").click();
  await expect(page.getByTestId("chart-type-sheet")).toBeVisible();
};
const pick = async (page: Page, id: string) => {
  await openMenu(page);
  await page.getByTestId(`type-${id}`).click();
};

test("the menu lists the types in order, marks Renko and Line Break experimental, and has no Kagi or Range bars", async ({ page }) => {
  await openTrade(page);
  await openMenu(page);
  const ids = await page.locator('[data-testid^="type-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(5)));
  expect(ids).toEqual(["candle", "hollow", "bar", "line", "area", "baseline", "ha", "renko", "linebreak"]);
  await expect(page.getByTestId("type-candle")).toHaveAttribute("aria-checked", "true");
  for (const id of ["renko", "linebreak"]) await expect(page.getByTestId(`type-${id}`)).toContainText("Experimental");
  for (const id of ["candle", "hollow", "bar", "line", "area", "baseline", "ha"]) await expect(page.getByTestId(`type-${id}`)).not.toContainText("Experimental");
  await expect(page.getByTestId("chart-type-sheet")).not.toContainText(/kagi|range bars/i);
  // every row is a 44 px target
  for (const id of ids) {
    const b = (await page.getByTestId(`type-${id}`).boundingBox())!;
    expect(b.height, id).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("chart-type-sheet")).toHaveCount(0);
});

test("each standard type draws the real bars", async ({ page }) => {
  await openTrade(page);
  for (const id of ["hollow", "bar", "line", "area", "baseline", "candle"]) {
    await pick(page, id);
    await expect(page.getByTestId("chart-type-sheet")).toHaveCount(0);
    await expect.poll(() => chartType(page)).toBe(id);
    const s = await series(page);
    expect(s.bars, id).toBeGreaterThan(200);
    expect(s.chartType).toBe(id);
    await expect(page.getByTestId("chart-type-button")).toHaveAttribute("aria-label", new RegExp(`^Chart type: `));
  }
});

test("the choice is remembered on this device: it is still there after a reload", async ({ page }) => {
  await openTrade(page);
  await pick(page, "hollow");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("zestoxx:chart-settings:v1") ?? "{}").type)).toBe("hollow");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(() => chartType(page)).toBe("hollow");
  await openMenu(page);
  await expect(page.getByTestId("type-hollow")).toHaveAttribute("aria-checked", "true");
});

test("Heikin Ashi plots converted bars: the readout shows the Heikin Ashi open, high, low and close of a bar", async ({ page }) => {
  await openTrade(page);
  await pick(page, "ha");
  await expect.poll(() => chartType(page)).toBe("ha");
  const i = 258;
  const s = await spot(page, i, 1);
  const box = await layerBox(page);
  await page.mouse.move(s.x, box.y + box.height * 0.5, { steps: 4 });
  const candles = RELIANCE_BARS.map((r) => ({ open: r[1] as number, high: r[2] as number, low: r[3] as number, close: r[4] as number, volume: r[5] as number }));
  const ha = toHeikinAshi(candles)[i];
  await expect(page.getByTestId("ro-open")).toHaveText(px2(ha.open));
  await expect(page.getByTestId("ro-high")).toHaveText(px2(ha.high));
  await expect(page.getByTestId("ro-low")).toHaveText(px2(ha.low));
  await expect(page.getByTestId("ro-close")).toHaveText(px2(ha.close));
  expect(px2(ha.close)).not.toBe(px2(candles[i].close)); // and these are not the real bar's values
  // drawing tools still work on Heikin Ashi
  await expect(page.getByTestId("tool-rail")).toBeVisible();
});

test("Renko asks for a brick size once, suggests one, checks it, and keeps it", async ({ page }) => {
  await openTrade(page);
  await pick(page, "renko");
  const form = page.getByTestId("renko-size-form");
  await expect(form).toBeVisible();
  const suggested = Number(await page.getByTestId("renko-size").inputValue());
  expect(suggested).toBeGreaterThan(0); // a suggestion from the ATR of the bars on the chart
  // a bad size is refused with a message
  for (const [v, msg] of [["0", /above 0/], ["-3", /above 0/], ["abc", /above 0/], ["", /above 0/], ["0.0001", /more than 5000 bricks/]] as const) {
    await page.getByTestId("renko-size").fill(v);
    await page.getByTestId("renko-size-save").click();
    await expect(page.getByTestId("renko-size-error")).toHaveText(msg);
  }
  await expect.poll(() => chartType(page)).toBe("candle"); // nothing changed while the size was refused
  await page.getByTestId("renko-size").fill("5");
  await page.getByTestId("renko-size-save").click();
  await expect(page.getByTestId("chart-type-sheet")).toHaveCount(0);
  await expect.poll(() => chartType(page)).toBe("renko");
  // the bricks are the ones the rule gives for that size on these closes (the last close is the live price)
  const closes = RELIANCE_BARS.map((r, k) => ({ open: 0, high: 0, low: 0, close: k === RELIANCE_BARS.length - 1 ? 1500 : (r[4] as number), volume: 0, t: k }));
  const expected = toRenko(closes, 5).length;
  await expect.poll(async () => (await series(page)).bars).toBe(expected);
  // stored for this symbol, and still there after a reload
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zestoxx:chart-settings:v1") ?? "{}").renko)).toEqual({ RELIANCE: 5 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(() => chartType(page)).toBe("renko");
  await expect.poll(async () => (await series(page)).bars).toBe(expected);
  // changing the size is a deliberate act
  await openMenu(page);
  await expect(page.getByTestId("renko-change-size")).toContainText("Brick size: 5");
  await page.getByTestId("renko-change-size").click();
  await page.getByTestId("renko-size").fill("10");
  await page.getByTestId("renko-size-save").click();
  await expect.poll(async () => (await series(page)).bars).toBe(toRenko(closes, 10).length);
});

test("the crosshair on a Renko chart shows each brick's real date, not the chart library's stand-in", async ({ page }) => {
  await openTrade(page);
  await pick(page, "renko");
  await page.getByTestId("renko-size").fill("5");
  await page.getByTestId("renko-size-save").click();
  await expect.poll(() => chartType(page)).toBe("renko");
  const box = (await page.getByTestId("trade-chart").boundingBox())!; // the drawing layer is off on Renko
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
  await expect(page.getByTestId("ro-date")).toContainText(/ (2025|2026)/); // 2000 would be the stand-in's
});

test("Line Break: experimental, no sizes to choose, and the drawing tools are off on it and on Renko, and back on for the rest", async ({ page }) => {
  await openTrade(page);
  await placeAt(page, "hline", [[262, 1560]]);
  await waitStored(page, 1);
  await pick(page, "linebreak");
  await expect.poll(() => chartType(page)).toBe("linebreak");
  await expect(page.getByTestId("renko-size-form")).toHaveCount(0);
  await expect(page.getByTestId("drawings-off-note")).toContainText("Line Break");
  await expect(page.getByTestId("tool-rail")).toHaveCount(0);
  await expect(page.getByTestId("quick-bar")).toHaveCount(0);
  await expect(page.getByTestId("drawing-layer")).toHaveCount(0);
  await pick(page, "renko");
  await page.getByTestId("renko-size").fill("5");
  await page.getByTestId("renko-size-save").click();
  await expect(page.getByTestId("drawings-off-note")).toContainText("Renko");
  await expect(page.getByTestId("tool-rail")).toHaveCount(0);
  // back to candles: the tools and the drawing are there
  await pick(page, "candle");
  await expect(page.getByTestId("drawings-off-note")).toHaveCount(0);
  await expect(page.getByTestId("tool-rail")).toBeVisible();
  await expect(page.getByTestId("drawing-count")).toHaveText("1 drawing");
  await expect(page.getByTestId("drawing-layer")).toHaveAttribute("data-levels", /\[15[0-9.]+\]/);
});

test("Renko picked on a symbol with no brick size yet asks for one", async ({ page }) => {
  await openTrade(page);
  await page.evaluate(() => localStorage.setItem("zestoxx:chart-settings:v1", JSON.stringify({ type: "renko", renko: { TCS: 20 } })));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect(page.getByTestId("renko-needs-size")).toBeVisible();
  await page.getByRole("button", { name: "Set brick size" }).click();
  await expect(page.getByTestId("renko-size-form")).toBeVisible();
});
