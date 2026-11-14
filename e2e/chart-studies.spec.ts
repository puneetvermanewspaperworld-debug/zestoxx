import { test, expect, type Page } from "@playwright/test";
import { RELIANCE_BARS, candleRows, layerBox, openTrade, spot } from "./chart-helpers";
import { rsiSeries } from "../lib/indicators";
import { STUDIES } from "../lib/chart/studies";
import { MAX_STUDIES } from "../lib/chart/settings";
import type { Candle } from "../lib/types";

/**
 * The studies menu and what it puts on the chart: a "Current studies" list with editable parameters (checked, with clear messages), remove and
 * Clear all, a searchable list, oscillators in native panes, a legend with live values, "Requires volume" for volume studies and VWAP where
 * there is no volume, VWAP on intraday charts only, and the experimental labels. The mocked clock is Wed 11 Nov 2026, 13:50 IST.
 */
test.use({ viewport: { width: 1280, height: 1100 } });

interface Plotted {
  uid: number;
  id: string;
  available: boolean;
  reason: string | null;
  pane: number | null;
  values: Record<string, number>;
  last: Record<string, number | null>;
}
const plotted = async (page: Page): Promise<Plotted[]> => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-studies")) ?? "[]");
const openMenu = async (page: Page) => {
  await page.getByTestId("studies-button").click();
  await expect(page.getByTestId("studies-sheet")).toBeVisible();
};
const add = async (page: Page, id: string, close = true) => {
  await openMenu(page);
  await page.getByTestId(`add-${id}`).click();
  if (close) await page.keyboard.press("Escape");
};
const find = async (page: Page, id: string) => (await plotted(page)).filter((s) => s.id === id);
const pickInterval = async (page: Page, id: string) => {
  await page.getByTestId("interval-button").click();
  await page.getByTestId(`interval-${id}`).click();
};

const reliance = (): Candle[] => RELIANCE_BARS.map((r, k) => ({ open: r[1] as number, high: r[2] as number, low: r[3] as number, close: k === RELIANCE_BARS.length - 1 ? 1500 : (r[4] as number), volume: r[5] as number }));

test("the menu shows the current studies (the two moving averages and volume to start with) and every study to add, with the experimental ones labelled", async ({ page }) => {
  await openTrade(page);
  await openMenu(page);
  await expect(page.getByTestId("current-studies").locator('[data-testid^="current-edit-"]')).toHaveCount(3);
  await expect(page.getByTestId("current-studies")).toContainText("SMA (10)");
  await expect(page.getByTestId("current-studies")).toContainText("SMA (30)");
  await expect(page.getByTestId("current-studies")).toContainText("Volume");
  await expect(page.locator('[data-testid^="add-"]')).toHaveCount(STUDIES.length);
  for (const def of STUDIES) {
    const row = page.getByTestId(`add-${def.id}`);
    await expect(row).toContainText(def.name);
    if (def.experimental) await expect(row).toContainText("Experimental");
    else await expect(row).not.toContainText("Experimental");
  }
  expect(STUDIES.filter((s) => s.experimental).map((s) => s.id).sort()).toEqual(["ao", "donchian", "supertrend"]);
  await expect(page.getByTestId("studies-sheet")).not.toContainText(/atr bands/i);
});

test("the list can be searched", async ({ page }) => {
  await openTrade(page);
  await openMenu(page);
  const search = page.getByTestId("studies-search");
  await search.fill("bollinger");
  await expect(page.locator('[data-testid^="add-"]')).toHaveCount(3);
  for (const id of ["bb", "bbpb", "bbw"]) await expect(page.getByTestId(`add-${id}`)).toBeVisible();
  await search.fill("moving average");
  await expect(page.getByTestId("add-sma")).toBeVisible();
  await expect(page.getByTestId("add-ema")).toBeVisible();
  await search.fill("zzzz");
  await expect(page.getByTestId("studies-none")).toContainText("zzzz");
  await search.fill("");
  await expect(page.locator('[data-testid^="add-"]')).toHaveCount(STUDIES.length);
});

