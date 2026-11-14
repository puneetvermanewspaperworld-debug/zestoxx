import { expect, type Page } from "@playwright/test";

/** Shared by the chart specs: mocked market data (daily bars shaped like Upstox's, 4-hour bars like CoinGecko's) and drawing helpers. */
export const OPEN = new Date("2026-11-11T13:50:00+05:30");
const IST_MIDNIGHT = (iso: string) => Date.parse(`${iso}T00:00:00+05:30`);

/** n weekday bars ending 12 Nov 2026: [epoch ms at 00:00 IST, open, high, low, close, volume] */
export function dailyBars(n: number, start: number, volume = 1_000_000) {
  const days: string[] = [];
  for (let d = Date.parse("2026-11-12T00:00:00Z"); days.length < n; d -= 86_400_000) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) days.unshift(new Date(d).toISOString().slice(0, 10));
  }
  return days.map((day, i) => {
    const c = start + i * 0.8 + Math.sin(i / 4) * 12;
    return [IST_MIDNIGHT(day), c - 2, c + 5, c - 5, c, volume === 0 ? 0 : volume + i * 100];
  });
}
/** a bar's time as the app stores it: the calendar day (IST) at 00:00 UTC, in seconds */
export const barTime = (ms: number) => Math.floor((ms + 19_800_000) / 86_400_000) * 86_400;

export function fourHourBars() {
  return Array.from({ length: 180 }, (_, i) => {
    const c = 90000 + i * 25 + Math.sin(i / 3) * 500;
    return [Date.UTC(2026, 9, 15, 8) + i * 4 * 3_600_000, c - 40, c + 90, c - 90, c];
  });
}

export const RELIANCE_BARS = dailyBars(271, 1400);

export async function mockMarket(page: Page, opts: { lot?: number | null } = {}) {
  await page.clock.install({ time: OPEN });
  await page.route("**/api/symbol-depth**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/option-expiries**", (r) => r.fulfill({ json: opts.lot ? { source: "live", expiries: ["2026-11-17"], lot: opts.lot } : { source: "unavailable" } }));
  await page.route("**/api/market-data?asset=equity", (r) =>
    r.fulfill({ json: { RELIANCE: { price: 1500, prevClose: 1490 }, TCS: { price: 4200, prevClose: 4100 }, NIFTY50: { price: 25250, prevClose: 25200 } } })
  );
  await page.route("**/api/market-data?asset=crypto", (r) => r.fulfill({ json: { BTC: { price: 91500, prevClose: 90500 } } }));
  await page.route("**/api/market-data?asset=equity-ohlc", (r) =>
    r.fulfill({ json: { RELIANCE: RELIANCE_BARS, TCS: dailyBars(271, 4000), NIFTY50: dailyBars(271, 24500, 0) } })
  );
  await page.route("**/api/market-data?asset=crypto-ohlc", (r) => r.fulfill({ json: { BTC: fourHourBars() } }));
}

export interface StoredDrawing {
  id: string;
  kind: string;
  color: string;
  width: number;
  dash: string;
  locked: boolean;
  price?: number;
  a?: { time: number; price: number };
  b?: { time: number; price: number };
  at?: { time: number; price: number };
  offset?: number;
  midline?: boolean;
  text?: string;
}

export const stored = async (page: Page, symbol = "RELIANCE"): Promise<StoredDrawing[]> =>
  page.evaluate((s) => {
    const raw = localStorage.getItem(`zestoxx:drawings:v1:${s}`);
    return raw ? JSON.parse(raw).drawings : [];
  }, symbol);

/** the autosave is debounced: wait until the browser holds `n` drawings */
export const waitStored = async (page: Page, n: number, symbol = "RELIANCE") => {
  await expect.poll(async () => (await stored(page, symbol)).length, { timeout: 8000 }).toBe(n);
  return stored(page, symbol);
};

export async function openTrade(page: Page, symbol = "RELIANCE", opts: { lot?: number | null } = {}) {
  await mockMarket(page, opts);
  await page.goto(`/app/trade/${symbol}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
  await expect.poll(async () => JSON.parse((await page.getByTestId("trade-chart").getAttribute("data-series")) ?? "{}").bars ?? 0, { timeout: 20_000 }).toBeGreaterThan(200);
  await page.getByTestId("drawing-layer").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);
}

export const layerBox = async (page: Page) => (await page.getByTestId("drawing-layer").boundingBox())!;
export const at = (box: { x: number; y: number; width: number; height: number }, fx: number, fy: number) => ({ x: box.x + fx * box.width, y: box.y + fy * box.height });

/** pick a tool and tap the given points (fractions of the plot area) */
export async function place(page: Page, tool: string, pts: [number, number][]) {
  await page.getByTestId(`tool-${tool}`).click();
  const box = await layerBox(page);
  for (const [fx, fy] of pts) {
    const p = at(box, fx, fy);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(60);
  }
}

/** drag from one point to another with the mouse */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export const centre = async (page: Page, testId: string, index = 0) => {
  const b = await page.getByTestId(testId).nth(index).boundingBox();
  if (!b) throw new Error(`${testId} not visible`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** the screen position of (bar index, price), from the scale the drawing layer publishes */
export async function spot(page: Page, barIndex: number, price: number) {
  const box = await layerBox(page);
  const s = JSON.parse((await page.getByTestId("drawing-layer").getAttribute("data-scale")) ?? "{}") as { x0: number; x100: number; y1: number; y1000: number };
  return { x: box.x + s.x0 + ((s.x100 - s.x0) * barIndex) / 100, y: box.y + s.y1 + ((s.y1000 - s.y1) * (price - 1)) / 999 };
}

/** tap a tool, then tap each (bar index, price) */
export async function placeAt(page: Page, tool: string, pts: [number, number][]) {
  await page.getByTestId(`tool-${tool}`).click();
  for (const [i, p] of pts) {
    const s = await spot(page, i, p);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(60);
  }
}
