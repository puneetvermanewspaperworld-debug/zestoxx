import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ParseError, parseCashJson, parseNseDate, parseParticipantOiCsv } from "./parse";
import { toRow } from "./row";
import { longPct } from "./rollup";

/** NSE's FII/DII cash JSON exactly as returned on 12 Nov 2026 (latest day only). */
const CASH = `[{"buyValue":"19704.39","category":"DII","date":"11-Nov-2026","netValue":"-8434.53","sellValue":"28138.92"},{"buyValue":"30087.21","category":"FII/FPI","date":"11-Nov-2026","netValue":"12563.33","sellValue":"17523.88"}]`;

/** NSE's participant-wise open interest file for 11 Nov 2026, byte for byte: CRLF line endings, a doubled-quote title and padded headers. */
const OI = [
  '""Participant wise Open Interest (no. of contracts) in Equity Derivatives as on Nov 11, 2026"",,,,,,,,,,,,,,',
  "Client Type,Future Index Long,Future Index Short,Future Stock Long,Future Stock Short       ,Option Index Call Long,Option Index Put Long,Option Index Call Short,Option Index Put Short,Option Stock Call Long,Option Stock Put Long,Option Stock Call Short,Option Stock Put Short,Total Long Contracts      ,Total Short Contracts",
  "Client,172162,105154,3139266,347050,3045743,2722311,2706602,3140961,1965989,1233953,1123164,1147025,12279424,8569956",
  "DII,54376,27224,340835,4329625,2610,107042,1550,1200,2775,41308,434434,34359,548946,4828392",
  "FII,57226,127639,3575532,2540154,722656,1094827,958257,647495,330474,415049,426899,322256,6195764,5022700",
  "Pro,26450,50197,704626,543430,1052450,954754,1157051,1089278,1328053,1037804,1642794,1224474,5104137,5707224",
  "TOTAL,310214,310214,7760259,7760259,4823459,4878935,4823459,4878935,3627291,2728114,3627291,2728114,24128272,24128272",
].join("\r\n") + "\r\n";

const err = (f: () => unknown, re: RegExp) => assert.throws(f, (e: unknown) => e instanceof ParseError && re.test(e.message));

describe("NSE date", () => {
  it("11-Nov-2026 → 2026-11-11", () => assert.equal(parseNseDate("11-Nov-2026"), "2026-11-11"));
  it("1-Jan-2027 and a lower-case month", () => {
    assert.equal(parseNseDate("1-Jan-2027"), "2027-01-01");
    assert.equal(parseNseDate("05-dec-2026"), "2026-12-05");
  });
  it("rejects nonsense and impossible dates", () => {
    for (const bad of ["", "2026-11-11", "31-Feb-2026", "11-Foo-2026", "11/11/2026"]) err(() => parseNseDate(bad), /unrecognised date/);
  });
});

describe("cash JSON", () => {
  const p = parseCashJson(CASH);
  it("reads the date", () => assert.equal(p.date, "2026-11-11"));
  it("FII/FPI: buy, sell and net, as numbers in ₹ crore", () => assert.deepEqual(p.fii, { buy: 30087.21, sell: 17523.88, net: 12563.33 }));
  it("DII: a net seller shows a negative net", () => assert.deepEqual(p.dii, { buy: 19704.39, sell: 28138.92, net: -8434.53 }));
  it("does not depend on row order, and accepts commas and numeric values", () => {
    const j = JSON.stringify([
      { category: "FII/FPI", date: "11-Nov-2026", buyValue: "1,000.50", sellValue: 400, netValue: "600.50" },
      { category: "DII", date: "11-Nov-2026", buyValue: "10", sellValue: "20", netValue: "-10" },
    ]);
    const q = parseCashJson(j);
    assert.deepEqual(q.fii, { buy: 1000.5, sell: 400, net: 600.5 });
    assert.deepEqual(q.dii, { buy: 10, sell: 20, net: -10 });
  });
  it("accepts a one-paisa rounding difference between net and buy − sell", () => {
    const j = CASH.replace('"netValue":"12563.33"', '"netValue":"12563.34"');
    assert.equal(parseCashJson(j).fii.net, 12563.34);
  });
  it("rejects a block page, text that is not JSON, and the wrong shape", () => {
    err(() => parseCashJson("<html><body>Access Denied</body></html>"), /not JSON/);
    err(() => parseCashJson('{"data":[]}'), /list of categories/);
    err(() => parseCashJson("[]"), /one FII and one DII/);
  });
  it("rejects a missing DII row or a duplicated FII row", () => {
    err(() => parseCashJson(JSON.stringify(JSON.parse(CASH).slice(1))), /one FII and one DII/);
    err(() => parseCashJson(JSON.stringify([...JSON.parse(CASH), JSON.parse(CASH)[1]])), /one FII and one DII/);
  });
  it("rejects FII and DII rows that are for different days", () => {
    err(() => parseCashJson(CASH.replace('"date":"11-Nov-2026","netValue":"-8434.53"', '"date":"10-Nov-2026","netValue":"-8434.53"')), /different|but DII/);
  });
  it("rejects a net that does not equal buy minus sell, a missing number and a negative buy", () => {
    err(() => parseCashJson(CASH.replace('"netValue":"12563.33"', '"netValue":"99999.00"')), /does not equal/);
    err(() => parseCashJson(CASH.replace('"buyValue":"30087.21"', '"buyValue":""')), /not a number/);
    err(() => parseCashJson(CASH.replace('"buyValue":"30087.21"', '"buyValue":"-5"')), /negative|does not equal/);
  });
});

