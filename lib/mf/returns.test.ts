import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { navOnOrBefore, returnsOf, subtractMonths, type NavPoint } from "./returns";

const near = (a: number | null, b: number, tol = 1e-9) => assert.ok(a !== null && Math.abs(a - b) <= tol, `${a} vs ${b}`);

describe("calendar months back", () => {
  it("clamps to the end of a shorter month and crosses years", () => {
    assert.equal(subtractMonths("2026-05-31", 1), "2026-04-30");
    assert.equal(subtractMonths("2026-03-31", 1), "2026-02-28");
    assert.equal(subtractMonths("2024-03-31", 1), "2024-02-29");
    assert.equal(subtractMonths("2026-01-15", 1), "2025-12-15");
    assert.equal(subtractMonths("2026-11-13", 6), "2026-05-13");
    assert.equal(subtractMonths("2026-11-13", 12), "2025-11-13");
    assert.equal(subtractMonths("2026-11-13", 36), "2023-11-13");
    assert.equal(subtractMonths("2024-02-29", 12), "2023-02-28");
  });
});

describe("the NAV a period back", () => {
  const pts: NavPoint[] = [{ date: "2026-10-01", nav: 10 }, { date: "2026-10-08", nav: 11 }, { date: "2026-10-15", nav: 12 }];
  it("is the last NAV on or before the date", () => {
    assert.deepEqual(navOnOrBefore(pts, "2026-10-08"), { date: "2026-10-08", nav: 11 });
    assert.deepEqual(navOnOrBefore(pts, "2026-10-12"), { date: "2026-10-08", nav: 11 });
    assert.deepEqual(navOnOrBefore(pts, "2026-12-31", 90), { date: "2026-10-15", nav: 12 });
  });
  it("is null before the fund's first NAV, or when the nearest is more than 7 days away", () => {
    assert.equal(navOnOrBefore(pts, "2026-09-30"), null);
    assert.deepEqual(navOnOrBefore(pts, "2026-10-22"), { date: "2026-10-15", nav: 12 }); // exactly 7 days: allowed
    assert.equal(navOnOrBefore(pts, "2026-10-23"), null);
    assert.equal(navOnOrBefore([], "2026-10-08"), null);
  });
});

describe("returns", () => {
  // newest NAV 2026-11-13 at 150; earlier NAVs exactly on the target dates
  const pts: NavPoint[] = [
    { date: "2021-11-12", nav: 50 }, // 5 years back (Friday before 13 Nov 2021, within 7 days)
    { date: "2023-11-13", nav: 100 }, // 3 years
    { date: "2025-11-13", nav: 120 }, // 1 year
    { date: "2026-05-13", nav: 130 }, // 6 months
    { date: "2026-10-13", nav: 140 }, // 1 month
    { date: "2026-11-13", nav: 150 },
  ];
  const r = returnsOf(pts);
  it("1 month, 6 months and 1 year are plain percentage changes", () => {
    near(r["1m"], (150 / 140 - 1) * 100);
    near(r["6m"], (150 / 130 - 1) * 100);
    near(r["1y"], (150 / 120 - 1) * 100);
  });
  it("3 and 5 years are annualised", () => {
    near(r["3y"], (Math.pow(150 / 100, 1 / 3) - 1) * 100);
    near(r["5y"], (Math.pow(150 / 50, 1 / 5) - 1) * 100);
  });
  it("a period the fund has not existed for is null, not a made-up number", () => {
    const young = returnsOf(pts.slice(2));
    assert.equal(young["3y"], null);
    assert.equal(young["5y"], null);
    near(young["1y"], 25);
  });
  it("no NAV near enough to the target date gives null for that period only", () => {
    const gappy = returnsOf(pts.filter((p) => p.date !== "2026-10-13"));
    assert.equal(gappy["1m"], null);
    assert.notEqual(gappy["6m"], null);
  });
  it("a falling fund has negative returns", () => {
    const down = returnsOf([{ date: "2025-11-13", nav: 200 }, { date: "2026-11-13", nav: 150 }]);
    near(down["1y"], -25);
  });
  it("empty input, or a newest NAV that is not positive, gives all null", () => {
    assert.deepEqual(returnsOf([]), { "1m": null, "6m": null, "1y": null, "3y": null, "5y": null });
    assert.deepEqual(returnsOf([{ date: "2026-11-13", nav: 0 }]), { "1m": null, "6m": null, "1y": null, "3y": null, "5y": null });
  });
  it("weekly-stored old data still gives 3 and 5 year returns when a NAV is within 7 days before the target", () => {
    const weekly = returnsOf([{ date: "2021-11-12", nav: 50 }, { date: "2023-11-10", nav: 100 }, { date: "2026-11-13", nav: 150 }]);
    assert.notEqual(weekly["3y"], null);
    assert.notEqual(weekly["5y"], null);
  });
});
