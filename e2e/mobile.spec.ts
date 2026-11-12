import { test, expect } from "@playwright/test";
import { ROUTES, measure } from "../scripts/mobile-audit";
import { bsm } from "../lib/fno/pricing";

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

test("the ticker strip stays fully visible, one 32px line, however the page is scrolled", async ({ page }) => {
  await open(page, "/app/fno", "#fno-und");
  await page.evaluate(() => {
    window.scrollTo(0, 5000);
    document.scrollingElement?.scrollTo(0, 5000);
    document.querySelectorAll<HTMLElement>(".overflow-y-auto").forEach((e) => e.scrollTo(0, 800));
  });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const t = document.querySelector(".ticker-strip")!.getBoundingClientRect();
    const se = document.scrollingElement!;
    return { top: t.top, height: t.height, docScrolls: se.scrollHeight - se.clientHeight, docY: se.scrollTop };
  });
  expect(r.docScrolls, "the page itself must not scroll; only the content area under the ticker does").toBeLessThanOrEqual(1);
  expect(r.docY).toBe(0);
  expect(Math.round(r.height)).toBe(32);
  expect(r.top, "the strip is clipped at the top edge").toBeGreaterThanOrEqual(0);
});

test("touching or scrolling past the payoff chart does not move the exit", async ({ page }) => {
  await open(page, "/app/fno", "#fno-und");
  const keep = () =>
    page.evaluate(() => {
      const el = document.querySelector('[aria-label="What you keep"]') as HTMLElement | null;
      const lines = (el?.innerText ?? "").split("\n");
      return lines.filter((l) => l.startsWith("Nifty at") || l.startsWith("Result after charges")).join(" | ");
    });
  const before = await keep();
  expect(before).toContain("Result after charges");
  // a finger lands on the chart and the browser takes over as a vertical scroll (pointercancel)
  await page.evaluate(() => {
    const svg = document.querySelector('[aria-label="Profit and loss chart"] svg') as SVGElement;
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.left + r.width * 0.8, clientY: r.top + 40, pointerId: 7, pointerType: "touch", bubbles: true }));
    svg.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width * 0.8 + 2, clientY: r.top + 140, pointerId: 7, pointerType: "touch", bubbles: true }));
    svg.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 7, pointerType: "touch", bubbles: true }));
  });
  await page.waitForTimeout(400);
  expect(await keep()).toBe(before);
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

test("strike comparison has implied volatility, gamma and vega rows; the per-leg Greeks table fits with a pinned first column", async ({ page }) => {
  await open(page, "/app/fno", "#fno-und");
  // rows in the strike comparison
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('[aria-label="Strike comparison"] tbody tr td:first-child')).map((td) => (td as HTMLElement).innerText.trim()));
  for (const want of ["Implied vol", "Gamma", "Vega / vol pt"]) expect(labels, `row ${want}`).toContain(want);
  // a four-leg trade: the per-leg table scrolls inside its box, with the label pinned and 3 columns showing
  await page.getByRole("button", { name: "Iron condor" }).click();
  await page.waitForSelector('table[aria-label="Greeks for each leg"]');
  const r = await page.evaluate(() => {
    const table = document.querySelector('table[aria-label="Greeks for each leg"]') as HTMLElement;
    const box = (table.parentElement as HTMLElement).getBoundingClientRect();
    const heads = Array.from(table.querySelectorAll("thead th")).slice(1) as HTMLElement[];
    const inside = heads.filter((h) => h.getBoundingClientRect().left >= box.left - 1 && h.getBoundingClientRect().right <= box.right + 1).length;
    return { inside, total: heads.length, pinned: getComputedStyle(table.querySelector("tbody td")!).position, page: document.documentElement.scrollWidth - innerWidth };
  });
  expect(r.total).toBe(5); // Total + four legs
  expect(r.inside).toBeGreaterThanOrEqual(3);
  expect(r.pinned).toBe("sticky");
  expect(r.page).toBeLessThanOrEqual(1);
});

