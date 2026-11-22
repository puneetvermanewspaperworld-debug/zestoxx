import { test, expect, type Page } from "@playwright/test";
import { simulateChain, chainStats, type OptionChain } from "../lib/options";
import { account, openApp, tick } from "./action-helpers";

/**
 * The option chain on a phone: the chain comes first; Call LTP, Strike and Put LTP are pinned in the middle while the other columns scroll
 * sideways inside the table; the page never scrolls sideways; a tap on a call or a put opens the Buy/Sell screen for that strike and expiry.
 */
const EXPIRIES = ["2026-11-12", "2026-11-19", "2026-11-26"];
const base = (expiry = EXPIRIES[0]) => ({ ...simulateChain("NIFTY50", 25250, expiry, new Date("2026-11-11T08:20:00Z")), source: "live" as const, expiry, expiries: EXPIRIES }) as OptionChain;

/** a RELIANCE chain whose spot (1,500) is a long way from its first strike, as a real one is: the screen must open at the spot, not at the top */
const reliance = (expiry = EXPIRIES[0]) => ({ ...simulateChain("RELIANCE", 1500, expiry, new Date("2026-11-11T08:20:00Z")), underlying: "RELIANCE", source: "live" as const, expiry, expiries: EXPIRIES }) as OptionChain;

interface Setup {
  chain?: (expiry: string) => OptionChain | null;
  /** stay on the RELIANCE chain the screen opens with, instead of searching for NIFTY50 */
  stay?: boolean;
  /** the expiry asked for, in order */
  asked?: string[];
}
async function open(page: Page, w: number, h: number, s: Setup = {}, extra?: (p: Page) => Promise<void>) {
  await page.setViewportSize({ width: w, height: h });
  const get = s.chain ?? base;
  const res = await openApp(page, "/app/options", account(), async (p) => {
    await p.route("**/api/options-chain**", (r) => {
      const q = new URL(r.request().url()).searchParams;
      const e = q.get("expiry") ?? EXPIRIES[0];
      s.asked?.push(e);
      const c = q.get("underlying") === "RELIANCE" && !s.chain ? reliance(e) : get(e);
      return r.fulfill({ json: c ? { ...c, underlying: q.get("underlying") ?? c.underlying } : { source: "unavailable" } });
    });
    // the exchange's list of what has options, narrowed by what is typed
    await p.route("**/api/watchlist-search**", (r) => {
      const q = (new URL(r.request().url()).searchParams.get("q") ?? "").toLowerCase();
      const all = [{ symbol: "NIFTY50", name: "Nifty 50 Index", kind: "index", fno: true }, { symbol: "BANKNIFTY", name: "Bank Nifty", kind: "index", fno: true }, { symbol: "RELIANCE", name: "Reliance Industries", kind: "equity", fno: true }, { symbol: "TCS", name: "Tata Consultancy Services", kind: "equity", fno: true }];
      return r.fulfill({ json: { results: all.filter((x) => x.symbol.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)) } });
    });
    await p.route("**/api/option-expiries**", (r) => r.fulfill({ json: { source: "live", expiries: EXPIRIES, lot: 65 } }));
    await p.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
    await extra?.(p);
  });
  await page.getByTestId("chain-spot-row").waitFor();
  if (!s.stay) await pickUnderlying(page, "nifty", "NIFTY50");
  await page.waitForTimeout(300);
  return res;
}
/** search for an underlying and tap the result */
async function pickUnderlying(page: Page, typed: string, symbol: string) {
  await page.getByTestId("chain-search-open").click();
  await page.getByTestId("chain-search-input").fill(typed);
  await page.getByTestId(`chain-result-${symbol}`).click();
  await page.getByTestId("chain-spot-row").waitFor();
  await expect(page.getByTestId("chain-underlying-name")).toHaveText(symbol);
  await page.waitForTimeout(300);
}
const rect = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;
const sideways = (page: Page) => page.evaluate(() => ({ page: document.documentElement.scrollWidth - window.innerWidth, content: (() => { const c = document.querySelector('[data-testid="app-content"]')!; return c.scrollWidth - c.clientWidth; })() }));

