import { test, expect, type Page } from "@playwright/test";
import { mockMarket } from "./chart-helpers";

/**
 * The phone shell: a bottom bar of Watchlist, Orders, Portfolio, Explore and Account, with the Watchlist as the home screen; lists with search
 * and add; the symbol sheet; Orders with GTT and stop-loss; Portfolio with Holdings and Positions and the privacy eye; Account; Explore. The
 * market and the server are mocked. Desktop (1000 px and up) keeps its sidebar.
 */
const phone = (w: number, h: number) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });

interface Opts {
  portfolio?: Record<string, unknown> | null;
  /** nearest option expiry returned for the indices (YYYY-MM-DD) */
  expiry?: string;
  candles?: { source: "live"; bars: number[][] } | { source: "unavailable" };
  chain?: Record<string, unknown>;
}

/** Everything the app asks the server for, answered: the market (clock fixed on Wed 11 Nov 2026, 13:50 IST), the saved portfolio, search, prices of other symbols, depth. */
async function mock(page: Page, o: Opts = {}) {
  await mockMarket(page);
  const puts: Record<string, unknown>[] = [];
  const px = { RELIANCE: 1500 };
  await page.route("**/api/portfolio", (r) => {
    if (r.request().method() === "PUT") {
      puts.push(JSON.parse(r.request().postData() ?? "{}"));
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: o.portfolio ?? null });
  });
  await page.route("**/api/market-data?asset=equity", (r) => r.fulfill({ json: { RELIANCE: { price: px.RELIANCE, prevClose: 1490 }, TCS: { price: 4200, prevClose: 4100 }, NIFTY50: { price: 25250, prevClose: 25200 }, BANKNIFTY: { price: 56000, prevClose: 55800 }, SENSEX: { price: 82000, prevClose: 81900 } } }));
  await page.route("**/api/option-expiries**", (r) => r.fulfill({ json: o.expiry ? { source: "live", expiries: [o.expiry, "2026-11-26"], lot: 75 } : { source: "unavailable" } }));
  await page.route("**/api/watchlist-search**", (r) => {
    const q = (new URL(r.request().url()).searchParams.get("q") ?? "").toLowerCase();
    const all = [
      { symbol: "ITC", name: "ITC Ltd", kind: "equity", fno: true },
      { symbol: "NIFTYBEES", name: "Nippon Nifty ETF", kind: "etf", fno: false },
      { symbol: "IDX NIFTY PVT BANK", name: "Nifty Pvt Bank", kind: "index", fno: false },
      { symbol: "NIFTY50", name: "Nifty 50", kind: "index", fno: true },
      { symbol: "TCS", name: "Tata Consultancy Services", kind: "equity", fno: true },
    ];
    return r.fulfill({ json: { results: all.filter((x) => x.symbol.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)) } });
  });
  // the other symbols' prices (any NSE symbol, an index): 100 + a number per symbol, +1.5 % each
  await page.route(/\/api\/watchlist\?symbols=/, (r) => {
    const syms = decodeURIComponent(new URL(r.request().url()).searchParams.get("symbols") ?? "").split(",").filter(Boolean);
    return r.fulfill({ json: { source: "live", asOf: "x", rows: syms.map((s, i) => ({ symbol: s, name: s === "ITC" ? "ITC Ltd" : s.replace(/^IDX /, ""), ltp: 400 + i, change: 6, changePct: 1.5, volume: 1000 })) } });
  });
  await page.route("**/api/symbol-detail**", (r) => {
    const sym = new URL(r.request().url()).searchParams.get("symbol");
    if (sym === "NIFTY50") return r.fulfill({ json: { source: "live", ltp: 25250, ohlc: { open: 25200, high: 25300, low: 25150 }, depth: null } });
    if (sym === "TCS") return r.fulfill({ json: { source: "unavailable" } });
    if (sym === "ITC") return r.fulfill({ json: { source: "live", ltp: 400, ohlc: { open: 0, high: 0, low: 0 }, depth: { bids: [{ price: 0, qty: 0, orders: 0 }], asks: [{ price: 0, qty: 0, orders: 0 }] } } });
    return r.fulfill({ json: { source: "live", ltp: 1500, ohlc: { open: 1490, high: 1512, low: 1481 }, depth: { bids: [{ price: 1499.9, qty: 120, orders: 3 }, { price: 1499.85, qty: 80, orders: 2 }], asks: [{ price: 1500.05, qty: 60, orders: 1 }], totalBuyQty: 200, totalSellQty: 60 } } });
  });
  if (o.candles) await page.route("**/api/candles**", (r) => r.fulfill({ json: o.candles }));
  if (o.chain) await page.route("**/api/options-chain**", (r) => r.fulfill({ json: o.chain }));
  return { puts, px };
}

async function go(page: Page, path: string, o: Opts = {}) {
  const m = await mock(page, o);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-content").waitFor();
  await page.waitForTimeout(800);
  return m;
}

