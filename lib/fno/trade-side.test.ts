import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, tradeSide } from "./engine";

/** The strike comparison opens on the side of the user's trade. */
const legs = (id: string) => PRESETS.find((p) => p.id === id)!.legs.map(([side, type]) => ({ side, type }));

describe("trade side", () => {
  it("a long put is puts", () => assert.equal(tradeSide([{ side: "B", type: "PE" }]), "PE"));
  it("a long call is calls", () => assert.equal(tradeSide([{ side: "B", type: "CE" }]), "CE"));
  it("a bear put spread is puts", () => assert.equal(tradeSide(legs("bps")), "PE"));
  it("a bull call spread is calls", () => assert.equal(tradeSide(legs("bcs")), "CE"));
  it("a short put alone is puts", () => assert.equal(tradeSide([{ side: "S", type: "PE" }]), "PE"));
  it("the first option bought decides when both kinds are present", () => assert.equal(tradeSide([{ side: "S", type: "CE" }, { side: "B", type: "PE" }]), "PE"));
  it("futures and no legs start on calls", () => {
    assert.equal(tradeSide(legs("lf")), "CE");
    assert.equal(tradeSide([]), "CE");
  });
});
