import { test, expect, type Page } from "@playwright/test";
import { isTradingDay } from "../lib/market-calendar";

/**
 * The Nifty % column on /app/fiidii at 360px, against a mocked /api/fiidii carrying FII/DII days and Nifty 50's stored closes. The
 * column is each day's close against the previous trading day's close; a day without both closes shows "--", never a made-up value.
 */
test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript("window.__name = function (f) { return f; };");
});

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** FII/DII days for every trading day from 14 Oct to 13 Nov 2026 */
function days() {
  const out = [];
  let i = 0;
  for (let d = "2026-10-14"; d <= "2026-11-13"; d = addDays(d, 1)) {
    if (!isTradingDay(d)) continue;
    i++;
    const fiiNet = Math.round(((i % 7) - 3) * 1450.37 * 100) / 100;
    out.push({
      date: d,
      cash: { fii: { buy: 20000, sell: 20000 - fiiNet, net: fiiNet }, dii: { buy: 15000, sell: 15000, net: 0 } },
      idxFut: null,
      provisional: false,
    });
  }
  return out;
}

/** Nifty closes for every trading day from 6 Oct to 13 Nov, rising 0.5% a day, except the days in `without` */
function closes(without: string[] = []) {
  const out = [];
  let c = 24000;
  for (let d = "2026-10-06"; d <= "2026-11-13"; d = addDays(d, 1)) {
    if (!isTradingDay(d)) continue;
    c = c * 1.005;
    if (!without.includes(d)) out.push({ date: d, close: Math.round(c * 100) / 100 });
  }
  return out;
}

async function open(page: Page, body: unknown) {
  await page.route("**/api/fiidii", (r) => r.fulfill({ json: body }));
  await page.goto("/app/fiidii", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table", { timeout: 30_000 });
}

const cellFor = (page: Page, label: string) => page.locator("tbody tr", { hasText: label }).first().getByTestId("nifty-pct");

test("each FII/DII day shows Nifty's change against the previous trading day", async ({ page }) => {
  await open(page, { status: "ok", rows: days(), nifty: closes() });
  await expect(page.locator("thead").getByText("Nifty %")).toBeVisible();
  // a steady +0.5% a day, rounded to the cent in the closes, so every day reads +0.50%
  for (const label of ["13 Nov", "11 Nov", "09 Nov", "21 Oct", "14 Oct"]) await expect(cellFor(page, label)).toHaveText("+0.50%");
  await expect(page.getByTestId("nifty-note")).toContainText("previous trading day");
});

test("a day with no Nifty close shows --, and so does the day after it; nothing is carried over or made up", async ({ page }) => {
  // no close stored for Thu 5 Nov 2026
  await open(page, { status: "ok", rows: days(), nifty: closes(["2026-11-05"]) });
  await expect(cellFor(page, "05 Nov")).toHaveText("--");
  await expect(cellFor(page, "06 Nov")).toHaveText("--"); // its previous trading day has no close
  await expect(cellFor(page, "04 Nov")).toHaveText("+0.50%");
  await expect(cellFor(page, "09 Nov")).toHaveText("+0.50%");
});

test("the previous trading day is used: Monday vs Friday, the Sunday Muhurat session, and 11 Nov vs 9 Nov over the 10 Nov holiday", async ({ page }) => {
  const nifty = closes();
  await open(page, { status: "ok", rows: days(), nifty });
  const close = (d: string) => nifty.find((c) => c.date === d)!.close;
  const pct = (d: string, prev: string) => {
    const v = (close(d) / close(prev) - 1) * 100;
    return `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(2)}%`;
  };
  await expect(cellFor(page, "19 Oct")).toHaveText(pct("2026-10-19", "2026-10-16")); // Monday against Friday
  await expect(cellFor(page, "09 Nov")).toHaveText(pct("2026-11-09", "2026-11-08")); // 8 Nov 2026 (a Sunday) was the Muhurat trading session
  await expect(cellFor(page, "11 Nov")).toHaveText(pct("2026-11-11", "2026-11-09")); // 10 Nov was a holiday
});

test("falling days read negative, with the minus sign and never +-", async ({ page }) => {
  const nifty = closes().map((c) => (c.date === "2026-11-12" ? { ...c, close: Math.round(c.close * 0.98 * 100) / 100 } : c));
  await open(page, { status: "ok", rows: days(), nifty });
  const v = await cellFor(page, "12 Nov").innerText();
  expect(v).toMatch(/^-\d+\.\d{2}%$/);
  expect(await page.locator("table").innerText()).not.toContain("+-");
  await expect(cellFor(page, "12 Nov")).toHaveClass(/text-rose-500/);
});

test("with no closes stored at all, every day shows -- and the rest of the page is unaffected", async ({ page }) => {
  await open(page, { status: "ok", rows: days(), nifty: [] });
  const cells = page.getByTestId("nifty-pct");
  expect(await cells.count()).toBeGreaterThan(20);
  expect([...new Set(await cells.allInnerTexts())]).toEqual(["--"]);
  await expect(page.locator("tbody tr").first()).toContainText(/₹/);
});

test("an older API answer with no nifty field at all is also --", async ({ page }) => {
  await open(page, { status: "ok", rows: days() });
  expect([...new Set(await page.getByTestId("nifty-pct").allInnerTexts())]).toEqual(["--"]);
});

test("the column is for daily rows: weekly and monthly views drop it", async ({ page }) => {
  await open(page, { status: "ok", rows: days(), nifty: closes() });
  await page.getByLabel("Interval").selectOption("weekly");
  await expect(page.locator("thead").getByText("Nifty %")).toHaveCount(0);
  await expect(page.getByTestId("nifty-pct")).toHaveCount(0);
  await expect(page.getByTestId("nifty-note")).toHaveCount(0);
  await page.getByLabel("Interval").selectOption("daily");
  await expect(page.locator("thead").getByText("Nifty %")).toBeVisible();
});

test("a day with no FII/DII figures still shows its Nifty change, and fits", async ({ page }) => {
  const rows = days().filter((r) => r.date !== "2026-11-04"); // a gap in the FII/DII data
  await open(page, { status: "ok", rows, nifty: closes() });
  const row = page.locator("tbody tr", { hasText: "04 Nov" }).first();
  await expect(row).toContainText("Data not available");
  await expect(row.getByTestId("nifty-pct")).toHaveText("+0.50%");
});

for (const width of [360, 390]) {
  test(`fits at ${width}px: no sideways scroll, the table stays inside the page`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, { status: "ok", rows: days().filter((r) => r.date !== "2026-11-04"), nifty: closes(["2026-11-05"]) });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
    const wide = await page.evaluate(() => [...document.querySelectorAll("table")].filter((t) => t.getBoundingClientRect().right > window.innerWidth + 1).length);
    expect(wide).toBe(0);
    // the table's own scroll box has nothing to scroll sideways either
    const inner = await page.evaluate(() => [...document.querySelectorAll("table")].map((t) => (t.parentElement ? t.parentElement.scrollWidth - t.parentElement.clientWidth : 0)));
    expect(Math.max(...inner)).toBeLessThanOrEqual(0);
    await page.locator("table").first().screenshot({ path: `test-results/nifty-pct-${width}.png` });
  });
}