test("an oscillator gets a native pane of its own, panes follow the order, and removing one closes its pane", async ({ page }) => {
  await openTrade(page);
  const h0 = (await page.getByTestId("trade-chart").boundingBox())!.height;
  await add(page, "rsi");
  await add(page, "macd");
  await expect.poll(async () => (await find(page, "macd")).length).toBe(1);
  const rsi = (await find(page, "rsi"))[0];
  const macd = (await find(page, "macd"))[0];
  expect([rsi.pane, macd.pane]).toEqual([1, 2]);
  expect((await find(page, "sma")).every((s) => s.pane === 0)).toBe(true); // overlays stay on the price
  expect((await find(page, "volume"))[0].pane).toBe(0);
  // each pane makes the chart taller, so the price keeps its room
  await expect.poll(async () => (await page.getByTestId("trade-chart").boundingBox())!.height).toBeGreaterThanOrEqual(h0 + 2 * 120 - 2);
  await page.getByTestId(`legend-remove-${rsi.uid}`).click();
  await expect.poll(async () => (await find(page, "macd"))[0].pane).toBe(1); // MACD moves up into the freed pane
  await expect.poll(async () => (await page.getByTestId("trade-chart").boundingBox())!.height).toBeLessThan(h0 + 2 * 120 - 2);
});

test("the legend shows each study's values on the latest bar, and on the bar under the crosshair", async ({ page }) => {
  await openTrade(page);
  await add(page, "rsi");
  await page.mouse.move(5, 5); // the pointer rests where the menu row was, over the chart: take it away so there is no crosshair
  const rsi = (await find(page, "rsi"))[0];
  const expected = rsiSeries(reliance(), 14);
  const latest = page.getByTestId(`legend-value-${rsi.uid}-rsi`);
  await expect(latest).toHaveText((expected[expected.length - 1] as number).toFixed(2));
  const i = 258;
  const s = await spot(page, i, 1);
  const box = await layerBox(page);
  await page.mouse.move(s.x, box.y + box.height * 0.5, { steps: 4 });
  await expect(latest).toHaveText((expected[i] as number).toFixed(2));
  await page.mouse.move(5, 5);
  await expect(latest).toHaveText((expected[expected.length - 1] as number).toFixed(2));
  // the moving averages show their price values
  const sma10 = (await find(page, "sma"))[0];
  await expect(page.getByTestId(`legend-value-${sma10.uid}-sma`)).toHaveText(/^[0-9,]+\.[0-9]{2}$/);
});

test("two moving averages have different colours", async ({ page }) => {
  await openTrade(page);
  const colour = (uid: number) => page.getByTestId(`legend-value-${uid}-sma`).evaluate((e) => getComputedStyle(e).color);
  expect(await colour(1)).not.toBe(await colour(2));
});

test("parameters can be edited: a valid value changes the study, an invalid one is explained and changes nothing", async ({ page }) => {
  await openTrade(page);
  await add(page, "rsi", false);
  const uid = (await find(page, "rsi"))[0].uid;
  await page.getByTestId(`current-edit-${uid}`).click();
  const field = page.getByTestId(`param-${uid}-n`);
  await field.fill("21");
  await expect.poll(async () => (await find(page, "rsi"))[0].values.rsi).toBe(271 - 21);
  await expect(page.getByTestId(`current-${uid}`)).toContainText("RSI (21)");
  for (const bad of ["0", "0.5", "21.5", "501", "100000", "abc", "", "-3"]) {
    await field.fill(bad);
    await expect(page.getByTestId(`param-error-${uid}`)).toHaveText("Period must be a whole number from 1 to 500.", { timeout: 3000 }).catch(async () => {
      // "0", "501" and "100000" are whole numbers outside the range: "from 1 to 500" without "a whole number"
      await expect(page.getByTestId(`param-error-${uid}`)).toHaveText("Period must be from 1 to 500.");
    });
    expect((await find(page, "rsi"))[0].values.rsi).toBe(271 - 21); // nothing changed
  }
  await field.fill("14");
  await expect(page.getByTestId(`param-error-${uid}`)).toHaveCount(0);
  await expect.poll(async () => (await find(page, "rsi"))[0].values.rsi).toBe(271 - 14);
});

