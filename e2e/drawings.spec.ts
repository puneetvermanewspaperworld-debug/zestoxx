import { test, expect } from "@playwright/test";
import { RELIANCE_BARS, at, barTime, centre, drag, layerBox, openTrade, place, placeAt, stored, waitStored } from "./chart-helpers";

/**
 * Chart drawing tools on desktop (mouse): every tool, select / drag / resize, style, lock / clone / delete, undo and redo, the bulk
 * actions, stay-in-mode, the magnet, the measure tool and saving per symbol. Drawings are stored by (time, price), in this browser.
 */
test.use({ viewport: { width: 1280, height: 1000 } });

const count = (page: import("@playwright/test").Page) => page.getByTestId("drawing-count");

test("horizontal level: tap to place, a price you can edit, stored by price", async ({ page }) => {
  await openTrade(page);
  const close = RELIANCE_BARS[255][4] as number; // a price that is on screen
  await placeAt(page, "hline", [[260, close]]);
  await expect(count(page)).toHaveText("1 drawing");
  const [d] = await waitStored(page, 1);
  expect(d.kind).toBe("hline");
  expect(Math.abs((d.price as number) - close)).toBeLessThan(1); // the tap was at that price on the price scale
  expect(Object.keys(d).includes("x") || Object.keys(d).includes("y")).toBe(false);
  await expect(page.getByTestId("drawing-layer")).toHaveAttribute("data-levels", JSON.stringify([d.price]));
  // it is selected after placing, with its price in the property bar; editing it moves the level
  await expect(page.getByTestId("level-price")).toHaveValue(String(d.price));
  await page.getByTestId("level-price").fill("1450.5");
  await page.getByTestId("level-price").blur();
  await expect.poll(async () => (await stored(page))[0].price).toBe(1450.5);
  await expect(page.getByTestId("drawing-layer")).toHaveAttribute("data-levels", "[1450.5]");
  // a higher tap is a higher price
  await placeAt(page, "hline", [[260, close + 20]]);
  const two = await waitStored(page, 2);
  expect(two[1].price!).toBeGreaterThan(close + 10);
});

test("trendline, ray, range box, parallel channel and text note are each placed and stored by (time, price)", async ({ page }) => {
  await openTrade(page);
  await place(page, "trend", [[0.2, 0.7], [0.5, 0.4]]);
  await place(page, "ray", [[0.3, 0.8], [0.6, 0.65]]);
  await place(page, "rect", [[0.55, 0.25], [0.8, 0.5]]);
  await place(page, "channel", [[0.15, 0.3], [0.45, 0.2]]);
  await place(page, "text", [[0.7, 0.8]]);
  await page.getByLabel("Note text").fill("Support");
  await page.keyboard.press("Enter");
  const ds = await waitStored(page, 5);
  expect(ds.map((d) => d.kind)).toEqual(["trend", "ray", "rect", "channel", "text"]);
  const [t, y, r, c, x] = ds;
  // the first tap is left of the second, so its time is earlier; the first is lower on screen, so its price is lower
  expect(t.a!.time).toBeLessThan(t.b!.time);
  expect(t.a!.price).toBeLessThan(t.b!.price);
  expect(y.a!.time).toBeLessThan(y.b!.time);
  expect(r.a!.time).toBeLessThan(r.b!.time);
  expect(r.a!.price).toBeGreaterThan(r.b!.price);
  expect(c.offset).toBeGreaterThan(0);
  expect(x.text).toBe("Support");
  // times are real bar days, prices are real prices: nothing is in pixels
  const first = barTime(RELIANCE_BARS[0][0] as number);
  const last = barTime(RELIANCE_BARS[RELIANCE_BARS.length - 1][0] as number);
  for (const d of ds) for (const p of [d.a, d.b, d.at].filter(Boolean) as { time: number; price: number }[]) {
    expect(p.time).toBeGreaterThan(first - 40 * 86_400);
    expect(p.time).toBeLessThan(last + 40 * 86_400);
    expect(p.price).toBeGreaterThan(900);
    expect(p.price).toBeLessThan(2000);
  }
  await expect(page.getByTestId("drawing-layer").locator("g[data-drawing]")).toHaveCount(5);
  await expect(page.getByTestId("drawing-layer").getByText("Support")).toBeVisible();
});

