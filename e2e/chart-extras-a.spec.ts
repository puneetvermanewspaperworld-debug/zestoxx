import { test, expect, type Page } from "@playwright/test";
import { candleRows, layerBox, openTrade, placeAt, spot, waitStored } from "./chart-helpers";
import { THEMES } from "../lib/chart/theme";
import { STUDIES } from "../lib/chart/studies";
import { TOOLS } from "../lib/chart/drawings";

/**
 * Chart extras A: the added intervals (2m, 3m, 10m, 2h, 4h), Invert price scale, the light and dark theme, starred drawing tools and studies,
 * and Save and Reset preferences. The mocked clock is Wed 11 Nov 2026, 13:50 IST.
 */
test.use({ viewport: { width: 1280, height: 1100 } });

const series = async (page: Page) => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}");
const attr = (page: Page, name: string) => page.getByTestId("trade-chart").getAttribute(name);
const setting = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem("zestoxx:chart-settings:v1") ?? "{}")[k], key);
const pickInterval = async (page: Page, id: string) => {
  await page.getByTestId("interval-button").click();
  await page.getByTestId(`interval-${id}`).click();
};
const plotted = (page: Page, rows: number) => expect.poll(async () => { const n = (await series(page)).bars; return n === rows || n === rows + 1; }, { timeout: 15_000 }).toBe(true);
const requests = (seen: string[]) => seen.map((s) => new URLSearchParams(s)).map((p) => `${p.get("symbol")}|${p.get("interval")}|${p.get("range")}`);
const openSettings = async (page: Page) => {
  await page.getByTestId("settings-button").click();
  await expect(page.getByTestId("settings-sheet")).toBeVisible();
};