for (const [w, h] of [[360, 800], [390, 844]] as const) {
  test.describe(`${w}x${h}`, () => {
    test("the chain is a full screen: no brand bar, ticker, cookie notice or tab bar, and the table has nearly all of the height", async ({ page }) => {
      await open(page, w, h);
      await expect(page.getByText(/2nd highest/i)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Paper sell/ })).toHaveCount(0);
      // (hidden elements may still be in the page: what counts is what can be seen)
      await expect(page.getByText("ZESTOXX", { exact: true }).filter({ visible: true })).toHaveCount(0);
      await expect(page.getByTestId("guest-notice-dismiss").filter({ visible: true })).toHaveCount(0);
      await expect(page.locator("nav").filter({ visible: true })).toHaveCount(0); // the tab bar
      await expect(page.getByText("Market Open").filter({ visible: true })).toHaveCount(0); // the top bar
      const head = await rect(page, "chain-header");
      expect(head.y).toBeLessThanOrEqual(0.5);
      expect(head.height).toBeLessThanOrEqual(57);
      const t = await rect(page, "chain-scroll");
      expect(t.y, "the table starts high up").toBeLessThan(h * 0.31);
      expect(t.y + t.height, "and runs to the bottom of the screen").toBeGreaterThanOrEqual(h - 1);
      expect(t.height).toBeGreaterThan(h * 0.7);
      await expect(page.getByTestId("chain-bar")).toHaveCount(0);
      await expect(page.getByTestId("chain-back")).toBeVisible();
      expect((await rect(page, "chain-back")).width).toBeGreaterThanOrEqual(43.5);
    });

    test("the header: a search box for the underlying with its price and change, and the expiry beside it, on one row with no overlap", async ({ page }) => {
      await open(page, w, h, { stay: true });
      const back = await rect(page, "chain-back");
      const box = await rect(page, "chain-search-open");
      const exp = await rect(page, "chain-expiry-select");
      expect(back.x + back.width).toBeLessThanOrEqual(box.x + 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(exp.x + 0.5);
      expect(exp.x + exp.width).toBeLessThanOrEqual(w + 0.5);
      for (const r of [box, exp]) expect(r.height).toBeGreaterThanOrEqual(43.5);
      expect(Math.abs(box.y - exp.y)).toBeLessThan(2);
      await expect(page.getByTestId("chain-underlying-name")).toHaveText("RELIANCE");
      await expect(page.getByTestId("chain-underlying-price")).toHaveText("₹1,500.00");
      await expect(page.getByTestId("chain-underlying-change")).toHaveText("+0.67%");
      // the expiry's text is all there (not cut off) and the field is 16px
      const sel = await page.getByTestId("chain-expiry-select").evaluate((e) => ({ fs: getComputedStyle(e).fontSize, ok: e.scrollWidth <= e.clientWidth + 1 }));
      expect(sel.fs).toBe("16px");
      expect(sel.ok).toBe(true);
      const name = await page.getByTestId("chain-underlying-name").evaluate((e) => ({ clip: e.scrollWidth > e.clientWidth + 1 }));
      expect(name.clip).toBe(false);
    });

    test("the screen opens with the spot row in the middle of the table, on load and after another symbol or expiry; the strikes at the top are not what is shown", async ({ page }) => {
      await open(page, w, h, { stay: true });
      const mid = async () => {
        const sb = await rect(page, "chain-scroll");
        const sp = await rect(page, "chain-spot-row");
        return sp.y + sp.height / 2 - (sb.y + 32 + (sb.height - 32) / 2);
      };
      expect(Math.abs(await mid()), "RELIANCE on load").toBeLessThan(20);
      // the first strikes are not what is on screen (the chain has 20 strikes under the spot)
      const first = await page.locator('[data-testid^="chain-strike-"]').first().boundingBox();
      expect(first!.y, "the top strike is scrolled out of view").toBeLessThan((await rect(page, "chain-scroll")).y + 32);
      expect(await page.getByTestId("chain-spot-price").isVisible()).toBe(true);
      // another expiry
      await page.getByTestId("chain-expiry-select").selectOption(EXPIRIES[1]);
      await expect(page.getByTestId("chain-expiry-select")).toHaveValue(EXPIRIES[1]);
      await page.waitForTimeout(400);
      expect(Math.abs(await mid()), "after another expiry").toBeLessThan(20);
      // another symbol
      await pickUnderlying(page, "nif", "NIFTY50");
      expect(Math.abs(await mid()), "after another symbol").toBeLessThan(20);
      await expect(page.getByTestId("chain-spot-price")).toHaveText("₹25,250.00");
      // scrolled by hand it stays where it was left (the screen does not pull it back)
      const sc = page.getByTestId("chain-scroll");
      await sc.evaluate((e) => (e.scrollTop = 0));
      await page.waitForTimeout(600);
      expect(await sc.evaluate((e) => e.scrollTop)).toBe(0);
    });

    test("the search box finds an underlying and switches the chain to it; the expiry dropdown lists real expiries with days left and starts on the nearest", async ({ page }) => {
      await open(page, w, h, { stay: true });
      const asked: string[] = [];
      page.on("request", (r) => { if (r.url().includes("/api/options-chain")) asked.push(new URL(r.url()).searchParams.get("underlying") + "|" + (new URL(r.url()).searchParams.get("expiry") ?? "")); });
      // the built-in ones are there before anything is typed, with a live price where the app has one
      await page.getByTestId("chain-search-open").click();
      await expect(page.getByTestId("chain-result-TCS")).toContainText("₹4,200.00");
      await page.getByTestId("chain-search-input").fill("bank");
      await expect(page.getByTestId("chain-result-BANKNIFTY")).toBeVisible();
      await expect(page.getByTestId("chain-result-TCS")).toHaveCount(0);
      await page.getByTestId("chain-search-input").fill("zzzz");
      await expect(page.getByTestId("chain-results")).toContainText("Nothing with options matches that");
      await page.getByTestId("chain-search-input").fill("nift");
      await page.getByTestId("chain-result-NIFTY50").click();
      await expect(page.getByTestId("chain-underlying-name")).toHaveText("NIFTY50");
      await expect(page.getByTestId("chain-underlying-price")).toHaveText("₹25,250.00");
      await expect(page.getByTestId("chain-spot-price")).toHaveText("₹25,250.00");
      await expect.poll(() => asked.some((a) => a.startsWith("NIFTY50|"))).toBe(true);
      // the expiry list: real expiries only, each with its date and the days left; the nearest is selected
      const opts = await page.getByTestId("chain-expiry-select").locator("option").allTextContents();
      expect(opts).toEqual(["12 Nov · 1d", "19 Nov · 8d", "26 Nov · 15d"]);
      await expect(page.getByTestId("chain-expiry-select")).toHaveValue(EXPIRIES[0]);
      await page.getByTestId("chain-expiry-select").selectOption(EXPIRIES[2]);
      await expect(page.getByTestId("chain-expiry-select")).toHaveValue(EXPIRIES[2]);
      await expect.poll(() => asked.some((a) => a === "NIFTY50|" + EXPIRIES[2])).toBe(true);
      await expect(page.getByTestId("chain-spot-row")).toBeVisible();
      // another underlying starts on its own nearest expiry, not the one chosen here
      await pickUnderlying(page, "bank", "BANKNIFTY");
      await expect(page.getByTestId("chain-expiry-select")).toHaveValue(EXPIRIES[0]);
      // Escape closes the search without changing anything
      await page.getByTestId("chain-search-open").click();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("chain-search-input")).toHaveCount(0);
      await expect(page.getByTestId("chain-underlying-name")).toHaveText("BANKNIFTY");
    });

    test("an open-interest figure and its suffix are fully in its cell, on top of the bar, in every row", async ({ page }) => {
      await open(page, w, h);
      const bad = await page.locator('[data-col="oi"]').evaluateAll((cells) => cells.map((c) => {
        const t = c.querySelector("span.relative")!.getBoundingClientRect();
        const r = c.getBoundingClientRect();
        const bar = c.querySelector('[data-testid="chain-oi-bar"]');
        return { text: c.textContent, inside: t.left >= r.left - 0.5 && t.right <= r.right + 0.5, above: !bar || getComputedStyle(bar).zIndex !== "1", suffix: /L$|Cr$|k$|\d$/.test((c.textContent ?? "").trim()) };
      }).filter((x) => !x.inside || !x.suffix));
      expect(bad).toEqual([]);
      // the bars are pale: a tint, not a block of colour
      const bg = await page.locator('[data-testid="chain-oi-bar"] > span').first().evaluate((e) => getComputedStyle(e).backgroundColor);
      const a = Number(bg.match(/\/\s*([\d.]+)\)/)?.[1] ?? 1); // the alpha of "oklab(... / 0.8)" or "rgb(... / 0.8)"; none means solid
      expect(a).toBeLessThanOrEqual(0.9);
    });

    test("no sideways scroll of the page, with the default columns and with every column on", async ({ page }) => {
      await open(page, w, h);
      expect(await sideways(page)).toEqual({ page: 0, content: 0 });
      const scroll = page.getByTestId("chain-scroll");
      // the default columns are OI and OI chg: on a 390 screen both sides are in view; on a 360 one the outer columns may scroll, inside the table
      if (w >= 390) expect(await scroll.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
      await page.getByTestId("chain-columns").click();
      for (const c of ["volume", "ltpChg"]) await page.getByTestId(`chain-col-${c}`).click();
      await page.getByTestId("chain-columns").click();
      expect(await scroll.evaluate((e) => e.scrollWidth - e.clientWidth), "now the table scrolls sideways, inside itself").toBeGreaterThan(40);
      expect(await sideways(page)).toEqual({ page: 0, content: 0 });
    });

    test("Call LTP, Strike and Put LTP stay where they are, in the middle, while the outer columns scroll", async ({ page }) => {
      await open(page, w, h);
      await page.getByTestId("chain-columns").click();
      for (const c of ["volume", "ltpChg"]) await page.getByTestId(`chain-col-${c}`).click();
      await page.getByTestId("chain-columns").click();
      const scroll = page.getByTestId("chain-scroll");
      const at = async () => {
        const s = await rect(page, "chain-strike-25250");
        const c = await rect(page, "chain-ce-25250");
        const p = await rect(page, "chain-pe-25250");
        return { s: Math.round(s.x), c: Math.round(c.x), p: Math.round(p.x), sw: Math.round(s.width) };
      };
      const start = await at();
      expect(Math.abs(start.s + start.sw / 2 - w / 2), "the strike is in the middle of the screen").toBeLessThanOrEqual(3);
      const max = await scroll.evaluate((e) => e.scrollWidth - e.clientWidth);
      for (const x of [0, Math.round(max / 2), max]) {
        await scroll.evaluate((e, v) => (e.scrollLeft = v), x);
        await page.waitForTimeout(80);
        const now = await at();
        expect(now, `pinned at scrollLeft ${x}`).toEqual(start);
        // all three are fully inside the screen
        for (const id of ["chain-ce-25250", "chain-strike-25250", "chain-pe-25250"]) {
          const r = await rect(page, id);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.x + r.width).toBeLessThanOrEqual(w + 0.5);
        }
      }
      // an outer column really moves
      await scroll.evaluate((e) => (e.scrollLeft = 0));
      const before = await page.locator('[data-col="volume"][data-k="25250"][data-t="PE"]').boundingBox();
      await scroll.evaluate((e) => (e.scrollLeft = e.scrollWidth));
      const after = await page.locator('[data-col="volume"][data-k="25250"][data-t="PE"]').boundingBox();
      expect(before!.x).not.toBe(after!.x);
    });

    test("the header does not overlap the first row, and is still there when the rows scroll", async ({ page }) => {
      await open(page, w, h);
      const scroll = page.getByTestId("chain-scroll");
      await scroll.evaluate((e) => (e.scrollTop = 0));
      const head = (await page.locator('[data-head="1"]').first().boundingBox())!;
      const first = (await page.locator('[data-t="CE"][data-col="ltp"]').first().boundingBox())!;
      expect(first.y, "the first row starts under the header").toBeGreaterThanOrEqual(head.y + head.height - 0.5);
      await scroll.evaluate((e) => (e.scrollTop = 200));
      await page.waitForTimeout(100);
      const head2 = (await page.locator('[data-head="1"]').first().boundingBox())!;
      expect(Math.abs(head2.y - head.y)).toBeLessThan(1);
      expect(head.height).toBeLessThanOrEqual(33);
    });

    test("rows are 40px, in tabular figures, and each side of a strike has a 44px tap area", async ({ page }) => {
      await open(page, w, h);
      const rows = await page.locator('[data-col="ltp"][data-t="CE"]').evaluateAll((els) => els.slice(0, 5).map((e) => e.getBoundingClientRect().height));
      for (const hh of rows) expect(hh).toBeCloseTo(40, 0);
      const hit = await page.getByTestId("chain-ce-25300").evaluate((b) => { const cs = getComputedStyle(b, "::after"); return { w: parseFloat(cs.width), h: parseFloat(cs.height) }; });
      expect(hit.h).toBeGreaterThanOrEqual(43.5);
      expect(hit.w).toBeGreaterThanOrEqual(43.5);
      expect(await page.getByTestId("chain-strike-25300").evaluate((e) => getComputedStyle(e).fontVariantNumeric)).toContain("tabular-nums");
    });

    test("prices ticking change digits and nothing moves", async ({ page }) => {
      await open(page, w, h);
      const snap = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="chain-strike-"]')].slice(0, 12).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }));
      const before = await snap();
      await tick(page);
      expect(await snap()).toEqual(before);
    });
  });
}

