import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { GET as quotesGET, QUOTES_PER_MINUTE } from "../app/api/quotes/route";
import { GET as candlesGET } from "../app/api/candles/route";
import { GET as depthGET } from "../app/api/symbol-depth/route";
import { MAX_QUOTE_SYMBOLS, infoFor, isDynamicEquity, isTradableId } from "./dynamic-symbols";

/**
 * Any NSE equity or ETF from Upstox's instrument list can be quoted, charted and traded. The instrument list and the feed are replaced by a stand-in
 * for fetch: no network and no token are used.
 */
const master = [
  { segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: "RELIANCE", name: "RELIANCE INDUSTRIES LTD", instrument_key: "NSE_EQ|INE002A01018", isin: "INE002A01018" },
  { segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: "RELAXO", name: "RELAXO FOOTWEARS LTD", instrument_key: "NSE_EQ|INE131B01039", isin: "INE131B01039" },
  { segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: "ITC", name: "ITC LTD", instrument_key: "NSE_EQ|INE154A01025", isin: "INE154A01025" },
  { segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: "SLEEPY", name: "SLEEPY SMALLCAP LTD", instrument_key: "NSE_EQ|INE000000001", isin: "INE000000001" },
  { segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: "NIFTYBEES", name: "NIPPON NIFTY BEES", short_name: "Nippon Nifty ETF", instrument_key: "NSE_EQ|INF204KB14I2", isin: "INF204KB14I2" },
  { segment: "NSE_INDEX", instrument_type: "INDEX", trading_symbol: "NIFTY PVT BANK", name: "Nifty Pvt Bank", instrument_key: "NSE_INDEX|Nifty Pvt Bank" },
];
const masterGz = gzipSync(Buffer.from(JSON.stringify(master)));
/** what the feed says for each instrument key; SLEEPY has no last price (no recent trades) */
const ltp: Record<string, { last_price: number; cp: number; volume: number }> = {
  "NSE_EQ|INE131B01039": { last_price: 1234.5, cp: 1200, volume: 5000 },
  "NSE_EQ|INE154A01025": { last_price: 410.25, cp: 405, volume: 90000 },
  "NSE_EQ|INE000000001": { last_price: 0, cp: 88, volume: 0 },
  "NSE_EQ|INF204KB14I2": { last_price: 275, cp: 270, volume: 1000 },
};

const realFetch = globalThis.fetch;
const realToken = process.env.UPSTOX_ANALYTICS_TOKEN;
let urls: string[] = [];
let feedDown = false;

const candleRow = (iso: string, c: number) => [iso, c, c + 1, c - 1, c, 100, 0];
const feed = (async (input: string | URL | Request) => {
  const url = String(input);
  urls.push(url);
  if (url.includes("market-quote/ltp")) {
    if (feedDown) return new Response("{}", { status: 503 });
    const keys = decodeURIComponent(new URL(url).searchParams.get("instrument_key") ?? "").split(",");
    const data: Record<string, unknown> = {};
    for (const k of keys) if (ltp[k]) data[k.replace("|", ":")] = { ...ltp[k], instrument_token: k };
    return new Response(JSON.stringify({ status: "success", data }));
  }
  if (url.includes("market-quote/quotes")) {
    const k = decodeURIComponent(new URL(url).searchParams.get("instrument_key") ?? "");
    return new Response(JSON.stringify({ data: { [k.replace("|", ":")]: { depth: { buy: [{ price: 1234, quantity: 10, orders: 2 }], sell: [{ price: 1235, quantity: 7, orders: 1 }] }, total_buy_quantity: 10, total_sell_quantity: 7 } } }));
  }
  if (url.includes("historical-candle") || url.includes("intraday")) return new Response(JSON.stringify({ status: "success", data: { candles: [candleRow("2026-11-13T00:00:00+05:30", 100), candleRow("2026-11-12T00:00:00+05:30", 99)] } }));
  return new Response(masterGz); // the instrument list
}) as typeof fetch;

beforeEach(() => {
  urls = [];
  feedDown = false;
  process.env.UPSTOX_ANALYTICS_TOKEN = "test-token";
  globalThis.fetch = feed;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realToken === undefined) delete process.env.UPSTOX_ANALYTICS_TOKEN;
  else process.env.UPSTOX_ANALYTICS_TOKEN = realToken;
});

const quotes = (symbols: string, ip?: string) => quotesGET(new Request(`http://localhost/api/quotes?symbols=${symbols}`, { headers: ip ? { "x-forwarded-for": ip } : {} }));
const candles = (q: string) => candlesGET(new Request(`http://localhost/api/candles?${q}`));
const ltpCalls = () => urls.filter((u) => u.includes("market-quote/ltp"));

