import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { actionToParams, exchangeOf, paramsToAction, type ActionSpec } from "./actions";

const back = (a: ActionSpec) => paramsToAction(actionToParams(a));

describe("an action screen is named by the address", () => {
  it("every kind survives a round trip", () => {
    for (const a of [
      { kind: "order", symbol: "RELIANCE", side: "buy", qty: 10 },
      { kind: "order", symbol: "ITC", side: "sell" },
      { kind: "option", underlying: "NIFTY50", expiry: "2026-11-26", strike: 25500, type: "CE", side: "buy" },
      { kind: "ochart", underlying: "RELIANCE", expiry: "2026-11-23", strike: 1380, type: "PE" },
      { kind: "gtt", symbol: "TCS" },
      { kind: "gtt", symbol: "TCS", editId: "17.5" },
      { kind: "alert", symbol: "INFY", editId: "a-1" },
      { kind: "note", symbol: "SBIN" },
      { kind: "sip" },
    ] as ActionSpec[]) assert.deepEqual(back(a), a);
  });
  it("a made-up or damaged address opens nothing", () => {
    const p = (q: string) => paramsToAction(new URLSearchParams(q));
    assert.equal(p(""), null);
    assert.equal(p("act=nope"), null);
    assert.equal(p("act=order&s=RELIANCE"), null); // no side
    assert.equal(p("act=order&s=RELIANCE&side=short"), null);
    assert.equal(p("act=order&s=IDX%20NIFTY%20PVT%20BANK&side=buy"), null); // an index cannot be traded
    assert.equal(p("act=order&s=%3Cscript%3E&side=buy"), null);
    assert.equal(p("act=option&u=NIFTY50&x=tomorrow&k=1&t=CE&side=buy"), null);
    assert.equal(p("act=option&u=NIFTY50&x=2026-11-26&k=-4&t=CE&side=buy"), null);
    assert.equal(p("act=option&u=NIFTY50&x=2026-11-26&k=100&t=XX&side=buy"), null);
    assert.equal(p("act=gtt&s=lower"), null);
    assert.equal(p("act=ochart&u=RELIANCE&x=2026-11-23&k=1380"), null); // no type
    assert.equal(p("act=ochart&u=RELIANCE&x=soon&k=1380&t=PE"), null);
  });
  it("a quantity that is not a whole number of 1 or more is dropped, not trusted", () => {
    const q = (v: string) => (paramsToAction(new URLSearchParams(`act=order&s=ITC&side=buy&q=${v}`)) as { qty?: number }).qty;
    assert.equal(q("5"), 5);
    for (const v of ["0", "-3", "1.5", "abc", "999999999999"]) assert.equal(q(v), undefined);
  });
  it("an edit id is kept only when it is plain", () => {
    const e = (v: string) => (paramsToAction(new URLSearchParams(`act=gtt&s=ITC&e=${encodeURIComponent(v)}`)) as { editId?: string }).editId;
    assert.equal(e("123.456"), "123.456");
    assert.equal(e("a b"), undefined);
    assert.equal(e("<x>"), undefined);
  });
  it("the exchange shown is one the app really gets prices from", () => {
    assert.equal(exchangeOf("RELIANCE"), "NSE");
    assert.equal(exchangeOf("SENSEX"), "BSE");
    assert.equal(exchangeOf("BTC"), "Crypto");
  });
});
