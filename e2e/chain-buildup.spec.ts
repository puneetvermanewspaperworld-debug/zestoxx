import { test, expect, type Page } from "@playwright/test";
import { simulateChain, type ChainRow, type OptionChain, type OptionLeg } from "../lib/options";
import { account, openApp, phone } from "./action-helpers";

/**
 * Buildup on the phone's option chain: a third view (OI | Greeks | Buildup) with a tag chip, the OI change and the premium's change at every strike of
 * both sides, the pinned centre and the spot row kept, a legend, and in the Summary the strike with the largest OI change per category.
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
      // the figures beside the tag
      await expect(page.getByTestId("bu-oi-1480-CE")).toHaveText("+5.00 L");
      await expect(page.getByTestId("bu-px-1480-CE")).toHaveText("+20.0%");
      await expect(page.getByTestId("bu-oi-1510-CE")).toHaveText("−80.0k");
      await expect(page.getByTestId("bu-px-1480-PE")).toHaveText("−20.0%");
      await expect(page.getByTestId("bu-oi-1490-PE")).toHaveText("+7.00 L");
      // no change in the premium, or none in the OI, or nothing at all: no tag, and nothing made up
      for (const [k, t] of [[1530, "CE"], [1530, "PE"], [1300, "CE"], [1300, "PE"]] as const) {
        await expect(tag(k, t)).toHaveCount(0);
        await expect(page.getByTestId(`bu-none-${k}-${t}`)).toHaveText("--");
      }
      // one colour per tag, and the legend uses the same colours
      const bg = (loc: ReturnType<Page["getByTestId"]>) => loc.evaluate((e) => getComputedStyle(e).backgroundColor);
      const colours = [await bg(tag(1480, "CE")), await bg(tag(1500, "CE")), await bg(tag(1510, "CE")), await bg(tag(1520, "CE"))];
      expect(new Set(colours).size, "four different colours").toBe(4);
      expect(await bg(tag(1480, "PE")), "the same kind has the same colour on the put side").toBe(await bg(tag(1500, "CE")));
      for (const [code, c] of [["LB", colours[0]], ["SB", colours[1]], ["SC", colours[2]], ["LU", colours[3]]] as const) expect(await bg(page.getByTestId(`legend-${code}`).locator("span").first())).toBe(c);
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
      expect(await sc.evaluate((e) => e.scrollWidth - e.clientWidth), "both sides fit without scrolling the table").toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      // each tag cell holds its tag and its two figures, side by side, inside the cell
      const bad = await page.locator('[data-col="buildup"]').evaluateAll((cells) =>
        cells.flatMap((c) => {
          const r = c.getBoundingClientRect();
          const kids = [...c.querySelectorAll("span")].filter((e) => e.children.length === 0).map((e) => e.getBoundingClientRect());
          const out: string[] = [];
          for (const k of kids) if (k.left < r.left - 0.5 || k.right > r.right + 0.5) out.push(`${c.textContent} sticks out`);
          for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (kids[i].left < kids[j].right - 0.5 && kids[j].left < kids[i].right - 0.5 && kids[i].top < kids[j].bottom - 0.5 && kids[j].top < kids[i].bottom - 0.5) out.push(`${c.textContent} overlaps`);
          return out;
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
      expect((await rect(page, "chain-summary-toggle")).height, "one line").toBeLessThanOrEqual(34);
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
      await expect(page.getByTestId("top-CE-LB")).toContainText("+9.00 L");
      await expect(page.getByTestId("top-CE-LB")).toContainText("+20.0%");
      await expect(page.getByTestId("top-CE-SC")).toContainText("−80.0k");
      // it says what "largest" means
      await expect(page.getByTestId("chain-tops")).toContainText("by size (up or down)");
      await expect(page.getByTestId("chain-tops")).toContainText("lower strike");
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

    test("the legend explains the four tags in one line, and the note says where the tags come from", async ({ page }) => {
      await open(page, w, h);
      await expect(page.getByTestId("chain-legend")).toHaveCount(0); // only in the Buildup view
      await buildup(page);
      const legend = page.getByTestId("chain-legend");
      expect((await legend.boundingBox())!.height, "one line").toBeLessThanOrEqual(28);
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
