import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { targetDay as fiiTarget } from "../fiidii/ingest";
import { targetDay as indexTarget } from "../indexpe/ingest";

/** Vercel Hobby: two cron entries, each at most once a day. Both call the one daily route; the second moved from 21:00 to 23:30 IST. */
describe("vercel.json crons", () => {
  const cfg = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  it("exactly two entries, both for the daily route, at 14:00 and 18:00 UTC on weekdays", () => {
    assert.equal(cfg.crons.length, 2);
    assert.deepEqual(cfg.crons.map((c) => c.path), ["/api/cron/daily", "/api/cron/daily"]);
    assert.deepEqual(cfg.crons.map((c) => c.schedule), ["0 14 * * 1-5", "0 18 * * 1-5"]);
  });
  it("each runs once a day (a fixed minute and hour, no lists, steps or ranges in them)", () => {
    for (const c of cfg.crons) {
      const [min, hour] = c.schedule.split(" ");
      assert.match(min, /^\d+$/);
      assert.match(hour, /^\d+$/);
    }
  });
  it("18:00 UTC is 23:30 IST", () => {
    assert.equal(new Date("2026-11-13T18:00:00Z").toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }), "23:30:00");
  });
});

describe("the FII/DII and index P/E passes at 23:30 IST", () => {
  const friday = new Date("2026-11-13T18:00:00Z"); // 23:30 IST, same IST date
  it("both aim at the same day's figures, as the earlier 19:30 and 21:00 runs do", () => {
    assert.equal(fiiTarget(friday), "2026-11-13");
    assert.equal(indexTarget(friday), "2026-11-13");
    for (const t of ["2026-11-13T14:00:00Z", "2026-11-13T15:30:00Z"]) {
      assert.equal(fiiTarget(new Date(t)), "2026-11-13", t);
      assert.equal(indexTarget(new Date(t)), "2026-11-13", t);
    }
  });
  it("a Monday 23:30 IST run aims at Monday, and a run after a holiday aims at the last trading day", () => {
    assert.equal(fiiTarget(new Date("2026-11-16T18:00:00Z")), "2026-11-16");
    assert.equal(indexTarget(new Date("2026-11-16T18:00:00Z")), "2026-11-16");
    // Tuesday 10 Nov 2026 is a holiday (Diwali-Balipratipada): the run aims at the last trading day, Monday 9 Nov
    assert.equal(fiiTarget(new Date("2026-11-10T18:00:00Z")), "2026-11-09");
    assert.equal(indexTarget(new Date("2026-11-10T18:00:00Z")), "2026-11-09");
  });
});

describe("the daily route and the mutual fund job", () => {
  const src = fs.readFileSync("app/api/cron/daily/route.ts", "utf8");
  it("runs the mutual fund NAV job only when MF_INGEST_ENABLED is 'true'", () => {
    assert.match(src, /MF_INGEST_ENABLED === "true"/);
    assert.match(src, /mfEnabled \?/);
    assert.match(src, /status: "disabled"/);
  });
  it("still runs the FII/DII and index P/E ingests, independently of the mutual fund one", () => {
    assert.match(src, /Promise\.allSettled\(\[ingestLatest\(fii\), ingestIndexLatest\(idx\), mf\(\)\]\)/);
  });
  it("is still protected by the cron secret", () => {
    assert.match(src, /cronAuthError\(request\)/);
  });
});
