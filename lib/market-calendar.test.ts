import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR,
  HOLIDAYS,
  SPECIAL_SESSIONS,
  calendarCovers,
  isMarketOpen,
  isTradingDay,
  lastCloseTime,
  marketStatus,
  nextTradingDay,
  previousTradingDay,
  sessionOn,
} from "./market-calendar";
import { classifySource } from "./fno/snapshot";

const at = (iso: string) => new Date(iso); // ISO with an explicit IST offset
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 16);

// NSE's own weekday for each F&O holiday, as printed in its holiday list (saved 2026-11-07). Checking our
// dates against NSE's weekday names catches a mistyped date, which a list of dates alone can't.
const NSE_WEEKDAYS: [string, string][] = [
  ["2026-01-15", "Thursday"], ["2026-01-26", "Monday"], ["2026-02-15", "Sunday"], ["2026-03-03", "Tuesday"],
  ["2026-03-21", "Saturday"], ["2026-03-26", "Thursday"], ["2026-03-31", "Tuesday"], ["2026-04-03", "Friday"],
  ["2026-04-14", "Tuesday"], ["2026-05-01", "Friday"], ["2026-05-28", "Thursday"], ["2026-06-26", "Friday"],
  ["2026-08-15", "Saturday"], ["2026-09-14", "Monday"], ["2026-10-02", "Friday"], ["2026-10-20", "Tuesday"],
  ["2026-11-08", "Sunday"], ["2026-11-10", "Tuesday"], ["2026-11-24", "Tuesday"], ["2026-12-25", "Friday"],
];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

describe("holiday table", () => {
  it("has NSE's 20 equity-derivatives holidays for 2026", () => assert.equal(Object.keys(HOLIDAYS).length, 20));
  it("every date is in 2026 and the keys are real calendar dates", () => {
    for (const d of Object.keys(HOLIDAYS)) {
      assert.match(d, /^2026-\d{2}-\d{2}$/);
      assert.equal(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10), d, `${d} isn't a valid date`);
    }
  });
  it("each date falls on the weekday NSE prints for it", () => {
    assert.deepEqual(Object.keys(HOLIDAYS).sort(), NSE_WEEKDAYS.map(([d]) => d).sort());
    for (const [date, name] of NSE_WEEKDAYS) assert.equal(DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()], name, date);
  });
  it("carries a verified-on date", () => {
    assert.match(CALENDAR.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(CALENDAR.year, 2026);
  });
});

describe("regular days (09:15–15:30 IST)", () => {
  it("open on an ordinary Monday, shut either side of the hours", () => {
    assert.equal(isMarketOpen(at("2026-11-09T09:14:00+05:30")), false);
    assert.equal(isMarketOpen(at("2026-11-09T09:15:00+05:30")), true);
    assert.equal(isMarketOpen(at("2026-11-09T15:30:00+05:30")), true);
    assert.equal(isMarketOpen(at("2026-11-09T15:31:00+05:30")), false);
  });
  it("shut on a Saturday and an ordinary Sunday", () => {
    assert.equal(isMarketOpen(at("2026-11-07T11:00:00+05:30")), false);
    assert.equal(isMarketOpen(at("2026-11-15T11:00:00+05:30")), false);
  });
});

describe("exchange holidays", () => {
  it("is shut all day on every weekday holiday", () => {
    for (const [date, reason] of Object.entries(HOLIDAYS)) {
      if (SPECIAL_SESSIONS[date]) continue; // 8 Nov has its own session, tested below
      for (const t of ["09:15", "11:00", "15:30"]) assert.equal(isMarketOpen(at(`${date}T${t}:00+05:30`)), false, `${date} ${t} (${reason})`);
      assert.equal(isTradingDay(date), false, date);
    }
  });
  it("Dussehra (Tue 20 Oct): closed, and the top-bar label names it", () => {
    const s = marketStatus(at("2026-10-20T11:00:00+05:30"));
    assert.equal(s.open, false);
    assert.equal(s.kind, "holiday");
    assert.equal(s.label, "Closed — Dussehra");
  });
  it("Diwali-Balipratipada (Tue 10 Nov) is a holiday", () => {
    assert.equal(marketStatus(at("2026-11-10T11:00:00+05:30")).label, "Closed — Diwali-Balipratipada");
  });
  it("the day after a holiday trades normally", () => assert.equal(isMarketOpen(at("2026-11-11T10:00:00+05:30")), true));
});

describe("Diwali Muhurat session, Sunday 8 Nov 2026 (NSE circular NSE/FAOP/76940: 14:20–15:40)", () => {
  it("is a special session, not a holiday or a weekend", () => {
    assert.equal(sessionOn("2026-11-08").kind, "special");
    assert.equal(isTradingDay("2026-11-08"), true);
  });
  it("opens at 14:20 (pre-open is not trading) and runs to 15:40", () => {
    assert.equal(isMarketOpen(at("2026-11-08T14:19:00+05:30")), false);
    assert.equal(isMarketOpen(at("2026-11-08T14:20:00+05:30")), true);
    assert.equal(isMarketOpen(at("2026-11-08T15:30:00+05:30")), true); // still trading past the regular close
    assert.equal(isMarketOpen(at("2026-11-08T15:40:00+05:30")), true);
    assert.equal(isMarketOpen(at("2026-11-08T15:41:00+05:30")), false);
  });
  it("is shut in the morning of the day, but the top bar says the session is coming", () => {
    const s = marketStatus(at("2026-11-08T10:00:00+05:30"));
    assert.equal(s.open, false);
    assert.equal(s.label, "Diwali Muhurat trading today");
  });
  it("shows the session name while it is live", () => {
    const s = marketStatus(at("2026-11-08T14:30:00+05:30"));
    assert.equal(s.open, true);
    assert.equal(s.kind, "special");
    assert.equal(s.label, "Diwali Muhurat trading");
  });
  it("after the session it is simply closed", () => assert.equal(marketStatus(at("2026-11-08T16:30:00+05:30")).label, "Market Closed"));
});

