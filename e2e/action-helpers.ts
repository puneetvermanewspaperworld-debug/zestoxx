import { expect, type Locator, type Page } from "@playwright/test";
import { mockMarket } from "./chart-helpers";

/** Shared by the specs for the phone's action screens: the app on a phone, with the market and the server mocked, and the live price changeable. */
export const phone = (w = 390, h = 844) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });

export interface Mocked {
  puts: Record<string, unknown>[];
  px: { RELIANCE: number; TCS: number };
}

export interface PortfolioBlob {
  watchlist?: string[];
  cash?: number;
  holdings?: Record<string, { qty: number; avgPrice: number }>;
  orderLog?: unknown[];
  alerts?: unknown[];
  openOrders?: unknown[];
  notes?: Record<string, string>;
  sips?: unknown[];
  lists?: { name: string; symbols: string[] }[];
}

export const account = (o: PortfolioBlob = {}): PortfolioBlob => ({ watchlist: ["RELIANCE", "TCS"], cash: 1_000_000, holdings: {}, orderLog: [], alerts: [], ...o });

export async function openApp(page: Page, path = "/app/watchlist", portfolio: PortfolioBlob = account(), extra?: (page: Page) => Promise<void>): Promise<Mocked> {
  await mockMarket(page);
  const puts: Record<string, unknown>[] = [];
  const px = { RELIANCE: 1500, TCS: 4200 };
  await page.route("**/api/portfolio", (r) => {
    if (r.request().method() === "PUT") {
      puts.push(JSON.parse(r.request().postData() ?? "{}"));
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: portfolio });
  });
  await page.route("**/api/market-data?asset=equity", (r) => r.fulfill({ json: { RELIANCE: { price: px.RELIANCE, prevClose: 1490 }, TCS: { price: px.TCS, prevClose: 4100 }, NIFTY50: { price: 25250, prevClose: 25200 } } }));
  await page.route("**/api/symbol-detail**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/quotes**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/watchlist?symbols=**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  if (extra) await extra(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-content").waitFor();
  const x = page.getByTestId("guest-notice-dismiss");
  if (await x.count()) await x.click();
  await page.waitForTimeout(1000);
  return { puts, px };
}

export const lastPut = (puts: Record<string, unknown>[]) =>
  puts[puts.length - 1] as { cash?: number; holdings?: Record<string, { qty: number; avgPrice: number }>; openOrders?: Record<string, unknown>[]; alerts?: Record<string, unknown>[]; notes?: Record<string, string>; sips?: unknown[]; orderLog?: Record<string, unknown>[] } | undefined;

/** the row sheet of a watchlist symbol */
export async function openSheet(page: Page, symbol: string) {
  await page.getByTestId(`wl-open-${symbol}`).click();
  await expect(page.getByTestId("symbol-sheet")).toBeVisible();
}

export const screen = (page: Page) => page.getByTestId("action-screen");

/** Type into a field one character at a time, letting the app's 2 s price tick run between characters: the field must keep focus and end with the whole text. */
export async function typeKeepingFocus(page: Page, field: Locator, text: string): Promise<string> {
  await field.tap();
  await field.press("Control+a");
  await field.press("Backspace");
  let typed = "";
  for (const ch of text) {
    await page.keyboard.type(ch);
    typed += ch;
    await page.clock.runFor(2600);
    await page.waitForTimeout(100);
    expect(await field.evaluate((e) => e === document.activeElement), `still focused after typing "${typed}"`).toBe(true);
  }
  return field.inputValue();
}

/** let the clock run so the app's next price pull and tick happen */
export async function tick(page: Page) {
  await page.clock.runFor(30_000);
  await page.clock.runFor(5_000);
  await page.waitForTimeout(400);
}
