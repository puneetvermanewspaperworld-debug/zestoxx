import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/candles/route";

/**
 * What /api/candles does when the candle feed misbehaves. The feed is replaced by a stand-in for fetch, so no network and no token are used.
 */
const realFetch = globalThis.fetch;
const realToken = process.env.UPSTOX_ANALYTICS_TOKEN;
let calls: string[] = [];

const row = (iso: string, c: number) => [iso, c, c + 1, c - 1, c, 100, 0];
const feedOk = (rows: unknown[]) => new Response(JSON.stringify({ status: "success", data: { candles: rows } }), { status: 200 });
const get = (q: string) => GET(new Request(`http://localhost/api/candles?${q}`));

beforeEach(() => {
  calls = [];
  process.env.UPSTOX_ANALYTICS_TOKEN = "test-token";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realToken === undefined) delete process.env.UPSTOX_ANALYTICS_TOKEN;
  else process.env.UPSTOX_ANALYTICS_TOKEN = realToken;
});

describe("/api/candles when the feed answers well", () => {
  it("joins the windows of a long range, sorted and without repeats", async () => {
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return feedOk([row("2026-11-13T09:15:00+05:30", 100), row("2026-11-12T09:15:00+05:30", 99)]);
    }) as typeof fetch;
    const res = await get("symbol=RELIANCE&interval=15m&range=3M");
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.source, "live");
    assert.ok(calls.filter((c) => !c.includes("/intraday/")).length >= 3); // 15 minute bars come a month at a time
    assert.deepEqual(j.bars.map((b: number[]) => b[0]), [...j.bars.map((b: number[]) => b[0])].sort((a, b) => a - b));
    assert.equal(new Set(j.bars.map((b: number[]) => b[0])).size, j.bars.length);
  });
});

describe("/api/candles when the feed fails", () => {
  it("a rate limit (429) is an 'unavailable' answer with a 502 status, not made-up data", async () => {
    globalThis.fetch = (async () => new Response('{"errors":[{"message":"Too many requests"}]}', { status: 429, headers: { "retry-after": "5" } })) as typeof fetch;
    const res = await get("symbol=RELIANCE&interval=5m&range=1D");
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { source: "unavailable", reason: "feed error" });
  });
  it("an invalid or expired token (401), a server error (500) and a network failure are the same", async () => {
    for (const make of [() => new Response("{}", { status: 401 }), () => new Response("{}", { status: 500 }), () => Promise.reject(new Error("socket hang up"))]) {
      globalThis.fetch = (async () => make()) as typeof fetch;
      const res = await get("symbol=TCS&interval=1D&range=1Y");
      assert.equal(res.status, 502);
      assert.equal((await res.json()).source, "unavailable");
    }
  });
  it("one window failing fails the whole request: a chart with a hole in its history is never returned", async () => {
    let n = 0;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes("/intraday/")) return feedOk([]);
      n++;
      return n === 2 ? new Response("{}", { status: 429 }) : feedOk([row(`2026-1${n}-10T09:15:00+05:30`, 100 + n)]);
    }) as typeof fetch;
    const res = await get("symbol=RELIANCE&interval=15m&range=3M");
    assert.equal(res.status, 502);
    assert.equal((await res.json()).source, "unavailable");
  });
  it("only today's session failing does not matter: the history that was asked for is still returned", async () => {
    globalThis.fetch = (async (url: string) => (String(url).includes("/intraday/") ? new Response("{}", { status: 429 }) : feedOk([row("2026-11-13T09:15:00+05:30", 100)]))) as typeof fetch;
    const res = await get("symbol=RELIANCE&interval=5m&range=1D");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).bars.length, 1);
  });
  it("an answer with no usable candles is 'unavailable', not an empty chart", async () => {
    globalThis.fetch = (async () => feedOk([["garbage", 1, 2], row("2026-11-13T09:15:00+05:30", 0)])) as typeof fetch;
    const res = await get("symbol=RELIANCE&interval=1D&range=1Y");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { source: "unavailable", reason: "no candles" });
  });
  it("makes no request to the feed without a token", async () => {
    delete process.env.UPSTOX_ANALYTICS_TOKEN;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return feedOk([]);
    }) as typeof fetch;
    const res = await get("symbol=RELIANCE&interval=1D&range=1Y");
    assert.deepEqual(await res.json(), { source: "unavailable", reason: "no token" });
    assert.equal(calls.length, 0);
  });
});

describe("/api/candles refuses bad requests before asking the feed anything", () => {
  it("an unknown symbol, interval or range, and a pairing that has no real data, are 400", async () => {
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return feedOk([]);
    }) as typeof fetch;
    for (const q of ["symbol=BTC&interval=1D&range=1M", "symbol=RELIANCE&interval=4m&range=1D", "symbol=RELIANCE&interval=3h&range=1D", "symbol=RELIANCE&interval=5m&range=10Y", "symbol=RELIANCE&interval=1m&range=1M", "symbol=RELIANCE&interval=5m&range=All"]) {
      assert.equal((await get(q)).status, 400, q);
    }
    assert.equal(calls.length, 0);
  });
});

describe("/api/candles for the added intervals", () => {
  it("asks the feed for the unit and number each one is named by, and refuses 4m and 3h", async () => {
    const seen: Record<string, string> = {};
    globalThis.fetch = (async (url: string) => {
      const m = String(url).match(/historical-candle\/[^/]+\/(minutes|hours)\/(\d+)\//);
      if (m) seen[m[1] + "/" + m[2]] = "yes";
      return feedOk([row("2026-11-13T09:15:00+05:30", 100)]);
    }) as typeof fetch;
    for (const [id, range] of [["2m", "1D"], ["3m", "1D"], ["10m", "5D"], ["2h", "1M"], ["4h", "3M"]]) assert.equal((await get(`symbol=NIFTY50&interval=${id}&range=${range}`)).status, 200, id);
    assert.deepEqual(Object.keys(seen).sort(), ["hours/2", "hours/4", "minutes/10", "minutes/2", "minutes/3"]);
    for (const id of ["4m", "3h"]) assert.equal((await get(`symbol=RELIANCE&interval=${id}&range=1D`)).status, 400, id);
  });
});
