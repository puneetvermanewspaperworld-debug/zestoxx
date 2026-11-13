import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ParseError,
  daysOld,
  isHidden,
  optionOf,
  parseAmfiDate,
  parseNav,
  parseNavAll,
  parseNavHistory,
  parseSection,
  planOf,
  visibleSchemes,
} from "./parse";

/**
 * Real lines from AMFI's NAVAll.txt (Nov 2026), CRLF like the real file, plus the shapes that have to be survived: a section line
 * with spaces inside the brackets, a fund house with brackets in its name, rows with no NAV, rows with a stale date, and the older
 * layout without the Plan and Option columns.
 */
const CRLF = (s: string) => s.replace(/\n/g, "\r\n");

const LIVE = CRLF(`Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Children’s Fund - Childrens' Fund)

Axis Mutual Fund

135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;31.1967;12-Nov-2026
135765;INF846K01WP8;-;Axis Children's Fund;Direct Plan;IDCW Option;28.7378;12-Nov-2026
135759;INF846K01WJ1;-;Axis Children's Fund;Regular Plan;Growth Option;27.1290;12-Nov-2026
135763;INF846K01WS2;INF846K01WQ6;Axis Children's Fund;Direct Plan;IDCW Option;28.7921;12-Nov-2026

Open Ended Schemes(Equity Scheme - Large Cap Fund)

HDFC Mutual Fund

100001;INF179K01YZ9;-;HDFC Top 100 Fund - Direct Plan - Growth Option;Direct Plan;Growth;1234.5;11-Nov-2026
100002;INF179K01XX0;-;HDFC Top 100 Fund - Regular Plan - Growth Option;Regular Plan;Growth;1100.25;04-Nov-2026
100003;-;-;HDFC Old Fund (Matured 2025);;;10.5;12-Nov-2026
100004;-;-;HDFC Broken Fund;Direct Plan;Growth;N.A.;12-Nov-2026
100005;-;-;HDFC Bad Date Fund;Direct Plan;Growth;10.5;31-Feb-2026

IL&FS Mutual Fund (IDF)

Close Ended Schemes(ELSS)

Some Mutual Fund

200001;-;-;Some ELSS Series 1;;;18.2;12-Nov-2026

Interval Fund Schemes(Income)

Other Mutual Fund

300001;-;-;Other Interval Fund - Regular Plan - Growth;Regular Plan;Growth Option;12.0;12-Nov-2026
`);

describe("NAVAll.txt", () => {
  const { items, skipped } = parseNavAll(LIVE);
  const by = (code: string) => items.find((s) => s.code === code);

  it("reads a real row completely: code, name, ISINs, plan, option, category, fund house, NAV and its own date", () => {
    assert.deepEqual(by("135762"), {
      code: "135762",
      name: "Axis Children's Fund",
      isin: "INF846K01WO1",
      isinReinvest: null,
      plan: "Direct",
      option: "Growth",
      kind: "Open Ended",
      category: "Children’s Fund - Childrens' Fund",
      amc: "Axis Mutual Fund",
      nav: 31.1967,
      navDate: "2026-11-12",
    });
  });
  it("tells Direct from Regular and Growth from IDCW, and keeps the reinvestment ISIN", () => {
    assert.equal(by("135765")?.plan, "Direct");
    assert.equal(by("135765")?.option, "IDCW");
    assert.equal(by("135759")?.plan, "Regular");
    assert.equal(by("135763")?.isinReinvest, "INF846K01WQ6");
  });
  it("takes category and fund house from the section lines above each row", () => {
    assert.equal(by("100001")?.category, "Equity Scheme - Large Cap Fund");
    assert.equal(by("100001")?.amc, "HDFC Mutual Fund");
    assert.equal(by("200001")?.kind, "Close Ended");
    assert.equal(by("200001")?.category, "ELSS");
    assert.equal(by("300001")?.kind, "Interval");
  });
  it("a fund house with brackets in its name is a fund house, not a category", () => {
    assert.equal(parseSection("IL&FS Mutual Fund (IDF)"), null);
    assert.equal(parseSection("Axis Mutual Fund"), null);
  });
  it("a row with no Plan or Option cell takes them from the scheme name, and says null when the name does not say", () => {
    assert.equal(by("100003")?.plan, null);
    assert.equal(by("200001")?.plan, null);
    assert.equal(by("300001")?.plan, "Regular");
    assert.equal(by("300001")?.option, "Growth");
  });
  it("skips a row it cannot read and says why, instead of guessing", () => {
    assert.equal(by("100004"), undefined);
    assert.equal(by("100005"), undefined);
    const reasons = skipped.map((s) => s.reason);
    assert.ok(reasons.some((r) => /NAV is not a number \("N\.A\."\)/.test(r)), reasons.join("|"));
    assert.ok(reasons.some((r) => /NAV date is not a date \("31-Feb-2026"\)/.test(r)), reasons.join("|"));
    assert.equal(skipped.length, 2);
  });
  it("counts every good row once", () => {
    assert.equal(items.length, 9);
    assert.equal(new Set(items.map((s) => s.code)).size, items.length);
  });
  it("is not confused by CRLF, a byte-order mark, or LF-only text", () => {
    const lf = parseNavAll("﻿" + LIVE.replace(/\r\n/g, "\n"));
    assert.equal(lf.items.length, items.length);
  });
});

