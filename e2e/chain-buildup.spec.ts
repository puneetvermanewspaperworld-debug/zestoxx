import { test, expect, type Page } from "@playwright/test";
import { simulateChain, type ChainRow, type OptionChain, type OptionLeg } from "../lib/options";
import { account, openApp, phone } from "./action-helpers";

/**
 * Buildup on the phone's option chain: a third view (OI | Greeks | Buildup) with a tag, the OI change and the price change % in columns of their own at
 * every strike of both sides, the pinned centre and the spot row kept, a legend, and in the Summary a table of the strike with the largest OI change
 * per category, for calls and for puts.
 */
const EXPIRIES = ["2026-11-12", "2026-11-19"];
const leg = (ltp: number, prevClose: number, oi: number, prevOi: number): OptionLeg => ({ ltp, prevClose, oi, prevOi, volume: 500, iv: 15 });
const flat = () => leg(20, 20, 100_000, 100_000); // no change in either: no tag
const UP = 24; // +20% on 20
const DOWN = 16; // -20% on 20

/** a RELIANCE chain around 1,500 with a known tag at some strikes (and none at the others) */
function crafted(expiry = EXPIRIES[0], source: "live" | "simulated" = "live"): OptionChain {
  const rows: ChainRow[] = [];
  for (let k = 1300; k <= 1700; k += 10) rows.push({ strike: k, call: flat(), put: flat() });
  const at = (k: number) => rows.find((r) => r.strike === k)!;
  // calls
  at(1480).call = leg(UP, 20, 600_000, 100_000); // long buildup, +5.00 L
  at(1490).call = leg(UP, 20, 1_000_000, 100_000); // long buildup, +9.00 L: the largest on the calls
  at(1500).call = leg(DOWN, 20, 400_000, 100_000); // short buildup, +3.00 L
  at(1510).call = leg(UP, 20, 20_000, 100_000); // short covering, -80.0k
  at(1520).call = leg(DOWN, 20, 40_000, 100_000); // long unwinding, -60.0k
  at(1540).call = leg(DOWN, 20, 40_000, 100_000); // long unwinding, -60.0k: a tie with 1520, which is the lower strike
  // puts
  at(1480).put = leg(DOWN, 20, 500_000, 100_000); // short buildup, +4.00 L
  at(1490).put = leg(DOWN, 20, 800_000, 100_000); // short buildup, +7.00 L: the largest on the puts
  at(1500).put = leg(UP, 20, 300_000, 100_000); // long buildup, +2.00 L
  at(1520).put = leg(DOWN, 20, 50_000, 100_000); // long unwinding, -50.0k
  // a strike with a price change and no OI change, and one the other way round: no tag
  at(1530).call = leg(UP, 20, 100_000, 100_000);
  at(1530).put = leg(20, 20, 400_000, 100_000);
  return { underlying: "RELIANCE", spot: 1500, expiry, expiries: EXPIRIES, lotSize: 250, rows, vix: 17.3, source } as OptionChain;
}

async function open(page: Page, w: number, h: number, chain: (e: string) => OptionChain | null = crafted, extra?: (p: Page) => Promise<void>) {
  await page.setViewportSize({ width: w, height: h });
  await openApp(page, "/app/options", account(), async (p) => {
    await p.route("**/api/options-chain**", (r) => {
      const c = chain(new URL(r.request().url()).searchParams.get("expiry") ?? EXPIRIES[0]);
      return r.fulfill({ json: c ?? { source: "unavailable" } });
    });
    await p.route("**/api/option-quote**", (r) => r.fulfill({ json: { source: "unavailable" } }));
    await extra?.(p);
  });
  await page.getByTestId("chain-spot-row").waitFor();
  await page.waitForTimeout(300);
}
const rect = async (page: Page, id: string) => (await page.getByTestId(id).boundingBox())!;
const buildup = async (page: Page) => {
  await page.getByTestId("chain-view-buildup").click();
  await page.getByTestId("chain-legend").waitFor();
  await page.waitForTimeout(300);
};

