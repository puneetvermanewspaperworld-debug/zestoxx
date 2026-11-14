import { test, expect, type Page } from "@playwright/test";
import { layerBox, openTrade, placeAt, stored, waitStored } from "./chart-helpers";

/** View controls: price scale (linear, log, per cent), grid, the magnet crosshair, Reset view, and fullscreen (landscape on a phone is in chart-phone.spec.ts). */
test.use({ viewport: { width: 1280, height: 1100 } });

const attr = (page: Page, name: string) => page.getByTestId("trade-chart").getAttribute(name);
const setting = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem("zestoxx:chart-settings:v1") ?? "{}")[k], key);
const pickScale = async (page: Page, id: string) => {
  await page.getByTestId("scale-button").click();
  await page.getByTestId(`scale-${id}`).click();
};

test("the price scale is linear, logarithmic or per cent, and the choice is remembered", async ({ page }) => {
  await openTrade(page);
  await expect(page.getByTestId("scale-button")).toHaveText(/Linear/);
  expect(await attr(page, "data-price-mode")).toBe("0");
  await pickScale(page, "log");
  await expect.poll(() => attr(page, "data-price-mode")).toBe("1");
  await expect(page.getByTestId("scale-button")).toHaveText(/Log/);
  await pickScale(page, "percent");
  await expect.poll(() => attr(page, "data-price-mode")).toBe("2");
  await expect(page.getByTestId("scale-button")).toHaveText(/%/);
  expect(await setting(page, "scale")).toBe("percent");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(() => attr(page, "data-price-mode")).toBe("2");
  await page.getByTestId("scale-button").click();
  await expect(page.getByTestId("scale-percent")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("scale-normal").click();
  await expect.poll(() => attr(page, "data-price-mode")).toBe("0");
});

for (const mode of ["log", "percent"] as const) {
  test(`drawings still sit on real prices on a ${mode} scale: a level lands where it was tapped and is stored as a price`, async ({ page }) => {
    await openTrade(page);
    await pickScale(page, mode);
    await expect.poll(() => attr(page, "data-price-mode")).toBe(mode === "log" ? "1" : "2");
    await page.waitForTimeout(500);
    await page.getByTestId("tool-hline").click();
    const box = await layerBox(page);
    const y = box.y + box.height * 0.45;
    await page.mouse.click(box.x + box.width * 0.5, y);
    const [d] = await waitStored(page, 1);
    // the price is a price (about 1,500 to 1,650 for these bars), not a per cent
    expect(d.price!).toBeGreaterThan(1400);
    expect(d.price!).toBeLessThan(1750);
    // and the drawing is on the pixel that was tapped
    const halo = (await page.getByTestId("drag-body").first().boundingBox())!;
    expect(Math.abs(halo.y + halo.height / 2 - y)).toBeLessThan(3);
    // it is still the same price on the linear scale
    await pickScale(page, "normal");
    await expect.poll(() => attr(page, "data-price-mode")).toBe("0");
    expect((await stored(page))[0].price).toBe(d.price);
  });
}

test("the grid can be switched off and on, and is remembered", async ({ page }) => {
  await openTrade(page);
  const btn = page.getByTestId("grid-button");
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  expect(await attr(page, "data-grid")).toBe("1");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => attr(page, "data-grid")).toBe("0");
  expect(await setting(page, "grid")).toBe(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(() => attr(page, "data-grid")).toBe("0");
  await page.getByTestId("grid-button").click();
  await expect.poll(() => attr(page, "data-grid")).toBe("1");
});

test("the magnet crosshair uses the library's open-high-low-close mode, and is separate from the drawing magnet", async ({ page }) => {
  await openTrade(page);
  expect(await attr(page, "data-crosshair-mode")).toBe("0"); // free
  const btn = page.getByTestId("crosshair-magnet-button");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => attr(page, "data-crosshair-mode")).toBe("3"); // MagnetOHLC
  expect(await setting(page, "magnet")).toBe(true);
  await expect(page.getByTestId("magnet")).toHaveAttribute("aria-pressed", "false"); // snapping drawn points is its own switch
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(() => attr(page, "data-crosshair-mode")).toBe("3");
  await page.getByTestId("crosshair-magnet-button").click();
  await expect.poll(() => attr(page, "data-crosshair-mode")).toBe("0");
});

