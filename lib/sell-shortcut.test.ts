import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { atmContract, SELL_NOT_HELD } from "./sell-shortcut";
import type { ChainRow } from "./options";

const leg = { ltp: 100, prevClose: 99, oi: 1000, prevOi: 900, volume: 10, iv: 16 };
const rows = (strikes: number[]): ChainRow[] => strikes.map((strike) => ({ strike, call: { ...leg }, put: { ...leg } }));

describe("Paper sell Call / Paper sell Put open the at-the-money strike", () => {
  it("picks the strike nearest the spot, for the chosen side", () => {
    const chain = { rows: rows([25100, 25150, 25200, 25250, 25300]), spot: 25237 };
    assert.deepEqual(atmContract(chain, "CE"), { strike: 25250, type: "CE" });
    assert.deepEqual(atmContract(chain, "PE"), { strike: 25250, type: "PE" });
  });
  it("follows the spot as it moves", () => {
    const r = rows([25100, 25150, 25200, 25250, 25300]);
    assert.equal(atmContract({ rows: r, spot: 25110 }, "CE")?.strike, 25100);
    assert.equal(atmContract({ rows: r, spot: 25290 }, "PE")?.strike, 25300);
  });
  it("a chain with no strikes opens nothing", () => {
    assert.equal(atmContract({ rows: [], spot: 25000 }, "CE"), null);
  });
  it("the sheet explains that selling needs a held contract", () => {
    assert.match(SELL_NOT_HELD, /short selling isn't supported/);
  });
});
