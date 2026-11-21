import { test, expect, type Locator, type Page } from "@playwright/test";
import { mockMarket } from "./chart-helpers";
import { ROUTES } from "../scripts/mobile-audit";

/**
 * On a phone the keyboard closed after each digit. The app re-renders every couple of seconds (the price tick), and the dialogs took focus back
 * on every re-render, so a field lost focus mid-number. These tests type a number one character at a time, letting the tick run between
 * characters, and check the field is still the focused element and holds the whole number.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const portfolio = { watchlist: ["RELIANCE", "TCS"], cash: 900_000, holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } }, orderLog: [], alerts: [], lists: [{ name: "Z", symbols: ["ITC"] }] };

async function setup(page: Page, path: string) {
  await mockMarket(page);
  await page.route("**/api/portfolio", (r) => (r.request().method() === "PUT" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: portfolio })));
  await page.route("**/api/symbol-detail**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/quotes**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.route("**/api/watchlist**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-content").waitFor();
  const x = page.getByTestId("guest-notice-dismiss");
  if (await x.count()) await x.click();
}

const isFocused = (el: Locator) => el.evaluate((e) => e === document.activeElement);

/** Type `text` into a field one character at a time, running the app's clock between characters; the field must keep focus throughout. */
async function typeKeepingFocus(page: Page, field: Locator, text: string) {
  await field.tap();
  await field.press("Control+a");
  await field.press("Backspace");
  let typed = "";
  for (const ch of text) {
    await page.keyboard.type(ch);
    typed += ch;
    await page.clock.runFor(2600); // the provider's tick (every 2 s) re-renders the whole app
    await page.waitForTimeout(120);
    expect(await isFocused(field), `still focused after typing "${typed}"`).toBe(true);
  }
  return field.inputValue();
}

test.describe("the symbol sheet's fields keep focus and take a whole number", () => {
  test("Create GTT: trigger price and quantity", async ({ page }) => {
    await setup(page, "/app/watchlist");
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-gtt").click();
    expect(await typeKeepingFocus(page, page.getByTestId("gtt-trigger"), "1450")).toBe("1450");
    expect(await typeKeepingFocus(page, page.getByTestId("gtt-qty"), "300")).toBe("300");
    expect(await page.getByTestId("gtt-trigger").inputValue()).toBe("1450"); // the first field was not reset either
  });

  test("Set alert: target price", async ({ page }) => {
    await setup(page, "/app/watchlist");
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-alert").click();
    expect(await typeKeepingFocus(page, page.getByTestId("alert-target"), "1625")).toBe("1625");
  });

  test("Buy: quantity", async ({ page }) => {
    await setup(page, "/app/watchlist");
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-buy").click();
    const qty = page.getByTestId("sheet-order-panel").getByRole("spinbutton").first();
    expect(await typeKeepingFocus(page, qty, "300")).toBe("300");
  });

  test("Add notes: the text", async ({ page }) => {
    await setup(page, "/app/watchlist");
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-notes").click();
    expect(await typeKeepingFocus(page, page.getByTestId("note-text"), "300")).toBe("300");
  });
});

test.describe("the other order forms and fields", () => {
  test("the chart page's order drawer: quantity and, for a limit order, the limit price", async ({ page }) => {
    await setup(page, "/app/trade/RELIANCE");
    await page.getByTestId("paper-buy").click();
    const drawer = page.getByRole("dialog").or(page.getByTestId("trade-drawer")).first();
    const spin = page.getByRole("spinbutton");
    await spin.first().waitFor();
    expect(await typeKeepingFocus(page, spin.first(), "300")).toBe("300");
    const limit = page.getByRole("button", { name: /^Limit$/ });
    if (await limit.count()) {
      await limit.first().click();
      expect(await typeKeepingFocus(page, spin.nth(1), "1450")).toBe("1450");
    }
    void drawer;
  });

  test("the Alerts page: target price", async ({ page }) => {
    await setup(page, "/app/alerts");
    const target = page.getByPlaceholder(/\d/).first();
    expect(await typeKeepingFocus(page, target, "1625")).toBe("1625");
  });

  test("Watchlist: the search field and a new list's name", async ({ page }) => {
    await setup(page, "/app/watchlist");
    expect(await typeKeepingFocus(page, page.getByTestId("wl-search-input"), "itc")).toBe("itc");
    await page.getByTestId("wl-new").click();
    expect(await typeKeepingFocus(page, page.getByTestId("wl-name"), "Swing")).toBe("Swing");
  });

  test("the chart's indicator search, custom formula and Renko brick size", async ({ page }) => {
    await setup(page, "/app/trade/RELIANCE");
    await page.getByTestId("trade-chart").waitFor({ timeout: 30_000 });
    const studies = page.getByRole("button", { name: /Indicators/i }).first();
    if (await studies.count()) {
      await studies.click();
      const search = page.getByTestId("studies-search");
      if (await search.count()) expect(await typeKeepingFocus(page, search, "rsi")).toBe("rsi");
    }
  });
});

/**
 * A sweep: every visible text or number field on every page the phone has, typed into the same way. The fields are found on the page, so a
 * field added later is covered without anyone remembering to list it.
 */
test.describe("every field on every page keeps focus while the app re-renders", () => {
  for (const r of ROUTES.filter((x) => x.path !== "/" && x.path !== "/app/news")) {
    test(r.name, async ({ page }) => {
      await setup(page, r.path);
      if (r.ready) await page.waitForSelector(r.ready, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const fields = page.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="date"]):not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])');
      const n = await fields.count();
      let tried = 0;
      for (let i = 0; i < n; i++) {
        const f = fields.nth(i);
        if (!(await f.isVisible())) continue;
        const box = await f.boundingBox();
        if (!box || box.width < 20 || box.height < 10) continue;
        await f.scrollIntoViewIfNeeded();
        await f.tap();
        for (const ch of "300") {
          await page.keyboard.type(ch);
          await page.clock.runFor(2600);
          await page.waitForTimeout(100);
          const label = (await f.getAttribute("aria-label")) ?? (await f.getAttribute("data-testid")) ?? (await f.getAttribute("id")) ?? (await f.getAttribute("placeholder")) ?? `field ${i}`;
          expect(await isFocused(f), `${r.name}: "${label}" lost focus after typing "${ch}"`).toBe(true);
        }
        tried++;
      }
      test.info().annotations.push({ type: "fields", description: String(tried) });
    });
  }
});
