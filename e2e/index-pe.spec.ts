import { test, expect, type Page } from "@playwright/test";
import { bsm } from "../lib/fno/pricing";

/**
 * The analyzer's "Is the market cheap or expensive?" panel against a mocked /api/fno/snapshot carrying (or not) NSE's index P/E:
 * fresh data replaces the typed P/E and says so; missing or stale data shows Manual and stays editable; a typed value wins; the
 * bond yield is always editable.
 */
test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
});

type IndexPEMock = {
  value: number;
  asOfDate: string;
  source: "NSE close";
  livePE: number | null;
  medianPE: number | null;
  historyDays: number;
  tradingDaysOld: number;
  stale: boolean;
} | null;

const FRESH: IndexPEMock = { value: 20.62, asOfDate: "2026-11-11", source: "NSE close", livePE: 20.8262, medianPE: 21.4, historyDays: 40, tradingDaysOld: 0, stale: false };

function snapshot(indexPE: IndexPEMock) {
  const spot = 25255.05;
  const now = new Date().toISOString();
  const T = 5.9 / 365;
  const leg = (type: "CE" | "PE", k: number) => {
    const p = bsm(type, spot, k, T, 0.16, 0.065, 0.013).price;
    return { ltp: p, bid: p - 0.5, ask: p + 0.5, oi: 1000, iv: 16, delta: null, gamma: null, theta: null, vega: null, lastTrade: now };
  };
  const chain = [];
  for (let k = 24500; k <= 26000; k += 50) chain.push({ strike: k, ce: leg("CE", k), pe: leg("PE", k) });
  return {
    asOf: now, feedAsOf: now, source: "live", underlying: "NIFTY", expiry: "2026-11-17", expiries: ["2026-11-17"],
    spot, vix: 16, vixPrevClose: 15.5, vixPercentile: 50, atmIv: 16, lot: 65, step: 50, pcr: 1, chain, indexPE,
  };
}

async function open(page: Page, indexPE: IndexPEMock) {
  await page.route("**/api/fno/snapshot**", (route) => route.fulfill({ json: snapshot(indexPE) }));
  await page.goto("/app/fno", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ctx-pe", { timeout: 30_000 });
  await page.waitForTimeout(400);
}

const sources = (page: Page) => page.locator('[aria-label="Valuation context"] [data-testid="pe-source"]').allInnerTexts();
const detail = (page: Page) => page.locator('[data-testid="pe-detail"]').innerText();

test("fresh NSE data: the P/E is NSE's close scaled to the live index, labelled as such, and the long-run P/E is the stored median", async ({ page }) => {
  await open(page, FRESH);
  expect(await page.inputValue("#ctx-pe")).toBe("20.83");
  expect(await page.inputValue("#ctx-avg")).toBe("21.4");
  expect(await sources(page)).toEqual(["NSE close, estimated live", "Median of 40 stored days"]);
  const d = await detail(page);
  expect(d).toContain("NSE close of 11 Nov 2026: P/E 20.62");
  expect(d).toContain("scaled to the live index level: 20.83");
  // the sentence below uses the NSE figures: 20.8 against a median of 21.4
  expect(await page.locator('[aria-label="Valuation context"]').innerText()).toMatch(/A PE of 20\.8 is 3% below the long-run level/);
});

test("the 10-year bond yield stays an editable input of its own", async ({ page }) => {
  await open(page, FRESH);
  expect(await page.locator('label[for="ctx-bond"]').innerText()).toBe("10-year bond yield %");
  await page.fill("#ctx-bond", "7.1");
  expect(await page.inputValue("#ctx-bond")).toBe("7.1");
  expect(await page.locator('[aria-label="Valuation context"]').innerText()).toContain("against a 7.10% bond");
  expect(await page.inputValue("#ctx-pe"), "typing a bond yield does not touch the NSE P/E").toBe("20.83");
});

test("missing data: Manual, the reason is given, and the inputs stay editable", async ({ page }) => {
  await open(page, null);
  expect(await sources(page)).toEqual(["Manual", "Manual"]);
  expect(await detail(page)).toContain("not stored for this index yet");
  expect(await page.inputValue("#ctx-pe")).toBe("22");
  await page.fill("#ctx-pe", "24.5");
  expect(await page.inputValue("#ctx-pe")).toBe("24.5");
  await page.fill("#ctx-avg", "19");
  expect(await page.locator('[aria-label="Valuation context"]').innerText()).toMatch(/A PE of 24\.5 is 29% above the long-run level/);
});

test("stale data (older than 3 trading days): Manual with the reason, even though NSE's figures exist", async ({ page }) => {
  await open(page, { ...FRESH!, asOfDate: "2026-11-05", tradingDaysOld: 5, stale: true });
  expect(await sources(page)).toEqual(["Manual", "Manual"]);
  expect(await detail(page)).toMatch(/05 Nov 2026\) is 5 trading days old, more than 3/);
  expect(await page.inputValue("#ctx-pe"), "the stale 20.62 is not used").toBe("22");
  await page.fill("#ctx-pe", "23");
  expect(await page.inputValue("#ctx-pe")).toBe("23");
  await expect(page.getByRole("button", { name: "Use NSE’s figures again" }), "no way back to figures that are too old").toHaveCount(0);
});

test("a value typed over NSE's is labelled Manual, wins, and can be handed back to NSE", async ({ page }) => {
  await open(page, FRESH);
  await page.fill("#ctx-pe", "25");
  expect(await sources(page)).toEqual(["Manual", "Median of 40 stored days"]);
  expect(await page.inputValue("#ctx-pe")).toBe("25");
  await page.getByRole("button", { name: "Use NSE’s figures again" }).click();
  expect(await sources(page)).toEqual(["NSE close, estimated live", "Median of 40 stored days"]);
  expect(await page.inputValue("#ctx-pe")).toBe("20.83");
});

test("history still building: today's P/E is NSE's, the long-run P/E is Manual and says how many days are stored", async ({ page }) => {
  await open(page, { ...FRESH!, medianPE: null, historyDays: 7 });
  expect(await sources(page)).toEqual(["NSE close, estimated live", "Manual"]);
  expect(await detail(page)).toContain("Only 7 days of history are stored; a median needs 20");
  expect(await page.inputValue("#ctx-avg")).toBe("20");
});

test("the panel does not scroll the page sideways at 360px", async ({ page }) => {
  await open(page, FRESH);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