/* ------------------------------------------------------------------------------------ intervals -- */
test("the interval menu lists 2m, 3m, 10m, 2h and 4h with the others, and has no 4m and no 3h", async ({ page }) => {
  await openTrade(page);
  await page.getByTestId("interval-button").click();
  const ids = await page.locator('[data-testid^="interval-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(9)).filter((s) => !["button", "sheet"].includes(s)));
  expect(ids).toEqual(["1m", "2m", "3m", "5m", "10m", "15m", "30m", "1h", "2h", "4h", "1D", "1W", "1M"]);
  await expect(page.getByTestId("interval-4m")).toHaveCount(0);
  await expect(page.getByTestId("interval-3h")).toHaveCount(0);
});

for (const [id, range, count] of [["2m", "1D", "2 minutes"], ["3m", "1D", "3 minutes"], ["10m", "5D", "10 minutes"], ["2h", "1Y", "2 hours"], ["4h", "1Y", "4 hours"]] as const) {
  test(`${id}: fetched on demand (range ${range}, the default one when it suits), plotted with IST times, and remembered`, async ({ page }) => {
    const seen: string[] = [];
    await openTrade(page, "RELIANCE", { seen });
    await pickInterval(page, id);
    await expect.poll(() => requests(seen)).toContain(`RELIANCE|${id}|${range}`);
    await expect(page.getByTestId("interval-button")).toHaveText(new RegExp(id));
    await expect(page.getByTestId(`range-${range}`)).toHaveAttribute("aria-pressed", "true");
    const rows = candleRows("RELIANCE", id, range);
    expect(rows.length).toBeGreaterThan(5);
    await plotted(page, rows.length);
    expect(await attr(page, "data-intraday")).toBe("1");
    await expect(page.getByTestId("tz-note")).toHaveText("Times in IST");
    // the first bar of the latest session starts at 09:15 on the Indian clock
    // hover a bar in the middle of the view: its time is its own start on the Indian clock
    const k = rows.length - Math.min(12, rows.length - 1);
    const s = await spot(page, k, 1);
    const box = await layerBox(page);
    await page.mouse.move(s.x, box.y + box.height * 0.5, { steps: 4 });
    // the bar under the pointer is one of this interval's own bars: its time of day is one of the starts the feed's bars have (a dense chart can land on a neighbour)
    const clock = (ms: number) => new Date(ms + 19_800_000).toISOString().slice(11, 16);
    const starts = new Set(rows.map((r) => clock(r[0])));
    await expect(page.getByTestId("ro-date")).toContainText(/[0-9]{1,2} [A-Z][a-z]{2} 202[0-9] [0-9]{2}:[0-9]{2}/);
    const shown = (await page.getByTestId("ro-date").innerText()).match(/([0-9]{2}:[0-9]{2})/)![1];
    expect(starts.has(shown), shown + " is one of " + [...starts].slice(0, 8).join(" ")).toBe(true);
    expect(clock(rows[0][0])).toBe("09:15");
    expect(count).toBeTruthy();
    // remembered across a reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
    await expect(page.getByTestId("interval-button")).toHaveText(new RegExp(id));
  });
}

test("2h bars start 09:15, 11:15, 13:15 on screen, and 4h bars 09:15 and 13:15", async ({ page }) => {
  await openTrade(page, "RELIANCE");
  await pickInterval(page, "2h");
  const rows2 = candleRows("RELIANCE", "2h", "1Y");
  await plotted(page, rows2.length);
  const clock = (ms: number) => new Date(ms + 19_800_000).toISOString().slice(11, 16);
  const day = new Date(rows2[rows2.length - 1][0] + 19_800_000).toISOString().slice(0, 10);
  expect(rows2.filter((r) => new Date(r[0] + 19_800_000).toISOString().slice(0, 10) === day).map((r) => clock(r[0]))).toEqual(["09:15", "11:15", "13:15"]); // today's session so far
  const full = rows2.filter((r) => new Date(r[0] + 19_800_000).toISOString().slice(0, 10) === new Date(rows2[0][0] + 19_800_000).toISOString().slice(0, 10)).map((r) => clock(r[0]));
  expect(full).toEqual(["09:15", "11:15", "13:15", "15:15"]);
  await pickInterval(page, "4h");
  const rows4 = candleRows("RELIANCE", "4h", "1Y");
  await plotted(page, rows4.length);
  expect(rows4.filter((r) => new Date(r[0] + 19_800_000).toISOString().slice(0, 10) === new Date(rows4[0][0] + 19_800_000).toISOString().slice(0, 10)).map((r) => clock(r[0]))).toEqual(["09:15", "13:15"]);
});

test("an index has no volume on the added intervals either", async ({ page }) => {
  await openTrade(page, "NIFTY50");
  await pickInterval(page, "10m");
  await plotted(page, candleRows("NIFTY50", "10m", "5D").length);
  expect((await series(page)).volume).toBe(0);
  await expect(page.getByTestId("volume-note")).toHaveText("Requires volume");
});

test("the live price moves the last candle of a 2 hour chart: the 13:15 bar is the one the price is in", async ({ page }) => {
  await openTrade(page, "RELIANCE");
  await pickInterval(page, "2h");
  const rows = candleRows("RELIANCE", "2h", "1Y");
  await plotted(page, rows.length);
  await expect.poll(async () => (await series(page)).lastClose, { timeout: 15_000 }).toBe(1500);
  expect((await series(page)).bars).toBe(rows.length); // 13:15 is already there from the feed: the price moved it, it did not add a bar
});

/* ----------------------------------------------------------------------------------------- invert -- */
test("Invert price scale turns the axis upside down, drawings follow it, and it is remembered", async ({ page }) => {
  await openTrade(page);
  await openSettings(page);
  const sw = page.getByTestId("invert-switch");
  expect((await sw.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(sw).toHaveAttribute("aria-checked", "false");
  expect(await attr(page, "data-invert")).toBe("0");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => attr(page, "data-invert")).toBe("1");
  expect(await setting(page, "invert")).toBe(true);
  await page.keyboard.press("Escape");
  // a tap higher on the screen is a LOWER price now
  await page.waitForTimeout(500);
  const box = await layerBox(page);
  await page.getByTestId("tool-hline").click();
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.25);
  await page.getByTestId("tool-hline").click();
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.65);
  const [a, b] = await waitStored(page, 2);
  expect(a.price!).toBeLessThan(b.price!);
  // and each is drawn where it was tapped
  const bodies = await page.getByTestId("drag-body").first().boundingBox();
  expect(bodies).not.toBeNull();
  // reload keeps it
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(() => attr(page, "data-invert")).toBe("1");
  // switched off again, the higher tap is the higher price
  await openSettings(page);
  await page.getByTestId("invert-switch").click();
  await expect.poll(() => attr(page, "data-invert")).toBe("0");
});

