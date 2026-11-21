import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { EQUITY_SETTLEMENT_DAYS, isSettled, settlementDate, splitHoldings } from "./settlement";
import { catchUpWindow, firstCrossing, gttError, gttKind, triggerDirection } from "./gtt";
import { MASK_PNL, MASK_VALUE, maskPnl, maskValue } from "./privacy";
import { isIndexSymbol, isWatchSymbol, MAX_SYMBOLS_PER_LIST } from "./watchlists";
import { isRestingOrderExpired, GTT_MAX_DAYS } from "./orders";
import { makeContractId } from "./contract";
import type { OrderLogEntry } from "./types";

describe("equity settlement: one constant, T+1, on the market calendar", () => {
  it("the cycle is T+1 (NSE's standard since the move that finished in January 2023), kept in one constant", () => {
    assert.equal(EQUITY_SETTLEMENT_DAYS, 1);
  });
  it("a trade settles on the next trading day", () => {
    assert.equal(settlementDate("2026-11-11"), "2026-11-12"); // Wed -> Thu
  });
  it("skips weekends: a Friday trade settles on Monday", () => {
    assert.equal(settlementDate("2026-11-13"), "2026-11-16");
  });
  it("skips exchange holidays: Monday 9 Nov 2026 -> Tuesday 10 Nov is Diwali-Balipratipada, so Wednesday 11", () => {
    assert.equal(settlementDate("2026-11-09"), "2026-11-11");
    // Thursday 23 Nov is followed by the Guru Nanak holiday on Tuesday 24
    assert.equal(settlementDate("2026-11-23"), "2026-11-25");
  });
  it("a longer cycle just counts more trading days", () => {
    assert.equal(settlementDate("2026-11-11", 2), "2026-11-13");
    assert.equal(settlementDate("2026-11-11", 0), "2026-11-11");
  });
  it("settled means the settlement date is today or earlier; an undated trade counts as settled", () => {
    assert.equal(isSettled("2026-11-11", "2026-11-11"), false);
    assert.equal(isSettled("2026-11-11", "2026-11-12"), true);
    assert.equal(isSettled("2026-11-13", "2026-11-14"), false); // Saturday: not yet
    assert.equal(isSettled("2026-11-13", "2026-11-16"), true);
    assert.equal(isSettled(undefined, "2026-11-11"), true);
  });
});

const fill = (id: number, symbol: string, side: "buy" | "sell", qty: number, price: number, date?: string): OrderLogEntry => ({ id, symbol, side, qty, price, mode: "market", time: "10:00:00 am", orderType: "MARKET", status: "filled", date });

describe("Holdings and Positions", () => {
  const today = "2026-11-11";
  it("shares bought today are a Position; shares bought on an earlier day are Holdings", () => {
    const s = splitHoldings({ RELIANCE: { qty: 10, avgPrice: 1400 } }, [fill(1, "RELIANCE", "buy", 6, 1380, "2026-11-09"), fill(2, "RELIANCE", "buy", 4, 1430, today)], today);
    assert.deepEqual(s.holdings, { RELIANCE: { qty: 6, avgPrice: 1400 } });
    assert.equal(s.positions.length, 1);
    assert.equal(s.positions[0].qty, 4);
    assert.equal(s.positions[0].avgPrice, 1430);
    assert.equal(s.positions[0].contract, false);
  });
  it("the next trading day the same shares have settled and are all Holdings", () => {
    const s = splitHoldings({ RELIANCE: { qty: 10, avgPrice: 1400 } }, [fill(1, "RELIANCE", "buy", 10, 1400, today)], "2026-11-12");
    assert.deepEqual(s.holdings, { RELIANCE: { qty: 10, avgPrice: 1400 } });
    assert.equal(s.positions.length, 0);
  });
  it("a Friday purchase is still a Position on Saturday and Sunday and settles on Monday", () => {
    const h = { TCS: { qty: 3, avgPrice: 4000 } };
    const log = [fill(1, "TCS", "buy", 3, 4000, "2026-11-13")];
    assert.equal(splitHoldings(h, log, "2026-11-14").positions.length, 1);
    assert.equal(splitHoldings(h, log, "2026-11-15").positions.length, 1);
    assert.equal(splitHoldings(h, log, "2026-11-16").positions.length, 0);
  });
  it("a sale comes off today's unsettled shares first, so nothing phantom is left", () => {
    const s = splitHoldings({ RELIANCE: { qty: 6, avgPrice: 1400 } }, [fill(1, "RELIANCE", "buy", 6, 1380, "2026-11-09"), fill(2, "RELIANCE", "buy", 4, 1430, today), fill(3, "RELIANCE", "sell", 4, 1440, today)], today);
    assert.equal(s.positions.length, 0);
    assert.deepEqual(s.holdings, { RELIANCE: { qty: 6, avgPrice: 1400 } });
  });
  it("an order saved before dates were kept has no date and counts as settled", () => {
    const s = splitHoldings({ INFY: { qty: 5, avgPrice: 1500 } }, [fill(1, "INFY", "buy", 5, 1500)], today);
    assert.deepEqual(s.holdings, { INFY: { qty: 5, avgPrice: 1500 } });
    assert.equal(s.positions.length, 0);
  });
  it("an option contract is always a Position, never a delivery holding", () => {
    const id = makeContractId({ underlying: "NIFTY50", expiry: "2026-11-26", strike: 25500, type: "CE", key: "NSE_FO|1234" });
    const s = splitHoldings({ [id]: { qty: 75, avgPrice: 120 } }, [fill(1, id, "buy", 75, 120, "2026-11-02")], today);
    assert.deepEqual(s.holdings, {});
    assert.equal(s.positions.length, 1);
    assert.equal(s.positions[0].contract, true);
    assert.equal(s.positions[0].qty, 75);
  });
  it("what is held in total is the same before and after the split", () => {
    const h = { RELIANCE: { qty: 10, avgPrice: 1400 }, TCS: { qty: 2, avgPrice: 4000 } };
    const s = splitHoldings(h, [fill(1, "RELIANCE", "buy", 4, 1430, today), fill(2, "TCS", "buy", 2, 4000, "2026-11-02")], today);
    const total = (id: string) => (s.holdings[id]?.qty ?? 0) + (s.positions.find((p) => p.id === id)?.qty ?? 0);
    assert.equal(total("RELIANCE"), 10);
    assert.equal(total("TCS"), 2);
  });
});

