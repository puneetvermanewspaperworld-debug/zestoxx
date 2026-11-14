import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BYTES_PER_NAV_ROW, DAILY_DAYS, TOTAL_DAYS, candidates, planDays } from "./plan";

const TODAY = "2026-11-13"; // a Friday

describe("which days the NAV history is filled for", () => {
  const plan = planDays(TODAY);
  const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  it("never a weekend, newest first, no duplicates", () => {
    assert.ok(plan.every((p) => dow(p.date) !== 0 && dow(p.date) !== 6));
    assert.equal(plan[0].date, TODAY);
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].date < plan[i - 1].date);
    assert.equal(new Set(plan.map((p) => p.date)).size, plan.length);
  });
  it("every weekday of the last 400 days is daily", () => {
    const daily = plan.filter((p) => p.kind === "daily");
    const cutoff = new Date(Date.parse(`${TODAY}T00:00:00Z`) - (DAILY_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
    assert.ok(daily.every((p) => p.date >= cutoff));
    assert.equal(daily.length, 286);
  });
  it("older than that, only Fridays, back to a little over five years", () => {
    const weekly = plan.filter((p) => p.kind === "weekly");
    assert.ok(weekly.every((p) => dow(p.date) === 5));
    const oldest = plan[plan.length - 1].date;
    assert.ok(Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`) <= TOTAL_DAYS * 86_400_000);
    assert.ok(Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`) > 5 * 365 * 86_400_000);
    assert.ok(weekly.length >= 200 && weekly.length <= 220, String(weekly.length));
  });
  it("a Friday that was a holiday falls back to the Thursday, then the Wednesday", () => {
    assert.deepEqual(candidates({ date: "2024-03-29", kind: "weekly" }), ["2024-03-29", "2024-03-28", "2024-03-27"]);
    assert.deepEqual(candidates({ date: "2026-11-12", kind: "daily" }), ["2026-11-12"]);
  });
  it("the storage estimate is rows x bytes", () => {
    assert.equal(BYTES_PER_NAV_ROW, 80);
  });
});