test("the range box labels its height in points and per cent", async ({ page }) => {
  await openTrade(page);
  await place(page, "rect", [[0.3, 0.3], [0.6, 0.6]]);
  const [d] = await waitStored(page, 1);
  const label = page.getByTestId("rect-label");
  const points = Math.abs(d.a!.price - d.b!.price);
  const pct = (points / Math.min(d.a!.price, d.b!.price)) * 100;
  await expect(label).toHaveText(`Height ${points.toFixed(2)} pts (${pct.toFixed(2)}%)`);
  await page.getByTestId("midline").click();
  await expect.poll(async () => (await stored(page))[0].midline).toBe(true);
});

test("select, drag a handle, and drag the whole drawing; one undo reverses each", async ({ page }) => {
  await openTrade(page);
  await place(page, "trend", [[0.25, 0.7], [0.55, 0.35]]);
  const [before] = await waitStored(page, 1);
  // drag the second handle up and to the right
  const hb = await centre(page, "handle-b");
  await drag(page, hb, { x: hb.x + 60, y: hb.y - 30 });
  await expect.poll(async () => (await stored(page))[0].b!.time).toBeGreaterThan(before.b!.time);
  const moved = (await stored(page))[0];
  expect(moved.a).toEqual(before.a);
  expect(moved.b!.price).toBeGreaterThan(before.b!.price);
  // one undo puts it back
  await page.getByTestId("undo").click();
  await expect.poll(async () => (await stored(page))[0].b).toEqual(before.b);
  await page.getByTestId("redo").click();
  await expect.poll(async () => (await stored(page))[0].b!.time).toBe(moved.b!.time);
  // drag the body: both ends move by the same amount
  const body = await centre(page, "drag-body");
  const pre = (await stored(page))[0];
  await drag(page, body, { x: body.x + 40, y: body.y + 25 });
  await expect.poll(async () => (await stored(page))[0].a!.time).not.toBe(pre.a!.time);
  const post = (await stored(page))[0];
  expect(Math.abs(post.b!.time - pre.b!.time - (post.a!.time - pre.a!.time))).toBeLessThan(2);
  expect(post.b!.price - pre.b!.price).toBeCloseTo(post.a!.price - pre.a!.price, 6);
  // tapping empty chart deselects; tapping the line selects it again
  const box = await layerBox(page);
  const empty = at(box, 0.9, 0.9);
  await page.mouse.click(empty.x, empty.y);
  await expect(page.getByTestId("properties")).toHaveCount(0);
});

test("a range box can be resized by a corner handle", async ({ page }) => {
  await openTrade(page);
  await place(page, "rect", [[0.3, 0.3], [0.6, 0.6]]);
  const [before] = await waitStored(page, 1);
  const hc = await centre(page, "handle-c");
  await drag(page, hc, { x: hc.x - 40, y: hc.y + 30 });
  await expect.poll(async () => (await stored(page))[0].a!.time).toBeLessThan(before.a!.time);
  const after = (await stored(page))[0];
  expect(after.b!.price).toBeLessThan(before.b!.price); // c = (a.time, b.price): dragging it down lowers b's price
  expect(after.b!.time).toBe(before.b!.time);
});

test("a channel's width handle sets its offset", async ({ page }) => {
  await openTrade(page);
  await place(page, "channel", [[0.25, 0.6], [0.6, 0.5]]);
  const [before] = await waitStored(page, 1);
  const ho = await centre(page, "handle-o");
  await drag(page, ho, { x: ho.x, y: ho.y - 50 });
  await expect.poll(async () => (await stored(page))[0].offset).toBeGreaterThan(before.offset!);
});