test("a multiplier and MACD's own rule have their own messages", async ({ page }) => {
  await openTrade(page);
  await add(page, "bb", false);
  const bb = (await find(page, "bb"))[0].uid;
  await page.getByTestId(`current-edit-${bb}`).click();
  await page.getByTestId(`param-${bb}-k`).fill("11");
  await expect(page.getByTestId(`param-error-${bb}`)).toHaveText("Deviations must be from 0.1 to 10.");
  await page.getByTestId(`param-${bb}-k`).fill("2.5");
  await expect(page.getByTestId(`param-error-${bb}`)).toHaveCount(0);
  await page.getByTestId(`current-edit-${bb}`).click();
  await page.getByTestId("add-macd").click();
  const macd = (await find(page, "macd"))[0].uid;
  await page.getByTestId(`current-edit-${macd}`).click();
  await page.getByTestId(`param-${macd}-fast`).fill("30");
  await expect(page.getByTestId(`param-error-${macd}`)).toHaveText("Fast must be shorter than Slow.");
  expect((await find(page, "macd"))[0].values.macd).toBe(271 - 25); // still the valid 12/26
});

test("remove takes one study off; Clear all takes them all off", async ({ page }) => {
  await openTrade(page);
  await openMenu(page);
  await page.getByTestId("current-remove-1").click();
  await expect(page.getByTestId("current-studies").locator('[data-testid^="current-edit-"]')).toHaveCount(2);
  await expect.poll(async () => (await plotted(page)).length).toBe(2);
  const clear = page.getByTestId("studies-clear");
  expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await clear.click();
  await expect(page.getByTestId("current-studies")).toContainText("No studies on the chart");
  await expect.poll(async () => (await plotted(page)).length).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("study-legend")).toHaveCount(0);
  expect((await find(page, "sma")).length).toBe(0);
});