test.describe("the contents", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the live spot is a row of its own between the two strikes it sits between, with its price and change, and the Spot button brings it back", async ({ page }) => {
    // the spot is 25,275: between the 25,250 and 25,300 strikes
    await open(page, 390, 844, {}, async (p) => {
      await p.route("**/api/market-data?asset=equity", (r) => r.fulfill({ json: { NIFTY50: { price: 25275, prevClose: 25200 }, RELIANCE: { price: 1500, prevClose: 1490 } } }));
    });
    const spot = page.getByTestId("chain-spot-row");
    await expect(spot).toContainText("₹25,275.00");
    await expect(page.getByTestId("chain-spot-change")).toContainText("+75.00");
    await expect(page.getByTestId("chain-spot-change")).toContainText("+0.30%");
    const above = await rect(page, "chain-strike-25250");
    const below = await rect(page, "chain-strike-25300");
    const s = (await spot.boundingBox())!;
    expect(s.y, "after the 25,250 row").toBeGreaterThanOrEqual(above.y + above.height - 0.5);
    expect(s.y + s.height, "before the 25,300 row").toBeLessThanOrEqual(below.y + 0.5);
    expect(s.height).toBeCloseTo(24, 0);
    // a thin line with a small label, readable at any scroll position, and not the dark pill of the other app
    expect(await spot.locator("span[aria-hidden]").first().evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(1.5);
    await expect(page.getByTestId("chain-atm")).toHaveCount(0);
    // in view and in the middle when the chain opens; the Spot button brings it back
    const scroll = page.getByTestId("chain-scroll");
    const sb = (await scroll.boundingBox())!;
    const mid = async () => { const a = (await spot.boundingBox())!; return a.y + a.height / 2 - (sb.y + 32 + (sb.height - 32) / 2); };
    expect(Math.abs(await mid()), "the spot row is in the middle of the table").toBeLessThan(20);
    await scroll.evaluate((e) => (e.scrollTop = 0));
    await page.waitForTimeout(100);
    expect(Math.abs(await mid())).toBeGreaterThan(100);
    await page.getByTestId("chain-spot-jump").click();
    await page.waitForTimeout(150);
    expect(Math.abs(await mid())).toBeLessThan(20);
  });

  test("the spot row stays readable when the table is scrolled sideways", async ({ page }) => {
    await open(page, 390, 844);
    await page.getByTestId("chain-columns").click();
    for (const c of ["volume", "ltpChg"]) await page.getByTestId(`chain-col-${c}`).click();
    await page.getByTestId("chain-columns").click();
    const scroll = page.getByTestId("chain-scroll");
    for (const x of [0, 99999]) {
      await scroll.evaluate((e, v) => (e.scrollLeft = v), x);
      await page.waitForTimeout(80);
      const t = (await page.getByTestId("chain-spot-price").boundingBox())!;
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(390.5);
    }
  });

  test("in-the-money cells are shaded: calls above the spot row, puts below it", async ({ page }) => {
    await open(page, 390, 844, {}, async (p) => {
      await p.route("**/api/market-data?asset=equity", (r) => r.fulfill({ json: { NIFTY50: { price: 25275, prevClose: 25200 }, RELIANCE: { price: 1500, prevClose: 1490 } } }));
    });
    const bg = (id: string) => page.getByTestId(id).locator("xpath=..").evaluate((e) => getComputedStyle(e).backgroundColor);
    const plain = await bg("chain-ce-25400"); // an out-of-the-money call
    expect(await bg("chain-ce-25250")).not.toBe(plain); // 25,250 is below the spot: a call there is in the money
    expect(await bg("chain-ce-25100")).not.toBe(plain);
    expect(await bg("chain-pe-25300")).not.toBe(plain); // 25,300 is above it: a put there is in the money
    expect(await bg("chain-pe-25250")).toBe(plain); // out of the money
    expect(await bg("chain-ce-25300")).toBe(plain);
  });

  test("open interest has a 2px rule under the figure in each cell, scaled to the largest in view; there is no bar under the strike", async ({ page }) => {
    await open(page, 390, 844);
    await expect(page.locator('[data-testid^="chain-split-"]')).toHaveCount(0);
    const bars = await page.locator('[data-col="oi"]').evaluateAll((cells) => cells.map((c) => ({ side: (c as HTMLElement).dataset.t, w: parseFloat(((c.querySelector('[data-testid="chain-oi-bar"] > span') as HTMLElement | null)?.style.width) ?? "0"), text: c.textContent })));
    expect(bars.length).toBeGreaterThan(20);
    expect(bars.some((b) => b.side === "CE") && bars.some((b) => b.side === "PE")).toBe(true);
    expect(Math.max(...bars.map((b) => b.w)), "the largest in view fills its cell").toBeCloseTo(100, 0);
    // a cell's bar is its own OI over the largest: 25,300's call
    const c = base();
    const inView = c.rows.filter((r) => Math.abs(r.strike - 25250) <= 20 * 50);
    const max = Math.max(...inView.flatMap((r) => [r.call.oi, r.put.oi]));
    const row = c.rows.find((r) => r.strike === 25300)!;
    const w = await page.locator('[data-col="oi"][data-k="25300"][data-t="CE"] [data-testid="chain-oi-bar"] > span').evaluate((e) => parseFloat((e as HTMLElement).style.width));
    expect(w).toBeCloseTo((row.call.oi / max) * 100, 0);
    // the rule is under the number, 2px thick, and never on top of it
    const z = await page.locator('[data-col="oi"][data-k="25300"][data-t="CE"]').evaluate((cell) => {
      const bar = cell.querySelector('[data-testid="chain-oi-bar"] > span')!.getBoundingClientRect();
      const text = cell.lastElementChild!.getBoundingClientRect();
      return { pos: getComputedStyle(cell.querySelector('[data-testid="chain-oi-bar"]')!).position, h: bar.height, below: bar.top >= text.bottom - 0.5 };
    });
    expect(z).toEqual({ pos: "absolute", h: 2, below: true });
  });

  test("tapping a Call or a Put cell opens the contract sheet; Buy from it opens the order screen for that strike and expiry, on another expiry too", async ({ page }) => {
    await open(page, 390, 844);
    await page.getByTestId("chain-ce-25300").click();
    await expect(page.getByTestId("contract-sheet")).toBeVisible();
    await expect(page.getByTestId("action-screen")).toHaveCount(0);
    await page.getByTestId("contract-buy").click();
    await expect(page).toHaveURL(new RegExp(`act=option&u=NIFTY50&x=${EXPIRIES[0]}&k=25300&t=CE&side=buy`));
    await expect(page.getByTestId("action-screen")).toBeVisible();
    await expect(page.getByTestId("contract-strike")).toHaveText("25300");
    await expect(page.getByTestId("contract-expiry")).toHaveText("12 Nov 2026");
    await page.getByTestId("action-back").click();
    await page.getByTestId("sheet-close").click();
    // a cell that is not the LTP opens a sheet too
    await page.locator('[data-col="oi"][data-k="25150"][data-t="PE"]').click();
    await expect(page.getByRole("dialog", { name: /25150 PE/ })).toBeVisible();
    await page.getByTestId("sheet-close").click();
    // another expiry
    await page.getByTestId("chain-expiry-select").selectOption(EXPIRIES[1]);
    await expect(page.getByTestId("chain-expiry-select")).toHaveValue(EXPIRIES[1]);
    await page.getByTestId("chain-spot-row").waitFor();
    await page.getByTestId("chain-pe-25200").click();
    await page.getByTestId("contract-buy").click();
    await expect(page).toHaveURL(new RegExp(`x=${EXPIRIES[1]}&k=25200&t=PE`));
    await expect(page.getByTestId("contract-expiry")).toHaveText("19 Nov 2026");
  });

  test("the choice of columns: only what the chain really has is offered, and the choice is remembered", async ({ page }) => {
    // a feed with no volume and no IV
    const noVol = (e: string) => { const c = base(e); for (const r of c.rows) for (const l of [r.call, r.put]) { l.volume = 0; l.iv = 0; } return c; };
    await open(page, 390, 844, { chain: noVol });
    await page.getByTestId("chain-columns").click();
    await expect(page.getByTestId("chain-col-oiChg")).toBeVisible();
    await expect(page.getByTestId("chain-col-oi")).toBeVisible();
    await expect(page.getByTestId("chain-col-volume")).toHaveCount(0);
    await expect(page.getByTestId("chain-col-ltpChg")).toBeVisible();
    // OI and OI chg are shown to begin with; OI chg is taken off
    await expect(page.locator('[data-head="1"]', { hasText: /^OI$/ })).toHaveCount(2);
    await expect(page.locator('[data-head="1"]', { hasText: /^OI chg$/ })).toHaveCount(2);
    await page.getByTestId("chain-col-oiChg").click();
    await page.getByTestId("chain-columns").click();
    await expect(page.locator('[data-head="1"]', { hasText: /^OI chg$/ })).toHaveCount(0);
    await page.reload();
    await page.getByTestId("chain-spot-row").waitFor();
    await expect(page.locator('[data-head="1"]', { hasText: /^OI$/ })).toHaveCount(2);
    await expect(page.locator('[data-head="1"]', { hasText: /^OI chg$/ })).toHaveCount(0); // still off after a reload
    // IV is not offered on the Greeks view either
    await page.getByTestId("chain-view-greeks").click();
    await page.getByTestId("chain-columns").click();
    await expect(page.getByTestId("chain-col-iv")).toHaveCount(0);
    await expect(page.getByTestId("chain-col-delta")).toBeVisible();
  });

  test("the OI view and the IV and Greeks view, and absolute or percentage change", async ({ page }) => {
    await open(page, 390, 844);
    const c = base();
    const r = c.rows.find((x) => x.strike === 25300)!;
    const oiChg = page.locator('[data-col="oiChg"][data-k="25300"][data-t="CE"]');
    const abs = (await oiChg.innerText()).trim();
    expect(abs).toMatch(/[kLC]r?$|^[+−]?\d/);
    await page.getByTestId("chain-change").click();
    const pct = (await oiChg.innerText()).trim();
    expect(pct).toMatch(/%$/);
    expect(parseFloat(pct.replace("−", "-"))).toBeCloseTo(((r.call.oi - r.call.prevOi) / r.call.prevOi) * 100, 1);
    await page.getByTestId("chain-change").click();
    expect((await oiChg.innerText()).trim()).toBe(abs);
    // Greeks
    await page.getByTestId("chain-view-greeks").click();
    await expect(page.locator('[data-head="1"]', { hasText: /^IV$/ })).toHaveCount(2);
    await expect(page.locator('[data-head="1"]', { hasText: /^Delta$/ })).toHaveCount(2);
    const d = (await page.locator('[data-col="delta"][data-k="25300"][data-t="CE"]').innerText()).trim();
    expect(parseFloat(d)).toBeCloseTo(r.call.delta!, 2);
    expect(await sideways(page)).toEqual({ page: 0, content: 0 });
  });

  test("no Greeks in the chain: there is no Greeks view (nothing is invented)", async ({ page }) => {
    const none = (e: string) => { const c = base(e); for (const r of c.rows) for (const l of [r.call, r.put]) { delete l.delta; delete l.gamma; delete l.theta; delete l.vega; } return c; };
    await open(page, 390, 844, { chain: none });
    await expect(page.getByTestId("chain-view-oi")).toBeVisible();
    await expect(page.getByTestId("chain-view-greeks")).toHaveCount(0);
  });

  test("Summary is one line until tapped, then PCR, Max Pain, ATM IV and India VIX worked out from the chain; there is no IV percentile", async ({ page }) => {
    await open(page, 390, 844);
    const c = base();
    const s = chainStats(c.rows, c.spot)!;
    const toggle = page.getByTestId("chain-summary-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false"); // closed to begin with
    await expect(page.getByTestId("chain-summary-stats")).toHaveCount(0);
    const line = page.getByTestId("chain-summary-line");
    await expect(line).toContainText(`PCR ${s.pcr!.toFixed(2)}`);
    await expect(line).toContainText(String(s.maxPain));
    await expect(line).toContainText(s.atmIv!.toFixed(2));
    await expect(line).toContainText(c.vix!.toFixed(2));
    expect((await rect(page, "chain-summary-toggle")).height, "one line").toBeLessThanOrEqual(44);
    expect(await line.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), "the whole line fits, not cut").toBe(true);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("chain-stat-pcr")).toHaveText(s.pcr!.toFixed(2));
    await expect(page.getByTestId("chain-stat-maxpain")).toHaveText(String(s.maxPain));
    await expect(page.getByTestId("chain-stat-atmiv")).toHaveText(s.atmIv!.toFixed(2));
    await expect(page.getByTestId("chain-stat-vix")).toHaveText(String(c.vix!.toFixed(2)));
    await expect(page.getByTestId("chain-summary")).not.toContainText(/percentile/i);
    await expect(page.getByTestId("chain-summary").locator("[data-testid^=chain-stat-]")).toHaveCount(4);
    expect((await rect(page, "chain-summary")).y, "above the table").toBeLessThan((await rect(page, "chain-scroll")).y);
  });

  test("Summary and Levels are closed by default, open on a tap, and stay as they were left", async ({ page }) => {
    await open(page, 390, 844);
    for (const id of ["chain-summary-toggle", "chain-levels-toggle"]) await expect(page.getByTestId(id)).toHaveAttribute("aria-expanded", "false");
    const closedTop = (await rect(page, "chain-scroll")).y;
    await page.getByTestId("chain-summary-toggle").click();
    expect((await rect(page, "chain-scroll")).y, "opening it takes room from the table").toBeGreaterThan(closedTop + 20);
    await page.reload();
    await page.getByTestId("chain-spot-row").waitFor();
    await expect(page.getByTestId("chain-summary-toggle")).toHaveAttribute("aria-expanded", "true"); // remembered
    await expect(page.getByTestId("chain-levels-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId("chain-summary-toggle").click();
    await page.reload();
    await page.getByTestId("chain-spot-row").waitFor();
    await expect(page.getByTestId("chain-summary-toggle")).toHaveAttribute("aria-expanded", "false");
  });

  test("the OI and Greeks views are a segmented control in the chain's header", async ({ page }) => {
    await open(page, 390, 844);
    const group = page.getByRole("radiogroup", { name: "Chain view" });
    await expect(group).toBeVisible();
    await expect(page.getByTestId("chain-view-oi")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("chain-view-greeks").click();
    await expect(page.getByTestId("chain-view-greeks")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("chain-view-oi")).toHaveAttribute("aria-checked", "false");
    // under the header, above the table, and not a row of tabs at the top of the screen
    const g = (await group.boundingBox())!;
    const t = await rect(page, "chain-scroll");
    expect(g.y).toBeLessThan(t.y);
    expect(g.y).toBeGreaterThan((await rect(page, "chain-header")).y + (await rect(page, "chain-header")).height - 1);
    await expect(page.getByRole("tablist", { name: "Chain view" })).toHaveCount(0);
  });

  test("support and resistance are in a Levels row that is folded until you open it", async ({ page }) => {
    await open(page, 390, 844);
    await expect(page.getByTestId("chain-levels")).toHaveCount(0);
    await expect(page.getByTestId("chain-levels-toggle")).toHaveAttribute("aria-expanded", "false");
    expect((await rect(page, "chain-levels-toggle")).height, "one line").toBeLessThanOrEqual(44);
    const c = base();
    const s = chainStats(c.rows, c.spot)!;
    await page.getByTestId("chain-levels-toggle").click();
    await expect(page.getByTestId("chain-levels")).toContainText("Resistance");
    await expect(page.getByTestId("chain-levels")).toContainText("Support");
    await expect(page.getByTestId("chain-levels")).toContainText(String(s.topCalls[1].strike));
  });

  test("a simulated chain says so", async ({ page }) => {
    await open(page, 390, 844, { chain: () => null });
    await expect(page.getByTestId("chain-tag")).toHaveText("Simulated");
    await expect(page.getByTestId("chain-tag")).toHaveAttribute("title", /Simulated chain: the live option feed is not available/);
  });

  test("when the market is closed a small tag says so, and its title says the figures are from the last session", async ({ page }) => {
    await open(page, 390, 844, {}, async (p) => { await p.clock.setSystemTime(new Date("2026-11-11T21:00:00+05:30")); });
    // a small tag, not a banner
    await expect(page.getByTestId("chain-tag")).toHaveText("Market closed");
    await expect(page.getByTestId("chain-tag")).toHaveAttribute("title", /last session/);
    expect((await rect(page, "chain-tag")).height).toBeLessThanOrEqual(24);
    await expect(page.getByTestId("chain-note")).toHaveCount(0);
  });
});

test.describe("sideways", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  test("the chain fits a phone turned sideways: a full screen, no sideways scroll of the page, and eight or more strikes show", async ({ page }) => {
    await open(page, 844, 390);
    expect(await sideways(page)).toEqual({ page: 0, content: 0 });
    const t = await rect(page, "chain-scroll");
    expect(t.y).toBeGreaterThanOrEqual(0);
    expect(t.y + t.height).toBeGreaterThanOrEqual(389);
    expect(t.width).toBeGreaterThan(800);
    // strikes on screen, whole or part of one (the spot is in the middle, so the first and last are cut by the header and the edge)
    const rowsInView = await page.evaluate(() => { const sc = document.querySelector('[data-testid="chain-scroll"]')!.getBoundingClientRect(); return [...document.querySelectorAll('[data-testid^="chain-strike-"]')].filter((e) => { const b = e.getBoundingClientRect(); return b.bottom > sc.top + 32 + 4 && b.top < sc.bottom - 4; }).length; });
    expect(rowsInView).toBeGreaterThanOrEqual(8);
  });
});

test("desktop keeps its chain page: the stat cards and the Paper sell buttons are still there", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page, "/app/options", account(), async (p) => {
    await p.route("**/api/options-chain**", (r) => r.fulfill({ json: base() }));
    await p.route("**/api/option-expiries**", (r) => r.fulfill({ json: { source: "live", expiries: EXPIRIES, lot: 65 } }));
  });
  await expect(page.getByText("Options Chain", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Paper sell Call/ })).toBeVisible();
  await expect(page.getByTestId("phone-options")).toHaveCount(0);
});