test("open-ended trades show a slope and a stress case, never 'Unlimited' or an index-at-zero maximum; a spread keeps its caps", async ({ page }) => {
  await open(page, "/app/fno", "#fno-und");
  const result = () => page.evaluate(() => (document.querySelector('[aria-label="Result"]') as HTMLElement).innerText);
  await page.getByRole("button", { name: "Long put" }).click();
  await page.waitForTimeout(800);
  let r = await result();
  expect(r).toContain("Grows about");
  expect(r).toContain("for every 100 points");
  expect(r).toContain("Stress case");
  expect(r).not.toMatch(/unlimited/i);
  await page.getByRole("button", { name: "Short straddle" }).click();
  await page.waitForTimeout(800);
  r = await result();
  expect(r).toContain("Loses about");
  expect(r).toContain("The loss is open-ended.");
  await page.getByRole("button", { name: "Bull call spread" }).click();
  await page.waitForTimeout(800);
  r = await result();
  expect(r).not.toContain("Grows about");
  expect(r).not.toContain("Loses about");
  expect(r).not.toContain("Stress case");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test.describe("desktop is untouched", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  test("sidebar shows and there is no bottom tab bar", async ({ page }) => {
    await open(page, "/app/dashboard");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expect(page.getByText("Paper Trading Mode")).toBeVisible();
  });
});

/* ---------------------------------------------------------------- frozen prices --- */


/** A live Nifty snapshot for the mocked feed: every poll moves spot, the exchange's update time and the option prices. */
function mockSnapshot(n: number) {
  const spot = 25255.05 + n * 3.5;
  const sec = String(12 + n * 5).padStart(2, "0");
  const feedAsOf = `2026-11-11T13:50:${sec}+05:30`;
  const T = 5.9 / 365;
  const leg = (type: "CE" | "PE", k: number) => {
    const p = bsm(type, spot, k, T, 0.16, 0.065, 0.013).price;
    return { ltp: p, bid: p - 0.5, ask: p + 0.5, oi: 1000, iv: 16, delta: null, gamma: null, theta: null, vega: null, lastTrade: feedAsOf };
  };
  const chain = [];
  for (let k = 24500; k <= 26000; k += 50) chain.push({ strike: k, ce: leg("CE", k), pe: leg("PE", k) });
  return {
    asOf: feedAsOf, feedAsOf, source: "live", underlying: "NIFTY", expiry: "2026-11-17", expiries: ["2026-11-17", "2026-11-24"],
    spot, vix: 16, vixPrevClose: 15.5, vixPercentile: 50, atmIv: 16, lot: 65, step: 50, pcr: 1, chain,
  };
}

test("frozen prices: the analysis holds still while the feed moves, updates on request, and never overwrites typed values", async ({ page }) => {
  let n = 0;
  await page.route("**/api/fno/snapshot**", (route) => route.fulfill({ json: mockSnapshot(n++) }));
  await page.clock.install({ time: new Date("2026-11-11T13:50:00+05:30") }); // a Wednesday in market hours, so the page polls
  await page.goto("/app/fno", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="priced-at"]', { timeout: 30_000 });
  const read = () =>
    page.evaluate(() => ({
      priced: (document.querySelector('[data-testid="priced-at"]') as HTMLElement).innerText,
      spot: (document.querySelector("#fno-spot") as HTMLInputElement).value,
      result: (document.querySelector('[aria-label="Result"]') as HTMLElement).innerText,
      words: (document.querySelector('[aria-label="In plain words"]') as HTMLElement).innerText,
      keep: (document.querySelector('[aria-label="What you keep"]') as HTMLElement).innerText,
      hasUpdate: !!document.querySelector('[data-testid="update-live"]'),
    }));
  const first = await read();
  expect(first.priced).toBe("Priced at 13:50:12 IST");
  expect(first.hasUpdate).toBe(false);

  // the feed polls every 5 s and moves each time; nothing on the page may change
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(5200);
    await page.waitForTimeout(250);
  }
  expect(n, "the page kept polling in the background").toBeGreaterThanOrEqual(3);
  const held = await read();
  expect(held.priced).toBe(first.priced);
  expect(held.spot).toBe(first.spot);
  expect(held.result).toBe(first.result);
  expect(held.words).toBe(first.words);
  expect(held.keep).toBe(first.keep);
  expect(held.hasUpdate, "the feed has moved, so the update button shows").toBe(true);

  // type a spot of your own, then update: the snapshot changes, your value stays
  await page.fill("#fno-spot", "25000");
  await page.waitForTimeout(250);
  await page.getByTestId("update-live").click();
  await page.waitForTimeout(400);
  const updated = await read();
  expect(updated.priced).not.toBe(first.priced);
  expect(updated.spot).toBe("25000");
  await expect(page.getByText("Manual", { exact: true }).first()).toBeVisible();

  // use live values, let the feed move again, then change the strike: that takes a fresh snapshot by itself
  await page.getByRole("button", { name: "Use live values" }).click();
  await page.waitForTimeout(300);
  await page.clock.runFor(5200);
  await page.waitForTimeout(250);
  const before = await read();
  expect(before.hasUpdate).toBe(true);
  const strike = page.locator('xpath=//label[text()="Strike"]/following-sibling::input').first();
  await strike.fill("25300");
  await page.waitForTimeout(400);
  const after = await read();
  expect(after.priced, "editing the strike took a fresh snapshot").not.toBe(before.priced);
});