const dismissNotice = async (page: Page) => {
  const x = page.getByTestId("guest-notice-dismiss");
  if (await x.count()) await x.click();
};
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.describe("bottom bar and home", () => {
  test.use(phone(390, 844));

  test("the bar has Watchlist, Orders, Portfolio, Explore and Account, and no Trade or More", async ({ page }) => {
    await go(page, "/app/watchlist");
    const nav = page.getByTestId("bottom-nav");
    await expect(nav.getByRole("link")).toHaveText(["Watchlist", "Orders", "Portfolio", "Explore", "Account"]);
    for (const name of ["Trade", "More", "Dashboard", "Pulse"]) await expect(nav.getByRole("link", { name })).toHaveCount(0);
    for (const l of await nav.getByRole("link").all()) {
      const b = (await l.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(43.5);
      expect(b.width).toBeGreaterThanOrEqual(43.5);
    }
    await expect(page.getByTestId("nav-watchlist")).toHaveAttribute("aria-current", "page");
    for (const [id, url, heading] of [["orders", "/app/orders", "Orders"], ["portfolio", "/app/portfolio", "Portfolio"], ["explore", "/app/explore", "Explore"], ["account", "/app/account", "Account"], ["watchlist", "/app/watchlist", "Watchlist"]] as const) {
      await page.getByTestId(`nav-${id}`).click();
      await expect(page).toHaveURL(new RegExp(url + "$"));
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(page.getByTestId(`nav-${id}`)).toHaveAttribute("aria-current", "page");
    }
  });

  test("a phone opens on the Watchlist", async ({ page }) => {
    await mock(page);
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/app\/watchlist$/);
    await expect(page.getByTestId("phone-watchlist")).toBeVisible();
  });

  test("pages that are not tabs belong to Explore: the bar keeps Explore lit", async ({ page }) => {
    await go(page, "/app/pulse");
    await expect(page.getByTestId("nav-explore")).toHaveAttribute("aria-current", "page");
  });
});

