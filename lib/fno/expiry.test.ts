import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { activeExpiries, expiresToday, expiryEndMs } from "./snapshot";

const LIST = ["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"];
const at = (iso: string) => new Date(iso);
/** the default the analyzer opens on: the first expiry still open */
const defaultExpiry = (list: string[], when: Date) => activeExpiries(list, when)[0] ?? null;

describe("an expired expiry is never the default", () => {
  it("opens on the first expiry whose 15:30 IST is after the feed's last update", () => {
    assert.equal(defaultExpiry(LIST, at("2026-11-09T12:00:00+05:30")), "2026-11-10");
  });
  it("the feed's last update is after 15:30 on expiry day: that expiry is skipped", () => {
    // 10 Nov is an expiry day and the feed last updated at 15:40 (after the close)
    assert.equal(defaultExpiry(LIST, at("2026-11-10T15:40:00+05:30")), "2026-11-17");
    assert.ok(!activeExpiries(LIST, at("2026-11-10T15:40:00+05:30")).includes("2026-11-10"));
  });
  it("the same holds for a feed time of 16:00 (the exchange's last update after the closing session)", () => {
    assert.equal(defaultExpiry(LIST, at("2026-11-10T16:00:00+05:30")), "2026-11-17");
  });
  it("one second before 15:30 the expiry is still open", () => {
    assert.equal(defaultExpiry(LIST, at("2026-11-10T15:29:59+05:30")), "2026-11-10");
  });
  it("at exactly 15:30 it is over", () => {
    assert.equal(defaultExpiry(LIST, new Date(expiryEndMs("2026-11-10"))), "2026-11-17");
  });
  it("the morning after expiry the old contract is gone", () => {
    assert.equal(defaultExpiry(LIST, at("2026-11-11T02:42:00+05:30")), "2026-11-17");
  });
  it("expired expiries are hidden from the list, later ones keep their order", () => {
    assert.deepEqual(activeExpiries(LIST, at("2026-11-17T15:40:00+05:30")), ["2026-11-24", "2026-12-01"]);
  });
  it("returns nothing (no default) when every listed expiry is over", () => {
    assert.equal(defaultExpiry(LIST, at("2027-01-01T00:00:00+05:30")), null);
  });
});

describe("the nearest expiry is today", () => {
  it("is true on expiry day, before the close", () => assert.equal(expiresToday("2026-11-17", at("2026-11-17T10:00:00+05:30")), true));
  it("uses the Indian date, not the UTC one (00:30 IST is still the 17th)", () => assert.equal(expiresToday("2026-11-17", at("2026-11-16T19:00:00Z")), true));
  it("is false the day before", () => assert.equal(expiresToday("2026-11-17", at("2026-11-16T12:00:00+05:30")), false));
  it("is false the next day (01:30 IST on the 18th is already the 18th)", () => assert.equal(expiresToday("2026-11-17", at("2026-11-17T20:00:00Z")), false));
});