describe("which symbols are the app's own and which are fetched on demand", () => {
  it("the twelve are built in; any other NSE trading symbol is dynamic; an index id or junk is neither", () => {
    for (const id of ["RELIANCE", "TCS", "NIFTY50", "BTC"]) assert.equal(isDynamicEquity(id), false, id);
    for (const id of ["ITC", "M&M", "BAJAJ-AUTO", "SLEEPY"]) assert.equal(isDynamicEquity(id), true, id);
    assert.equal(isDynamicEquity("IDX NIFTY PVT BANK"), false);
    assert.equal(isDynamicEquity("itc"), false);
    assert.equal(isDynamicEquity(""), false);
    for (const id of ["RELIANCE", "BTC", "ITC", "M&M"]) assert.equal(isTradableId(id), true, id);
    assert.equal(isTradableId("IDX NIFTY PVT BANK"), false);
  });
  it("a dynamic symbol is a stock with the exchange's name, or its own symbol until the name is known", () => {
    assert.deepEqual(infoFor("ITC", "ITC Ltd"), { id: "ITC", name: "ITC Ltd", type: "stock", base: 0 });
    assert.equal(infoFor("ITC").name, "ITC");
    assert.equal(infoFor("TCS").name, "Tata Consultancy Svcs");
  });
});

describe("/api/quotes", () => {
  it("answers live, none (no recent trades) and unknown, from one request to the feed", async () => {
    const res = await quotes("RELAXO,SLEEPY,NOSUCH,NIFTYBEES");
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.source, "live");
    assert.deepEqual(j.quotes.RELAXO, { state: "live", ltp: 1234.5, prevClose: 1200, name: "Relaxo Footwears Ltd" });
    assert.equal(j.quotes.NIFTYBEES.name, "Nippon Nifty ETF");
    assert.equal(j.quotes.NIFTYBEES.state, "live");
    assert.equal(j.quotes.SLEEPY.state, "none");
    assert.equal("ltp" in j.quotes.SLEEPY, false, "a symbol with no recent trades has no price at all");
    assert.equal(j.quotes.SLEEPY.prevClose, 88);
    assert.equal(j.quotes.NOSUCH.state, "unknown");
    assert.equal(ltpCalls().length, 1, "one feed request for the lot");
  });
  it("the same set asked again is answered from memory, so many views on screen are one feed request", async () => {
    await quotes("ITC,RELAXO");
    const before = ltpCalls().length;
    const again = await (await quotes("RELAXO,ITC")).json(); // any order: it is the same set
    assert.equal(again.quotes.ITC.ltp, 410.25);
    assert.equal(ltpCalls().length, before);
  });
  it("refuses an empty list, more than the limit, and anything that is not a trading symbol", async () => {
    assert.equal((await quotes("")).status, 400);
    const many = Array.from({ length: MAX_QUOTE_SYMBOLS + 1 }, (_, i) => `S${i}`).join(",");
    assert.equal((await quotes(many)).status, 400);
    const ok = Array.from({ length: MAX_QUOTE_SYMBOLS }, (_, i) => `T${i}`).join(",");
    assert.equal((await quotes(ok)).status, 200);
    for (const bad of ["itc", "IDX%20NIFTY", "A;B", "TOO-LONG-A-SYMBOL-NAME-X"]) assert.equal((await quotes(bad)).status, 400, bad);
  });
  it("is unavailable, with no price, without a token and when the feed fails", async () => {
    delete process.env.UPSTOX_ANALYTICS_TOKEN;
    assert.equal((await (await quotes("ITC")).json()).source, "unavailable");
    process.env.UPSTOX_ANALYTICS_TOKEN = "test-token";
    feedDown = true;
    const j = await (await quotes("SLEEPY")).json();
    assert.equal(j.source, "unavailable");
    assert.equal(j.quotes, undefined);
  });
  it("allows QUOTES_PER_MINUTE requests a minute from one address, then answers 429 with Retry-After; another address is fine", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < QUOTES_PER_MINUTE; i++) assert.notEqual((await quotes("ITC", ip)).status, 429, `request ${i + 1}`);
    const over = await quotes("ITC", ip);
    assert.equal(over.status, 429);
    assert.ok(Number(over.headers.get("retry-after")) >= 1);
    assert.notEqual((await quotes("ITC", "203.0.113.51")).status, 429);
  });
});