test.describe("desktop keeps the sidebar", () => {
  for (const [w, h] of [[1280, 800], [1000, 700]] as const) {
    test(`at ${w}x${h}: the sidebar with Trade, no bottom bar, and /app opens the Dashboard`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await mock(page);
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/app\/dashboard$/);
      await expect(page.getByRole("link", { name: "Trade" }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();
      await expect(page.getByTestId("bottom-nav")).toBeHidden();
      await page.goto("/app/watchlist", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("phone-watchlist")).toHaveCount(0); // the desktop watchlist
      await expect(page.getByTestId("bottom-nav")).toBeHidden();
    });
  }
  test("a phone turned sideways has the bottom bar and no sidebar", async ({ browser }) => {
    const ctx = await browser.newContext(phone(844, 390));
    const page = await ctx.newPage();
    await go(page, "/app/watchlist");
    await expect(page.getByTestId("bottom-nav")).toBeVisible();
    await expect(page.getByRole("link", { name: "Trade" })).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("watchlists", () => {
  test.use(phone(390, 844));

  test("lists, a count out of 250, a New list action, and live price and change on each row", async ({ page }) => {
    await go(page, "/app/watchlist");
    await dismissNotice(page);
    await expect(page.getByTestId("wl-count")).toHaveText("5/250");
    await expect(page.getByTestId("wl-tab-My Watchlist")).toHaveAttribute("aria-selected", "true");
    for (const s of ["RELIANCE", "TCS", "NIFTY50", "BANKNIFTY", "BTC"]) {
      await expect(page.getByTestId(`wl-row-${s}`)).toBeVisible();
      await expect(page.getByTestId(`wl-price-${s}`)).toHaveText(/\d/);
      await expect(page.getByTestId(`wl-chg-${s}`)).toHaveText(/[+−-]?\d+\.\d\d%/);
    }
    await expect(page.getByTestId("wl-price-RELIANCE")).toHaveText("₹1,500");
    // New list
    await page.getByTestId("wl-new").click();
    await page.getByTestId("wl-name").fill("Banks");
    await page.getByTestId("wl-create").click();
    await expect(page.getByTestId("wl-tab-Banks")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("wl-count")).toHaveText("0/250");
    await expect(page.getByTestId("wl-empty")).toBeVisible();
    // a name that is taken, and a blank one, are refused
    await page.getByTestId("wl-new").click();
    await page.getByTestId("wl-name").fill("banks");
    await page.getByTestId("wl-create").click();
    await expect(page.getByTestId("wl-create-error")).toContainText("already exists");
    await page.getByTestId("wl-name").fill("");
    await page.getByTestId("wl-create").click();
    await expect(page.getByTestId("wl-create-error")).toContainText("name");
  });

  test("search finds equities, ETFs and indices (tagging F&O), adds to the open list, and the row shows a live price", async ({ page }) => {
    const { puts } = await go(page, "/app/watchlist");
    await dismissNotice(page);
    await page.getByTestId("wl-new").click();
    await page.getByTestId("wl-name").fill("Mine");
    await page.getByTestId("wl-create").click();
    await page.getByTestId("wl-search-input").fill("nifty");
    const results = page.getByTestId("wl-results");
    await expect(results).toBeVisible();
    await expect(results.getByTestId("wl-result-NIFTYBEES")).toContainText("ETF");
    await expect(results.getByTestId("wl-result-IDX NIFTY PVT BANK")).toContainText("Index");
    await expect(results.getByTestId("wl-result-NIFTY50")).toContainText("F&O");
    for (const li of await results.getByRole("button").all()) expect((await li.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await results.getByTestId("wl-result-IDX NIFTY PVT BANK").click();
    await expect(page.getByTestId("wl-search-message")).toContainText("added to Mine");
    await expect(page.getByTestId("wl-row-IDX NIFTY PVT BANK")).toBeVisible();
    await expect(page.getByTestId("wl-price-IDX NIFTY PVT BANK")).toHaveText(/\d/); // priced by the server
    await expect(page.getByTestId("wl-chg-IDX NIFTY PVT BANK")).toHaveText("+1.50%");
    await expect(page.getByTestId("wl-count")).toHaveText("1/250");
    // an F&O stock too
    await page.getByTestId("wl-search-input").fill("itc");
    await page.getByTestId("wl-result-ITC").click();
    await expect(page.getByTestId("wl-row-ITC")).toBeVisible();
    // and it is saved with the guest's portfolio
    await expect.poll(() => puts.length).toBeGreaterThan(0);
    const last = puts[puts.length - 1] as { lists: { name: string; symbols: string[] }[] };
    expect(last.lists).toEqual([{ name: "Mine", symbols: ["IDX NIFTY PVT BANK", "ITC"] }]);
    // a symbol already in the list says Added and cannot be added twice
    await page.getByTestId("wl-search-input").fill("itc");
    await expect(page.getByTestId("wl-result-ITC")).toBeDisabled();
  });

  test("My Watchlist holds the symbols Zestoxx can chart: another symbol is refused with a way out", async ({ page }) => {
    await go(page, "/app/watchlist");
    await dismissNotice(page);
    await page.getByTestId("wl-search-input").fill("itc");
    await page.getByTestId("wl-result-ITC").click();
    await expect(page.getByTestId("wl-search-message")).toContainText("another list");
    await expect(page.getByTestId("wl-count")).toHaveText("5/250");
  });

  test("Edit moves rows up and down (kept, saved) and removes them; every button is 44 px", async ({ page }) => {
    const { puts } = await go(page, "/app/watchlist");
    await dismissNotice(page);
    await page.getByTestId("wl-edit").click();
    for (const id of ["wl-up-TCS", "wl-down-TCS", "wl-remove-TCS"]) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.width, id).toBeGreaterThanOrEqual(43.5);
      expect(b.height, id).toBeGreaterThanOrEqual(43.5);
    }
    await expect(page.getByTestId("wl-up-RELIANCE")).toBeDisabled();
    await expect(page.getByTestId("wl-down-BTC")).toBeDisabled();
    const order = () => page.locator('[data-testid^="wl-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(7)));
    expect(await order()).toEqual(["RELIANCE", "TCS", "NIFTY50", "BANKNIFTY", "BTC"]);
    await page.getByTestId("wl-up-TCS").click();
    expect(await order()).toEqual(["TCS", "RELIANCE", "NIFTY50", "BANKNIFTY", "BTC"]);
    await page.getByTestId("wl-down-RELIANCE").click();
    expect(await order()).toEqual(["TCS", "NIFTY50", "RELIANCE", "BANKNIFTY", "BTC"]);
    await page.getByTestId("wl-remove-BTC").click();
    await expect(page.getByTestId("wl-count")).toHaveText("4/250");
    await expect.poll(() => (puts[puts.length - 1] as { watchlist: string[] } | undefined)?.watchlist).toEqual(["TCS", "NIFTY50", "RELIANCE", "BANKNIFTY"]);
    // a custom list can be deleted, after asking
    await page.getByTestId("wl-edit").click();
    await page.getByTestId("wl-new").click();
    await page.getByTestId("wl-name").fill("Temp");
    await page.getByTestId("wl-create").click();
    await page.getByTestId("wl-edit").click();
    await page.getByTestId("wl-delete").click();
    await expect(page.getByTestId("wl-tab-Temp")).toBeVisible();
    await page.getByTestId("wl-delete-confirm").click();
    await expect(page.getByTestId("wl-tab-Temp")).toHaveCount(0);
    await expect(page.getByTestId("wl-tab-My Watchlist")).toHaveAttribute("aria-selected", "true");
  });

  test("a saved portfolio's lists come back, in order, for this guest", async ({ page }) => {
    await go(page, "/app/watchlist", { portfolio: { watchlist: ["TCS", "RELIANCE"], cash: 1_000_000, holdings: {}, orderLog: [], alerts: [], lists: [{ name: "Banks", symbols: ["IDX NIFTY PVT BANK", "ITC"] }, { name: "Two", symbols: [] }] } });
    await dismissNotice(page);
    await expect(page.getByTestId("wl-count")).toHaveText("2/250");
    await expect(page.locator('[role=tab][data-testid^="wl-tab-"]')).toHaveText(["My Watchlist", "Banks", "Two"]);
    await page.getByTestId("wl-tab-Banks").click();
    await expect(page.locator('[data-testid^="wl-row-"]')).toHaveCount(2);
    await expect(page.getByTestId("wl-count")).toHaveText("2/250");
  });
});

test.describe("the symbol sheet", () => {
  test.use(phone(390, 844));

  test("name, price and change, Buy and Sell, View chart, Option chain, Set alert, Add notes, Create GTT, depth, Show 20 depth, and the day's range", async ({ page }) => {
    await go(page, "/app/watchlist");
    await dismissNotice(page);
    await page.getByTestId("wl-open-RELIANCE").click();
    const sheet = page.getByTestId("symbol-sheet");
    await expect(sheet.getByTestId("sheet-name")).toHaveText("Reliance Industries");
    await expect(sheet.getByTestId("sheet-price")).toHaveText("₹1,500");
    await expect(sheet.getByTestId("sheet-change")).toHaveText(/[+−-]?\d/);
    for (const id of ["sheet-buy", "sheet-sell", "sheet-chart", "sheet-chain", "sheet-alert", "sheet-notes", "sheet-gtt", "show-20-depth"]) {
      const b = (await sheet.getByTestId(id).boundingBox())!;
      await expect(sheet.getByTestId(id), id).toBeVisible();
      expect(b.height, id).toBeGreaterThanOrEqual(43.5);
    }
    await expect(sheet.getByTestId("sheet-buy")).toHaveText("Buy");
    await expect(sheet.getByTestId("sheet-sell")).toHaveText("Sell");
    await expect(sheet.getByTestId("sheet-chart")).toHaveText("View chart");
    await expect(sheet.getByTestId("sheet-chain")).toHaveText("Option chain");
    await expect(sheet.getByTestId("sheet-alert")).toHaveText("Set alert");
    await expect(sheet.getByTestId("sheet-notes")).toHaveText("Add notes");
    await expect(sheet.getByTestId("sheet-gtt")).toHaveText("Create GTT");
    // real depth, five levels at most, and the day's range
    await expect(sheet.getByTestId("depth-levels")).toContainText("1,499.9");
    await expect(sheet.getByTestId("depth-levels")).toContainText("1,500.05");
    await expect(sheet.getByTestId("range-low")).toHaveText("Low ₹1,481");
    await expect(sheet.getByTestId("range-high")).toHaveText("High ₹1,512");
    // Show 20 depth says what it cannot do, instead of rows
    await expect(sheet.getByTestId("depth-20-note")).toHaveCount(0);
    await sheet.getByTestId("show-20-depth").click();
    await expect(sheet.getByTestId("depth-20-note")).toContainText("does not have");
    expect(await noSideways(page)).toBe(true);
  });

  test("depth is real or a message: unavailable, an index, and an empty book never show rows of zeros", async ({ page }) => {
    await go(page, "/app/watchlist");
    await dismissNotice(page);
    // unavailable
    await page.getByTestId("wl-open-TCS").click();
    await expect(page.getByTestId("depth-message")).toContainText("not available");
    await expect(page.getByTestId("depth-levels")).toHaveCount(0);
    await expect(page.getByTestId("range-unavailable")).toBeVisible();
    await page.getByTestId("sheet-close").click();
    // an index: no order book
    await page.getByTestId("wl-open-NIFTY50").click();
    await expect(page.getByTestId("depth-message")).toContainText("no order book");
    await expect(page.getByTestId("range-low")).toHaveText(/^Low .*25,150$/);
    await page.getByTestId("sheet-close").click();
    // an empty book (the feed answers with zero levels)
    await page.getByTestId("wl-new").click();
    await page.getByTestId("wl-name").fill("Z");
    await page.getByTestId("wl-create").click();
    await page.getByTestId("wl-search-input").fill("itc");
    await page.getByTestId("wl-result-ITC").click();
    await page.getByTestId("wl-open-ITC").click();
    await expect(page.getByTestId("depth-levels")).toHaveCount(0);
    await expect(page.getByTestId("depth-message")).toBeVisible();
    await expect(page.getByTestId("range-unavailable")).toBeVisible(); // a day's range of zeros is not shown either
    await expect(page.getByTestId("quote-only-note")).toBeVisible(); // not a symbol Zestoxx charts
    for (const id of ["sheet-buy", "sheet-sell", "sheet-chart", "sheet-alert", "sheet-gtt"]) await expect(page.getByTestId(id)).toBeDisabled();
    await expect(page.getByTestId("sheet-notes")).toBeEnabled();
  });

  test("Buy opens the order form for that symbol; View chart opens the full-screen chart page", async ({ page }) => {
    await go(page, "/app/watchlist");
    await dismissNotice(page);
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-buy").click();
    const panel = page.getByTestId("sheet-order-panel");
    await expect(panel.getByText("Paper Trade")).toBeVisible();
    await panel.getByRole("button", { name: "Paper buy", exact: true }).click();
    await expect(panel.getByText(/Bought 1 RELIANCE/)).toBeVisible();
    await page.getByTestId("sheet-chart").click();
    await expect(page).toHaveURL(/\/app\/trade\/RELIANCE$/);
    await expect(page.getByTestId("trade-screen")).toBeVisible(); // the full-screen chart page
    await page.getByTestId("trade-back").click();
    await expect(page).toHaveURL(/\/app\/watchlist$/);
  });

  test("Add notes saves a note for the symbol, shown in the sheet and kept with the portfolio", async ({ page }) => {
    const { puts } = await go(page, "/app/watchlist");
    await dismissNotice(page);
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-notes").click();
    await page.getByTestId("note-text").fill("Wait for 1,450");
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("saved-note")).toHaveText("Wait for 1,450");
    await expect(page.getByTestId("sheet-notes")).toHaveText("Edit notes");
    await expect.poll(() => (puts[puts.length - 1] as { notes?: Record<string, string> } | undefined)?.notes).toEqual({ RELIANCE: "Wait for 1,450" });
    // a blank note deletes it
    await page.getByTestId("sheet-notes").click();
    await page.getByTestId("note-text").fill("");
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("saved-note")).toHaveCount(0);
  });

  test("Set alert creates a price alert, listed under Orders > Alerts", async ({ page }) => {
    await go(page, "/app/watchlist");
    await dismissNotice(page);
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-alert").click();
    await page.getByTestId("alert-save").click();
    await expect(page.getByTestId("alert-form").getByRole("alert")).toContainText("above 0");
    await page.getByTestId("alert-target").fill("1600");
    await page.getByTestId("alert-save").click();
    await expect(page.getByTestId("alert-form")).toHaveCount(0);
    await page.getByTestId("sheet-close").click();
    await page.getByTestId("nav-orders").click();
    await page.getByTestId("orders-tab-alerts").click();
    await expect(page.getByText("Active Alerts")).toBeVisible();
    await expect(page.getByText(/RELIANCE/).first()).toBeVisible();
  });

  test("the sheet says an index that expires today does", async ({ page }) => {
    await go(page, "/app/watchlist", { expiry: "2026-11-11" });
    await dismissNotice(page);
    await page.getByTestId("wl-open-NIFTY50").click();
    await expect(page.getByTestId("symbol-sheet").getByTestId("expiry-today")).toHaveText("Expiry today");
  });
});

test.describe("orders: GTT and stop-loss", () => {
  test.use(phone(390, 844));
  const seed = { watchlist: ["RELIANCE", "TCS", "NIFTY50", "BANKNIFTY", "BTC"], cash: 900_000, holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } }, orderLog: [{ id: "h", symbol: "RELIANCE", side: "buy", qty: 10, price: 1400, mode: "market", time: "10:00:00 am", orderType: "MARKET", status: "filled", date: "2026-11-02" }], alerts: [] };

  test("the tabs are Open, Executed, GTT, Baskets, SIPs and Alerts; Baskets says it is not available", async ({ page }) => {
    await go(page, "/app/orders");
    await dismissNotice(page);
    await expect(page.getByRole("tab")).toHaveText(["Open", "Executed", "GTT", "Baskets", "SIPs", "Alerts"]);
    await expect(page.getByTestId("no-open-orders")).toBeVisible();
    await page.getByTestId("orders-tab-executed").click();
    await expect(page.getByTestId("no-executed")).toBeVisible();
    await page.getByTestId("orders-tab-gtt").click();
    await expect(page.getByTestId("gtt-explainer")).toContainText("cannot watch prices in the background");
    await expect(page.getByTestId("no-gtt")).toBeVisible();
    await page.getByTestId("orders-tab-baskets").click();
    await expect(page.getByTestId("baskets-empty")).toContainText("not available");
    await page.getByTestId("orders-tab-sips").click();
    await expect(page.getByText(/SIP/i).first()).toBeVisible();
    await page.getByTestId("orders-tab-alerts").click();
    await expect(page.getByText("Set a Price Alert")).toBeVisible();
  });

  test("a stop-loss is created from the symbol sheet, waits under GTT, and can be cancelled", async ({ page }) => {
    const { puts } = await go(page, "/app/watchlist", { portfolio: seed });
    await dismissNotice(page);
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-gtt").click();
    // refused: a trigger at the price, and more than is held
    await page.getByTestId("gtt-trigger").fill("1500");
    await page.getByTestId("gtt-save").click();
    await expect(page.getByTestId("gtt-error")).toContainText("too close");
    await page.getByTestId("gtt-trigger").fill("1450");
    await page.getByTestId("gtt-qty").fill("11");
    await page.getByTestId("gtt-save").click();
    await expect(page.getByTestId("gtt-error")).toContainText("hold 10");
    await page.getByTestId("gtt-qty").fill("5");
    await expect(page.getByTestId("gtt-kind")).toHaveText("Stop-loss: sell 5 when the price reaches ₹1,450");
    await page.getByTestId("gtt-save").click();
    await page.getByTestId("sheet-close").click();
    await page.getByTestId("nav-orders").click();
    await page.getByTestId("orders-tab-gtt").click();
    const card = page.locator('[data-testid^="open-order-"]');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("SELL 5 RELIANCE");
    await expect(card).toContainText("Trigger at or below");
    await expect(card).toContainText("Stop-loss");
    await expect(card).toContainText("till triggered");
    // saved with its trigger, direction and placement time
    await expect.poll(() => (puts[puts.length - 1] as { openOrders?: { orderType: string; trigger: string; limitPrice: number; placedAtMs: number }[] } | undefined)?.openOrders?.[0]).toMatchObject({ orderType: "GTT", trigger: "below", limitPrice: 1450 });
    await card.getByRole("button", { name: /Cancel/ }).click();
    await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="log-order-"]').first()).toContainText("Cancelled"); // the history keeps it
    await page.getByTestId("orders-tab-executed").click();
    await expect(page.locator('[data-testid^="log-order-"]').first()).toContainText("Cancelled");
  });

  test("while the app is open, the price crossing the trigger fills it at that price", async ({ page }) => {
    const { px } = await go(page, "/app/watchlist", { portfolio: seed });
    await dismissNotice(page);
    await page.getByTestId("wl-open-RELIANCE").click();
    await page.getByTestId("sheet-gtt").click();
    await page.getByTestId("gtt-trigger").fill("1480");
    await page.getByTestId("gtt-qty").fill("5");
    await page.getByTestId("gtt-save").click();
    await page.getByTestId("sheet-close").click();
    px.RELIANCE = 1470; // the next quote is under the trigger
    await page.clock.runFor(30_000);
    await page.clock.runFor(5_000);
    await page.getByTestId("nav-orders").click();
    await page.getByTestId("orders-tab-executed").click();
    const row = page.locator('[data-testid^="log-order-"]').first();
    await expect(row).toContainText("SELL 5 RELIANCE", { timeout: 10_000 });
    await expect(row).toContainText("Filled at ₹1,470");
    await expect(row).toContainText("GTT");
    await expect(page.locator('[data-testid^="simulated-"]')).toHaveCount(0); // watched live: not simulated
    await page.getByTestId("orders-tab-gtt").click();
    await expect(page.getByTestId("no-gtt").or(page.locator('[data-testid^="log-order-"]').first())).toBeVisible();
    await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(0);
  });

  const placed = Date.parse("2026-11-09T10:00:00+05:30");
  const gtt = { symbol: "RELIANCE", side: "sell", qty: 5, limitPrice: 1400, time: "10:00:00 am", orderType: "GTT", placedDate: "2026-11-09", trigger: "below", placedAtMs: placed };
  const t = (iso: string) => Date.parse(`${iso}+05:30`);
  const bar = (iso: string, o: number, h: number, l: number, c: number) => [t(iso), o, h, l, c, 1000];

  test("on the next visit it fills at the first candle that crossed the trigger, and says the fill is simulated", async ({ page }) => {
    await go(page, "/app/orders", {
      portfolio: { ...seed, openOrders: [gtt] },
      candles: { source: "live", bars: [bar("2026-11-09T09:20:00", 1500, 1505, 1390, 1400), bar("2026-11-09T10:30:00", 1450, 1452, 1440, 1445), bar("2026-11-10T11:00:00", 1410, 1412, 1395, 1396), bar("2026-11-10T11:05:00", 1396, 1397, 1380, 1385)] },
    });
    await dismissNotice(page);
    // the 09:20 candle low was before the order existed: it is not the one
    await page.getByTestId("orders-tab-executed").click();
    const row = page.locator('[data-testid^="log-order-"]').first();
    await expect(row).toContainText("SELL 5 RELIANCE", { timeout: 15_000 });
    await expect(row).toContainText("Filled at ₹1,400"); // the trigger price (the 11:00 candle opened above it)
    await expect(row).toContainText("10 Nov"); // the day of the candle
    await expect(row.locator('[data-testid^="simulated-"]')).toContainText("Simulated");
    await expect(row.locator('[data-testid^="simulated-"]')).toContainText("cannot watch prices while it is closed");
    await page.getByTestId("orders-tab-gtt").click();
    await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(0);
    await page.getByTestId("nav-portfolio").click();
    await expect(page.getByTestId("pf-cash")).toHaveText(/9,07,000/); // 900,000 + 5 x 1,400
  });

  test("a gap past the trigger fills at that candle's open", async ({ page }) => {
    await go(page, "/app/orders", { portfolio: { ...seed, openOrders: [gtt] }, candles: { source: "live", bars: [bar("2026-11-10T09:15:00", 1380, 1385, 1370, 1375)] } });
    await dismissNotice(page);
    await page.getByTestId("orders-tab-executed").click();
    await expect(page.locator('[data-testid^="log-order-"]').first()).toContainText("Filled at ₹1,380", { timeout: 15_000 });
  });

  test("it stays open when no candle crossed, and when the candles cannot be fetched", async ({ browser }) => {
    for (const candles of [{ source: "live" as const, bars: [bar("2026-11-10T11:00:00", 1450, 1460, 1440, 1455)] }, { source: "unavailable" as const }]) {
      const ctx = await browser.newContext(phone(390, 844));
      const page = await ctx.newPage();
      await go(page, "/app/orders", { portfolio: { ...seed, orderLog: [], openOrders: [gtt] }, candles });
      await dismissNotice(page);
      await page.getByTestId("orders-tab-gtt").click();
      await page.waitForTimeout(6000);
      await expect(page.locator('[data-testid^="open-order-"]')).toHaveCount(1);
      await page.getByTestId("orders-tab-executed").click();
      await expect(page.getByTestId("no-executed")).toBeVisible();
      await ctx.close();
    }
  });

  test("a GTT that crossed while away but can no longer trade is cancelled, not filled", async ({ page }) => {
    await go(page, "/app/orders", { portfolio: { ...seed, holdings: {}, openOrders: [gtt] }, candles: { source: "live", bars: [bar("2026-11-10T11:00:00", 1410, 1412, 1395, 1396)] } });
    await dismissNotice(page);
    await page.getByTestId("orders-tab-executed").click();
    await expect(page.locator('[data-testid^="log-order-"]').first()).toContainText("Cancelled", { timeout: 15_000 });
    await expect(page.locator('[data-testid^="simulated-"]')).toHaveCount(0);
  });
});

