import { test, expect, type Page } from "@playwright/test";
import { simulateChain, chainStats, type OptionChain } from "../lib/options";
import { account, openApp, tick } from "./action-helpers";

/**
 * The option chain on a phone: the chain comes first; Call LTP, Strike and Put LTP are pinned in the middle while the other columns scroll
 * sideways inside the table; the page never scrolls sideways; a tap on a call or a put opens the Buy/Sell screen for that strike and expiry.
 */
const EXPIRIES = ["2026-11-12", "2026-11-19", "2026-11-26"];
const base = (expiry = EXPIRIES[0]) => ({ ...simulateChain("NIFTY50", 25250, expiry, new Date("2026-11-11T08:20:00Z")), source: "live" as const, expiry, expiries: EXPIRIES }) as OptionChain;

interface Setup {
  chain?: (expiry: string) => OptionChain | null;
  /** the expiry asked for, in order */
  asked?: string[];
}
async function open(page: Page, w: number, h: number, s: Setup = {}, extra?: (p: Page) => Promise<void>) {
  await page.setViewportSize({ width: w, height: h });
  const get = s.chain ?? base;
  const res = await openApp(page, "/app/options", account(), async (p) => {
    await p.route("**/api/options-chain**", (r) => {
      const e = new URL(r.request().url()).searchParams.get("expiry") ?? EXPIRIES[0];
      s.asked?.push(e);
      const c = get(e);
      return r.fulfill({ json: c ?? { source: "unavailable" } });
    });
    await p.route("**/api/option-expiries**", (r) => r.fulfill({ json: { source: "live", expiries: EXPIRIES, lot: 65 } }));
    await p.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
    await extra?.(p);
  });
  await page.getByTestId("chain-sym-NIFTY50").click();
  await page.getByTestId("chain-spot-row").waitFor();
  await page.waitForTimeout(300);
  return res;
}
const rect = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;
const sideways = (page: Page) => page.evaluate(() => ({ page: document.documentElement.scrollWidth - window.innerWidth, content: (() => { const c = document.querySelector('[data-testid="app-content"]')!; return c.scrollWidth - c.clientWidth; })() }));