describe("GTT and stop-loss orders", () => {
  it("the trigger is above or below the price now, and a sell below is a stop-loss, a sell above a target", () => {
    assert.equal(triggerDirection(1480, 1500), "below");
    assert.equal(triggerDirection(1520, 1500), "above");
    assert.equal(gttKind("sell", "below"), "Stop-loss");
    assert.equal(gttKind("sell", "above"), "Target");
    assert.equal(gttKind("buy", "above"), "Buy on breakout");
    assert.equal(gttKind("buy", "below"), "Buy on dip");
  });
  it("is refused when it could not trade: a trigger at the price, no quantity, selling what is not held, buying beyond the cash", () => {
    const ok = { side: "sell" as const, qty: 5, trigger: 1480, priceNow: 1500, heldQty: 10, cash: 1_000_000 };
    assert.equal(gttError(ok), null);
    assert.match(gttError({ ...ok, trigger: 1500 })!, /too close/);
    assert.match(gttError({ ...ok, trigger: 1499.9 })!, /too close/);
    assert.match(gttError({ ...ok, qty: 0 })!, /whole number/);
    assert.match(gttError({ ...ok, qty: 1.5 })!, /whole number/);
    assert.match(gttError({ ...ok, trigger: -3 })!, /above 0/);
    assert.match(gttError({ ...ok, qty: 11 })!, /hold 10/);
    assert.match(gttError({ ...ok, heldQty: 0 })!, /short/);
    assert.match(gttError({ ...ok, side: "buy", trigger: 1600, qty: 1000, cash: 100 })!, /cash/);
  });
  const bar = (t: number, o: number, h: number, l: number) => ({ t, o, h, l });
  it("fills at the first candle that crossed the trigger, at the trigger price", () => {
    const bars = [bar(0, 1500, 1505, 1495), bar(300_000, 1495, 1497, 1488), bar(600_000, 1488, 1489, 1470), bar(900_000, 1470, 1472, 1440)];
    const hit = firstCrossing(bars, { trigger: 1480, direction: "below", placedAtMs: 0 });
    assert.deepEqual(hit, { t: 600_000, price: 1480, gapped: false });
  });
  it("a price that gapped past the trigger fills at that candle's open, not at the trigger", () => {
    const hit = firstCrossing([bar(0, 1500, 1505, 1495), bar(300_000, 1470, 1475, 1465)], { trigger: 1480, direction: "below", placedAtMs: 0 });
    assert.deepEqual(hit, { t: 300_000, price: 1470, gapped: true });
    const up = firstCrossing([bar(0, 1500, 1505, 1495), bar(300_000, 1530, 1540, 1525)], { trigger: 1520, direction: "above", placedAtMs: 0 });
    assert.deepEqual(up, { t: 300_000, price: 1530, gapped: true });
  });
  it("a trigger above is crossed by a high; a candle that only touches it counts", () => {
    assert.deepEqual(firstCrossing([bar(0, 1500, 1519, 1495), bar(300_000, 1505, 1520, 1500)], { trigger: 1520, direction: "above", placedAtMs: 0 }), { t: 300_000, price: 1520, gapped: false });
  });
  it("candles from before the order was placed are not looked at, and nothing crossing gives null", () => {
    const bars = [bar(0, 1500, 1505, 1400), bar(300_000, 1500, 1505, 1495)];
    assert.equal(firstCrossing(bars, { trigger: 1480, direction: "below", placedAtMs: 300_000 }), null);
    assert.equal(firstCrossing([], { trigger: 1480, direction: "below", placedAtMs: 0 }), null);
    assert.deepEqual(firstCrossing(bars, { trigger: 1480, direction: "below", placedAtMs: 0 }), { t: 0, price: 1480, gapped: false });
  });
  it("picks the finest candles the feed offers for how long ago the order was placed, and none when that is too long", () => {
    const now = Date.parse("2026-11-20T10:00:00Z");
    const ago = (days: number) => now - days * 86_400_000;
    assert.deepEqual(catchUpWindow(ago(2), now), { range: "5D", interval: "5m", barMs: 300_000 });
    assert.equal(catchUpWindow(ago(20), now)!.range, "1M");
    assert.equal(catchUpWindow(ago(60), now)!.range, "3M");
    assert.equal(catchUpWindow(ago(120), now)!.range, "6M");
    assert.equal(catchUpWindow(ago(400), now), null);
  });
  it("a GTT waits for its trigger for a year, then expires", () => {
    const o = { orderType: "GTT" as const, placedDate: "2026-01-10" };
    assert.equal(GTT_MAX_DAYS, 365);
    assert.equal(isRestingOrderExpired(o, "2026-12-31"), false);
    assert.equal(isRestingOrderExpired(o, "2027-01-10"), false); // valid through the day a year after it was placed
    assert.equal(isRestingOrderExpired(o, "2027-01-11"), true);
  });
});

