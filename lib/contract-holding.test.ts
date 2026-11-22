import { test } from "node:test";
import assert from "node:assert/strict";
import { contractFromHolding, makeContractId } from "./contract";

test("a simulated contract id gives back its own fields", () => {
  const id = makeContractId({ underlying: "NIFTY50", expiry: "2026-12-03", strike: 22900, type: "CE" });
  assert.deepEqual(contractFromHolding(id, "2026-11-22"), { underlying: "NIFTY50", expiry: "2026-12-03", strike: 22900, type: "CE" });
});

test("a live contract id is read from its label: the next time that day and month comes round", () => {
  const id = "NIFTY 03 DEC 22900 CE#NSE_FO|53750";
  assert.deepEqual(contractFromHolding(id, "2026-11-22"), { underlying: "NIFTY50", expiry: "2026-12-03", strike: 22900, type: "CE" });
  // a January expiry seen in November is next year's
  assert.equal(contractFromHolding("RELIANCE 29 JAN 1500 PE#NSE_FO|1", "2026-11-22")?.expiry, "2027-01-29");
  // one that ended a few days ago stays in this year (the option screen then says it has expired)
  assert.equal(contractFromHolding("NIFTY 18 NOV 22900 CE#NSE_FO|2", "2026-11-22")?.expiry, "2026-11-18");
});

test("a plain symbol or an unreadable label is not a contract", () => {
  assert.equal(contractFromHolding("RELIANCE", "2026-11-22"), null);
  assert.equal(contractFromHolding("something odd#NSE_FO|3", "2026-11-22"), null);
});