describe("live/delayed together with the calendar", () => {
  it("a fresh feed during the Muhurat session is live, and the calendar agrees it's open", () => {
    const now = at("2026-11-08T14:30:00+05:30");
    assert.equal(marketStatus(now).open, true);
    assert.equal(classifySource(new Date(now.getTime() - 4_000).toISOString(), now), "live");
  });
  it("on a holiday the last tick is the previous session's, so prices are delayed, and the reason is the holiday", () => {
    const now = at("2026-11-10T11:00:00+05:30");
    assert.equal(classifySource(at("2026-11-09T15:30:00+05:30").toISOString(), now), "delayed");
    assert.equal(marketStatus(now).reason, "Diwali-Balipratipada");
  });
});

describe("trading-day arithmetic (what moves a weekly expiry off a holiday)", () => {
  it("Nifty's Tuesday 10 Nov expiry date is a holiday; the previous trading day is Monday 9 Nov", () => {
    assert.equal(isTradingDay("2026-11-10"), false);
    assert.equal(previousTradingDay("2026-11-10"), "2026-11-09");
  });
  it("Tuesday 24 Nov (Guru Nanak Jayanti) moves to Monday 23 Nov", () => assert.equal(previousTradingDay("2026-11-24"), "2026-11-23"));
  it("the Muhurat Sunday counts as a trading day", () => {
    assert.equal(previousTradingDay("2026-11-09"), "2026-11-08");
    assert.equal(nextTradingDay("2026-11-07"), "2026-11-08");
  });
  it("skips weekends and holidays going forward", () => {
    assert.equal(nextTradingDay("2026-12-24"), "2026-12-28"); // Fri 25 Dec is Christmas, then the weekend
    assert.equal(nextTradingDay("2026-11-09"), "2026-11-11"); // 10 Nov is a holiday
  });
});

describe("expiries Upstox listed for the indices (captured 2026-11-07) all land on trading days", () => {
  const listed: Record<string, string[]> = {
    NIFTY: ["2026-11-09", "2026-11-17", "2026-11-23", "2026-12-01", "2026-12-08", "2026-12-29"],
    BANKNIFTY: ["2026-11-23", "2026-12-29"],
    FINNIFTY: ["2026-11-23", "2026-12-29"],
    MIDCPNIFTY: ["2026-11-23", "2026-12-29"],
    SENSEX: ["2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03", "2026-12-10", "2026-12-17", "2026-12-24", "2026-12-31"],
  };
  for (const [u, dates] of Object.entries(listed)) {
    it(`${u}: no expiry is a holiday or a weekend`, () => {
      for (const d of dates) assert.equal(isTradingDay(d), true, `${u} expiry ${d} is not a trading day`);
    });
  }
  it("Nifty's nearest weekly expiry is Monday 9 Nov, not Tuesday 10 Nov", () => {
    assert.equal(listed.NIFTY[0], "2026-11-09");
    assert.equal(listed.NIFTY.includes("2026-11-10"), false);
    assert.equal(new Date("2026-11-09T00:00:00Z").getUTCDay(), 1);
  });
});

describe("the last close (what delayed prices belong to)", () => {
  it("Saturday looks back to Friday 15:30", () => assert.equal(ist(lastCloseTime(at("2026-11-07T14:39:00+05:30"))), "2026-11-06T15:30"));
  it("Monday morning looks back to the Muhurat close on Sunday, 15:40", () => assert.equal(ist(lastCloseTime(at("2026-11-09T09:00:00+05:30"))), "2026-11-08T15:40"));
  it("during the Muhurat session itself, the last close is still Friday's", () => assert.equal(ist(lastCloseTime(at("2026-11-08T15:00:00+05:30"))), "2026-11-06T15:30"));
  it("a holiday looks back past it: Tue 10 Nov all day → Mon 9 Nov 15:30", () => {
    assert.equal(ist(lastCloseTime(at("2026-11-10T11:00:00+05:30"))), "2026-11-09T15:30");
    assert.equal(ist(lastCloseTime(at("2026-11-10T20:00:00+05:30"))), "2026-11-09T15:30");
  });
  it("Wednesday morning after that holiday → Mon 9 Nov 15:30", () => assert.equal(ist(lastCloseTime(at("2026-11-11T09:00:00+05:30"))), "2026-11-09T15:30"));
  it("a normal weekday after the close is that day's close; before the open it's the previous day's", () => {
    assert.equal(ist(lastCloseTime(at("2026-11-12T16:00:00+05:30"))), "2026-11-12T15:30");
    assert.equal(ist(lastCloseTime(at("2026-11-12T09:00:00+05:30"))), "2026-11-11T15:30");
  });
});

describe("dates outside the calendar's year", () => {
  it("says it doesn't know, and falls back to weekday hours", () => {
    assert.equal(calendarCovers("2027-01-04"), false);
    assert.equal(calendarCovers("2026-12-31"), true);
    const s = marketStatus(at("2027-01-04T10:00:00+05:30"));
    assert.equal(s.open, true);
    assert.equal(s.calendarCovered, false);
    assert.equal(isMarketOpen(at("2027-01-02T10:00:00+05:30")), false); // a Saturday
  });
});
