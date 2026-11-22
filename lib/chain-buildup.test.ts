import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BUILDUP_MARK, anyBuildup, buildupMarkClass, buildupNote, legFigures, strikeBuildup, topPerCategory } from "./chain-buildup";
import { buildupGrid, classifyBuildup, legBuildup, type ChainRow, type OptionLeg } from "./options";

// a leg that traded, with last session's figures: price 100 -> `ltp`, OI 1000 -> `oi`
const leg = (ltp: number, oi: number, o: Partial<OptionLeg> = {}): OptionLeg => ({ ltp, prevClose: 100, oi, prevOi: 1000, volume: 500, iv: 15, ...o });
const row = (strike: number, call: OptionLeg, put: OptionLeg): ChainRow => ({ strike, call, put });
const flat = leg(100, 1000);

test("the four categories: price and open interest, up or down", () => {
  assert.equal(strikeBuildup(row(1, leg(110, 1500), flat)).call.kind, "long-buildup"); // price up, OI up
  assert.equal(strikeBuildup(row(1, leg(90, 1500), flat)).call.kind, "short-buildup"); // price down, OI up
  assert.equal(strikeBuildup(row(1, leg(110, 600), flat)).call.kind, "short-covering"); // price up, OI down
  assert.equal(strikeBuildup(row(1, leg(90, 600), flat)).call.kind, "long-unwinding"); // price down, OI down
  // the put side is classified the same way
  assert.equal(strikeBuildup(row(1, flat, leg(110, 1500))).put.kind, "long-buildup");
  assert.equal(strikeBuildup(row(1, flat, leg(90, 600))).put.kind, "long-unwinding");
  // the figures shown with a tag: OI change and the premium's change in percent
  const b = strikeBuildup(row(1, leg(110, 1500), flat)).call;
  assert.equal(b.oiChange, 500);
  assert.equal(b.priceChangePct, 10);
});

test("a missing or zero input gives no tag, and no invented figure", () => {
  assert.equal(classifyBuildup(0, 5), null);
  assert.equal(classifyBuildup(5, 0), null);
  assert.equal(legBuildup(leg(100, 1500)).kind, null); // no price change
  assert.equal(legBuildup(leg(110, 1000)).kind, null); // no OI change
  assert.equal(legBuildup(leg(110, 1500, { prevOi: 0 })).kind, null); // no previous OI
  assert.equal(legBuildup(leg(110, 1500, { prevClose: 0 })).kind, null); // no previous close
  assert.equal(legBuildup(leg(0, 1500)).kind, null); // no price
  assert.equal(legBuildup(leg(110, 0)).kind, null); // no OI
  assert.equal(legBuildup(leg(110, 1500, { volume: 0 })).kind, null); // it has not traded
  assert.deepEqual(legBuildup(leg(110, 1500, { prevOi: 0 })), { kind: null, priceChangePct: 0, oiChange: 0 });
  assert.equal(anyBuildup([row(1, flat, flat), row(2, leg(100, 1500), flat)]), false);
  assert.equal(anyBuildup([row(1, flat, flat), row(2, leg(110, 1500), flat)]), true);
});

test("the largest open-interest change per category is by absolute size, per side", () => {
  const rows = [
    row(100, leg(110, 1300), leg(90, 1400)), // call LB +300; put SB +400
    row(110, leg(110, 1900), leg(90, 1900)), // call LB +900; put SB +900
    row(120, leg(110, 1200), leg(110, 300)), // call LB +200; put SC -700
    row(130, leg(90, 100), leg(90, 700)), // call LU -900; put LU -300
    row(140, leg(90, 400), flat), // call LU -600
  ];
  const calls = topPerCategory(rows, "call");
  assert.equal(calls["long-buildup"]?.strike, 110);
  assert.equal(calls["long-unwinding"]?.strike, 130); // -900 beats -600 by absolute size
  assert.equal(calls["long-unwinding"]?.oiChange, -900);
  assert.equal(calls["short-buildup"], null); // none
  assert.equal(calls["short-covering"], null);
  const puts = topPerCategory(rows, "put");
  assert.equal(puts["short-buildup"]?.strike, 110);
  assert.equal(puts["short-covering"]?.strike, 120);
  assert.equal(puts["short-covering"]?.oiChange, -700);
  assert.equal(puts["long-unwinding"]?.strike, 130);
  assert.equal(puts["long-buildup"], null);
  assert.deepEqual(topPerCategory([], "call"), { "long-buildup": null, "short-buildup": null, "short-covering": null, "long-unwinding": null });
});