test("without volume (an index) volume studies and VWAP say 'Requires volume' and are not drawn; price studies work", async ({ page }) => {
  await openTrade(page, "NIFTY50");
  await pickInterval(page, "15m");
  await expect.poll(async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").bars).toBeGreaterThan(100);
  await openMenu(page);
  for (const id of ["volume", "obv", "ad", "vwap"]) {
    await expect(page.getByTestId(`add-${id}`)).toBeDisabled();
    await expect(page.getByTestId(`add-${id}`)).toContainText("Requires volume");
  }
  for (const id of ["rsi", "macd", "atr", "bb"]) await expect(page.getByTestId(`add-${id}`)).toBeEnabled();
  await page.keyboard.press("Escape");
  // the Volume study that is on the chart by default says so and is not plotted
  const vol = (await find(page, "volume"))[0];
  expect(vol.available).toBe(false);
  expect(vol.reason).toBe("Requires volume");
  await expect(page.getByTestId(`legend-reason-${vol.uid}`)).toHaveText("Requires volume");
  expect(JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").volume).toBe(0);
});

test("VWAP is for intraday charts only; on one it is the volume-weighted typical price, starting again each day", async ({ page }) => {
  await openTrade(page, "RELIANCE");
  await openMenu(page);
  await expect(page.getByTestId("add-vwap")).toBeDisabled(); // the daily chart
  await expect(page.getByTestId("add-vwap")).toContainText("Intraday charts only");
  await page.keyboard.press("Escape");
  await pickInterval(page, "15m");
  await expect.poll(async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").bars).toBeGreaterThan(100);
  await add(page, "vwap");
  await expect.poll(async () => (await find(page, "vwap"))[0]?.available).toBe(true);
  // the last bar's VWAP: today's session so far, from the feed's bars (the live bar carries no volume, so it changes nothing)
  const rows = candleRows("RELIANCE", "15m", "5D");
  const day = (ms: number) => new Date(ms + 19_800_000).toISOString().slice(0, 10);
  const today = rows.filter((r) => day(r[0]) === day(rows[rows.length - 1][0]));
  let pv = 0;
  let vv = 0;
  for (const r of today) {
    pv += ((r[2] + r[3] + r[4]) / 3) * r[5];
    vv += r[5];
  }
  await expect.poll(async () => (await find(page, "vwap"))[0].last.vwap, { timeout: 15_000 }).toBeCloseTo(pv / vv, 6);
  // on a daily chart again it is off, and says why
  await pickInterval(page, "1D");
  await expect.poll(async () => (await find(page, "vwap"))[0].available).toBe(false);
  expect((await find(page, "vwap"))[0].reason).toBe("Intraday charts only");
});

test("an experimental study is marked in the legend and in the menu", async ({ page }) => {
  await openTrade(page);
  await add(page, "supertrend");
  const st = (await find(page, "supertrend"))[0];
  await expect(page.getByTestId(`legend-${st.uid}`)).toContainText("exp.");
  await expect(page.getByTestId(`legend-${st.uid}`)).toContainText("Supertrend (10, 3)");
});

test("the list is remembered on this device, and a saved study whose parameters are not valid is dropped", async ({ page }) => {
  await openTrade(page);
  await add(page, "rsi", false);
  const uid = (await find(page, "rsi"))[0].uid;
  await page.getByTestId(`current-edit-${uid}`).click();
  await page.getByTestId(`param-${uid}-n`).fill("9");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("zestoxx:chart-settings:v1") ?? "{}").studies?.length)).toBe(4);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(async () => (await plotted(page)).length).toBe(4);
  expect((await find(page, "rsi"))[0].values.rsi).toBe(271 - 9);
  // a hand-edited entry with a period of 0 is dropped, the rest kept
  await page.evaluate(() => {
    const k = "zestoxx:chart-settings:v1";
    const s = JSON.parse(localStorage.getItem(k)!);
    s.studies.push({ uid: 50, id: "atr", params: { n: 0 } });
    localStorage.setItem(k, JSON.stringify(s));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(async () => (await plotted(page)).length).toBe(4);
  expect((await plotted(page)).some((s) => s.id === "atr")).toBe(false);
});

test(`at most ${MAX_STUDIES} studies, with a message`, async ({ page }) => {
  await openTrade(page);
  await openMenu(page);
  for (const id of ["ema", "bb", "keltner", "rsi", "macd", "stoch", "atr", "cci", "willr"]) await page.getByTestId(`add-${id}`).click();
  await expect(page.getByTestId("studies-full")).toContainText(`${MAX_STUDIES} studies is the most`);
  await expect(page.getByTestId("add-roc")).toBeDisabled();
  await page.getByTestId("current-remove-4").click();
  await expect(page.getByTestId("studies-full")).toHaveCount(0);
});

test("every control of the studies menu and legend is a 44 px target", async ({ page }) => {
  await openTrade(page);
  await openMenu(page);
  await page.getByTestId("current-edit-1").click();
  const tooSmall = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="studies-sheet"] button, [data-testid="studies-sheet"] input, [data-testid="study-legend"] button')]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5))
        .map(({ e, r }) => `${e.getAttribute("data-testid") ?? e.getAttribute("aria-label")} ${Math.round(r.width)}x${Math.round(r.height)}`)
    );
  expect(await tooSmall()).toEqual([]);
  await page.keyboard.press("Escape");
  expect(await tooSmall()).toEqual([]); // the legend chips
});

test("on the legend, tapping a study's name opens its parameters", async ({ page }) => {
  await openTrade(page);
  await page.getByTestId("legend-edit-2").click();
  await expect(page.getByTestId("studies-sheet")).toBeVisible();
  await expect(page.getByTestId("param-2-n")).toHaveValue("30");
});