describe("columns are found by header name, never by position", () => {
  it("the history layout (name, plan, option, ISINs, NAV, date) reads the same fields", () => {
    const text = CRLF(`Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date

Open Ended Schemes ( Equity Scheme - Multi Cap Fund )

Aditya Birla Sun Life Mutual Fund
148921;Aditya Birla Sun Life Multi-Cap Fund-Direct Growth;Direct Plan;GROWTH;INF209KB1Y49;;23.20;11-Nov-2026
`);
    const { items } = parseNavAll(text);
    assert.equal(items.length, 1);
    assert.equal(items[0].category, "Equity Scheme - Multi Cap Fund");
    assert.equal(items[0].plan, "Direct");
    assert.equal(items[0].option, "Growth");
    assert.equal(items[0].isin, "INF209KB1Y49");
    assert.equal(items[0].nav, 23.2);
    assert.equal(items[0].navDate, "2026-11-11");
  });
  it("a column inserted before NAV (as Plan and Option were) changes nothing", () => {
    const text = `Scheme Code;Scheme Name;Brand New Column;Plan;Option;Net Asset Value;Date
Open Ended Schemes(Equity Scheme - Mid Cap Fund)
Some Mutual Fund
1;Mid Fund - Direct;whatever;Direct Plan;Growth;45.5;12-Nov-2026
`;
    const { items } = parseNavAll(text);
    assert.equal(items[0].nav, 45.5);
    assert.equal(items[0].navDate, "2026-11-12");
    assert.equal(items[0].isin, null);
  });
  it("the older layout without Plan and Option columns still reads, with plan and option from the name", () => {
    const text = `Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Repurchase Price;Sale Price;Date
Open Ended Schemes(Equity Scheme - Mid Cap Fund)
Some Mutual Fund
7;INF000000001;-;Mid Fund - Direct Plan - Growth;45.5;45.5;45.5;12-Nov-2026
`;
    const { items } = parseNavAll(text);
    assert.equal(items[0].plan, "Direct");
    assert.equal(items[0].option, "Growth");
    assert.equal(items[0].nav, 45.5);
  });
  it("a header missing a needed column fails loudly and names it", () => {
    assert.throws(() => parseNavAll("Scheme Code;Scheme Name;Plan;Option;Date\nx"), (e: unknown) => e instanceof ParseError && /Net Asset Value/.test(e.message));
  });
  it("text that is not an AMFI file (an error page, say) fails loudly instead of returning nothing", () => {
    assert.throws(() => parseNavAll("<html><body>Object Moved</body></html>"), ParseError);
    assert.throws(() => parseNavHistory("<html><body>View/Download NAV History</body></html>"), ParseError);
  });
});

describe("NAV history report", () => {
  const text = CRLF(`Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date

Open Ended Schemes ( Equity Scheme - Multi Cap Fund )

Aditya Birla Sun Life Mutual Fund
148921;Aditya Birla Sun Life Multi-Cap Fund-Direct Growth;Direct Plan;GROWTH;INF209KB1Y49;;21.91;02-Nov-2026
148921;Aditya Birla Sun Life Multi-Cap Fund-Direct Growth;Direct Plan;GROWTH;INF209KB1Y49;;22.12;03-Nov-2026
148921;Aditya Birla Sun Life Multi-Cap Fund-Direct Growth;Direct Plan;GROWTH;INF209KB1Y49;;N.A.;04-Nov-2026
148922;Aditya Birla Sun Life Multi-Cap Fund-Regular Growth;Regular Plan;GROWTH;INF209KB1Y50;;20.00;02-Nov-2026
`);
  it("returns one point per dated NAV, with section and fund-house lines ignored", () => {
    const { items, skipped } = parseNavHistory(text);
    assert.deepEqual(items, [
      { code: "148921", date: "2026-11-02", nav: 21.91 },
      { code: "148921", date: "2026-11-03", nav: 22.12 },
      { code: "148922", date: "2026-11-02", nav: 20 },
    ]);
    assert.equal(skipped.length, 1);
  });
});