for (const [w, h] of [[360, 800], [390, 844]] as const) {
  test.describe(`${w}x${h}`, () => {
    test.use(phone(w, h));

    test("the Buildup view tags the Call and the Put at each strike with its OI change and premium change; a strike with none shows no tag", async ({ page }) => {
      await open(page, w, h);
      await buildup(page);
      const tag = (k: number, t: "CE" | "PE") => page.getByTestId(`bu-tag-${k}-${t}`);
      // both sides of one strike, each its own tag
      await expect(tag(1480, "CE")).toHaveText("LB");
      await expect(tag(1480, "PE")).toHaveText("SB");
      await expect(tag(1500, "CE")).toHaveText("SB");
      await expect(tag(1500, "PE")).toHaveText("LB");
      await expect(tag(1510, "CE")).toHaveText("SC");
      await expect(tag(1520, "CE")).toHaveText("LU");
      await expect(tag(1520, "PE")).toHaveText("LU");
      for (const [k, t, kind] of [[1480, "CE", "long-buildup"], [1480, "PE", "short-buildup"], [1510, "CE", "short-covering"], [1520, "PE", "long-unwinding"]] as const) await expect(tag(k, t)).toHaveAttribute("data-kind", kind);
      // the figures, in their own columns: the OI change keeps its unit, the price change is in per cent (the header says so)
      await expect(page.getByTestId("bu-oi-1480-CE")).toHaveText("+5.0L");
      await expect(page.getByTestId("bu-px-1480-CE")).toHaveText("+20.0");
      await expect(page.getByTestId("bu-oi-1510-CE")).toHaveText("−80.0k");
      await expect(page.getByTestId("bu-px-1480-PE")).toHaveText("−20.0");
      await expect(page.getByTestId("bu-oi-1490-PE")).toHaveText("+7.0L");
      await expect(page.getByTestId("bu-px-1480-CE")).toHaveAttribute("aria-label", "+20.0 per cent");
      await expect(page.locator('[data-head="1"]', { hasText: /^Price\s*%$/ })).toHaveCount(2);
      await expect(page.locator('[data-head="1"]', { hasText: /^OI chg$/ })).toHaveCount(2);
      await expect(page.locator('[data-head="1"]', { hasText: /^Tag$/ })).toHaveCount(2);
      // no change in the premium, or none in the OI: the figures are there (they are real) and there is no tag; the cell is blank, not "--"
      for (const [k, t] of [[1530, "CE"], [1530, "PE"], [1300, "CE"], [1300, "PE"]] as const) {
        await expect(tag(k, t)).toHaveCount(0);
        await expect(page.getByTestId(`bu-none-${k}-${t}`)).toHaveText("");
      }
      await expect(page.getByTestId("bu-oi-1530-CE")).toHaveText("0");
      await expect(page.getByTestId("bu-px-1530-CE")).toHaveText("+20.0");
      // green is the price going up, red the price going down; bold is the open interest going up, regular its going down
      const look = (loc: ReturnType<Page["getByTestId"]>) => loc.evaluate((e) => { const cs = getComputedStyle(e); return cs.color + "|" + cs.fontWeight; });
      const GREEN = "rgb(4, 120, 87)"; // #047857
      const RED = "rgb(190, 18, 60)"; // #be123c
      const looks = [await look(tag(1480, "CE")), await look(tag(1500, "CE")), await look(tag(1510, "CE")), await look(tag(1520, "CE"))];
      expect(looks.map((l) => l.split("|")[0]), "LB green, SB red, SC green, LU red").toEqual([GREEN, RED, GREEN, RED]);
      const weight = looks.map((l) => Number(l.split("|")[1]));
      expect(weight[0], "LB is bold").toBeGreaterThanOrEqual(600);
      expect(weight[1], "SB is bold").toBeGreaterThanOrEqual(600);
      expect(weight[2], "SC is regular").toBeLessThanOrEqual(400);
      expect(weight[3], "LU is regular").toBeLessThanOrEqual(400);
      expect(await look(tag(1480, "PE")), "the same kind looks the same on the put side").toBe(looks[1]);
      for (const [code, l] of [["LB", looks[0]], ["SB", looks[1]], ["SC", looks[2]], ["LU", looks[3]]] as const) expect(await look(page.getByTestId(`legend-${code}`).locator("span").first()), `the legend's ${code}`).toBe(l);
      // the price change is coloured by its direction too
      expect((await look(page.getByTestId("bu-px-1480-CE"))).split("|")[0]).toBe(GREEN);
      expect((await look(page.getByTestId("bu-px-1480-PE"))).split("|")[0]).toBe(RED);
    });

    test("the pinned centre and the spot row are kept, nothing scrolls sideways, and nothing overlaps", async ({ page }) => {
      await open(page, w, h);
      const centre = async () => ({ s: Math.round((await rect(page, "chain-strike-1500")).x), c: Math.round((await rect(page, "chain-ce-1500")).x), p: Math.round((await rect(page, "chain-pe-1500")).x) });
      const before = await centre();
      await buildup(page);
      await expect(page.getByTestId("chain-spot-row")).toBeVisible();
      await expect(page.getByTestId("chain-spot-price")).toHaveText("₹1,500.00");
      expect(await centre(), "Call LTP, Strike and Put LTP are where they were").toEqual(before);
      const sc = page.getByTestId("chain-scroll");
      const over = await sc.evaluate((e) => e.scrollWidth - e.clientWidth);
      // on a 390 screen the tag, the OI change and the price change fit on both sides; on a 360 one the outer columns may scroll, inside the table, and only a little
      if (w >= 390) expect(over, "both sides fit without scrolling the table").toBeLessThanOrEqual(1);
      else expect(over, "a few pixels, not a screenful").toBeLessThanOrEqual(40);
      // wherever it is, every tag can be brought fully into view: at the left end the call tags, at the right end the put tags
      await sc.evaluate((e) => (e.scrollLeft = 0));
      expect((await page.getByTestId("bu-tag-1480-CE").boundingBox())!.x, "the call tags at the left end").toBeGreaterThanOrEqual(11.5);
      await sc.evaluate((e) => (e.scrollLeft = e.scrollWidth));
      const put = (await page.getByTestId("bu-tag-1500-PE").boundingBox())!;
      expect(put.x + put.width, "the put tags at the right end").toBeLessThanOrEqual(w - 11.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      // every figure is inside its own column, and no two overlap
      const bad = await page.locator('[data-col^="bu"]').evaluateAll((cells) =>
        cells.flatMap((c) => {
          const r = c.getBoundingClientRect();
          return [...c.querySelectorAll("span")].filter((e) => e.children.length === 0 && e.textContent).filter((e) => { const k = e.getBoundingClientRect(); return k.left < r.left - 0.5 || k.right > r.right + 0.5; }).map((e) => `${e.textContent} sticks out`);
        })
      );
      expect(bad).toEqual([]);
      // the controls row fits in every view
      for (const id of ["chain-view-oi", "chain-view-buildup"]) {
        await page.getByTestId(id).click();
        expect(await page.getByTestId("chain-controls").evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `${id}: the controls fit`).toBe(true);
      }
    });

    test("a tap on a Buildup cell opens the contract sheet like any other cell", async ({ page }) => {
      await open(page, w, h);
      await buildup(page);
      await page.getByTestId("bu-tag-1480-PE").click();
      await expect(page.getByRole("dialog", { name: "RELIANCE 12 NOV 1480 PE" })).toBeVisible();
    });

    test("the largest OI change per category is in the Summary, for calls and for puts, by absolute size; a tie takes the lower strike; none says none", async ({ page }) => {
      await open(page, w, h);
      await expect(page.getByTestId("chain-tops")).toHaveCount(0); // closed to begin with
      expect((await rect(page, "chain-summary-toggle")).height, "one line").toBeLessThanOrEqual(44);
      await page.getByTestId("chain-summary-toggle").click();
      const strike = (side: string, code: string) => page.getByTestId(`top-${side}-${code}-strike`);
      await expect(strike("CE", "LB")).toHaveText("1490"); // +9.00 L beats +5.00 L
      await expect(strike("CE", "SB")).toHaveText("1500");
      await expect(strike("CE", "SC")).toHaveText("1510");
      await expect(strike("CE", "LU")).toHaveText("1520"); // 1520 and 1540 tie: the lower
      await expect(strike("PE", "SB")).toHaveText("1490");
      await expect(strike("PE", "LB")).toHaveText("1500");
      await expect(strike("PE", "LU")).toHaveText("1520");
      await expect(page.getByTestId("top-PE-SC-none")).toHaveText("none"); // no put is in short covering
      // the table shows the strike and the tag only; what is behind each strike is on the button, for a screen reader and for a long press
      await expect(page.getByTestId("top-CE-LB")).toHaveAttribute("aria-label", /Long Buildup, call strike 1490: OI change \+9\.00 L, price \+20\.0 per cent/);
      await expect(page.getByTestId("top-CE-SC")).toHaveAttribute("title", "OI change −80.0k, price +20.0%");
      await expect(page.getByTestId("top-CE-LB")).not.toContainText("+9");
      // a table of category against Calls and Puts, with an info icon; the one line that says what "largest" means is behind it
      await expect(page.getByTestId("chain-tops")).toContainText("Top buildup strikes");
      for (const code of ["LB", "SB", "SC", "LU"]) await expect(page.getByTestId("chain-tops").getByText(code, { exact: true })).toBeVisible();
      await expect(page.getByTestId("chain-tops-info")).toHaveCount(0);
      await page.getByTestId("chain-tops-info-toggle").click();
      await expect(page.getByTestId("chain-tops-info")).toContainText("up or down");
      expect(await page.getByTestId("chain-tops-info-toggle").evaluate((b) => parseFloat(getComputedStyle(b, "::after").height)), "a 44px hit area").toBeGreaterThanOrEqual(43.5);
      await expect(page.getByTestId("chain-tops-info-toggle")).toHaveAttribute("title", /lower strike/);
      for (const id of ["top-CE-LB", "top-PE-SB", "top-CE-LU"]) expect((await rect(page, id)).height, id).toBeGreaterThanOrEqual(43.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });

    test("tapping a top entry scrolls the table to that strike and marks it for a moment", async ({ page }) => {
      await open(page, w, h);
      await page.getByTestId("chain-summary-toggle").click();
      const sc = page.getByTestId("chain-scroll");
      await sc.evaluate((e) => (e.scrollTop = 0)); // the first strikes: 1490 is out of view
      await page.waitForTimeout(200);
      const middle = async (k: number) => { const t = await rect(page, "chain-scroll"); const s = await rect(page, `chain-strike-${k}`); return s.y + s.height / 2 - (t.y + 32 + (t.height - 32) / 2); };
      expect(Math.abs(await middle(1490))).toBeGreaterThan(60);
      await page.getByTestId("top-CE-LB").click();
      await expect(page.getByTestId("chain-strike-1490")).toHaveAttribute("data-flash", "1");
      await page.waitForTimeout(250);
      expect(Math.abs(await middle(1490)), "the strike is in the middle of the table").toBeLessThan(24);
      // only that strike is marked, and the mark goes
      await expect(page.locator('[data-testid^="chain-strike-"][data-flash="1"]')).toHaveCount(1);
      await expect(page.getByTestId("chain-strike-1490")).not.toHaveAttribute("data-flash", "1", { timeout: 4000 });
      // another entry, on the puts, in the Buildup view
      await buildup(page);
      await sc.evaluate((e) => (e.scrollTop = e.scrollHeight));
      await page.getByTestId("top-PE-LU").click();
      await page.waitForTimeout(250);
      expect(Math.abs(await middle(1520))).toBeLessThan(24);
      // a category with none cannot be tapped
      await expect(page.getByTestId("top-PE-SC")).toBeDisabled();
    });

    test("the legend explains the four tags, wrapping onto two lines and never cut off, and the note says where the tags come from", async ({ page }) => {
      await open(page, w, h);
      await expect(page.getByTestId("chain-legend")).toHaveCount(0); // only in the Buildup view
      await buildup(page);
      const legend = page.getByTestId("chain-legend");
      expect((await legend.boundingBox())!.height, "two lines at most").toBeLessThanOrEqual(36);
      expect(await legend.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), "nothing is cut off").toBe(true);
      for (const code of ["LB", "SB", "SC", "LU"]) { const r = (await page.getByTestId(`legend-${code}`).boundingBox())!; expect(r.x).toBeGreaterThanOrEqual(11.5); expect(r.x + r.width).toBeLessThanOrEqual(w - 11.5); }
      await expect(page.getByTestId("chain-legend-key")).toHaveText("Green: price up · Red: price down · Bold: OI up");
      for (const [code, name] of [["LB", "Long Buildup"], ["SB", "Short Buildup"], ["SC", "Short Covering"], ["LU", "Long Unwinding"]]) await expect(page.getByTestId(`legend-${code}`)).toContainText(name);
      await expect(page.getByTestId("legend-LB")).toHaveAttribute("title", /Premium up, open interest up/);
      await expect(page.getByTestId("legend-LU")).toHaveAttribute("title", /Premium down, open interest down/);
      await expect(page.getByTestId("chain-buildup-note")).toContainText("previous session");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  });
}

test.describe("where the tags come from", () => {
  test.use(phone(390, 844));

  test("with the market closed they say they are from the last session, in the view and in the Summary", async ({ page }) => {
    await open(page, 390, 844, crafted, async (p) => { await p.clock.setSystemTime(new Date("2026-11-11T21:00:00+05:30")); });
    await buildup(page);
    await expect(page.getByTestId("chain-buildup-note")).toContainText("last session");
    await page.getByTestId("chain-summary-toggle").click();
    await expect(page.getByTestId("chain-tops")).toContainText("last session");
  });

  test("a simulated chain says its tags are generated", async ({ page }) => {
    await open(page, 390, 844, () => crafted(EXPIRIES[0], "simulated"));
    await buildup(page);
    await expect(page.getByTestId("chain-buildup-note")).toContainText("Simulated chain");
    await page.getByTestId("chain-summary-toggle").click();
    await expect(page.getByTestId("chain-tops")).toContainText("Simulated chain");
  });

  test("a chain with no strike that can be tagged says so, and the Summary says none everywhere", async ({ page }) => {
    const none = (e: string) => { const c = crafted(e); for (const r of c.rows) { r.call = flat(); r.put = flat(); } return c; };
    await open(page, 390, 844, none);
    await buildup(page);
    await expect(page.getByTestId("chain-buildup-note")).toContainText("No strike has both");
    await expect(page.locator('[data-testid^="bu-tag-"]')).toHaveCount(0);
    await page.getByTestId("chain-summary-toggle").click();
    await expect(page.locator('[data-testid$="-none"]')).toHaveCount(8);
  });

  test("the choice of view is remembered, and the Columns and Chg buttons are for the other two views", async ({ page }) => {
    await open(page, 390, 844);
    await expect(page.getByTestId("chain-columns")).toBeVisible();
    await buildup(page);
    await expect(page.getByTestId("chain-columns")).toHaveCount(0);
    await expect(page.getByTestId("chain-change")).toHaveCount(0);
    await expect(page.getByTestId("chain-view-buildup")).toHaveAttribute("aria-checked", "true");
    expect((await page.getByTestId("chain-view-buildup").evaluate((b) => { const cs = getComputedStyle(b, "::after"); return parseFloat(cs.height); }))).toBeGreaterThanOrEqual(43.5);
    await page.reload();
    await page.getByTestId("chain-spot-row").waitFor();
    await expect(page.getByTestId("chain-view-buildup")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("chain-view-oi").click();
    await expect(page.getByTestId("chain-legend")).toHaveCount(0);
  });
});

test("a wide screen's options page has no Buildup view of the phone's chain", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page, "/app/options", account(), async (p) => {
    await p.route("**/api/options-chain**", (r) => r.fulfill({ json: simulateChain("NIFTY50", 25250, EXPIRIES[0], new Date("2026-11-11T08:20:00Z")) }));
  });
  await expect(page.getByTestId("phone-options")).toHaveCount(0);
  await expect(page.getByTestId("chain-view-buildup")).toHaveCount(0);
});
