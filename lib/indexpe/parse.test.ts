import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ParseError, parseIndexCloseCsv, parseIndexDate, splitCsvLine } from "./parse";

/** The top of NSE's index closing file for 12 Nov 2026, as served: LF endings, ".18" with no leading zero, "-" where an index has no valuation. */
const REAL = [
  "Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value,Points Change,Change(%),Volume,Turnover (Rs. Cr.),P/E,P/B,Div Yield",
  "Nifty 50,12-11-2026,25213.5,25384.8,25142.95,25299.35,44.3,.18,349198003,33608.35,20.62,3.1,1.39",
  "Nifty Next 50,12-11-2026,73552.05,73948.8,73238.55,73481.25,-4.95,-.01,640497061,13911.43,17.84,3.53,1.34",
  "Nifty Bank,12-11-2026,61000.1,61700.0,60900.5,61518.5,150.2,.24,1,1,13.6,1.85,1.02",
  "Nifty Financial Services,12-11-2026,28000,28100,27900,28057.15,10,.04,1,1,16.51,2.59,.89",
  "Nifty Midcap Select,12-11-2026,14300,14400,14200,14322.75,22.75,.16,1,1,28.6,4.29,.77",
  "Nifty 50 Futures Index,12-11-2026,6100,6140,6090,6130.1,-3.2,-.05,1,1,-,-,-",
  "India VIX,12-11-2026,17.4,17.9,17.1,17.56,.12,.69,0,0,-,-,-",
].join("\n") + "\n";

const err = (f: () => unknown, re: RegExp) => assert.throws(f, (e: unknown) => e instanceof ParseError && re.test(e.message));
const byName = (csv: string) => new Map(parseIndexCloseCsv(csv).rows.map((r) => [r.indexName, r]));

describe("the real file", () => {
  const p = parseIndexCloseCsv(REAL);
  const m = new Map(p.rows.map((r) => [r.indexName, r]));
  it("date is read from the rows (12-11-2026 → 2026-11-12)", () => assert.equal(p.date, "2026-11-12"));
  it("every index row is read", () => assert.equal(p.rows.length, 7));
  it("Nifty 50: close, P/E, P/B and dividend yield", () => assert.deepEqual(m.get("Nifty 50"), { indexName: "Nifty 50", date: "2026-11-12", close: 25299.35, pe: 20.62, pb: 3.1, divYield: 1.39 }));
  it("numbers with no leading zero are read (.89 → 0.89)", () => assert.equal(m.get("Nifty Financial Services")!.divYield, 0.89));
  it("the four indices the analyzer maps to are all there with a P/E", () => {
    for (const n of ["Nifty 50", "Nifty Bank", "Nifty Financial Services", "Nifty Midcap Select"]) assert.ok((m.get(n)!.pe ?? 0) > 0, n);
  });
  it('"-" means no valuation: null, never zero (futures and volatility indices)', () => {
    for (const n of ["Nifty 50 Futures Index", "India VIX"]) {
      const r = m.get(n)!;
      assert.deepEqual([r.pe, r.pb, r.divYield], [null, null, null], n);
      assert.ok(r.close > 0, "its closing level is still there");
    }
  });
});

describe("header and spacing quirks", () => {
  const row = "Nifty 50,12-11-2026,1,2,3,25299.35,4,5,6,7,20.62,3.1,1.39";
  it("CRLF line endings and a UTF-8 byte-order mark", () => {
    const csv = "﻿" + REAL.replace(/\n/g, "\r\n");
    assert.equal(byName(csv).get("Nifty 50")!.pe, 20.62);
  });
  it("blank lines and a trailing blank line", () => assert.equal(parseIndexCloseCsv("\n" + REAL.replace("\n", "\n\n") + "\n\n").rows.length, 7));
  it("header cells in any case, with stray spaces and quotes", () => {
    const head = '" INDEX  NAME ","index date",open,high,low," CLOSING INDEX VALUE ",chg,pct,vol,turnover," P/E "," p/b ","DIV YIELD"';
    assert.equal(byName(head + "\n" + row).get("Nifty 50")!.close, 25299.35);
  });
  it("other spellings of the same columns (Close, PE, PB, Dividend Yield)", () => {
    const head = "Index Name,Index Date,Open,High,Low,Close,Chg,Pct,Vol,Turnover,PE,PB,Dividend Yield";
    const r = byName(head + "\n" + row).get("Nifty 50")!;
    assert.deepEqual([r.close, r.pe, r.pb, r.divYield], [25299.35, 20.62, 3.1, 1.39]);
  });
  it("columns in a different order, and extra columns, are found by name", () => {
    const head = "Extra,P/B,Div Yield,Index Name,P/E,Index Date,Closing Index Value";
    const r = byName(head + "\nx,3.1,1.39,Nifty 50,20.62,12-11-2026,25299.35").get("Nifty 50")!;
    assert.deepEqual([r.close, r.pe, r.pb, r.divYield], [25299.35, 20.62, 3.1, 1.39]);
  });
  it("padding spaces inside cells and in the index name", () => {
    const head = REAL.split("\n")[0];
    const r = byName(head + "\n  Nifty   50 , 12-11-2026 ,1,2,3, 25299.35 ,4,5,6,7, 20.62 , 3.1 , 1.39 ").get("Nifty 50")!;
    assert.deepEqual([r.indexName, r.close, r.pe], ["Nifty 50", 25299.35, 20.62]);
  });
  it("quoted cells: a name with a comma, and a number with a thousands comma", () => {
    const head = REAL.split("\n")[0];
    const r = byName(head + '\n"Nifty 50, Equal Weight",12-11-2026,1,2,3,"25,299.35",4,5,6,7,20.62,3.1,1.39').get("Nifty 50, Equal Weight")!;
    assert.equal(r.close, 25299.35);
  });
  it("a date written with a month name", () => {
    assert.equal(parseIndexCloseCsv(REAL.replace(/12-11-2026/g, "12-Nov-2026")).date, "2026-11-12");
  });
  it("a stray short line (a footer) is not a data row", () => assert.equal(parseIndexCloseCsv(REAL + "Source: NSE\n").rows.length, 7));
  it("the same index twice: the last row wins, once", () => {
    const csv = REAL + "Nifty 50,12-11-2026,1,2,3,26000,4,5,6,7,21,3.2,1.4\n";
    assert.equal(parseIndexCloseCsv(csv).rows.filter((r) => r.indexName === "Nifty 50").length, 1);
    assert.equal(byName(csv).get("Nifty 50")!.close, 26000);
  });
});

