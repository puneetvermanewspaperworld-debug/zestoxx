import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dataBadge } from "./data-badge";
import { PULSE_BASIS } from "./pulse";

describe("Trade page data badge", () => {
  it("a live Indian symbol says Live data while the market is open", () => {
    assert.deepEqual(dataBadge("live", true, "stock"), { label: "Live data", tone: "live" });
    assert.deepEqual(dataBadge("live", true, "index"), { label: "Live data", tone: "live" });
  });
  it("and Last close once it is shut", () => {
    assert.deepEqual(dataBadge("live", false, "stock"), { label: "Last close", tone: "closed" });
    assert.deepEqual(dataBadge("live", false, "index"), { label: "Last close", tone: "closed" });
  });
  it("claims nothing until the market status is known", () => {
    assert.equal(dataBadge("live", null, "stock"), null);
  });
  it("crypto trades around the clock: Live data whether or not NSE is open", () => {
    for (const open of [true, false, null]) assert.deepEqual(dataBadge("live", open, "crypto"), { label: "Live data", tone: "live" });
  });
  it("a simulated price is Simulated, open or shut", () => {
    for (const open of [true, false, null]) assert.deepEqual(dataBadge("sim", open, "stock"), { label: "Simulated", tone: "sim" });
    assert.deepEqual(dataBadge(undefined, true, "stock"), { label: "Simulated", tone: "sim" });
  });
  it("every page that shows a data source uses the shared badge, with no hard-coded Live data label", () => {
    for (const f of [
      "components/views/TradeView.tsx",
      "components/views/MoversView.tsx",
      "components/OptionOrderSheet.tsx",
      "components/views/OptionsView.tsx",
      "components/views/BuildupView.tsx",
    ]) {
      const src = fs.readFileSync(f, "utf8");
      assert.match(src, /<DataBadge /, f);
      assert.doesNotMatch(src, /"Live data"/, f);
    }
  });
});

describe("Pulse basis wording", () => {
  it("leads with 'Pulse scores are based on price momentum (day change) and RSI positioning.'", () => {
    assert.ok(PULSE_BASIS.startsWith("Pulse scores are based on price momentum (day change) and RSI positioning."), PULSE_BASIS);
    assert.match(PULSE_BASIS, /News is not part of the score because no news source is connected\.$/);
  });
  it("the News page shows it in full", () => {
    assert.match(fs.readFileSync("components/views/NewsView.tsx", "utf8"), /\{PULSE_BASIS\}/);
  });
});
