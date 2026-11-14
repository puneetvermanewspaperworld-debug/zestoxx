import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLevelAlert, findLevelAlert, moveLevelAlert, removeLevelAlert, sameLevel, sideFor } from "./chart/levelAlert";
import type { PriceAlert } from "./types";

const alert = (over: Partial<PriceAlert> = {}): PriceAlert => ({ id: 1, symbol: "RELIANCE", condition: "above", target: 1520, createdAt: "10:00:00 am", ...over });

describe("alert on a horizontal level", () => {
  it("a level above the price is an 'above' alert, a level below it a 'below' alert", () => {
    assert.equal(sideFor(1500, 1520), "above");
    assert.equal(sideFor(1500, 1480), "below");
  });
  it("there is no alert when the price is at the level (it would fire at once), or the price is not known", () => {
    assert.equal(sideFor(1500, 1500), null);
    assert.equal(sideFor(undefined, 1500), null);
    assert.equal(sideFor(NaN, 1500), null);
    assert.equal(createLevelAlert("RELIANCE", 1500, 1500, "now"), null);
  });
  it("builds a normal price alert the terminal already understands: symbol, condition, target", () => {
    const a = createLevelAlert("RELIANCE", 1520.25, 1500, "10:00:00 am", 7)!;
    assert.deepEqual(a, { id: 7, symbol: "RELIANCE", condition: "above", target: 1520.25, createdAt: "10:00:00 am" });
  });
  it("the target is the level's exact price, not a rounded one", () => {
    const a = createLevelAlert("RELIANCE", 1306.38929519, 1300, "now", 1)!;
    assert.equal(a.target, 1306.38929519);
    assert.ok(findLevelAlert([a], "RELIANCE", 1306.38929519));
  });
  it("finds an alert by symbol and price only", () => {
    const list = [alert(), alert({ id: 2, symbol: "TCS", target: 4000 })];
    assert.equal(findLevelAlert(list, "RELIANCE", 1520)?.id, 1);
    assert.equal(findLevelAlert(list, "TCS", 1520), undefined);
    assert.equal(findLevelAlert(list, "RELIANCE", 1521), undefined);
    assert.ok(sameLevel(1520, 1520.0000001));
    assert.ok(!sameLevel(1520, 1520.01));
  });
  it("removes just that level's alert", () => {
    const list = [alert(), alert({ id: 2, target: 1600 }), alert({ id: 3, symbol: "TCS" })];
    assert.deepEqual(removeLevelAlert(list, "RELIANCE", 1520).map((a) => a.id), [2, 3]);
  });
  it("moving the level moves its alert, and works the side out again from the price now", () => {
    const list = [alert({ condition: "above", target: 1520 })];
    const moved = moveLevelAlert(list, "RELIANCE", 1520, 1480, 1500);
    assert.equal(moved[0].target, 1480);
    assert.equal(moved[0].condition, "below"); // dragged under the price: it now waits for a fall
    const up = moveLevelAlert(list, "RELIANCE", 1520, 1560, 1500);
    assert.equal(up[0].condition, "above");
  });
  it("moving a level that has no alert changes nothing, and neither does another symbol's alert", () => {
    const list = [alert({ symbol: "TCS", target: 4000 })];
    assert.equal(moveLevelAlert(list, "RELIANCE", 1520, 1480, 1500), list);
    assert.equal(moveLevelAlert(list, "TCS", 4100, 4200, 4050), list);
    assert.equal(moveLevelAlert(list, "TCS", 4000, 4000, 4050), list);
  });
  it("moving onto the price keeps the alert's side rather than firing at once", () => {
    const moved = moveLevelAlert([alert()], "RELIANCE", 1520, 1500, 1500);
    assert.equal(moved[0].condition, "above");
    assert.equal(moved[0].target, 1500);
  });
});