test("colour, width and style change and are saved; one undo each", async ({ page }) => {
  await openTrade(page);
  await place(page, "trend", [[0.3, 0.6], [0.6, 0.4]]);
  await waitStored(page, 1);
  await page.getByTestId("colour-f43f5e").click();
  await page.getByTestId("width-4").click();
  await page.getByTestId("dash-dotted").click();
  await expect.poll(async () => (await stored(page))[0]).toMatchObject({ color: "#f43f5e", width: 4, dash: "dotted" });
  await page.getByTestId("undo").click();
  await expect.poll(async () => (await stored(page))[0].dash).toBe("solid");
  expect((await stored(page))[0].width).toBe(4);
});

test("lock stops edits (no handles), clone adds a copy, delete removes", async ({ page }) => {
  await openTrade(page);
  await place(page, "trend", [[0.3, 0.6], [0.6, 0.4]]);
  await waitStored(page, 1);
  await page.getByTestId("lock").click();
  await expect.poll(async () => (await stored(page))[0].locked).toBe(true);
  await expect(page.getByTestId("handle-a")).toHaveCount(0);
  await expect(page.getByTestId("drag-body")).toHaveCount(0);
  await page.getByTestId("lock").click();
  await expect(page.getByTestId("handle-a")).toHaveCount(1);
  await page.getByTestId("clone").click();
  const two = await waitStored(page, 2);
  expect(two[1].id).not.toBe(two[0].id);
  expect(two[1].a!.time).toBeGreaterThan(two[0].a!.time);
  expect(two[1].a!.price).toBeLessThan(two[0].a!.price);
  await page.getByTestId("delete").click();
  const one = await waitStored(page, 1);
  expect(one[0].id).toBe(two[0].id);
});

test("undo and redo, hide all, lock all, delete all (and undo it)", async ({ page }) => {
  await openTrade(page);
  await place(page, "hline", [[0.5, 0.3]]);
  await place(page, "trend", [[0.2, 0.7], [0.45, 0.5]]);
  await place(page, "rect", [[0.55, 0.25], [0.8, 0.5]]);
  await waitStored(page, 3);
  await expect(page.getByTestId("undo")).toBeEnabled();
  await expect(page.getByTestId("redo")).toBeDisabled();
  await page.getByTestId("undo").click();
  await expect(count(page)).toHaveText("2 drawings");
  await expect(page.getByTestId("redo")).toBeEnabled();
  await page.getByTestId("redo").click();
  await expect(count(page)).toHaveText("3 drawings");
  // hide all: nothing is drawn or kept as a level, but they are all still there
  await page.getByTestId("hide-all").click();
  await expect(page.getByTestId("drawing-layer").locator("g[data-drawing]")).toHaveCount(0);
  await expect(page.getByTestId("drawing-layer")).toHaveAttribute("data-levels", "[]");
  await expect(count(page)).toHaveText("3 drawings");
  await page.getByTestId("hide-all").click();
  await expect(page.getByTestId("drawing-layer").locator("g[data-drawing]")).toHaveCount(2);
  // lock all
  await page.getByTestId("lock-all").click();
  await expect.poll(async () => (await stored(page)).every((d) => d.locked)).toBe(true);
  await page.getByTestId("lock-all").click();
  await expect.poll(async () => (await stored(page)).every((d) => !d.locked)).toBe(true);
  // delete all, then undo brings them all back
  await page.getByTestId("delete-all").click();
  await expect(count(page)).toHaveText("0 drawings");
  await waitStored(page, 0);
  await page.getByTestId("undo").click();
  await expect(count(page)).toHaveText("3 drawings");
  await waitStored(page, 3);
  // keyboard: Ctrl+Z undoes the last step (here, the unlock), Ctrl+Shift+Z redoes it
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await stored(page)).every((d) => d.locked)).toBe(true);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await stored(page)).every((d) => !d.locked)).toBe(true);
});

