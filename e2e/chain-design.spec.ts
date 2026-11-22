import { test, expect, type Page } from "@playwright/test";
import { type ChainRow, type OptionChain, type OptionLeg } from "../lib/options";
import { oiShare } from "../lib/chain-view";
import { account, openApp, phone } from "./action-helpers";

/**
 * The look of the phone's option chain (the "Ledger" design): 12px of padding at each side so nothing touches the screen edge, blank cells instead of
 * "--", figures right-aligned in fixed columns, tag colours that stay readable on the shaded rows, the thin Call/Put open-interest bar under the
 * Summary line, 44px tap areas, and no sideways scroll of the page in any view at 360, 390 or sideways.
 */
const EXPIRIES = ["2026-11-12", "2026-11-19"];
const leg = (ltp: number, prevClose: number, oi: number, prevOi: number, o: Partial<OptionLeg> = {}): OptionLeg => ({ ltp, prevClose, oi, prevOi, volume: 500, iv: 15, delta: 0.4, theta: -2, vega: 5, gamma: 0.01, ...o });
const flat = () => leg(20, 20, 100_000, 100_000);
const NOTHING: OptionLeg = { ltp: 0, prevClose: 0, oi: 0, prevOi: 0, volume: 0, iv: 0 }; // a strike that has not traded and has no figures at all

/** a RELIANCE chain around 1,500, a tag at some strikes, and no figures at all at the far ones */
function crafted(expiry = EXPIRIES[0]): OptionChain {
  const rows: ChainRow[] = [];
  for (let k = 1300; k <= 1700; k += 10) rows.push({ strike: k, call: flat(), put: flat() });
  const at = (k: number) => rows.find((r) => r.strike === k)!;
  at(1470).call = leg(24, 20, 600_000, 100_000); // long buildup
  at(1480).call = leg(16, 20, 400_000, 100_000); // short buildup
  at(1490).call = leg(24, 20, 20_000, 100_000); // short covering
  at(1470).put = leg(16, 20, 40_000, 100_000); // long unwinding
  at(1510).put = leg(24, 20, 800_000, 100_000); // long buildup, in the money
  at(1520).put = leg(16, 20, 500_000, 100_000); // short buildup, in the money
  at(1530).put = leg(24, 20, 30_000, 100_000); // short covering, in the money
  for (const k of [1300, 1310, 1320]) at(k).call = { ...NOTHING };
  for (const k of [1680, 1690, 1700]) at(k).put = { ...NOTHING };
  return { underlying: "RELIANCE", spot: 1500, expiry, expiries: EXPIRIES, lotSize: 250, rows, vix: 17.3, source: "live" } as OptionChain;
}