test("a tie goes to the lower strike, however the strikes are ordered", () => {
  const a = row(100, leg(110, 1500), flat);
  const b = row(120, leg(115, 1500), flat);
  assert.equal(topPerCategory([a, b], "call")["long-buildup"]?.strike, 100);
  assert.equal(topPerCategory([b, a], "call")["long-buildup"]?.strike, 100);
});

test("the note says where the tags come from", () => {
  assert.match(buildupNote("simulated", true), /Simulated chain/);
  assert.match(buildupNote("live", false), /last session/);
  assert.match(buildupNote("live", true), /previous session/);
  assert.match(buildupNote("live", null), /previous session/); // until the market's state is known nothing is claimed about it
});

test("the chain and the Buildup page use the same classification: one function, called by both", () => {
  const rows = [row(100, leg(110, 1500), leg(90, 600)), row(110, flat, leg(110, 1500)), row(120, leg(90, 1500), leg(110, 600))];
  // what the page's grid says for each strike is what the chain says
  const grid = buildupGrid(rows, 110, 8);
  assert.equal(grid.length, 3);
  for (const g of grid) {
    const mine = strikeBuildup(rows.find((r) => r.strike === g.strike)!);
    assert.deepEqual(mine.call, g.call);
    assert.deepEqual(mine.put, g.put);
  }
  // and neither screen has a rule of its own: the rule is written once, in lib/options.ts
  const src = (p: string) => fs.readFileSync(p, "utf8");
  assert.equal((src("lib/options.ts").match(/export function classifyBuildup/g) ?? []).length, 1);
  assert.match(src("lib/chain-buildup.ts"), /import \{[^}]*legBuildup[^}]*\} from "\.\/options"/);
  assert.match(src("lib/options.ts"), /buildupGrid[\s\S]*legBuildup\(r\.call\)/);
  for (const f of ["components/views/BuildupView.tsx", "components/chain/PhoneChainTable.tsx", "components/chain/ChainView.tsx", "lib/chain-buildup.ts"]) {
    assert.doesNotMatch(src(f), /priceChange\s*>\s*0|priceChangePct\s*>\s*0\s*\?/, `${f} must not classify on its own`);
  }
  assert.match(src("components/views/BuildupView.tsx"), /buildupGrid|buildupBreakdown/);
  assert.match(src("components/chain/PhoneChainTable.tsx"), /legFigures|strikeBuildup|legBuildup/);
});

test("a tag's colour is the price's direction and its weight is the open interest's; the letter is always there", () => {
  assert.deepEqual(BUILDUP_MARK["long-buildup"], { priceUp: true, oiUp: true });
  assert.deepEqual(BUILDUP_MARK["short-buildup"], { priceUp: false, oiUp: true });
  assert.deepEqual(BUILDUP_MARK["short-covering"], { priceUp: true, oiUp: false });
  assert.deepEqual(BUILDUP_MARK["long-unwinding"], { priceUp: false, oiUp: false });
  assert.equal(buildupMarkClass("long-buildup"), "text-chain-up font-bold");
  assert.equal(buildupMarkClass("short-buildup"), "text-chain-down font-bold");
  assert.equal(buildupMarkClass("short-covering"), "text-chain-up font-normal");
  assert.equal(buildupMarkClass("long-unwinding"), "text-chain-down font-normal");
  // the two colours are the tokens, and the tokens are the ones asked for: green #047857, red #be123c, grey #64748b
  const css = fs.readFileSync("app/globals.css", "utf8");
  assert.match(css, /--color-chain-up:\s*#047857/);
  assert.match(css, /--color-chain-down:\s*#be123c/);
  assert.match(css, /--color-chain-quiet:\s*#64748b/);
});

test("the Buildup view shows a leg's changes whenever it has traded and has last session's figures; a tag only when neither change is zero", () => {
  assert.equal(legFigures(leg(110, 1500, { volume: 0 })), null); // it has not traded: blank
  assert.equal(legFigures(leg(110, 1500, { prevOi: 0 })), null); // nothing to compare with: blank
  const noTag = legFigures(leg(100, 1500))!; // no price change: the OI change is real and shown, the tag is not
  assert.equal(noTag.kind, null);
  assert.equal(noTag.oiChange, 500);
  assert.equal(noTag.priceChangePct, 0);
  assert.equal(legFigures(leg(110, 1500))!.kind, "long-buildup");
});
