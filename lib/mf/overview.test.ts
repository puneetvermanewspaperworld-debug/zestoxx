import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildDetail, buildOverview, isTileId, median, rowsForTile, sortByReturn, type FundRow } from "./overview";
import { MIXES, evaluateMix } from "./mixes";
import { calculate, monthlyNeeded } from "./sip";
import { MF_DISCLAIMER, MF_EMPTY, MF_SOURCE } from "./disclaimer";
import { COVERAGE_LABEL } from "./universe";

const row = (code: number, category: string, over: Partial<FundRow> = {}): FundRow => ({
  code, name: `Fund ${code}`, amc: "Test MF", category, nav: 100, navDate: "2026-11-13", ret1m: null, ret6m: null, ret1y: null, ret3y: null, ret5y: null, ...over,
});

describe("median", () => {
  it("middle value, or the mean of the middle two, ignoring missing ones", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([null, 5, null]), 5);
    assert.equal(median([null, null]), null);
    assert.equal(median([]), null);
  });
});

describe("category overview", () => {
  const rows = [
    row(1, "Equity Scheme - Large Cap Fund", { ret1y: 10, ret3y: 12 }),
    row(2, "Equity Schemes - Large Cap Fund", { ret1y: 20, ret3y: 14 }),
    row(3, "Equity Scheme - Mid Cap Fund", { ret1y: 30, ret3y: null }),
    row(4, "Debt Scheme - Money Market Fund", { ret1y: 6, ret3y: 6.5 }),
  ];
  const o = Object.fromEntries(buildOverview(rows).map((t) => [t.id, t]));
  it("counts a scheme in every tile its category belongs to", () => {
    assert.equal(o["equity"].count, 3);
    assert.equal(o["large-cap"].count, 2);
    assert.equal(o["mid-cap"].count, 1);
    assert.equal(o["debt"].count, 1);
    assert.equal(o["money-market"].count, 1);
    assert.equal(o["small-cap"].count, 0);
  });
  it("median returns are over the schemes that have one, null when none do", () => {
    assert.equal(o["large-cap"].median1y, 15);
    assert.equal(o["large-cap"].median3y, 13);
    assert.equal(o["equity"].median1y, 20);
    assert.equal(o["equity"].median3y, 13); // the Mid Cap fund has no 3-year figure
    assert.equal(o["small-cap"].median1y, null);
  });
  it("all eleven tiles are always listed", () => {
    assert.equal(buildOverview([]).length, 11);
    assert.ok(buildOverview([]).every((t) => t.count === 0 && t.median1y === null));
  });
  it("rowsForTile follows the same rule", () => {
    assert.deepEqual(rowsForTile(rows, "large-cap").map((r) => r.code), [1, 2]);
    assert.ok(isTileId("large-cap") && !isTileId("nope"));
  });
});

describe("sorting by return", () => {
  const rows = [row(1, "x", { ret1y: 5 }), row(2, "x", { ret1y: null }), row(3, "x", { ret1y: 12 }), row(4, "x", { ret1y: -3 }), row(5, "x", { ret1y: 12 })];
  it("best first, ties by name, funds with no figure last", () => {
    assert.deepEqual(sortByReturn(rows, "ret1y").map((r) => r.code), [3, 5, 1, 4, 2]);
  });
  it("does not change its input", () => {
    const copy = rows.map((r) => r.code);
    sortByReturn(rows, "ret1y");
    assert.deepEqual(rows.map((r) => r.code), copy);
  });
});

describe("scheme detail", () => {
  it("works the returns out from the stored series", () => {
    const d = buildDetail({ ...row(1, "x"), isin: null }, [{ date: "2025-11-13", nav: 100 }, { date: "2026-11-13", nav: 120 }]);
    assert.ok(Math.abs((d.returns["1y"] as number) - 20) < 1e-9);
    assert.equal(d.returns["3y"], null);
  });
});

describe("sample mixes", () => {
  const tiles = [
    { id: "large-cap" as const, median3y: 12 },
    { id: "equity-hybrid" as const, median3y: 10 },
    { id: "debt" as const, median3y: 6 },
  ];
  it("each mix adds to 100% and names categories only, never a fund", () => {
    for (const m of MIXES) {
      assert.equal(m.parts.reduce((s, p) => s + p.pct, 0), 100, m.title);
      assert.ok(m.parts.every((p) => /^[a-z-]+$/.test(p.tile)));
    }
    assert.ok(MIXES.some((m) => m.title === "Aiming for ₹5 lakh in 5 years"));
  });
  it("a mix's return is its parts' median 3-year returns, weighted", () => {
    const r = evaluateMix(MIXES[0], tiles); // 40% large cap, 40% equity hybrid, 20% debt
    assert.deepEqual(r.partReturns, [12, 10, 6]);
    assert.ok(Math.abs((r.mixReturn as number) - (0.4 * 12 + 0.4 * 10 + 0.2 * 6)) < 1e-9);
  });
  it("with a category that has no figure yet there is no mix return, not a guess", () => {
    const r = evaluateMix(MIXES[1], tiles); // needs mid cap and index too
    assert.equal(r.mixReturn, null);
    assert.ok(r.partReturns.includes(null));
  });
  it("the monthly amount to reach the goal is the inverse of the SIP calculation", () => {
    const need = monthlyNeeded(500_000, 5, 11)!;
    // the calculator takes whole rupees, so compare after rounding the amount: within one rupee a month's worth of growth
    const back = calculate({ mode: "sip", amount: need, years: 5, yearlyReturnPct: 11 }).futureValue;
    assert.ok(Math.abs(back - 500_000) / 500_000 < 0.002, `${need} -> ${back}`);
    assert.ok(Math.abs(calculate({ mode: "sip", amount: Math.round(need), years: 5, yearlyReturnPct: 11 }).futureValue - back) < 1e-9);
    assert.equal(monthlyNeeded(0, 5, 11), null);
    assert.equal(monthlyNeeded(500_000, 0, 11), null);
  });
});

describe("what the pages say", () => {
  it("the required text, exactly", () => {
    assert.equal(MF_DISCLAIMER, "Mutual fund investments are subject to market risks. Past performance does not guarantee future returns. Zestoxx does not distribute or recommend funds.");
    assert.equal(MF_EMPTY, "Data not available yet");
    assert.equal(COVERAGE_LABEL, "Direct plans, Growth option");
    assert.match(MF_SOURCE, /Direct plans, Growth option/);
  });
  const files = [
    "components/views/FundsView.tsx",
    "components/views/FundCategoryView.tsx",
    "components/views/FundSchemeView.tsx",
    "components/FundsNotes.tsx",
    "app/app/funds/page.tsx",
  ];
  it("no purchase, SIP set-up or 'Invest' button on any mutual fund page", () => {
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      assert.doesNotMatch(src, /Invest Now|Buy Now|Start SIP|Start a SIP|Purchase|Redeem|Apply Now/i, f);
      assert.doesNotMatch(src, /<button[^>]*>\s*(Invest|Buy|Purchase)/i, f);
    }
  });
  it("every mutual fund page carries the disclaimer and the coverage label", () => {
    for (const f of ["components/views/FundsView.tsx", "components/views/FundCategoryView.tsx", "components/views/FundSchemeView.tsx"]) {
      const src = fs.readFileSync(f, "utf8");
      assert.match(src, /<FundsFooter \/>/, f);
      assert.match(src, /<CoverageChip \/>/, f);
    }
  });
  it("the pages read only stored data: no generated numbers", () => {
    for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /Math\.random|seededRandom|strSeed/, f);
  });
});
