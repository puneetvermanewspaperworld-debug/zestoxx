import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fmtCr } from "./format-cr";

describe("fmtCr (sign before the rupee sign)", () => {
  it("writes buying as +₹3,401 Cr", () => assert.equal(fmtCr(3401), "+₹3,401 Cr"));
  it("writes selling with a real minus, as −₹475 Cr", () => assert.equal(fmtCr(-475), "−₹475 Cr"));
  it("never puts the sign after the rupee sign or uses a hyphen", () => {
    for (const v of [3401, -475, 12.4, -0.6, 123456.7]) {
      const s = fmtCr(v);
      assert.ok(!s.includes("₹+") && !s.includes("₹-") && !s.includes("₹−"), s);
      assert.ok(!s.includes("-"), s);
    }
  });
  it("groups digits the Indian way", () => assert.equal(fmtCr(123456), "+₹1,23,456 Cr"));
  it("zero (and anything that rounds to zero) has no sign", () => {
    assert.equal(fmtCr(0), "₹0 Cr");
    assert.equal(fmtCr(0.4), "₹0 Cr");
    assert.equal(fmtCr(-0.4), "₹0 Cr");
  });
  it("can drop the sign for axis labels and totals", () => assert.equal(fmtCr(-475, { sign: false }), "₹475 Cr"));
});