async function open(page: Page, w: number, h: number, chain: (e: string) => OptionChain = crafted) {
  await page.setViewportSize({ width: w, height: h });
  await openApp(page, "/app/options", account(), async (p) => {
    await p.route("**/api/options-chain**", (r) => r.fulfill({ json: chain(new URL(r.request().url()).searchParams.get("expiry") ?? EXPIRIES[0]) }));
    await p.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
  });
  await page.getByTestId("chain-spot-row").waitFor();
  await page.waitForTimeout(300);
}
const view = async (page: Page, id: "oi" | "greeks" | "buildup") => {
  await page.getByTestId(`chain-view-${id}`).click();
  await page.waitForTimeout(350);
};
const pageSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const [w, h] of [[360, 800], [390, 844]] as const) {
  test.describe(`${w}x${h}`, () => {
    test.use(phone(w, h));

    test("12px of padding at each side: the first and last columns, the Calls and Puts labels, the lines above and the legend never touch the screen edge", async ({ page }) => {
      await open(page, w, h);
      for (const id of ["oi", "greeks", "buildup"] as const) {
        await view(page, id);
        const sc = page.getByTestId("chain-scroll");
        // the first column of the call side at the left end of the table, the last column of the put side at its right end
        await sc.evaluate((e) => (e.scrollLeft = 0));
        const left = await page.locator('[data-head="1"]').first().boundingBox();
        expect(left!.x, `${id}: the first column starts 12px in`).toBeGreaterThanOrEqual(11.5);
        await sc.evaluate((e) => (e.scrollLeft = e.scrollWidth));
        const heads = await page.locator('[data-head="1"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
        expect(Math.max(...heads), `${id}: the last column ends 12px in`).toBeLessThanOrEqual(w - 11.5);
        // the text itself, everywhere outside the scrolling table: left and right edges
        const text = await page.getByTestId("chain-view").evaluate((root) => {
          const sc = root.querySelector('[data-testid="chain-scroll"]')!;
          const out: { t: string; l: number; r: number }[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent?.trim() || sc.contains(n)) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            const b = range.getBoundingClientRect();
            if (b.width) out.push({ t: n.textContent.trim(), l: b.left, r: b.right });
          }
          return out;
        });
        for (const x of text) {
          expect(x.l, `${id}: "${x.t}" left`).toBeGreaterThanOrEqual(11.5);
          expect(x.r, `${id}: "${x.t}" right`).toBeLessThanOrEqual(w - 11.5);
        }
      }
      // the shaded in-the-money band and the hairlines under the rows stop at the same 12px
      await view(page, "oi");
      const sc = page.getByTestId("chain-scroll");
      await sc.evaluate((e) => (e.scrollLeft = 0));
      const callEdge = await page.locator('[data-itm="1"][data-t="CE"]').evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().left)));
      expect(callEdge, "the shade starts 12px in").toBeGreaterThanOrEqual(11.5);
      await sc.evaluate((e) => (e.scrollLeft = e.scrollWidth));
      const putEdge = await page.locator('[data-itm="1"][data-t="PE"]').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().right)));
      expect(putEdge, "and ends 12px from the right").toBeLessThanOrEqual(w - 11.5);
      expect(await pageSideways(page)).toBeLessThanOrEqual(0);
    });

    test("a cell with no data is blank, not '--', in every view", async ({ page }) => {
      await open(page, w, h);
      for (const id of ["oi", "greeks", "buildup"] as const) {
        await view(page, id);
        const dashes = await page.locator('[data-col], [data-testid^="chain-ce-"], [data-testid^="chain-pe-"]').evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()).filter((t) => /^-+$/.test(t)));
        expect(dashes, `${id}: no cell reads --`).toEqual([]);
      }
      await view(page, "oi");
      // the strike with no figures at all: its call cells are empty, its put cells are not
      for (const c of ["oi", "oiChg"]) await expect(page.locator(`[data-col="${c}"][data-k="1300"][data-t="CE"]`)).toHaveText("");
      await expect(page.locator('[data-col="oi"][data-k="1300"][data-t="PE"]')).not.toHaveText("");
      await expect(page.getByTestId("chain-ce-1300")).toHaveText("");
    });

    test("figures are right-aligned in fixed columns: every row of a column ends at the same x", async ({ page }) => {
      await open(page, w, h);
      for (const id of ["oi", "buildup"] as const) {
        await view(page, id);
        await page.getByTestId("chain-scroll").evaluate((e) => (e.scrollLeft = 0));
        const cols = id === "oi" ? ["oi", "oiChg", "ltp"] : ["buPx", "buOi", "buTag", "ltp"];
        for (const c of cols) {
          for (const side of ["CE", "PE"]) {
            const r = await page.locator(`[data-col="${c}"][data-t="${side}"]`).evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { left: Math.round(b.left * 2) / 2, w: Math.round(b.width * 2) / 2, jc: cs.justifyContent }; }));
            expect(new Set(r.map((x) => x.left)).size, `${id} ${c} ${side}: one x for every row`).toBe(1);
            expect(new Set(r.map((x) => x.w)).size, `${id} ${c} ${side}: one width`).toBe(1);
            expect(r[0].jc, `${id} ${c} ${side} is right-aligned`).toMatch(/end|flex-end|right/);
          }
        }
      }
      // the strike is centred and the LTPs are the biggest figures, with the grey OI figures smaller
      const size = (id: string) => page.locator(id).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      await view(page, "oi");
      const strike = await size('[data-testid="chain-strike-1500"]');
      const ltp = await size('[data-testid="chain-ce-1500"]');
      const oi = await size('[data-col="oi"][data-k="1500"][data-t="CE"] span.relative');
      expect(strike).toBeGreaterThanOrEqual(ltp);
      expect(ltp).toBeGreaterThan(oi);
    });

    test("the tags, the price changes and the grey figures are readable (4.5 to 1) on the plain and on the shaded rows", async ({ page }) => {
      await open(page, w, h);
      await page.getByTestId("chain-summary-toggle").click();
      for (const id of ["oi", "buildup"] as const) {
        await view(page, id);
        const low = await page.getByTestId("chain-view").evaluate((root) => {
          const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
          const rgba = (css: string): [number, number, number, number] => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#fff"; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
          const lum = ([r, g, b]: number[]) => { const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          const backdrop = (el: Element): number[] => { let c: number[] = [255, 255, 255]; const chain: Element[] = []; for (let e: Element | null = el; e; e = e.parentElement) chain.push(e); for (const e of chain.reverse()) { const [r, g, b, a] = rgba(getComputedStyle(e).backgroundColor); if (a > 0) c = c.map((v, i) => Math.round([r, g, b][i] * a + v * (1 - a))); } return c; };
          const bad: string[] = [];
          const seen = new Set<Element>();
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement!;
            if (!n.textContent?.trim() || seen.has(el)) continue;
            seen.add(el);
            const b = el.getBoundingClientRect();
            if (!b.width || b.right < 0 || b.left > window.innerWidth) continue;
            const fg = rgba(getComputedStyle(el).color);
            const bg = backdrop(el);
            const mix = fg.slice(0, 3).map((v, i) => Math.round(v * fg[3] + bg[i] * (1 - fg[3])));
            const a = lum(mix), c2 = lum(bg);
            const ratio = (Math.max(a, c2) + 0.05) / (Math.min(a, c2) + 0.05);
            if (ratio < 4.5) bad.push(`${n.textContent.trim()} ${ratio.toFixed(2)}`);
          }
          return bad;
        });
        expect(low, `${id}: every text is at least 4.5 to 1`).toEqual([]);
      }
      // the shaded rows really are tinted (a tag in the money sits on it)
      const bg = await page.getByTestId("bu-tag-1470-CE").evaluate((e) => getComputedStyle(e.parentElement!).backgroundColor);
      const plain = await page.getByTestId("bu-tag-1470-PE").evaluate((e) => getComputedStyle(e.parentElement!).backgroundColor);
      expect(bg).not.toBe(plain);
    });

    test("44px tap areas on the controls, the Summary and Levels lines, the info icon and the top strikes", async ({ page }) => {
      await open(page, w, h);
      const hit = (id: string) => page.getByTestId(id).evaluate((b) => { const cs = getComputedStyle(b, "::after"); return [parseFloat(cs.width), parseFloat(cs.height)]; });
      for (const id of ["chain-view-oi", "chain-view-buildup", "chain-columns", "chain-change", "chain-spot-jump", "chain-summary-toggle", "chain-levels-toggle"]) {
        const [bw, bh] = await hit(id);
        expect(bh, `${id} is 44px tall`).toBeGreaterThanOrEqual(43.5);
        expect(bw, `${id} is 44px wide`).toBeGreaterThanOrEqual(43.5);
      }
      await view(page, "buildup");
      await page.getByTestId("chain-summary-toggle").click();
      const [iw, ih] = await hit("chain-tops-info-toggle");
      expect(Math.min(iw, ih)).toBeGreaterThanOrEqual(43.5);
      for (const id of ["top-CE-LB", "top-PE-SB", "top-CE-LU"]) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(43.5);
    });

    test("the thin Call/Put open-interest bar sits under the Summary line, with the same totals as the PCR, and has a text for a screen reader", async ({ page }) => {
      await open(page, w, h);
      const c = crafted();
      const s = oiShare(c.rows)!;
      const bar = page.getByTestId("chain-oi-split");
      const calls = Math.round(s.call * 100);
      const puts = Math.round(s.put * 100);
      await expect(bar).toHaveAttribute("aria-label", `Open interest: calls ${calls}%, puts ${puts}%`);
      const b = (await bar.boundingBox())!;
      const t = (await page.getByTestId("chain-summary-toggle").boundingBox())!;
      expect(b.height, "thin").toBeLessThanOrEqual(3.5);
      expect(Math.abs(b.y + b.height - (t.y + t.height)), "under the Summary line").toBeLessThan(1);
      expect(Math.abs(b.width - t.width)).toBeLessThan(1);
      const put = await bar.locator("i").evaluate((e) => (e as HTMLElement).style.width);
      expect(parseFloat(put)).toBeCloseTo(s.put * 100, 0);
      // the PCR is those two totals the other way round
      const pcr = c.rows.reduce((n, r) => n + r.put.oi, 0) / c.rows.reduce((n, r) => n + r.call.oi, 0);
      expect(s.put / s.call).toBeCloseTo(pcr, 6);
      // opened, it says it in words
      await page.getByTestId("chain-summary-toggle").click();
      await expect(page.getByTestId("chain-split-text")).toContainText(`calls ${calls}%, puts ${puts}%`);
    });

    test("no open interest anywhere: no bar", async ({ page }) => {
      await open(page, w, h, (e) => { const c = crafted(e); for (const r of c.rows) { r.call = { ...r.call, oi: 0, prevOi: 0 }; r.put = { ...r.put, oi: 0, prevOi: 0 }; } return c; });
      await expect(page.getByTestId("chain-oi-split")).toHaveCount(0);
    });

    test("no sideways scroll of the page in any view, with Summary and Levels open or closed", async ({ page }) => {
      await open(page, w, h);
      for (const isOpen of [false, true]) {
        if (isOpen) { await page.getByTestId("chain-summary-toggle").click(); await page.getByTestId("chain-levels-toggle").click(); }
        for (const id of ["oi", "greeks", "buildup"] as const) {
          await view(page, id);
          expect(await pageSideways(page), `${id}, open ${isOpen}`).toBeLessThanOrEqual(0);
          expect(await page.getByTestId("app-content").evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
        }
      }
    });

    test("the Greeks view has the same look: underlined tab, grey figures, pinned centre", async ({ page }) => {
      await open(page, w, h);
      await view(page, "greeks");
      await expect(page.getByTestId("chain-view-greeks")).toHaveAttribute("aria-checked", "true");
      await expect(page.locator('[data-head="1"]', { hasText: /^IV$/ })).toHaveCount(2);
      const colour = await page.locator('[data-col="iv"][data-k="1500"][data-t="CE"]').evaluate((e) => getComputedStyle(e).color);
      expect(colour).toBe("rgb(100, 116, 139)"); // #64748b
      const s = await page.getByTestId("chain-strike-1500").boundingBox();
      expect(Math.abs(s!.x + s!.width / 2 - w / 2)).toBeLessThanOrEqual(3);
    });
  });
}

test.describe("a phone turned sideways", () => {
  test.use(phone(844, 390));
  test("the page does not scroll sideways in any view, with Summary and Levels open", async ({ page }) => {
    await open(page, 844, 390);
    for (const id of ["oi", "greeks", "buildup"] as const) {
      await view(page, id);
      expect(await pageSideways(page), id).toBeLessThanOrEqual(0);
    }
    await page.getByTestId("chain-summary-toggle").click();
    await page.getByTestId("chain-levels-toggle").click();
    expect(await pageSideways(page)).toBeLessThanOrEqual(0);
    // Summary and Levels share one line, the table keeps its height for eight strikes
    await page.getByTestId("chain-summary-toggle").click();
    await page.getByTestId("chain-levels-toggle").click();
    const a = (await page.getByTestId("chain-summary-toggle").boundingBox())!;
    const b = (await page.getByTestId("chain-levels-toggle").boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  });
});
