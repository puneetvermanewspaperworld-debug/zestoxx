import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { moverSheetState, MOVER_CONTRACT_UNAVAILABLE } from "./mover-sheet";
import { underlyingKey } from "./upstox";
import type { OptionChain } from "./options";

const leg = { ltp: 10, prevClose: 9, oi: 1, prevOi: 1, volume: 1, iv: 15 };
const chain = (o: Partial<OptionChain> = {}): OptionChain => ({
  underlying: "NIFTY", spot: 25250, expiry: "2026-11-17", expiries: ["2026-11-17"], lotSize: 65, vix: 16, source: "live",
  rows: [25200, 25250, 25300].map((strike) => ({ strike, call: { ...leg }, put: { ...leg } })), ...o,
});
const contract = { symbol: "NIFTY", expiry: "2026-11-17", strike: 25250, type: "CE" as const };

describe("tapping a Movers row opens the option sheet", () => {
  it("is loading until the chain arrives", () => {
    assert.deepEqual(moverSheetState(null, contract), { kind: "loading" });
  });
  it("opens from a live chain for the same expiry that lists the strike", () => {
    const c = chain();
    assert.deepEqual(moverSheetState(c, contract), { kind: "ready", chain: c });
  });
  it("never opens from a simulated chain", () => {
    assert.deepEqual(moverSheetState(chain({ source: "simulated" }), contract), { kind: "unavailable", text: MOVER_CONTRACT_UNAVAILABLE });
  });
  it("never opens a different expiry or a strike the chain does not list", () => {
    assert.equal(moverSheetState(chain({ expiry: "2026-11-24" }), contract).kind, "unavailable");
    assert.equal(moverSheetState(chain(), { ...contract, strike: 99999 }).kind, "unavailable");
  });
});

describe("underlying keys for the option chain", () => {
  const stocks = [{ symbol: "ITC", key: "NSE_EQ|INE154A01025" }];
  it("indices and the app's own symbols use their fixed keys", () => {
    assert.equal(underlyingKey("NIFTY", stocks), "NSE_INDEX|Nifty 50");
    assert.equal(underlyingKey("RELIANCE", stocks), "NSE_EQ|INE002A01018");
  });
  it("any other F&O stock is looked up in the F&O universe", () => {
    assert.equal(underlyingKey("ITC", stocks), "NSE_EQ|INE154A01025");
  });
  it("an unknown name has no key", () => {
    assert.equal(underlyingKey("NOPE", stocks), null);
  });
});