describe("privacy masks", () => {
  it("the portfolio's value shows as **** and profit and loss as ***", () => {
    assert.equal(MASK_VALUE, "****");
    assert.equal(MASK_PNL, "***");
    assert.equal(maskValue("₹10,00,000", true), "****");
    assert.equal(maskPnl("+₹1,200", true), "***");
  });
  it("and as they are when privacy mode is off", () => {
    assert.equal(maskValue("₹10,00,000", false), "₹10,00,000");
    assert.equal(maskPnl("+₹1,200", false), "+₹1,200");
  });
});

describe("watchlist symbols", () => {
  it("an NSE symbol or an index id is allowed; anything else is not", () => {
    for (const s of ["RELIANCE", "M&M", "BAJAJ-AUTO", "NIFTY50", "IDX NIFTY PVT BANK", "IDX NIFTY100 QUALTY30"]) assert.ok(isWatchSymbol(s), s);
    for (const s of ["", "reliance", "IDX ", "IDX lower", "a b", "<script>", "X".repeat(21)]) assert.ok(!isWatchSymbol(s), s);
    assert.ok(isIndexSymbol("IDX NIFTY PVT BANK"));
    assert.ok(!isIndexSymbol("NIFTY50"));
  });
  it("a list holds up to 250", () => {
    assert.equal(MAX_SYMBOLS_PER_LIST, 250);
  });
});