test("stay in drawing mode keeps the tool after each drawing; without it the tool returns to select", async ({ page }) => {
  await openTrade(page);
  await place(page, "hline", [[0.5, 0.3]]);
  await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-tool", "select");
  await page.getByTestId("stay").click();
  await expect(page.getByTestId("stay")).toHaveAttribute("aria-pressed", "true");
  await place(page, "hline", [[0.5, 0.45], [0.5, 0.6]]);
  await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-tool", "hline");
  await waitStored(page, 3);
});

test("the magnet snaps a tap to a candle's open, high, low or close, and takes that candle's time", async ({ page }) => {
  await openTrade(page);
  const bar = (i: number) => RELIANCE_BARS[i].slice(1, 5) as number[]; // open, high, low, close
  const [, hi, lo] = [0, bar(255)[1], bar(262)[2]];
  // taps 3 price units off a candle's high and low: within the magnet's reach
  await page.getByTestId("magnet").click();
  await placeAt(page, "trend", [[255, hi + 3], [262, lo - 3]]);
  const [d] = await waitStored(page, 1);
  expect(d.a!.time).toBe(barTime(RELIANCE_BARS[255][0] as number));
  expect(d.a!.price).toBeCloseTo(hi, 6);
  expect(d.b!.time).toBe(barTime(RELIANCE_BARS[262][0] as number));
  expect(d.b!.price).toBeCloseTo(lo, 6);
});

test("without the magnet a tap is where it was; with it, a tap far from every candle price is left alone", async ({ page }) => {
  await openTrade(page);
  const hi = RELIANCE_BARS[255][2] as number;
  await placeAt(page, "hline", [[255, hi + 3]]);
  const [free] = await waitStored(page, 1);
  expect(Math.abs((free.price as number) - (hi + 3))).toBeLessThan(1.5); // not snapped
  await page.getByTestId("magnet").click();
  const sc = JSON.parse((await page.getByTestId("drawing-layer").getAttribute("data-scale")) ?? "{}") as { y1: number; y1000: number };
  const pxPerUnit = Math.abs(sc.y1000 - sc.y1) / 999;
  const lo = RELIANCE_BARS[255][3] as number;
  const far = lo - 80 / pxPerUnit; // 80 px below the bar's low: well beyond the 32 px magnet reach, and still on screen
  await placeAt(page, "hline", [[255, far]]);
  const two = await waitStored(page, 2);
  expect(Math.abs((two[1].price as number) - far)).toBeLessThan(1.5);
});

test("drawings are kept per symbol, survive a reload and a timeframe change, and are not shared between symbols", async ({ page }) => {
  await openTrade(page);
  await place(page, "trend", [[0.3, 0.6], [0.6, 0.4]]);
  await place(page, "hline", [[0.5, 0.3]]);
  const saved = await waitStored(page, 2);
  // another timeframe: the same drawings, the same times and prices
  await page.getByRole("button", { name: "W", exact: true }).click();
  await page.waitForTimeout(700);
  await expect(page.getByTestId("drawing-layer").locator("g[data-drawing]")).toHaveCount(1);
  expect(await stored(page)).toEqual(saved);
  await page.getByRole("button", { name: "D", exact: true }).click();
  // reload
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("drawing-layer").waitFor({ timeout: 20_000 });
  await expect(count(page)).toHaveText("2 drawings");
  expect(await stored(page)).toEqual(saved);
  await expect(page.getByTestId("drawing-layer")).toHaveAttribute("data-levels", JSON.stringify(saved.filter((d) => d.kind === "hline").map((d) => d.price)));
  // another symbol starts empty and keeps its own
  await page.goto("/app/trade/TCS", { waitUntil: "domcontentloaded" });
  await page.getByTestId("drawing-layer").waitFor({ timeout: 20_000 });
  await expect(count(page)).toHaveText("0 drawings");
  await place(page, "hline", [[0.5, 0.4]]);
  await waitStored(page, 1, "TCS");
  expect((await stored(page)).length).toBe(2); // RELIANCE untouched
  // nothing about drawings went to the server: no request carried one
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("zestoxx:drawings:")));
  expect(keys.sort()).toEqual(["zestoxx:drawings:v1:RELIANCE", "zestoxx:drawings:v1:TCS"]);
});