for (const [w, h] of [[360, 800], [390, 844]] as const) {
  test.describe(`${w}x${h}`, () => {
    test("the chain comes first: no stat cards, no Paper sell buttons, the table is in the upper half and ends above the tab bar", async ({ page }) => {
      await open(page, w, h);
      await expect(page.getByText(/2nd highest/i)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Paper sell/ })).toHaveCount(0);
      await expect(page.getByText("Options Chain", { exact: true })).toHaveCount(0);
      const t = await rect(page, "chain-scroll");
      expect(t.y, "the table starts in the upper part of the screen").toBeLessThan(h * 0.42);
      const nav = (await page.locator("nav").last().boundingBox())!;
      expect(t.y + t.height, "the table ends above the tab bar").toBeLessThanOrEqual(nav.y + 1);
      await expect(page.getByTestId("chain-bar")).toHaveCount(0); // there is no fixed bar under the table: the summary is at the top
    });

    test("no sideways scroll of the page, with the default columns and with every column on", async ({ page }) => {
      await open(page, w, h);
      expect(await sideways(page)).toEqual({ page: 0, content: 0 });
      const scroll = page.getByTestId("chain-scroll");
      // default: the table itself does not scroll sideways either, so both sides are in view
      expect(await scroll.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
      await page.getByTestId("chain-columns").click();
      for (const c of ["oiChg", "volume", "ltpChg"]) await page.getByTestId(`chain-col-${c}`).click();
      await page.getByTestId("chain-columns").click();
      expect(await scroll.evaluate((e) => e.scrollWidth - e.clientWidth), "now the table scrolls sideways, inside itself").toBeGreaterThan(40);
      expect(await sideways(page)).toEqual({ page: 0, content: 0 });
    });

    test("Call LTP, Strike and Put LTP stay where they are, in the middle, while the outer columns scroll", async ({ page }) => {
      await open(page, w, h);
      await page.getByTestId("chain-columns").click();
      for (const c of ["oiChg", "volume", "ltpChg"]) await page.getByTestId(`chain-col-${c}`).click();
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

    test("rows are 32px, in tabular figures, and each side of a strike has a 44px tap area", async ({ page }) => {
      await open(page, w, h);
      const rows = await page.locator('[data-col="ltp"][data-t="CE"]').evaluateAll((els) => els.slice(0, 5).map((e) => e.getBoundingClientRect().height));
      for (const hh of rows) expect(hh).toBeCloseTo(32, 0);
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
    expect(s.height).toBeCloseTo(28, 0);
    // it is wide enough to read at any scroll position, and not the dark pill of the other app
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
    for (const c of ["oiChg", "volume", "ltpChg"]) await page.getByTestId(`chain-col-${c}`).click();
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

  test("open interest is a bar behind the figure in each cell, scaled to the largest in view; there is no bar under the strike", async ({ page }) => {
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
    // the bar is behind the number (the number is above it)
    const z = await page.locator('[data-col="oi"][data-k="25300"][data-t="CE"]').evaluate((cell) => ({ bar: getComputedStyle(cell.querySelector('[data-testid="chain-oi-bar"]')!).position, text: getComputedStyle(cell.lastElementChild!).position }));
    expect(z).toEqual({ bar: "absolute", text: "relative" });
  });

  test("tapping a Call or a Put cell opens the Buy screen for that strike and expiry; on another expiry too", async ({ page }) => {
    await open(page, 390, 844);
    await page.getByTestId("chain-ce-25300").click();
    await expect(page).toHaveURL(new RegExp(`act=option&u=NIFTY50&x=${EXPIRIES[0]}&k=25300&t=CE&side=buy`));
    await expect(page.getByTestId("action-screen")).toBeVisible();
    await expect(page.getByTestId("contract-strike")).toHaveText("25300");
    await expect(page.getByTestId("contract-expiry")).toHaveText("12 Nov 2026");
    await page.getByTestId("action-back").click();
    await expect(page.getByTestId("action-screen")).toHaveCount(0);
    // a cell that is not the LTP opens it too
    await page.locator('[data-col="oi"][data-k="25150"][data-t="PE"]').click();
    await expect(page).toHaveURL(/k=25150&t=PE/);
    await page.getByTestId("action-back").click();
    // another expiry
    await page.getByTestId(`chain-expiry-${EXPIRIES[1]}`).click();
    await page.getByTestId(`chain-expiry-${EXPIRIES[1]}`).and(page.locator('[aria-selected="true"]')).waitFor();
    await page.getByTestId("chain-spot-row").waitFor();
    await page.getByTestId("chain-pe-25200").click();
    await expect(page).toHaveURL(new RegExp(`x=${EXPIRIES[1]}&k=25200&t=PE`));
    await expect(page.getByTestId("contract-expiry")).toHaveText("19 Nov 2026");
  });

  test("expiry chips scroll sideways and say how many days away each is; only the real expiries are there", async ({ page }) => {
    await open(page, 390, 844);
    await expect(page.getByTestId(`chain-expiry-${EXPIRIES[0]}`)).toContainText("12 Nov");
    await expect(page.getByTestId(`chain-expiry-${EXPIRIES[0]}`)).toContainText("1d");
    await expect(page.getByTestId(`chain-expiry-${EXPIRIES[1]}`)).toContainText("8d");
    await expect(page.getByTestId("chain-expiries").getByRole("tab")).toHaveCount(EXPIRIES.length);
    await expect(page.getByTestId(`chain-expiry-${EXPIRIES[0]}`)).toHaveAttribute("aria-selected", "true");
  });

  test("the underlying is chosen from a one-line selector that scrolls; the live price is on the spot row", async ({ page }) => {
    await open(page, 390, 844);
    await expect(page.getByTestId("chain-spot-price")).toHaveText("₹25,250.00");
    const sel = page.getByTestId("chain-underlying");
    const b = (await sel.boundingBox())!;
    expect(b.height).toBeLessThanOrEqual(40);
    expect(await sel.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
    await page.getByTestId("chain-sym-BANKNIFTY").scrollIntoViewIfNeeded();
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
    // OI is what is shown to begin with; OI chg is added
    await expect(page.locator('[data-head="1"]', { hasText: /^OI$/ })).toHaveCount(2);
    await page.getByTestId("chain-col-oiChg").click();
    await page.getByTestId("chain-columns").click();
    await expect(page.locator('[data-head="1"]', { hasText: /^OI chg$/ })).toHaveCount(2);
    await page.reload();
    await page.getByTestId("chain-sym-NIFTY50").click();
    await page.getByTestId("chain-spot-row").waitFor();
    await expect(page.locator('[data-head="1"]', { hasText: /^OI chg$/ })).toHaveCount(2); // still there after a reload
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
    await page.getByTestId("chain-columns").click();
    await page.getByTestId("chain-col-oiChg").click();
    await page.getByTestId("chain-columns").click();
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

  test("the summary strip at the top of the chain has PCR, Max Pain, ATM IV and India VIX, worked out from the chain; there is no IV percentile", async ({ page }) => {
    await open(page, 390, 844);
    const c = base();
    const s = chainStats(c.rows, c.spot)!;
    const strip = page.getByTestId("chain-summary");
    await expect(strip).toBeVisible();
    await expect(page.getByTestId("chain-stat-pcr")).toHaveText(s.pcr!.toFixed(2));
    await expect(page.getByTestId("chain-stat-maxpain")).toHaveText(String(s.maxPain));
    await expect(page.getByTestId("chain-stat-atmiv")).toHaveText(s.atmIv!.toFixed(2));
    await expect(page.getByTestId("chain-stat-vix")).toHaveText(String(c.vix!.toFixed(2)));
    await expect(strip).not.toContainText(/percentile/i);
    await expect(strip.locator("[data-testid^=chain-stat-]")).toHaveCount(4);
    // it is above the table, not under it
    expect((await rect(page, "chain-summary")).y).toBeLessThan((await rect(page, "chain-scroll")).y);
  });

  test("the summary strip is open on the first visit, folds away, and stays as it was left", async ({ page }) => {
    await open(page, 390, 844);
    const toggle = page.getByTestId("chain-summary-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const openTop = (await rect(page, "chain-scroll")).y;
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("chain-summary-stats")).toHaveCount(0);
    expect((await rect(page, "chain-scroll")).y, "folding it gives the room to the table").toBeLessThan(openTop - 20);
    await page.reload();
    await page.getByTestId("chain-sym-NIFTY50").click();
    await page.getByTestId("chain-spot-row").waitFor();
    await expect(page.getByTestId("chain-summary-toggle")).toHaveAttribute("aria-expanded", "false"); // remembered
    await page.getByTestId("chain-summary-toggle").click();
    await page.reload();
    await page.getByTestId("chain-sym-NIFTY50").click();
    await page.getByTestId("chain-spot-row").waitFor();
    await expect(page.getByTestId("chain-summary-toggle")).toHaveAttribute("aria-expanded", "true");
  });

  test("the OI and Greeks views are a segmented control in the chain's header", async ({ page }) => {
    await open(page, 390, 844);
    const group = page.getByRole("radiogroup", { name: "Chain view" });
    await expect(group).toBeVisible();
    await expect(page.getByTestId("chain-view-oi")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("chain-view-greeks").click();
    await expect(page.getByTestId("chain-view-greeks")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("chain-view-oi")).toHaveAttribute("aria-checked", "false");
    // inside the card, above the table, and not a row of tabs at the top of the screen
    const g = (await group.boundingBox())!;
    const t = await rect(page, "chain-scroll");
    expect(g.y).toBeLessThan(t.y);
    expect(g.y).toBeGreaterThan((await rect(page, "chain-expiries")).y);
    await expect(page.getByRole("tablist", { name: "Chain view" })).toHaveCount(0);
  });

  test("support and resistance are in a Levels row that is folded until you open it", async ({ page }) => {
    await open(page, 390, 844);
    await expect(page.getByTestId("chain-levels")).toHaveCount(0);
    await expect(page.getByTestId("chain-levels-toggle")).toHaveAttribute("aria-expanded", "false");
    const c = base();
    const s = chainStats(c.rows, c.spot)!;
    await page.getByTestId("chain-levels-toggle").click();
    await expect(page.getByTestId("chain-levels")).toContainText("Resistance");
    await expect(page.getByTestId("chain-levels")).toContainText("Support");
    await expect(page.getByTestId("chain-levels")).toContainText(String(s.topCalls[1].strike));
  });

  test("a simulated chain says so", async ({ page }) => {
    await open(page, 390, 844, { chain: () => null });
    await expect(page.getByTestId("chain-note")).toContainText("Simulated chain");
  });

  test("when the market is closed it says the figures are from the last session", async ({ page }) => {
    await open(page, 390, 844, {}, async (p) => { await p.clock.setSystemTime(new Date("2026-11-11T21:00:00+05:30")); });
    await expect(page.getByTestId("chain-note")).toContainText("Market closed");
    await expect(page.getByTestId("chain-note")).toContainText("last session");
  });
});

test.describe("sideways", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  test("the chain fits a phone turned sideways: no sideways scroll of the page, and the table can be scrolled to", async ({ page }) => {
    await open(page, 844, 390);
    expect(await sideways(page)).toEqual({ page: 0, content: 0 });
    // the chain is beside the controls, in view without scrolling the page, and above the tab bar
    const t = await rect(page, "chain-scroll");
    const nav = (await page.locator("nav").last().boundingBox())!;
    expect(t.y).toBeGreaterThanOrEqual(0);
    expect(t.y + t.height).toBeLessThanOrEqual(nav.y + 1);
    expect(t.height).toBeGreaterThan(110);
    expect(t.width).toBeGreaterThan(450);
    await expect(page.getByTestId("chain-summary")).toBeVisible();
    // six whole strikes and part of a seventh (it was four): the table has the whole height beside the controls
    const rowsInView = await page.evaluate(() => { const sc = document.querySelector('[data-testid="chain-scroll"]')!.getBoundingClientRect(); return [...document.querySelectorAll('[data-testid^="chain-strike-"]')].filter((e) => { const b = e.getBoundingClientRect(); return b.top >= sc.top + 32 - 1 && b.bottom <= sc.bottom + 1; }).length; });
    expect(rowsInView).toBeGreaterThanOrEqual(6);
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
