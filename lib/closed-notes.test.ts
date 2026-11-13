import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLOSED_LAST_CLOSE, WHEN_OPEN, moversNote, noChangeFigure, quoteNote, unavailableNote } from "./closed-notes";

describe("movers while the market is shut", () => {
  it("says the last close is shown", () => {
    assert.equal(moversNote(false, [{ change: 5, changePct: 1.2 }]), CLOSED_LAST_CLOSE);
  });
  it("and says when change comes back, if some rows have no change figure", () => {
    const n = moversNote(false, [{ change: 5, changePct: 1.2 }, { change: 0, changePct: 0 }]);
    assert.match(n ?? "", /^Market closed, last close shown\. Change is available when the market is open$/);
  });
  it("no note when the market is open, when the status is unknown, or when there are no rows", () => {
    assert.equal(moversNote(true, [{ change: 0, changePct: 0 }]), null);
    assert.equal(moversNote(null, [{ change: 0, changePct: 0 }]), null);
    assert.equal(moversNote(false, []), null);
  });
  it("a missing percent with a zero change counts as no figure; a real move does not", () => {
    assert.ok(noChangeFigure({ change: 0, changePct: null }));
    assert.ok(!noChangeFigure({ change: 0.5, changePct: null }));
    assert.ok(!noChangeFigure({ change: -0.5, changePct: -1 }));
  });
});

describe("option sheet values while the market is shut", () => {
  it("all four blank: available when the market is open", () => {
    assert.equal(quoteNote(false, { open: 0, high: 0, low: 0, prevClose: 0 }), WHEN_OPEN);
  });
  it("some blank: last close shown, blanks explained", () => {
    assert.match(quoteNote(false, { open: 0, high: 0, low: 0, prevClose: 105.5 }) ?? "", /^Market closed, last close shown\. Blank values are available/);
  });
  it("all present: last close shown", () => {
    assert.equal(quoteNote(false, { open: 1, high: 2, low: 1, prevClose: 1 }), CLOSED_LAST_CLOSE);
  });
  it("no note while open or before the status is known", () => {
    assert.equal(quoteNote(true, { open: 0, high: 0, low: 0, prevClose: 0 }), null);
    assert.equal(quoteNote(null, { open: 0, high: 0, low: 0, prevClose: 0 }), null);
  });
});

describe("ATM IV and the other stat values", () => {
  it("a missing value while shut says when it is available", () => {
    assert.equal(unavailableNote(false, null), WHEN_OPEN);
    assert.equal(unavailableNote(false, Number.NaN), WHEN_OPEN);
  });
  it("a present value, or an open market, gets no note", () => {
    assert.equal(unavailableNote(false, 16.2), null);
    assert.equal(unavailableNote(true, null), null);
    assert.equal(unavailableNote(null, null), null);
  });
});
