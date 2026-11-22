import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt, fmtINR } from "./helpers";

test("money always shows two decimals", () => {
  assert.equal(fmtINR(12834.9), "₹12,834.90");
  assert.equal(fmtINR(1500), "₹1,500.00");
  assert.equal(fmtINR(1000000), "₹10,00,000.00");
  assert.equal(fmtINR(0), "₹0.00");
  assert.equal(fmtINR(-250.5), "₹-250.50"); // the sign follows the symbol, as before
});

test("a price shows two decimals too, in rupees or dollars", () => {
  assert.equal(fmt(1377.5), "₹1,377.50");
  assert.equal(fmt(25800.6, "index"), "₹25,800.60");
  assert.equal(fmt(59624, "crypto"), "$59,624.00");
});

test("a missing value is still two dashes", () => {
  assert.equal(fmtINR(null), "--");
  assert.equal(fmt(undefined), "--");
  assert.equal(fmt(NaN), "--");
});
