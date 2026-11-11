import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifySource, daysToExpiry, isMarketOpen, lastCloseTime, quoteFromSnapshot, strikeGap, type FnoSnapshot } from "./snapshot";
import { percentileOf } from "../upstox-fno";

const at = (iso: string) => new Date(iso); // ISO with explicit IST offset

describe("market hours (IST, weekdays 09:15–15:30)", () => {
  it("open on a weekday mid-morning", () => assert.equal(isMarketOpen(at("2026-11-04T10:00:00+05:30")), true));
  it("shut before 09:15 and after 15:30", () => {
    assert.equal(isMarketOpen(at("2026-11-04T09:14:00+05:30")), false);
    assert.equal(isMarketOpen(at("2026-11-04T15:31:00+05:30")), false);
  });
  it("shut on the weekend", () => assert.equal(isMarketOpen(at("2026-11-07T11:00:00+05:30")), false));
});

describe("last close", () => {
  const iso = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 16);
  it("a Saturday looks back to Friday 15:30", () => assert.equal(iso(lastCloseTime(at("2026-11-07T14:39:00+05:30"))), "2026-11-06T15:30"));
  it("a Monday before the open looks back to Friday 15:30", () => assert.equal(iso(lastCloseTime(at("2026-11-16T09:00:00+05:30"))), "2026-11-13T15:30"));
  it("a weekday after 15:30 is that day's close", () => assert.equal(iso(lastCloseTime(at("2026-11-12T16:00:00+05:30"))), "2026-11-12T15:30"));
  it("mid-session it is the previous day's close", () => assert.equal(iso(lastCloseTime(at("2026-11-12T11:00:00+05:30"))), "2026-11-11T15:30"));
});

describe("days to expiry", () => {
  it("counts to 15:30 IST on expiry day, as a decimal", () => {
    assert.equal(daysToExpiry("2026-11-09", at("2026-11-06T15:30:00+05:30")), 3);
    assert.equal(daysToExpiry("2026-11-09", at("2026-11-09T03:30:00+05:30")), 0.5);
  });
  it("is never negative", () => assert.equal(daysToExpiry("2026-11-09", at("2026-11-12T10:00:00+05:30")), 0));
  it("a delayed weekend snapshot is measured from Friday's close, not the wall clock", () => {
    const sat = at("2026-11-07T14:39:00+05:30");
    near(daysToExpiry("2026-11-09", lastCloseTime(sat)), 3, 1e-9);
    assert.ok(daysToExpiry("2026-11-09", sat) < 2.1); // the wall clock would have shaved a day off
  });
});

function near(a: number, b: number, tol: number) { assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`); }

describe("snapshot helpers", () => {
  it("strike gap is the most common spacing", () => assert.equal(strikeGap([100, 150, 200, 250, 350, 400]), 50));
  it("percentile is the share of past closes at or below today", () => {
    const closes = Array.from({ length: 100 }, (_, i) => 10 + i / 10); // 10.0 .. 19.9
    near(percentileOf(15, closes)!, 51, 1e-9);
    assert.equal(percentileOf(15, closes.slice(0, 10)), null); // too short to mean anything
  });
  const base: FnoSnapshot = { asOf: "", feedAsOf: null, source: "live", underlying: "NIFTY", expiry: "2026-11-09", expiries: [], spot: 25000, vix: 16, vixPrevClose: 15, vixPercentile: 50, atmIv: 16, lot: 65, step: 50, pcr: 1, chain: [{ strike: 25000, ce: { ltp: 140, bid: 139, ask: 141, oi: 1, iv: 16, delta: 0.5, gamma: 0, theta: 0, vega: 0 }, pe: { ltp: 0, bid: null, ask: null, oi: 0, iv: null, delta: null, gamma: null, theta: null, vega: null } }] };
  it("offers chain prices for traded strikes only", () => {
    const q = quoteFromSnapshot(base)!;
    assert.deepEqual(q("CE", 25000), { ltp: 140, iv: 16, basis: "mid" }); // the middle of 139 and 141
    const oneSided = { ...base, chain: [{ ...base.chain[0], ce: { ...base.chain[0].ce, ltp: 140, bid: null, ask: null } }] };
    assert.equal(quoteFromSnapshot(oneSided)!("CE", 25000)!.basis, "last"); // no two-sided quote: the last trade
    assert.equal(q("PE", 25000), null); // never traded
    assert.equal(q("CE", 99999), null); // not in the chain
  });
  it("never treats simulated prices as chain prices", () => assert.equal(quoteFromSnapshot({ ...base, source: "simulated" }), undefined));
});

describe("live vs delayed comes from the feed's own timestamp", () => {
  const now = at("2026-11-12T11:00:00+05:30"); // an ordinary Thursday, mid-session
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it("a tick from 20 seconds ago is live", () => assert.equal(classifySource(ago(20_000), now), "live"));
  it("exactly a minute old is still live; just over is delayed", () => {
    assert.equal(classifySource(ago(60_000), now), "live");
    assert.equal(classifySource(ago(61_000), now), "delayed");
  });
  it("during market hours, a stalled feed is delayed (covers exchange holidays)", () => {
    assert.equal(isMarketOpen(now), true); // the clock says open...
    assert.equal(classifySource(ago(20 * 3600_000), now), "delayed"); // ...but the last tick was yesterday's close
  });
  it("no timestamp is never live", () => assert.equal(classifySource(null, now), "delayed"));
  it("a garbage timestamp is never live", () => assert.equal(classifySource("not a date", now), "delayed"));
  it("a few seconds of clock skew into the future is tolerated, minutes are not", () => {
    assert.equal(classifySource(new Date(now.getTime() + 3_000).toISOString(), now), "live");
    assert.equal(classifySource(new Date(now.getTime() + 10 * 60_000).toISOString(), now), "delayed");
  });
  it("a special session outside normal hours is live while it is ticking", () => {
    const sunday = at("2026-11-15T18:15:00+05:30"); // an ordinary Sunday evening, standing in for any unscheduled session
    assert.equal(isMarketOpen(sunday), false);
    assert.equal(classifySource(new Date(sunday.getTime() - 5_000).toISOString(), sunday), "live");
  });
});