test("Reset view is still there and still works with the new controls", async ({ page }) => {
  await openTrade(page);
  await pickScale(page, "log");
  const view = async () => JSON.parse((await attr(page, "data-view")) ?? "{}");
  const v0 = await view();
  const box = await layerBox(page);
  await page.mouse.move(box.x + 100, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 120, { steps: 6 });
  await page.mouse.up();
  expect((await view()).from).toBeLessThan(v0.from - 3);
  await page.getByTestId("reset-view").click();
  await expect.poll(async () => (await view()).from).toBeCloseTo(v0.from, 0);
});

test("fullscreen: the chart takes the whole screen with its controls, the tools still work, and it can be left", async ({ page }) => {
  await openTrade(page);
  const root = page.getByTestId("chart-with-tools");
  const before = (await page.getByTestId("trade-chart").boundingBox())!;
  await page.getByTestId("fullscreen-button").click();
  await expect(root).toHaveAttribute("data-fullscreen", "1");
  await expect(page.getByTestId("fullscreen-button")).toHaveAttribute("aria-pressed", "true");
  const r = (await root.boundingBox())!;
  expect([Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]).toEqual([0, 0, 1280, 1100]);
  const after = (await page.getByTestId("trade-chart").boundingBox())!;
  expect(after.height).toBeGreaterThan(before.height); // it fills what is left under the controls
  await expect(page.getByTestId("chart-controls")).toBeVisible();
  await expect(page.getByTestId("studies-button")).toBeVisible();
  // a drawing can be made in fullscreen
  await page.waitForTimeout(500);
  await placeAt(page, "hline", [[262, 1560]]);
  await waitStored(page, 1);
  // a menu opens inside it
  await page.getByTestId("chart-type-button").click();
  await expect(page.getByTestId("chart-type-sheet")).toBeVisible();
  await page.keyboard.press("Escape"); // closes the menu, not the fullscreen
  await expect(page.getByTestId("chart-type-sheet")).toHaveCount(0);
  await expect(root).toHaveAttribute("data-fullscreen", "1");
  await page.keyboard.press("Escape");
  await expect(root).toHaveAttribute("data-fullscreen", "0");
  // back to its own height (give or take the attribution line, which wraps once a scrollbar is on the page)
  await expect.poll(async () => Math.abs((await page.getByTestId("trade-chart").boundingBox())!.height - before.height)).toBeLessThan(20);
  expect((await stored(page)).length).toBe(1);
  // and by the button
  await page.getByTestId("fullscreen-button").click();
  await expect(root).toHaveAttribute("data-fullscreen", "1");
  await page.getByTestId("fullscreen-button").click();
  await expect(root).toHaveAttribute("data-fullscreen", "0");
});

test("the landscape button is for phones: it is not on a wide screen", async ({ page }) => {
  await openTrade(page);
  await expect(page.getByTestId("landscape-button")).toBeHidden();
});

test("the new view controls are 44 px targets", async ({ page }) => {
  await openTrade(page);
  for (const id of ["scale-button", "grid-button", "crosshair-magnet-button", "fullscreen-button", "studies-button", "interval-button", "chart-type-button", "reset-view"]) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.height, id).toBeGreaterThanOrEqual(44);
    expect(b.width, id).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId("scale-button").click();
  for (const id of ["normal", "log", "percent"]) expect((await page.getByTestId(`scale-${id}`).boundingBox())!.height, id).toBeGreaterThanOrEqual(44);
});