test.describe("portfolio: Holdings, Positions and privacy", () => {
  test.use(phone(390, 844));
  const portfolio = { watchlist: ["RELIANCE"], cash: 900_000, holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } }, orderLog: [{ id: "1", symbol: "RELIANCE", side: "buy", qty: 6, price: 1380, mode: "market", time: "10:00:00 am", orderType: "MARKET", status: "filled", date: "2026-11-09" }, { id: "2", symbol: "RELIANCE", side: "buy", qty: 4, price: 1430, mode: "market", time: "11:00:00 am", orderType: "MARKET", status: "filled", date: "2026-11-11" }], alerts: [] };

  test("Holdings are settled delivery shares from earlier days; Positions are today's trades; the note says T+1", async ({ page }) => {
    await go(page, "/app/portfolio", { portfolio });
    await dismissNotice(page);
    await expect(page.getByRole("tab")).toHaveText(["Holdings1", "Positions1"]);
    await expect(page.getByTestId("settlement-note")).toContainText("T+1");
    const held = page.getByTestId("pf-rows-holdings").getByTestId("pf-row-RELIANCE");
    await expect(held).toContainText("6 @ ₹1,400");
    await page.getByTestId("pf-tab-positions").click();
    const pos = page.getByTestId("pf-rows-positions").getByTestId("pf-row-RELIANCE");
    await expect(pos).toContainText("4 @ ₹1,430");
    await expect(page.getByTestId("settlement-note")).toContainText("Today's trades");
  });

  test("the day after, the same shares have settled and are all Holdings", async ({ page }) => {
    await mock(page, { portfolio });
    await page.clock.setFixedTime(new Date("2026-11-12T11:00:00+05:30"));
    await page.goto("/app/portfolio", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    await dismissNotice(page);
    await expect(page.getByTestId("pf-rows-holdings").getByTestId("pf-row-RELIANCE")).toContainText("10 @ ₹1,400");
    await page.getByTestId("pf-tab-positions").click();
    await expect(page.getByTestId("pf-empty-positions")).toBeVisible();
  });

  test("the eye hides the portfolio's value as **** and profit and loss as ***, everywhere, and is remembered", async ({ page }) => {
    await go(page, "/app/portfolio", { portfolio });
    await dismissNotice(page);
    const shown = await page.getByTestId("pf-total").innerText();
    expect(shown).toMatch(/₹/);
    await expect(page.getByTestId("pf-pnl")).toHaveText(/[+−]?₹/);
    expect((await page.getByTestId("privacy-eye").boundingBox())!.width).toBeGreaterThanOrEqual(43.5);
    await page.getByTestId("privacy-eye").click();
    for (const id of ["pf-total", "pf-cash", "pf-holdings-value"]) await expect(page.getByTestId(id)).toHaveText("****");
    await expect(page.getByTestId("pf-pnl")).toHaveText("***");
    await expect(page.getByTestId("pf-rows-holdings").getByTestId("pf-row-pnl")).toHaveText("***");
    await expect(page.getByTestId("pf-rows-holdings").getByTestId("pf-row-value")).toHaveText("****");
    // the top bar's balance
    await expect(page.getByText("₹9,00,000")).toHaveCount(0);
    // another place: the dashboard
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    await expect(page.getByText("****").first()).toBeVisible();
    await expect(page.getByText("***", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/₹9,00,000|₹10,00,000/)).toHaveCount(0);
    // remembered on this device
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    await expect(page.getByText("****").first()).toBeVisible();
    await page.goto("/app/portfolio", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-content").waitFor();
    await expect(page.getByTestId("pf-total")).toHaveText("****");
    await expect(page.getByTestId("privacy-eye")).toHaveAttribute("aria-pressed", "true");
    // and the eye shows them again
    await page.getByTestId("privacy-eye").click();
    await expect(page.getByTestId("pf-total")).toHaveText(shown);
  });

  test("Account has the same switch, and Reset my paper account and the cookie notice", async ({ page }) => {
    await go(page, "/app/account");
    await dismissNotice(page);
    await expect(page.getByTestId("privacy-switch")).toHaveAttribute("aria-checked", "false");
    expect((await page.getByTestId("privacy-switch").boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await page.getByTestId("privacy-switch").click();
    await expect(page.getByTestId("privacy-switch")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("nav-portfolio").click();
    await expect(page.getByTestId("pf-total")).toHaveText("****");
    await page.getByTestId("nav-account").click();
    await expect(page.getByTestId("reset-account")).toHaveText("Reset my paper account");
    await expect(page.getByTestId("account-panel")).toContainText("cookie on this device");
  });
});

test.describe("explore", () => {
  test.use(phone(390, 844));

  test("a grid of Pulse, F&O Analyzer, MTF, FII/DII, Movers, Options and Buildup that open their pages", async ({ page }) => {
    await go(page, "/app/explore");
    await dismissNotice(page);
    const labels = ["Pulse", "F&O Analyzer", "MTF", "FII/DII", "Movers", "Options", "Buildup"];
    await expect(page.getByTestId("explore-grid").getByRole("link")).toHaveCount(7);
    for (const l of labels) await expect(page.getByTestId("explore-grid").getByRole("link", { name: new RegExp("^" + l.replace(/[/&]/g, "\\$&")) })).toBeVisible();
    for (const l of await page.getByTestId("explore-grid").getByRole("link").all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await page.getByTestId("explore-mtf").click();
    await expect(page).toHaveURL(/\/app\/mtf$/);
  });

  test("an index that expires today shows an Expiry today tag on its card; one that does not has none", async ({ page }) => {
    await go(page, "/app/explore", { expiry: "2026-11-11" });
    await expect(page.getByTestId("expiry-today-NIFTY50")).toHaveText("Expiry today");
    await expect(page.getByTestId("expiry-today-BANKNIFTY")).toHaveText("Expiry today");
    await expect(page.getByTestId("index-card-SENSEX").getByText("Expiry today")).toHaveCount(0);
    const p2 = await page.context().newPage();
    await go(p2, "/app/explore", { expiry: "2026-11-12" });
    await expect(p2.getByTestId("index-card-NIFTY50")).toBeVisible();
    await expect(p2.getByText("Expiry today")).toHaveCount(0);
  });

  test("and in its option chain when the chain's expiry is today", async ({ page }) => {
    const { simulateChain } = await import("../lib/options");
    const chain = { ...simulateChain("NIFTY50", 25250, null), source: "live", expiry: "2026-11-11", expiries: ["2026-11-11", "2026-11-26"] };
    await go(page, "/app/options", { chain, expiry: "2026-11-11" });
    await dismissNotice(page);
    await expect(page.getByTestId("chain-expiry-today")).toHaveText("Expiry today");
    const later = await page.context().newPage();
    await go(later, "/app/options", { chain: { ...chain, expiry: "2026-11-12", expiries: ["2026-11-12"] } });
    await expect(later.getByTestId("chain-expiry-today")).toHaveCount(0);
  });
});

/* ------------------------------------------------------- layout: three sizes, no sideways scroll, 44 px targets -- */
const SIZES = [
  [360, 800],
  [390, 844],
  [844, 390],
] as const;

for (const [w, h] of SIZES) {
  test.describe(`layout at ${w}x${h}`, () => {
    test.use(phone(w, h));

    /** every control inside the page and the bottom bar, that is on screen, is at least 44 px each way */
    const smallControls = (page: Page) =>
      page.evaluate(() => {
        const out: string[] = [];
        const roots = [document.querySelector('[data-testid="app-content"]'), document.querySelector('[data-testid="bottom-nav"]'), ...document.querySelectorAll('[role="dialog"]')];
        for (const root of roots) {
          if (!root) continue;
          for (const el of root.querySelectorAll<HTMLElement>("button, a[href], select, input:not([type=checkbox]):not([type=radio]), textarea, [role=tab], [role=radio], [role=switch]")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (el.closest('[data-testid="chart-attribution"]')) continue;
            if (r.height < 43.5 || r.width < 43.5) out.push(`${el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        return out;
      });

    const pages: [string, string, (p: Page) => Promise<void>][] = [
      ["watchlist", "/app/watchlist", async () => {}],
      ["watchlist, editing", "/app/watchlist", async (p) => p.getByTestId("wl-edit").click()],
      ["watchlist, new list form", "/app/watchlist", async (p) => p.getByTestId("wl-new").click()],
      ["orders: open", "/app/orders", async () => {}],
      ["orders: executed", "/app/orders", async (p) => p.getByTestId("orders-tab-executed").click()],
      ["orders: GTT", "/app/orders", async (p) => p.getByTestId("orders-tab-gtt").click()],
      ["orders: baskets", "/app/orders", async (p) => p.getByTestId("orders-tab-baskets").click()],
      ["orders: SIPs", "/app/orders", async (p) => p.getByTestId("orders-tab-sips").click()],
      ["orders: alerts", "/app/orders", async (p) => p.getByTestId("orders-tab-alerts").click()],
      ["portfolio: holdings", "/app/portfolio", async () => {}],
      ["portfolio: positions", "/app/portfolio", async (p) => p.getByTestId("pf-tab-positions").click()],
      ["explore", "/app/explore", async () => {}],
      ["account", "/app/account", async () => {}],
    ];
    const portfolio = { watchlist: ["RELIANCE", "TCS", "NIFTY50", "BANKNIFTY", "BTC"], cash: 900_000, holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } }, orderLog: [{ id: "1", symbol: "RELIANCE", side: "buy", qty: 6, price: 1380, mode: "market", time: "10:00:00 am", orderType: "MARKET", status: "filled", date: "2026-11-09" }, { id: "2", symbol: "RELIANCE", side: "buy", qty: 4, price: 1430, mode: "market", time: "11:00:00 am", orderType: "MARKET", status: "filled", date: "2026-11-11" }], openOrders: [{ symbol: "RELIANCE", side: "buy", qty: 1, limitPrice: 1300, time: "x", orderType: "LIMIT", placedDate: "2026-11-11" }, { symbol: "RELIANCE", side: "sell", qty: 2, limitPrice: 1400, time: "x", orderType: "GTT", placedDate: "2026-11-11", trigger: "below", placedAtMs: Date.now() }], alerts: [{ id: "a", symbol: "TCS", condition: "above", target: 4500, createdAt: "x" }] };

    for (const [name, path, act] of pages) {
      test(`${name}: no sideways scroll, every control 44 px`, async ({ page }) => {
        await go(page, path, { portfolio });
        await dismissNotice(page);
        await act(page);
        await page.waitForTimeout(300);
        expect(await noSideways(page), "no horizontal scroll").toBe(true);
        expect(await smallControls(page)).toEqual([]);
      });
    }

    test("the symbol sheet and its forms: no sideways scroll, every control 44 px", async ({ page }) => {
      await go(page, "/app/watchlist", { portfolio });
      await dismissNotice(page);
      await page.getByTestId("wl-open-RELIANCE").click();
      await page.getByTestId("sheet-gtt").click();
      await expect(page.getByTestId("gtt-form")).toBeVisible();
      expect(await noSideways(page)).toBe(true);
      expect(await smallControls(page)).toEqual([]);
      await page.getByTestId("sheet-alert").click();
      await page.getByTestId("sheet-notes").click();
      await page.getByTestId("sheet-buy").click();
      expect(await noSideways(page)).toBe(true);
      expect(await smallControls(page)).toEqual([]);
    });

    test("the search results: no sideways scroll, every row 44 px", async ({ page }) => {
      await go(page, "/app/watchlist", { portfolio });
      await dismissNotice(page);
      await page.getByTestId("wl-search-input").fill("nifty");
      await expect(page.getByTestId("wl-results")).toBeVisible();
      expect(await noSideways(page)).toBe(true);
      expect(await smallControls(page)).toEqual([]);
    });
  });
}