describe("the instrument master: indices, F&O underlyings and a daily refresh", () => {
  const master = [
    { segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: "RELIANCE", name: "RELIANCE INDUSTRIES LTD", instrument_key: "NSE_EQ|INE002A01018", isin: "INE002A01018" },
    { segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: "RELAXO", name: "RELAXO FOOTWEARS LTD", instrument_key: "NSE_EQ|INE131B01039", isin: "INE131B01039" },
    { segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: "NIFTYBEES", name: "NIPPON NIFTY BEES", short_name: "Nippon Nifty ETF", instrument_key: "NSE_EQ|INF204KB14I2", isin: "INF204KB14I2" },
    { segment: "NSE_INDEX", instrument_type: "INDEX", trading_symbol: "NIFTY", name: "Nifty 50", instrument_key: "NSE_INDEX|Nifty 50" },
    { segment: "NSE_INDEX", instrument_type: "INDEX", trading_symbol: "BANKNIFTY", name: "Nifty Bank", instrument_key: "NSE_INDEX|Nifty Bank" },
    { segment: "NSE_INDEX", instrument_type: "INDEX", trading_symbol: "NIFTY PVT BANK", name: "Nifty Pvt Bank", instrument_key: "NSE_INDEX|Nifty Pvt Bank" },
    { segment: "NSE_FO", instrument_type: "FUT", name: "RELIANCE INDUSTRIES LTD", underlying_symbol: "RELIANCE", underlying_type: "EQUITY", underlying_key: "NSE_EQ|INE002A01018", instrument_key: "NSE_FO|1", expiry: Date.parse("2026-11-26T10:00:00Z"), lot_size: 250 },
    { segment: "NSE_FO", instrument_type: "FUT", name: "NIFTY", underlying_symbol: "NIFTY", underlying_type: "INDEX", underlying_key: "NSE_INDEX|Nifty 50", instrument_key: "NSE_FO|2", expiry: Date.parse("2026-11-26T10:00:00Z"), lot_size: 75 },
  ];
  const gz = gzipSync(Buffer.from(JSON.stringify(master)));
  it("search finds equities, ETFs and indices, says which have F&O, and ranks exact and prefix matches first", async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(gz);
    }) as typeof fetch;
    try {
      const { searchSymbols } = await import("./upstox-watchlist");
      const rel = await searchSymbols("rel");
      assert.deepEqual(rel.map((r) => r.symbol), ["RELIANCE", "RELAXO"]); // F&O name first among equal matches
      assert.equal(rel[0].fno, true);
      assert.equal(rel[1].fno, false);
      const nifty = await searchSymbols("nifty");
      const by = Object.fromEntries(nifty.map((r) => [r.symbol, r]));
      assert.equal(by["NIFTY50"].kind, "index"); // Nifty 50 keeps the id the app charts
      assert.equal(by["NIFTY50"].fno, true);
      assert.equal(by["BANKNIFTY"].kind, "index");
      assert.equal(by["IDX NIFTY PVT BANK"].kind, "index");
      assert.equal(by["IDX NIFTY PVT BANK"].fno, false);
      assert.equal(by["NIFTYBEES"].kind, "etf");
      assert.deepEqual((await searchSymbols("zzzz")), []);
      assert.deepEqual((await searchSymbols("   ")), []);
      assert.equal(calls, 1, "the master was downloaded once for all of these");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  it("a copy of the master is used until the day's file is out (06:30 IST) and for at most a day", async () => {
    const { masterIsFresh } = await import("./upstox-movers");
    const ist = (iso: string) => Date.parse(`${iso}+05:30`);
    // loaded Tue 05:00 IST (the file of Monday): good until 06:30, not after
    assert.equal(masterIsFresh(ist("2026-11-17T05:00:00"), ist("2026-11-17T06:00:00")), true);
    assert.equal(masterIsFresh(ist("2026-11-17T05:00:00"), ist("2026-11-17T07:00:00")), false);
    // loaded Tue 07:00 IST: good for the rest of Tuesday and until 06:30 Wednesday
    assert.equal(masterIsFresh(ist("2026-11-17T07:00:00"), ist("2026-11-17T23:59:00")), true);
    assert.equal(masterIsFresh(ist("2026-11-17T07:00:00"), ist("2026-11-18T06:00:00")), true);
    assert.equal(masterIsFresh(ist("2026-11-17T07:00:00"), ist("2026-11-18T06:31:00")), false);
    // never more than a day
    assert.equal(masterIsFresh(ist("2026-11-17T06:31:00"), ist("2026-11-18T06:29:00")), true);
    assert.equal(masterIsFresh(ist("2026-11-17T06:31:00"), ist("2026-11-18T06:31:00")), false);
  });
  void mock;
});

import { makeLimiter } from "./rateLimit";
import { GTT_CATCHUP_GAP_MS, GTT_CATCHUP_SYMBOLS, MAX_OPEN_GTT } from "./gtt";
import fs from "node:fs";
import path from "node:path";