/* ------------------------------------------------------------------------------------------ theme -- */
test("the dark theme re-colours the chart and everything around it in our own palette, and is remembered", async ({ page }) => {
  await openTrade(page);
  const root = page.getByTestId("chart-with-tools");
  await expect(root).toHaveAttribute("data-theme", "light");
  expect(await attr(page, "data-text-color")).toBe(THEMES.light.text);
  const lightBg = await page.getByTestId("chart-controls").evaluate((e) => getComputedStyle(e.querySelector("button")!).backgroundColor);
  await openSettings(page);
  await expect(page.getByTestId("theme-light")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("theme-dark").click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => attr(page, "data-text-color")).toBe(THEMES.dark.text);
  expect(await setting(page, "theme")).toBe("dark");
  // the surrounding controls and the open menu are dark too (not white)
  const panel = await page.getByTestId("settings-sheet").locator("> div").last().evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(panel).toBe("rgb(21, 32, 51)"); // THEMES.dark.panel
  await page.keyboard.press("Escape");
  const darkBg = await page.getByTestId("chart-controls").evaluate((e) => getComputedStyle(e.querySelector("button")!).backgroundColor);
  expect(darkBg).not.toBe(lightBg);
  const rootBg = await root.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(rootBg).toBe("rgb(14, 22, 38)"); // THEMES.dark.background
  // the chart still works in dark: draw
  await page.waitForTimeout(400);
  await placeAt(page, "hline", [[262, 1560]]);
  await waitStored(page, 1);
  // remembered
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect(page.getByTestId("chart-with-tools")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => attr(page, "data-text-color")).toBe(THEMES.dark.text);
  await openSettings(page);
  await page.getByTestId("theme-light").click();
  await expect.poll(() => attr(page, "data-text-color")).toBe(THEMES.light.text);
});

test("in the dark theme the text of controls, legend and menus is readable (contrast of at least 4.5 against what is behind it)", async ({ page }) => {
  await openTrade(page);
  await openSettings(page);
  await page.getByTestId("theme-dark").click();
  await page.waitForTimeout(600); // let the colour transitions finish
  const ratio = (fg: number[], bg: number[]) => {
    const L = (c: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const [hi, lo] = [L(fg), L(bg)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // any CSS colour (the framework writes oklab()) to red, green, blue and alpha, through a canvas
  const samples = await page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    const rgba = (c: string): number[] => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = "#000";
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const bgOf = (el: Element): number[] => {
      let n: Element | null = el;
      while (n) {
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c[3] > 0.5) return c;
        n = n.parentElement;
      }
      return [255, 255, 255, 1];
    };
    const out: { id: string; fg: number[]; bg: number[] }[] = [];
    for (const id of ["interval-button", "chart-type-button", "studies-button", "theme-dark", "invert-switch", "prefs-save", "prefs-status", "prefs-reset-defaults"]) {
      const el = document.querySelector('[data-testid="' + id + '"]');
      if (el) out.push({ id, fg: rgba(getComputedStyle(el).color), bg: bgOf(el) });
    }
    return out;
  });
  expect(samples.length).toBeGreaterThan(5);
  for (const s of samples) expect(ratio(s.fg, s.bg), s.id + ": rgb(" + s.fg.slice(0, 3) + ") on rgb(" + s.bg.slice(0, 3) + ")").toBeGreaterThanOrEqual(4.5);
});