describe("values that cannot be right are not stored as fact", () => {
  const head = REAL.split("\n")[0];
  const one = (pe: string, pb: string, dy: string) => parseIndexCloseCsv(`${head}\nX,12-11-2026,1,2,3,100,4,5,6,7,${pe},${pb},${dy}\n`).rows[0];
  it("a P/E of 0, a negative P/E and an absurd one become null", () => {
    assert.equal(one("0", "1", "1").pe, null);
    assert.equal(one("-5", "1", "1").pe, null);
    assert.equal(one("5000", "1", "1").pe, null);
  });
  it("a P/B of 0 or 500 becomes null", () => {
    assert.equal(one("20", "0", "1").pb, null);
    assert.equal(one("20", "500", "1").pb, null);
  });
  it("a dividend yield of exactly 0 is real (an index that pays nothing); negative or huge is not", () => {
    assert.equal(one("20", "3", "0").divYield, 0);
    assert.equal(one("20", "3", "-1").divYield, null);
    assert.equal(one("20", "3", "90").divYield, null);
  });
});

describe("a file that is not what we expect stores nothing", () => {
  const head = REAL.split("\n")[0];
  it("a block page or empty text", () => {
    err(() => parseIndexCloseCsv("<html>Access Denied</html>"), /too short/);
    err(() => parseIndexCloseCsv("<html>\n<body>Access Denied</body>\n</html>"), /no "Index Name" column/);
    err(() => parseIndexCloseCsv(""), /too short/);
  });
  it("a missing column", () => {
    err(() => parseIndexCloseCsv(REAL.replace("P/E", "Price Earnings")), /P\/E/);
    err(() => parseIndexCloseCsv(REAL.replace("Closing Index Value", "Level")), /Closing/);
    err(() => parseIndexCloseCsv(REAL.replace("Div Yield", "Something")), /Div Yield/);
  });
  it("a value that is neither a number nor a dash means the layout changed", () => {
    err(() => parseIndexCloseCsv(REAL.replace("20.62", "twenty")), /not a number/);
  });
  it("a row with no closing value", () => err(() => parseIndexCloseCsv(REAL.replace("25299.35", "-")), /no closing value/));
  it("rows for different days", () => err(() => parseIndexCloseCsv(REAL.replace("Nifty Bank,12-11-2026", "Nifty Bank,11-11-2026")), /different days/));
  it("an impossible date", () => err(() => parseIndexCloseCsv(REAL.replace("Nifty 50,12-11-2026", "Nifty 50,31-02-2026")), /unrecognised date/));
  it("a header and nothing else", () => err(() => parseIndexCloseCsv(head + "\n\n"), /too short|no index rows/));
});

describe("small pieces", () => {
  it("splitCsvLine keeps quoted commas and doubled quotes", () => {
    assert.deepEqual(splitCsvLine('a,"b,c","say ""hi""",d'), ["a", "b,c", 'say "hi"', "d"]);
    assert.deepEqual(splitCsvLine("a,,b"), ["a", "", "b"]);
  });
  it("dates", () => {
    assert.equal(parseIndexDate("01-02-2027"), "2027-02-01");
    assert.equal(parseIndexDate("1-Feb-2027"), "2027-02-01");
    err(() => parseIndexDate("2027-02-01"), /unrecognised date/);
  });
});
