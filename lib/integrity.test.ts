import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { computePulse, PULSE_BASIS, PULSE_WEIGHTS } from "./pulse";
import { NEWS_NOT_CONNECTED, NEWS_SOURCE } from "./news";
import { PAPER_BUY, PAPER_SELL } from "./labels";
import type { Candle } from "./types";

const candles = (closes: number[]): Candle[] => closes.map((c) => ({ open: c, high: c, low: c, close: c, volume: 1000 }));
const read = (f: string) => fs.readFileSync(f, "utf8");

describe("news is not connected, and nothing stands in for it", () => {
  it("says so, and no invented headline is left anywhere in the app", () => {
    assert.equal(NEWS_NOT_CONNECTED, "News is not connected yet");
    assert.equal(NEWS_SOURCE.connected, false);
    const symbols = read("lib/symbols.ts");
    assert.doesNotMatch(symbols, /NEWS/);
    for (const f of ["lib/symbols.ts", "lib/pulse.ts", "components/views/NewsView.tsx", "components/views/DashboardView.tsx"]) {
      assert.doesNotMatch(read(f), /Market Desk|Bourse Wire|CoinLedger|Sector Watch|Deal Street|2h ago|RBI holds repo/, f);
    }
  });
  it("the News page and the dashboard card show the message", () => {
    assert.match(read("components/views/NewsView.tsx"), /NEWS_NOT_CONNECTED/);
    assert.match(read("components/views/DashboardView.tsx"), /NEWS_NOT_CONNECTED/);
  });
});

describe("Pulse is worked out without news and says what it is based on", () => {
  const history = { X: candles(Array.from({ length: 40 }, (_, i) => 100 + i * 0.5)) };
  it("has no news input at all", () => {
    assert.doesNotMatch(read("lib/pulse.ts"), /NEWS\b|newsScore|newsHits|sentiment|from "\.\/symbols"/);
  });
  it("weights momentum and RSI only, and they add to one", () => {
    assert.equal(PULSE_WEIGHTS.momentum + PULSE_WEIGHTS.rsi, 1);
  });
  it("states its basis in words, and the basis names no news input", () => {
    const p = computePulse("X", { X: 120 }, history, 119);
    assert.equal(p.basis, PULSE_BASIS);
    assert.match(p.basis, /momentum/i);
    assert.match(p.basis, /RSI/);
    assert.match(p.basis, /news is not part of the score/i);
    assert.ok(!("newsScore" in p));
  });
  it("the score follows the price: up is above neutral, down is below, flat is 50-ish", () => {
    const up = computePulse("X", { X: 103 }, history, 100);
    const down = computePulse("X", { X: 97 }, { X: candles(Array.from({ length: 40 }, (_, i) => 140 - i * 0.5)) }, 100);
    assert.ok(up.score > 50, `up ${up.score}`);
    assert.ok(down.score < 50, `down ${down.score}`);
    assert.ok(up.score >= 0 && up.score <= 100 && down.score >= 0 && down.score <= 100);
  });
  it("the result is the same whatever else is in the app (no hidden input)", () => {
    const a = computePulse("X", { X: 110 }, history, 108);
    const b = computePulse("X", { X: 110 }, history, 108);
    assert.deepEqual(a, b);
  });
});

describe("order buttons say paper", () => {
  it("the labels", () => {
    assert.equal(PAPER_BUY, "Paper buy");
    assert.equal(PAPER_SELL, "Paper sell");
  });
  it("the desktop order panel and the option sheet use them and have no bare Buy/Sell button", () => {
    for (const f of ["components/OrderPanel.tsx", "components/OptionOrderSheet.tsx"]) {
      const src = read(f);
      assert.match(src, /\{PAPER_BUY\}/, f);
      assert.match(src, /\{PAPER_SELL\}/, f);
      // a button whose whole text is Buy or Sell
      assert.doesNotMatch(src, /<\/?button[^>]*>\s*(Buy|Sell)\s*<\/button>/, f);
      assert.doesNotMatch(src, />\s*\n\s*(Buy|Sell)\s*\n\s*<\/button>/, f);
    }
  });
});

describe("movers and trade page use real data only", () => {
  it("the dashboard no longer ranks demo symbols by position in a sorted list", () => {
    const src = read("components/views/DashboardView.tsx");
    assert.match(src, /rankMovers/);
    assert.doesNotMatch(src, /slice\(-3\)/);
    assert.match(src, /hasFeedQuote/);
  });
  it("the Pulse pill on the trade page goes through pulseFor: a score only with a real quote and real history", () => {
    const src = fs.readFileSync("components/views/TradeView.tsx", "utf8");
    assert.match(src, /pulseFor\(/);
    assert.match(src, /hasFeedQuote\(selected\)/);
    assert.match(src, /hasRealHistory\(selected\)/);
  });
});