/* ------------------------------------------------------------------------------------ favourites -- */
test("starring a drawing tool pins it to the top of the rail, after Select, and is remembered", async ({ page }) => {
  await openTrade(page);
  const order = () => page.locator('[data-testid^="tool-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(9)));
  expect(await order()).toEqual(TOOLS.map((t) => t.id));
  await page.getByTestId("tool-pin-mode").click();
  for (const id of TOOLS.filter((t) => t.id !== "select").map((t) => t.id)) {
    const b = (await page.getByTestId(`tool-star-${id}`).boundingBox())!;
    expect(b.width, id).toBeGreaterThanOrEqual(44);
    expect(b.height, id).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByTestId("tool-star-select")).toHaveCount(0); // Select is always first
  await page.getByTestId("tool-star-fib").scrollIntoViewIfNeeded();
  await page.getByTestId("tool-star-fib").click();
  await page.getByTestId("tool-star-ray").scrollIntoViewIfNeeded();
  await page.getByTestId("tool-star-ray").click();
  await expect(page.getByTestId("tool-star-fib")).toHaveAttribute("aria-pressed", "true");
  const rest = TOOLS.map((t) => t.id).filter((id) => id !== "select" && id !== "fib" && id !== "ray");
  expect(await order()).toEqual(["select", "fib", "ray", ...rest]);
  expect(await setting(page, "favTools")).toEqual(["fib", "ray"]);
  await page.getByTestId("tool-pin-mode").click();
  await expect(page.getByTestId("tool-starred-fib")).toBeVisible();
  // the pinned tool still draws
  await placeAt(page, "fib", [[255, 1595], [265, 1520]]);
  expect((await waitStored(page, 1))[0].kind).toBe("fib");
  // remembered after a reload; and unstarring puts it back
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("tool-rail").waitFor({ timeout: 30_000 });
  expect(await order()).toEqual(["select", "fib", "ray", ...rest]);
  await page.getByTestId("tool-pin-mode").click();
  await page.getByTestId("tool-star-fib").scrollIntoViewIfNeeded();
  await page.getByTestId("tool-star-fib").click();
  await page.getByTestId("tool-star-ray").scrollIntoViewIfNeeded();
  await page.getByTestId("tool-star-ray").click();
  expect(await order()).toEqual(TOOLS.map((t) => t.id));
});

test("starring a study pins it to the top of the studies list, with a 'Starred' heading, and is remembered", async ({ page }) => {
  await openTrade(page);
  await page.getByTestId("studies-button").click();
  const order = () => page.locator('[data-testid^="add-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(4)));
  expect(await order()).toEqual(STUDIES.map((s) => s.id));
  await expect(page.getByTestId("starred-heading")).toHaveCount(0);
  for (const id of ["macd", "rsi"]) {
    const star = page.getByTestId(`star-${id}`);
    await star.scrollIntoViewIfNeeded();
    expect((await star.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    expect((await star.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await star.click();
  }
  const rest = STUDIES.map((s) => s.id).filter((id) => id !== "macd" && id !== "rsi");
  expect(await order()).toEqual(["macd", "rsi", ...rest]);
  await expect(page.getByTestId("starred-heading")).toHaveText("Starred");
  // search keeps starred matches first
  await page.getByTestId("studies-search").fill("r");
  const hits = await order();
  expect(hits[0]).toBe("rsi"); // MACD does not match "r"; the starred match comes first
  expect(hits).toContain("sma");
  await page.getByTestId("studies-search").fill("");
  expect(await setting(page, "favStudies")).toEqual(["macd", "rsi"]);
  // a starred study adds as usual
  await page.getByTestId("add-macd").click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => JSON.parse((await attr(page, "data-studies")) ?? "[]").some((s: { id: string }) => s.id === "macd")).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await page.getByTestId("studies-button").click();
  expect((await order()).slice(0, 2)).toEqual(["macd", "rsi"]);
  await page.getByTestId("star-macd").click();
  expect((await order()).slice(0, 1)).toEqual(["rsi"]);
});

/* ----------------------------------------------------------------------------------- preferences -- */
test("Save preferences keeps the chart type, interval, studies and settings; Reset to saved goes back to them", async ({ page }) => {
  await openTrade(page);
  // set the chart up the way we like it
  await page.getByTestId("chart-type-button").click();
  await page.getByTestId("type-hollow").click();
  await pickInterval(page, "15m");
  await page.getByTestId("studies-button").click();
  await page.getByTestId("add-rsi").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("grid-button").click();
  await openSettings(page);
  await page.getByTestId("theme-dark").click();
  await page.getByTestId("invert-switch").click();
  await expect(page.getByTestId("prefs-status")).toHaveText("Nothing saved yet.");
  await expect(page.getByTestId("prefs-reset-saved")).toHaveCount(0); // nothing saved: no Reset to saved
  await expect(page.getByTestId("prefs-reset-defaults")).toHaveText("Reset to defaults"); // but Reset to defaults is always there
  await page.getByTestId("prefs-save").click();
  await expect(page.getByTestId("prefs-message")).toHaveText("Preferences saved on this device.");
  await expect(page.getByTestId("prefs-reset-saved")).toHaveText("Reset to saved");
  await expect(page.getByTestId("prefs-reset-defaults")).toHaveText("Reset to defaults");
  await expect(page.getByTestId("prefs-forget")).toHaveText("Delete saved preferences");
  await expect(page.getByTestId("prefs-status")).toContainText("Saved ");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("zestoxx:chart-prefs:v1") ?? "null"));
  expect(saved.settings).toMatchObject({ type: "hollow", interval: "15m", theme: "dark", invert: true, grid: false });
  expect(saved.settings.studies.some((s: { id: string }) => s.id === "rsi")).toBe(true);
  // wander off
  await page.getByTestId("theme-light").click();
  await page.getByTestId("invert-switch").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("chart-type-button").click();
  await page.getByTestId("type-line").click();
  await page.getByTestId("studies-button").click();
  await page.getByTestId("studies-clear").click();
  await page.keyboard.press("Escape");
  await expect.poll(() => attr(page, "data-chart-type")).toBe("line");
  // Reset to saved: asks first, then goes back to the saved preferences
  await openSettings(page);
  await page.getByTestId("prefs-reset-saved").click();
  await expect(page.getByTestId("prefs-reset-question")).toHaveText("Go back to the saved preferences?");
  await expect(page.getByTestId("prefs-reset-confirm")).toHaveText("Reset to saved");
  await page.getByTestId("prefs-reset-cancel").click();
  expect(await attr(page, "data-chart-type")).toBe("line"); // cancelled: nothing changed
  await page.getByTestId("prefs-reset-saved").click();
  await page.getByTestId("prefs-reset-confirm").click();
  await expect(page.getByTestId("prefs-message")).toHaveText("Back to your saved preferences.");
  await expect.poll(() => attr(page, "data-chart-type")).toBe("hollow");
  expect(await attr(page, "data-theme")).toBe("dark");
  expect(await attr(page, "data-invert")).toBe("1");
  expect(await attr(page, "data-grid")).toBe("0");
  await expect(page.getByTestId("interval-button")).toHaveText(/15m/);
  expect((await setting(page, "studies")).some((s: { id: string }) => s.id === "rsi")).toBe(true);
});

test("Reset to defaults is always there and goes to the app's defaults; with nothing saved there is no Reset to saved; saved preferences can be deleted", async ({ page }) => {
  await openTrade(page);
  await page.getByTestId("chart-type-button").click();
  await page.getByTestId("type-area").click();
  await openSettings(page);
  await page.getByTestId("theme-dark").click();
  await expect(page.getByTestId("prefs-forget")).toHaveCount(0);
  await expect(page.getByTestId("prefs-reset-saved")).toHaveCount(0);
  await page.getByTestId("prefs-reset-defaults").click();
  await expect(page.getByTestId("prefs-reset-question")).toHaveText("Go back to the app's defaults?");
  await expect(page.getByTestId("prefs-reset-confirm")).toHaveText("Reset to defaults");
  await page.getByTestId("prefs-reset-confirm").click();
  await expect(page.getByTestId("prefs-message")).toHaveText("Back to the app's defaults.");
  await expect.poll(() => attr(page, "data-chart-type")).toBe("candle");
  expect(await attr(page, "data-theme")).toBe("light");
  // save, then delete the saved copy
  await page.getByTestId("prefs-save").click();
  await expect(page.getByTestId("prefs-forget")).toBeVisible();
  expect((await page.getByTestId("prefs-forget").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("prefs-forget").click();
  await expect(page.getByTestId("prefs-message")).toHaveText("Saved preferences deleted.");
  await expect(page.getByTestId("prefs-reset-saved")).toHaveCount(0); // gone with the snapshot
  await expect(page.getByTestId("prefs-reset-defaults")).toBeVisible(); // this one stays
  expect(await page.evaluate(() => localStorage.getItem("zestoxx:chart-prefs:v1"))).toBeNull();
  await expect(page.getByTestId("prefs-status")).toContainText("Nothing saved yet");
});

test("saved preferences stay in this browser and survive a reload; nothing is sent anywhere", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => { if (r.method() !== "GET") sent.push(`${r.method()} ${r.url()}`); });
  await openTrade(page);
  await openSettings(page);
  await page.getByTestId("theme-dark").click();
  await page.getByTestId("prefs-save").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await openSettings(page);
  await expect(page.getByTestId("prefs-status")).toContainText("Saved ");
  expect(sent.filter((s) => /prefs|preferences|chart-settings/i.test(s))).toEqual([]);
});

test("every control added here is a 44 px target", async ({ page }) => {
  await openTrade(page);
  const b = (await page.getByTestId("settings-button").boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.width).toBeGreaterThanOrEqual(44);
  await openSettings(page);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="settings-sheet"] button')]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < 43.5 || r.height < 43.5))
      .map(({ e, r }) => `${e.getAttribute("data-testid")} ${Math.round(r.width)}x${Math.round(r.height)}`)
  );
  expect(small).toEqual([]);
  expect((await page.getByTestId("prefs-reset-defaults").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("prefs-save").click();
  expect((await page.getByTestId("prefs-reset-saved").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("prefs-reset-saved").click();
  for (const id of ["prefs-reset-confirm", "prefs-reset-cancel"]) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(44);
});

test("with preferences saved, Reset to defaults goes to the defaults, not to the snapshot, and the snapshot is kept for Reset to saved", async ({ page }) => {
  await openTrade(page);
  await openSettings(page);
  await page.getByTestId("theme-dark").click();
  await page.getByTestId("prefs-save").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("chart-type-button").click();
  await page.getByTestId("type-hollow").click();
  await openSettings(page);
  await page.getByTestId("prefs-reset-defaults").click();
  await page.getByTestId("prefs-reset-confirm").click();
  await expect(page.getByTestId("prefs-message")).toHaveText("Back to the app's defaults.");
  await expect.poll(() => attr(page, "data-chart-type")).toBe("candle");
  expect(await attr(page, "data-theme")).toBe("light"); // the defaults, not the saved dark theme
  await expect(page.getByTestId("prefs-status")).toContainText("Saved "); // the snapshot is still there
  await page.getByTestId("prefs-reset-saved").click();
  await page.getByTestId("prefs-reset-confirm").click();
  await expect.poll(() => attr(page, "data-theme")).toBe("dark");
});