describe("the next-visit check is bounded", () => {
  it("a fixed-window limiter lets max through a window, then refuses until it ends", () => {
    const allow = makeLimiter(3, 1000);
    assert.deepEqual([allow("a", 0).ok, allow("a", 1).ok, allow("a", 2).ok, allow("a", 3).ok], [true, true, true, false]);
    assert.equal(allow("a", 3).retryAfterS, 1);
    assert.equal(allow("b", 3).ok, true);
    assert.equal(allow("a", 1000).ok, true); // a new window
  });
  it("the limits are small constants: 5 symbols a pass, 30 s between passes, 20 open GTT orders", () => {
    assert.equal(GTT_CATCHUP_SYMBOLS, 5);
    assert.equal(GTT_CATCHUP_GAP_MS, 30_000);
    assert.equal(MAX_OPEN_GTT, 20);
  });
  const provider = fs.readFileSync(path.join(process.cwd(), "components", "ZestoxxProvider.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("a pass groups orders by symbol: one candle request per symbol, not per order, and no more than the cap", () => {
    assert.match(provider, /bySymbol\.set\(o\.symbol/);
    assert.match(provider, /if \(n\+\+ >= GTT_CATCHUP_SYMBOLS\) break/);
    assert.equal((provider.match(/fetch\(`\/api\/candles/g) ?? []).length, 1);
  });
  it("it runs once per page load, in one tab at a time, not again too soon, and re-checks an order is still open before filling it", () => {
    assert.match(provider, /caughtUp\.current = true/);
    assert.match(provider, /catchUpOnce\(/);
    const gtt = fs.readFileSync(path.join(process.cwd(), "lib", "gtt.ts"), "utf8");
    assert.match(gtt, /zestoxx-gtt-catchup/);
    assert.match(gtt, /ifAvailable: true/);
    assert.match(gtt, /GTT_CATCHUP_GAP_MS/);
    assert.match(provider, /openOrdersRef\.current\.some\(\(x\) => x\.id === o\.id\) \|\| firedOrders\.current\.has\(o\.id\)/);
    // the order is marked fired before it is filled
    assert.ok(provider.indexOf("firedOrders.current.add(o.id);\n            if (short)") > 0);
  });
});

import { catchUpOnce, type CatchUpEnv } from "./gtt";

describe("two tabs cannot both run the next-visit check", () => {
  /** a Web Locks stand-in: a lock is held while its callback runs; with ifAvailable, a held lock gives the callback null */
  const makeLocks = () => {
    const held = new Set<string>();
    return {
      request: async (name: string, _o: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void>) => {
        if (held.has(name)) return cb(null);
        held.add(name);
        try {
          await cb({});
        } finally {
          held.delete(name);
        }
      },
    };
  };
  const device = (clock: { t: number }) => {
    let stamp = 0;
    const locks = makeLocks();
    const env = (): CatchUpEnv => ({ locks, readStamp: () => stamp, writeStamp: (n) => (stamp = n), now: () => clock.t });
    return { env, stamp: () => stamp };
  };

  it("two tabs asking at the same moment, the first finishing at once: one pass, not two (the race that showed up as two candle requests)", async () => {
    const clock = { t: 1_000_000 };
    const d = device(clock);
    let passes = 0;
    const pass = async () => {
      passes++; // finishes immediately: the lock is free again before the second tab's request is handled
    };
    const ran = await Promise.all([catchUpOnce(d.env(), pass), catchUpOnce(d.env(), pass)]);
    assert.equal(passes, 1);
    assert.deepEqual(ran.sort(), [false, true]);
    assert.equal(d.stamp(), 1_000_000);
  });
  it("many tabs, any order: still one pass", async () => {
    const clock = { t: 5_000_000 };
    const d = device(clock);
    let passes = 0;
    await Promise.all(Array.from({ length: 6 }, () => catchUpOnce(d.env(), async () => void passes++)));
    assert.equal(passes, 1);
  });
  it("a tab that cannot get the lock leaves the stamp alone and does not run", async () => {
    const clock = { t: 9_000_000 };
    const d = device(clock);
    let inner = 0;
    let outer = 0;
    await catchUpOnce(d.env(), async () => {
      outer++;
      assert.equal(await catchUpOnce(d.env(), async () => void inner++), false); // asked while the first pass is running
    });
    assert.deepEqual([outer, inner], [1, 0]);
  });
  it("a reload soon after does not run again; one after the gap does", async () => {
    const clock = { t: 20_000_000 };
    const d = device(clock);
    let passes = 0;
    const pass = async () => void passes++;
    assert.equal(await catchUpOnce(d.env(), pass), true);
    clock.t += GTT_CATCHUP_GAP_MS - 1;
    assert.equal(await catchUpOnce(d.env(), pass), false);
    clock.t += 2;
    assert.equal(await catchUpOnce(d.env(), pass), true);
    assert.equal(passes, 2);
  });
  it("without Web Locks the stamp alone limits it", async () => {
    const clock = { t: 30_000_000 };
    let stamp = 0;
    const env: CatchUpEnv = { readStamp: () => stamp, writeStamp: (n) => (stamp = n), now: () => clock.t };
    let passes = 0;
    await catchUpOnce(env, async () => void passes++);
    await catchUpOnce(env, async () => void passes++);
    assert.equal(passes, 1);
  });
});