describe("participant-wise open interest CSV", () => {
  const p = parseParticipantOiCsv(OI);
  it("reads the date from the title line", () => assert.equal(p.date, "2026-11-11"));
  it("FII index futures: long 57,226 and short 127,639 (not the Client, DII, Pro or TOTAL rows)", () => {
    assert.equal(p.long, 57226);
    assert.equal(p.short, 127639);
  });
  it("gives the long share the page shows", () => assert.ok(Math.abs((longPct(p.long, p.short) as number) - 30.95) < 0.01));
  it("finds columns by name, so extra or reordered columns are fine", () => {
    const csv = ['"as on Nov 09, 2026"', "Client Type,Future Stock Long,Future Index Short,Future Index Long", "FII,1,200,100"].join("\n");
    const q = parseParticipantOiCsv(csv);
    assert.deepEqual([q.long, q.short, q.date], [100, 200, "2026-11-09"]);
  });
  it("copes with a file that has no date in its title", () => {
    const csv = ["Participant wise Open Interest", "Client Type,Future Index Long,Future Index Short", "FII,5,6"].join("\r\n");
    assert.equal(parseParticipantOiCsv(csv).date, null);
  });
  it("rejects a block page, a file without the FII row, without the columns, or with odd numbers", () => {
    err(() => parseParticipantOiCsv("<html>Access Denied</html>"), /too short/);
    err(() => parseParticipantOiCsv("<html>\n<body>\nAccess Denied\n</body>\n</html>"), /Client Type/);
    err(() => parseParticipantOiCsv(OI.replace(/\r\nFII,[^\r]*/, "")), /no FII row/);
    err(() => parseParticipantOiCsv(OI.replace("Future Index Long", "Something Else")), /Future Index Long/);
    err(() => parseParticipantOiCsv(OI.replace("FII,57226,127639", "FII,57226.5,127639")), /whole, non-negative/);
    err(() => parseParticipantOiCsv(OI.replace("FII,57226,127639", "FII,abc,127639")), /not a number/);
    err(() => parseParticipantOiCsv(OI.replace("Nov 11, 2026", "Foo 40, 2026")), /title|unrecognised|date/);
  });
});

describe("stored row → what the page reads", () => {
  const base = { date: "2026-11-11", fiiBuy: 1, fiiSell: 2, fiiNet: -1, diiBuy: 3, diiSell: 1, diiNet: 2, fiiIdxFutLong: 10, fiiIdxFutShort: 20, provisional: true, cashFetchedAt: null, oiFetchedAt: null, createdAt: new Date(), updatedAt: new Date() };
  it("a full row has both halves", () => {
    const r = toRow(base);
    assert.deepEqual(r.cash, { fii: { buy: 1, sell: 2, net: -1 }, dii: { buy: 3, sell: 1, net: 2 } });
    assert.deepEqual(r.idxFut, { long: 10, short: 20 });
    assert.equal(r.provisional, true);
  });
  it("a half is null unless every one of its numbers is there: never a partial figure, never a zero", () => {
    assert.equal(toRow({ ...base, diiNet: null }).cash, null);
    assert.equal(toRow({ ...base, fiiIdxFutShort: null }).idxFut, null);
    const oiOnly = toRow({ ...base, fiiBuy: null, fiiSell: null, fiiNet: null, diiBuy: null, diiSell: null, diiNet: null, provisional: false });
    assert.equal(oiOnly.cash, null);
    assert.deepEqual(oiOnly.idxFut, { long: 10, short: 20 });
  });
});
