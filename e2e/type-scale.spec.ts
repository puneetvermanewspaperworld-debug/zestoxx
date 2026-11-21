import { test, expect, type Page } from "@playwright/test";
import { mockMarket } from "./chart-helpers";
import { ROUTES } from "../scripts/mobile-audit";

/**
 * The phone type scale (app/globals.css: the --text-* tokens). On a phone every page uses only these sizes, nothing is smaller than 11px, fields
 * are 16px (a smaller one makes an iPhone zoom the page), table rows are 8 to 10px above and below, and nothing scrolls sideways. A wide screen
 * (1000px and up) keeps the sizes it has always had.
 */
const SCALE = new Set([11, 12, 13, 14, 15, 18, 19, 20]);

interface Report {
  smallest: number;
  strays: string[];
  inputs: { under16: number; under44: number };
  rowPad: number[];
  sideways: number;
}

/** runs in the page */
function report(scale: number[]): Report {
  const ok = new Set(scale);
  const strays: string[] = [];
  let smallest = 999;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? "").trim();
    const el = n.parentElement;
    if (!t || !el) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none") continue;
    const px = parseFloat(s.fontSize);
    smallest = Math.min(smallest, px);
    if (!ok.has(px) && strays.length < 5) strays.push(`${px}px <${el.tagName.toLowerCase()}> "${t.slice(0, 28)}"`);
  }
  const fields = Array.from(document.querySelectorAll<HTMLElement>("input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea")).filter((e) => e.getBoundingClientRect().width > 0);
  const cells = Array.from(document.querySelectorAll<HTMLElement>("td")).filter((e) => e.getBoundingClientRect().width > 0 && !e.closest(".tv-lightweight-charts")).slice(0, 40); // the chart library lays itself out with a table of its own
  const scroller = (document.querySelector('[data-testid="app-content"]')?.closest(".overflow-y-auto") as HTMLElement | null) ?? document.documentElement;
  return {
    smallest,
    strays,
    inputs: { under16: fields.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length, under44: fields.filter((e) => e.getBoundingClientRect().height < 43.5).length },
    rowPad: [...new Set(cells.map((c) => parseFloat(getComputedStyle(c).paddingTop)))],
    sideways: Math.max(document.documentElement.scrollWidth - window.innerWidth, scroller.scrollWidth - scroller.clientWidth),
  };
}

for (const [w, h] of [[360, 800], [390, 844]] as const) {
  test.describe(`the phone type scale at ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });

    for (const r of ROUTES.filter((x) => x.path !== "/")) {
      test(r.name, async ({ page }) => {
        await page.goto(r.path, { waitUntil: "domcontentloaded" });
        if (r.ready) await page.waitForSelector(r.ready, { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        const rep = await page.evaluate(report, [...SCALE]);
        expect(rep.smallest, "the smallest text on the page").toBeGreaterThanOrEqual(11);
        expect(rep.strays, "text in a size that is not on the scale").toEqual([]);
        expect(rep.inputs.under16, "fields under 16px").toBe(0);
        expect(rep.inputs.under44, "fields under 44px tall").toBe(0);
        for (const pad of rep.rowPad) expect(pad, "table row padding").toBeGreaterThanOrEqual(8);
        for (const pad of rep.rowPad) expect(pad, "table row padding").toBeLessThanOrEqual(10);
        expect(rep.sideways, "sideways scroll").toBeLessThanOrEqual(1);
      });
    }
  });
}

test.describe("a wide screen keeps its sizes", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the pixel sizes the components were written with are what a desktop shows, and table rows keep their 10px", async ({ page }) => {
    await mockMarket(page);
    await page.goto("/app/markets", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    await page.waitForTimeout(1500);
    const sizes = await page.evaluate(() => {
      const px = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).fontSize : null;
      };
      const td = document.querySelector("td");
      return { s115: px('[class*="text-[11.5px]"]'), s125: px('[class*="text-[12.5px]"]'), s13: px('[class*="text-[13px]"]'), s10: px('[class*="text-[10.5px]"]'), tdPad: td ? getComputedStyle(td).paddingTop : null };
    });
    // each of these is what its class says, not a token's value
    if (sizes.s115) expect(sizes.s115).toBe("11.5px");
    if (sizes.s125) expect(sizes.s125).toBe("12.5px");
    if (sizes.s13) expect(sizes.s13).toBe("13px");
    if (sizes.s10) expect(sizes.s10).toBe("10.5px");
    expect(sizes.tdPad).toBe("10px");
    expect(sizes.s115 ?? sizes.s125 ?? sizes.s13 ?? sizes.s10).not.toBeNull();
  });
});

test.describe("the row sheet with the GTT form open needs little scrolling", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  async function open(page: Page) {
    await mockMarket(page);
    await page.route("**/api/portfolio", (r) => (r.request().method() === "PUT" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { watchlist: ["RELIANCE", "TCS"], cash: 900_000, holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } }, orderLog: [], alerts: [] } })));
    await page.route("**/api/symbol-detail**", (r) => r.fulfill({ json: { source: "live", ltp: 1500, ohlc: { open: 1490, high: 1512, low: 1481 }, depth: { bids: [1, 2, 3, 4, 5].map((i) => ({ price: 1500 - i / 10, qty: 10 * i, orders: i })), asks: [1, 2, 3, 4, 5].map((i) => ({ price: 1500 + i / 10, qty: 10 * i, orders: i })), totalBuyQty: 150, totalSellQty: 150 } } }));
    await page.route("**/api/quotes**", (r) => r.fulfill({ json: { source: "unavailable" } }));
    await page.goto("/app/watchlist", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    const x = page.getByTestId("guest-notice-dismiss");
    if (await x.count()) await x.click();
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-gtt").click();
    await page.waitForTimeout(500);
  }

  // 340 and 284 before the type scale; the sheet now follows a phone trading app's spacing (Buy and Sell 49.5px, link rows 71px apart), so it is
  // a little taller than the compact sheet of the type-scale work (185 and 131)
  for (const [w, h, max] of [[360, 800, 260], [390, 844, 210]] as const) {
    test(`at ${w}x${h} the sheet scrolls by at most ${max}px (it was 340 and 284 before the type scale)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      const by = await page.evaluate(() => {
        const box = document.querySelector('[data-testid="symbol-sheet"] .overflow-y-auto') as HTMLElement;
        return box.scrollHeight - box.clientHeight;
      });
      expect(by).toBeLessThanOrEqual(max);
    });
  }
});
