import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TILES, inTile, tilesFor, type TileId } from "./categories";
import { REAL_CATEGORIES } from "./categories.fixture";

describe("category tiles", () => {
  it("the grid has the eleven tiles of the spec, in order", () => {
    assert.deepEqual(TILES.map((t) => t.label), ["Equity Funds", "Equity Hybrid", "Tax Saver", "Large Cap", "Mid Cap", "Small Cap", "Debt Funds", "Money Market Funds", "Index Funds", "FoFs", "Others"]);
  });
  it("every one of AMFI's real open-ended categories lands in at least one tile", () => {
    assert.ok(REAL_CATEGORIES.length > 90);
    for (const c of REAL_CATEGORIES) assert.ok(tilesFor(c).length >= 1, c);
  });
  it("Others holds only what matches nothing else", () => {
    for (const c of REAL_CATEGORIES) {
      const t = tilesFor(c);
      if (t.includes("others")) assert.deepEqual(t, ["others"], c);
    }
  });
  const cases: [string, TileId[]][] = [
    ["Equity Scheme - Large Cap Fund", ["equity", "large-cap"]],
    ["Equity Schemes - Large Cap Fund", ["equity", "large-cap"]], // the older generation of the same name
    ["Equity Scheme - Mid Cap Fund", ["equity", "mid-cap"]],
    ["Equity Schemes - Small Cap Fund", ["equity", "small-cap"]],
    ["Equity Scheme - Large & Mid Cap Fund", ["equity"]], // neither large nor mid on its own
    ["Equity Scheme - Flexi Cap Fund", ["equity"]],
    ["Equity Scheme - ELSS", ["equity", "tax-saver"]],
    ["Equity Schemes - ELSS- Tax Saver Fund", ["equity", "tax-saver"]],
    ["Hybrid Scheme - Aggressive Hybrid Fund", ["equity-hybrid"]],
    ["Hybrid Schemes - Balanced Advantage Fund/ Dynamic Asset Allocation", ["equity-hybrid"]],
    ["Hybrid Scheme - Conservative Hybrid Fund", ["debt"]],
    ["Debt Scheme - Corporate Bond Fund", ["debt"]],
    ["Income/Debt Oriented Schemes - Gilt Fund", ["debt"]],
    ["Debt Scheme - Money Market Fund", ["money-market", "debt"]],
    ["Income/Debt Oriented Schemes - Money Market Fund", ["money-market", "debt"]],
    ["Index Funds - Equity Funds", ["index"]],
    ["Other Scheme - Index Funds", ["index"]],
    ["Fund of Funds Scheme (Domestic) - Fund of Funds Scheme (Domestic)", ["fof"]],
    ["Other Scheme - FoF Overseas", ["fof"]],
    ["Overseas Fund of Funds - Fund of Funds investing overseas", ["fof"]],
    ["Solution Oriented Scheme - Retirement Fund", ["others"]],
    ["Children’s Fund - Childrens' Fund", ["others"]],
  ];
  for (const [category, want] of cases) {
    it(`${category} -> ${want.join(", ")}`, () => {
      assert.deepEqual([...tilesFor(category)].sort(), [...want].sort());
    });
  }
  it("a Large Cap fund is also an Equity fund, and a Mid Cap fund is not a Large Cap one", () => {
    assert.ok(inTile("Equity Scheme - Large Cap Fund", "equity"));
    assert.ok(!inTile("Equity Scheme - Mid Cap Fund", "large-cap"));
  });
  it("spacing and case in AMFI's text do not matter", () => {
    assert.ok(inTile("  equity   scheme -  LARGE CAP fund ", "large-cap"));
  });
});