describe("/api/candles for a symbol the app does not chart on its own", () => {
  it("looks the instrument key up on the instrument list and fetches that symbol's candles", async () => {
    const res = await candles("symbol=RELAXO&interval=1D&range=1Y");
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.source, "live");
    assert.equal(j.symbol, "RELAXO");
    assert.ok(j.bars.length >= 2);
    const feedUrls = urls.filter((u) => u.includes("historical-candle"));
    assert.ok(feedUrls.length >= 1);
    assert.ok(feedUrls.every((u) => u.includes(encodeURIComponent("NSE_EQ|INE131B01039"))), "the candle requests name Relaxo's key");
  });
  it("has the same caching as for the twelve", async () => {
    const own = await candles("symbol=RELIANCE&interval=1D&range=1Y");
    const other = await candles("symbol=RELAXO&interval=1D&range=1Y");
    assert.equal(other.headers.get("cache-control"), own.headers.get("cache-control"));
    assert.match(other.headers.get("cache-control") ?? "", /s-maxage=600/);
  });
  it("refuses a symbol that is not on the list, crypto, an index id and a malformed one, and never asks the feed for candles", async () => {
    for (const s of ["NOSUCH", "BTC", "IDX%20NIFTY%20PVT%20BANK", "bad%20symbol"]) {
      const res = await candles(`symbol=${s}&interval=1D&range=1Y`);
      assert.equal(res.status, 400, s);
    }
    assert.equal(urls.filter((u) => u.includes("historical-candle")).length, 0);
  });
  it("is the same endpoint with the same size limits: an interval that is not offered for the range is refused, and a symbol is never looked up for it", async () => {
    const res = await candles("symbol=RELAXO&interval=1m&range=1Y");
    assert.equal(res.status, 400);
    assert.equal(urls.length, 0);
  });
  it("says unavailable, not an invented chart, when the feed has nothing", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("historical-candle") || url.includes("intraday")) return new Response(JSON.stringify({ status: "success", data: { candles: [] } }));
      return new Response(masterGz);
    }) as typeof fetch;
    const j = await (await candles("symbol=SLEEPY&interval=1D&range=1Y")).json();
    assert.equal(j.source, "unavailable");
    assert.equal(j.bars, undefined);
  });
  it("still serves the twelve from their fixed keys without loading the instrument list", async () => {
    await candles("symbol=TCS&interval=1D&range=1Y");
    assert.equal(urls.filter((u) => !u.includes("upstox.com/v")).length, 0, "no instrument list download");
  });
});

describe("/api/symbol-depth for any listed equity", () => {
  const depth = (s: string) => depthGET(new Request(`http://localhost/api/symbol-depth?symbol=${s}`));
  it("gives five-level depth for an equity the app does not chart on its own", async () => {
    const j = await (await depth("ITC")).json();
    assert.equal(j.source, "live");
    assert.equal(j.bids[0].price, 1234);
  });
  it("has none for an index or crypto", async () => {
    for (const s of ["NIFTY50", "BTC", "IDX%20NIFTY%20PVT%20BANK", "NOSUCH"]) assert.equal((await (await depth(s)).json()).source, "unsupported", s);
  });
});

describe("how the provider treats these symbols (the rules, checked in the source)", () => {
  const src = fs.readFileSync("components/ZestoxxProvider.tsx", "utf8").replace(/\r\n/g, "\n");
  it("never simulates a price for one: the random walk skips any symbol that is not one of the twelve", () => {
    assert.match(src, /const sym = SYMBOL_MAP\[id\];\n\s+if \(!sym\) return;/);
  });
  it("a market order with no live price is not filled", () => {
    assert.match(src, /const at = live\[symbol\];\n\s+if \(!\(at > 0\)\) return refuse\("There is no live price/);
  });
  it("a no-trades answer removes the price instead of keeping a stale one", () => {
    assert.match(src, /none\.forEach\(\(id\) => delete next\[id\]\)/);
  });
  it("quotes are fetched in one request for the symbols that need watching, at most every few seconds, and not while the page is hidden", () => {
    assert.equal((src.match(/fetch\(`\/api\/quotes/g) ?? []).length, 1);
    assert.match(src, /QUOTE_GAP_MS = 5_000/);
    assert.match(src, /document\.visibilityState === "hidden"/);
    assert.match(src, /\.slice\(0, MAX_QUOTE_SYMBOLS\)/);
    assert.match(src, /if \(quoteBusy\.current/);
  });
  it("the set it watches is what is on screen, what is held, and what has an open order, GTT or alert", () => {
    const block = src.slice(src.indexOf("const quoteIds = useCallback"), src.indexOf("const pollQuotes"));
    for (const part of ["watched.current.values()", "holdingsRef.current", "openOrdersRef.current", "alertsRef.current"]) assert.ok(block.includes(part), part);
  });
});
