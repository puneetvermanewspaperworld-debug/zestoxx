import { test, expect, type Page } from "@playwright/test";
import { simulateChain } from "../lib/options";
import { account, openApp, phone } from "./action-helpers";

/** Small fixes: the GTT note is short, the end of every action screen clears its bottom button, and money has two decimals. */

const EXPIRY = "2026-11-26";
const chain = { ...simulateChain("NIFTY50", 25250, EXPIRY, new Date("2026-11-11T08:20:00Z")), source: "live", expiry: EXPIRY, expiries: [EXPIRY] };
const chainRoutes = async (p: Page) => {
  await p.route("**/api/options-chain**", (r) => r.fulfill({ json: chain }));
  await p.route("**/api/option-expiries**", (r) => r.fulfill({ json: { source: "live", expiries: [EXPIRY], lot: chain.lotSize } }));
  await p.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
};

const SCREENS: [string, string][] = [
  ["order", "/app/watchlist?act=order&s=RELIANCE&side=buy"],
  ["limit order", "/app/watchlist?act=order&s=RELIANCE&side=buy"],
  ["gtt", "/app/watchlist?act=gtt&s=RELIANCE"],
  ["alert", "/app/watchlist?act=alert&s=RELIANCE"],
  ["note", "/app/watchlist?act=note&s=RELIANCE"],
  ["option", `/app/options?act=option&u=NIFTY50&x=${EXPIRY}&k=25250&t=CE&side=buy`],
  ["sip", "/app/orders?act=sip"],
];

for (const [w, h] of [[360, 800], [390, 844], [844, 390]] as const) {
  test.describe(`at ${w}x${h}`, () => {
    test.use(phone(w, h));

    for (const [name, path] of SCREENS) {
      test(`the end of the ${name} screen is not under the bottom button`, async ({ page }) => {
        await openApp(page, path, account(), chainRoutes);
        if (name === "limit order") {
          await page.getByTestId("mode-limit").click();
          await page.getByTestId("order-limit").fill("1450");
          await page.getByTestId("action-submit").click(); // an error message and the long form
        }
        await expect(page.getByTestId("action-screen")).toBeVisible();
        const body = page.getByTestId("action-body");
        await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
        const m = await page.evaluate(() => {
          const body = document.querySelector('[data-testid="action-body"]')!;
          const foot = document.querySelector('[data-testid="action-submit"], [data-testid="action-done"]')!.getBoundingClientRect();
          const kids = [...body.children].filter((c) => (c as HTMLElement).offsetHeight > 0);
          const last = kids[kids.length - 1].getBoundingClientRect();
          return { lastBottom: last.bottom, footTop: foot.top, canScroll: body.scrollHeight > body.clientHeight };
        });
        expect(m.lastBottom, "the last line ends above the button").toBeLessThanOrEqual(m.footTop - 8);
      });
    }

    test("the GTT note is about two lines, and Learn more opens the rest", async ({ page }) => {
      test.skip(w > 500, "the 2-line promise is for the upright phone");
      await openApp(page, "/app/watchlist?act=gtt&s=RELIANCE", account());
      const note = page.getByTestId("gtt-note");
      const lines = await note.evaluate((el) => {
        const cs = getComputedStyle(el);
        return (el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth)) / parseFloat(cs.lineHeight);
      });
      expect(lines, "lines of text").toBeLessThanOrEqual(2.2);
      await expect(page.getByTestId("gtt-learn")).toHaveText("Learn more");
      await expect(page.getByTestId("gtt-learn-text")).toHaveCount(0);
      await page.getByTestId("gtt-learn").click();
      await expect(page.getByTestId("gtt-learn-text")).toContainText("fills at the first candle that crossed the trigger");
      await expect(page.getByTestId("gtt-learn-text")).toContainText("it is cancelled");
      await expect(page.getByTestId("gtt-learn")).toHaveText("Show less");
    });
  });
}

test.describe("money", () => {
  test.use(phone());
  test("amounts and prices show two decimals everywhere on the portfolio and the order screen", async ({ page }) => {
    await openApp(page, "/app/portfolio", account({ cash: 987165.1, holdings: { RELIANCE: { qty: 10, avgPrice: 1400.5 } } }));
    await expect(page.getByTestId("pf-cash")).toHaveText("₹9,87,165.10");
    await expect(page.getByTestId("pf-row-RELIANCE")).toContainText("10 @ ₹1,400.50");
    await page.getByTestId("pf-add-RELIANCE").click();
    await expect(page.getByTestId("strip-price")).toHaveText("₹1,500.00");
    await expect(page.getByTestId("funds-available")).toHaveText("₹9,87,165.10");
  });
});