describe("pieces", () => {
  it("dates: AMFI's DD-Mon-YYYY, and only real dates", () => {
    assert.equal(parseAmfiDate("12-Nov-2026"), "2026-11-12");
    assert.equal(parseAmfiDate("2-Jan-2025"), "2025-01-02");
    assert.equal(parseAmfiDate("29-Feb-2024"), "2024-02-29");
    for (const bad of ["29-Feb-2026", "31-Apr-2026", "12-Nov-26", "2026-11-12", "", "N.A.", "12-Xyz-2026"]) assert.equal(parseAmfiDate(bad), null, bad);
  });
  it("NAV: a plain positive number only", () => {
    assert.equal(parseNav("31.1967"), 31.1967);
    assert.equal(parseNav("1,234.50"), 1234.5);
    for (const bad of ["N.A.", "-", "", "0", "0.00", "-5", "abc", "1.2.3"]) assert.equal(parseNav(bad), null, bad);
  });
  it("section lines, with and without spaces inside the brackets, and footnote stars", () => {
    assert.deepEqual(parseSection("Open Ended Schemes(Equity Scheme - Large Cap Fund)"), { kind: "Open Ended", category: "Equity Scheme - Large Cap Fund" });
    assert.deepEqual(parseSection("Open Ended Schemes ( Equity Scheme - Large Cap Fund )"), { kind: "Open Ended", category: "Equity Scheme - Large Cap Fund" });
    assert.deepEqual(parseSection("Open Ended Schemes(Solution Oriented Schemes ** - Retirement Fund)"), { kind: "Open Ended", category: "Solution Oriented Schemes - Retirement Fund" });
    assert.deepEqual(parseSection("Open Ended Schemes(Other Scheme - Other  ETFs)"), { kind: "Open Ended", category: "Other Scheme - Other ETFs" });
    assert.deepEqual(parseSection("Close Ended Schemes(Growth)"), { kind: "Close Ended", category: "Growth" });
    assert.deepEqual(parseSection("Interval Fund Schemes(Income)"), { kind: "Interval", category: "Income" });
  });
  it("plan and option read AMFI's different spellings", () => {
    assert.equal(planOf("Direct Plan", "x"), "Direct");
    assert.equal(planOf("Regular Plan", "x"), "Regular");
    assert.equal(planOf("", "Fund - Direct Plan - Growth"), "Direct");
    assert.equal(planOf("", "Fund"), null);
    for (const o of ["Growth", "Growth Option", "GROWTH"]) assert.equal(optionOf(o, "x"), "Growth", o);
    for (const o of ["IDCW", "IDCW Option", "Monthly IDCW", "IDCW (Income Distribution CUM Capital Withdrawal)", "Dividend Payout"]) assert.equal(optionOf(o, "x"), "IDCW", o);
    assert.equal(optionOf("", "Fund - Growth Option"), "Growth");
    assert.equal(optionOf("", "Fund"), null);
  });
});

describe("hiding stale and matured schemes", () => {
  const today = "2026-11-13";
  const { items } = parseNavAll(LIVE);
  it("a NAV more than 7 days old is stale; exactly 7 days is not", () => {
    assert.equal(daysOld("2026-11-06", today), 7);
    assert.equal(isHidden({ name: "Fund", navDate: "2026-11-06" }, today), false);
    assert.equal(isHidden({ name: "Fund", navDate: "2026-11-05" }, today), true);
    assert.equal(isHidden({ name: "Fund", navDate: "2026-11-13" }, today), false);
  });
  it("a matured or wound-up scheme is hidden even with a fresh NAV, but 'Constant Maturity' is not matured", () => {
    assert.equal(isHidden({ name: "HDFC Old Fund (Matured 2025)", navDate: "2026-11-12" }, today), true);
    assert.equal(isHidden({ name: "Some Fund (wound up)", navDate: "2026-11-12" }, today), true);
    assert.equal(isHidden({ name: "Bandhan 10 year Constant Maturity Gilt Fund", navDate: "2026-11-12" }, today), false);
  });
  it("from the sample, the stale Regular plan (4 Nov, 9 days) and the matured one are not shown", () => {
    const shown = visibleSchemes(items, today).map((s) => s.code);
    assert.ok(!shown.includes("100002"), "stale");
    assert.ok(!shown.includes("100003"), "matured");
    assert.ok(shown.includes("100001"));
    assert.ok(shown.includes("135762"));
    assert.equal(shown.length, items.length - 2);
  });
});
