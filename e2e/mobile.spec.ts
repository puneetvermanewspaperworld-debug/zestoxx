import { test, expect } from "@playwright/test";
import { ROUTES, measure } from "../scripts/mobile-audit";

/**
 * The phone guard. Fails if any route scrolls sideways at 360px (the page itself, not a table inside its own
 * scroll box), and pins down the specific faults that were seen on a real phone.
 */
test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

test.beforeEach(async ({ page }) => {
  // tsx/esbuild add a __name() helper to function bodies; give the page one so measure() can run there.
  await page.addInitScript("window.__name = function (f) { return f; };");
});

async function open(page: import("@playwright/test").Page, path: string, ready?: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  if (ready) await page.waitForSelector(ready, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(ready ? 3500 : 2500);
}

for (const r of ROUTES) {
  test(`${r.name} does not scroll sideways at 360px`, async ({ page }) => {
    await open(page, r.path, r.ready);
    const m = (await page.evaluate(measure)) as { pageScroll: number; wide: string[]; clipped: string[]; tableOverflow: string[] };
    expect(m.pageScroll, `the page is ${m.pageScroll}px wider than the screen`).toBeLessThanOrEqual(1);
    expect(m.wide, "elements stick out past the right edge").toEqual([]);
    expect(m.clipped, "content is cut off by an overflow-hidden box").toEqual([]);
    expect(m.tableOverflow, "tables stick out past the page").toEqual([]);
  });
}

test("FII/DII: the whole Net amount is visible on every row", async ({ page }) => {
  await open(page, "/app/fiidii");
  const rows = page.locator("table tbody tr");
  expect(await rows.count()).toBeGreaterThan(5);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("table tbody tr").forEach((tr, i) => {
      const cell = tr.lastElementChild as HTMLElement;
      const r = cell.getBoundingClientRect();
      if (r.right > window.innerWidth + 0.5 || r.left < 0 || cell.scrollWidth > cell.clientWidth + 1) out.push(`row ${i}: ${cell.innerText} right=${Math.round(r.right)}`);
    });
    return out;
  });
  expect(bad).toEqual([]);
});

test("FII/DII: amounts put the sign before the rupee sign", async ({ page }) => {
  await open(page, "/app/fiidii");
  const text = await page.locator("table tbody").innerText();
  expect(text).toMatch(/[+−]₹[\d,]+ Cr/);
  expect(text).not.toMatch(/₹[+\-−]/);
});

test("FII/DII: the chart shows the same date range as the table", async ({ page }) => {
  await open(page, "/app/fiidii");
  const caption = await page.locator("p.tabular-nums, span.tabular-nums").filter({ hasText: /–/ }).first().innerText();
  const bars = await page.locator("svg[role=img] rect[fill='#047857'], svg[role=img] rect[fill='#be123c']").count();
  const rows = await page.locator("table tbody tr").count();
  expect(caption).toMatch(/\d/);
  expect(bars).toBe(rows);
});

test("phones get a bottom tab bar with Dashboard, Watchlist, Trade, Pulse and More", async ({ page }) => {
  await open(page, "/app/dashboard");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();
  for (const t of ["Dashboard", "Watchlist", "Trade", "Pulse", "More"]) await expect(nav.getByText(t, { exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "All pages" });
  for (const t of ["Markets", "Movers", "F&O Analyzer", "Options", "Buildup", "FII/DII", "News", "Alerts", "Orders", "Portfolio"]) {
    await expect(sheet.getByRole("link", { name: t })).toBeVisible();
  }
});

test("the ticker strip is one 32px line", async ({ page }) => {
  await open(page, "/app/dashboard");
  const h = await page.evaluate(() => document.querySelector(".ticker-strip")?.getBoundingClientRect().height ?? 0);
  expect(Math.round(h)).toBe(32);
});

test("the strike comparison shows at least three strikes at once", async ({ page }) => {
  await open(page, "/app/fno", "#fno-und");
  const visible = await page.evaluate(() => {
    const t = document.querySelector('[aria-label="Strike comparison"] table') as HTMLElement;
    const heads = Array.from(t.querySelectorAll("thead th")).slice(1) as HTMLElement[];
    return heads.filter((h) => h.getBoundingClientRect().right <= window.innerWidth + 1 && h.getBoundingClientRect().left >= 0).length;
  });
  expect(visible).toBeGreaterThanOrEqual(3);
});

test.describe("desktop is untouched", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  test("sidebar shows and there is no bottom tab bar", async ({ page }) => {
    await open(page, "/app/dashboard");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expect(page.getByText("Paper Trading Mode")).toBeVisible();
  });
});