test("autosave is debounced: a burst of edits is one write", async ({ page }) => {
  await openTrade(page);
  await page.evaluate(() => {
    const w = window as unknown as { __writes: number };
    w.__writes = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.startsWith("zestoxx:drawings:")) w.__writes++;
      return orig.call(this, k, v);
    };
  });
  await place(page, "trend", [[0.3, 0.6], [0.6, 0.4]]);
  for (const w of [1, 2, 3, 4]) await page.getByTestId(`width-${w}`).click();
  await waitStored(page, 1);
  await page.waitForTimeout(1000);
  const writes = await page.evaluate(() => (window as unknown as { __writes: number }).__writes);
  expect(writes).toBeGreaterThanOrEqual(1);
  expect(writes).toBeLessThanOrEqual(2); // the burst is not one write per click
});

test("measure: points, per cent, candles and time; nothing is stored", async ({ page }) => {
  await openTrade(page);
  await page.getByTestId("tool-measure").click();
  const box = await layerBox(page);
  const a = at(box, 0.3, 0.7);
  const b = at(box, 0.7, 0.3);
  await drag(page, a, b);
  const m = page.getByTestId("measure");
  await expect(m).toBeVisible();
  await expect(page.getByTestId("measure-line-0")).toHaveText(/^\+\d+\.\d{2} pts \(\+\d+\.\d{2}%\)$/); // dragged up: a rise
  await expect(page.getByTestId("measure-line-1")).toHaveText(/^\d+ candles · \d+ days$/);
  await expect(page.getByTestId("measure-line-2")).toHaveCount(0); // a stock: no per-lot figure
  expect(await stored(page)).toEqual([]);
  await expect(count(page)).toHaveText("0 drawings");
  // tap, tap works too, and dragging down is a fall
  await page.getByTestId("tool-select").click();
  await page.getByTestId("tool-measure").click();
  await page.mouse.click(b.x, b.y);
  await page.mouse.click(a.x, a.y);
  await expect(page.getByTestId("measure-line-0")).toHaveText(/^-\d+\.\d{2} pts \(-\d+\.\d{2}%\)$/);
});

test("measure on an index also gives rupees per lot of a future (points x the lot size from the feed)", async ({ page }) => {
  await openTrade(page, "NIFTY50", { lot: 65 });
  await page.getByTestId("tool-measure").click();
  const box = await layerBox(page);
  await drag(page, at(box, 0.3, 0.7), at(box, 0.7, 0.3));
  const move = (await page.getByTestId("measure-line-0").textContent()) ?? "";
  const points = Math.abs(Number(move.match(/([+-]\d+\.\d{2}) pts/)![1]));
  const per = (await page.getByTestId("measure-line-2").textContent()) ?? "";
  const rupees = Number(per.replace(/[^\d]/g, ""));
  expect(Math.abs(rupees - Math.round(points * 65))).toBeLessThanOrEqual(65); // rounding of the shown points
  expect(per).toContain("per lot of a future");
});

test("measure on an index with no lot size from the feed says so, never a guess", async ({ page }) => {
  await openTrade(page, "NIFTY50", { lot: null });
  await page.getByTestId("tool-measure").click();
  const box = await layerBox(page);
  await drag(page, at(box, 0.3, 0.7), at(box, 0.7, 0.3));
  await expect(page.getByTestId("measure-line-2")).toHaveText("-- per lot (lot size not available)");
});
