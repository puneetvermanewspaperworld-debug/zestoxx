import { seededRandom, strSeed } from "./helpers";

/* ------------------------------------------------------------------ types ---- */

export interface OptionLeg {
  ltp: number;
  /** previous session close of the option premium */
  prevClose: number;
  oi: number;
  prevOi: number;
  volume: number;
  /** implied volatility in %, 0 when unavailable */
  iv: number;
  /** Upstox instrument key (live chains only) */
  key?: string;
}

export interface ChainRow {
  strike: number;
  call: OptionLeg;
  put: OptionLeg;
}

export interface OptionChain {
  underlying: string;
  spot: number;
  /** YYYY-MM-DD */
  expiry: string;
  expiries: string[];
  /** contracts per lot */
  lotSize: number;
  rows: ChainRow[];
  vix: number | null;
  source: "live" | "simulated";
}

/* --------------------------------------------------------------- buildup ----- */

export type Buildup = "long-buildup" | "short-covering" | "short-buildup" | "long-unwinding";

export const BUILDUP_ORDER: Buildup[] = [
  "long-buildup",
  "short-covering",
  "short-buildup",
  "long-unwinding",
];

/** Static class strings (Tailwind needs literals) + the rgb used for heatmap tints. */
export const BUILDUP_META: Record<
  Buildup,
  { label: string; code: string; swatch: string; rgb: [number, number, number]; meaning: string }
> = {
  "long-buildup": {
    label: "Long Buildup",
    code: "LB",
    swatch: "bg-emerald-500",
    rgb: [16, 185, 129],
    meaning: "Premium up, open interest up — fresh buyers are adding positions.",
  },
  "short-covering": {
    label: "Short Covering",
    code: "SC",
    swatch: "bg-teal-300",
    rgb: [94, 234, 212],
    meaning: "Premium up, open interest down — sellers are closing positions to cut losses.",
  },
  "short-buildup": {
    label: "Short Buildup",
    code: "SB",
    swatch: "bg-rose-500",
    rgb: [244, 63, 94],
    meaning: "Premium down, open interest up — fresh sellers are writing positions.",
  },
  "long-unwinding": {
    label: "Long Unwinding",
    code: "LU",
    swatch: "bg-orange-300",
    rgb: [253, 186, 116],
    meaning: "Premium down, open interest down — buyers are exiting positions.",
  },
};

/** Standard price-direction × OI-direction classification. Null when either is flat. */
export function classifyBuildup(priceChange: number, oiChange: number): Buildup | null {
  if (!priceChange || !oiChange) return null;
  if (priceChange > 0) return oiChange > 0 ? "long-buildup" : "short-covering";
  return oiChange > 0 ? "short-buildup" : "long-unwinding";
}

/** A leg only takes part when it actually traded and has a prior-session reference. */
export function isLiquid(leg: OptionLeg): boolean {
  return leg.volume > 0 && leg.ltp > 0 && leg.prevClose > 0 && leg.oi > 0 && leg.prevOi > 0;
}

export interface LegBuildup {
  kind: Buildup | null;
  priceChangePct: number;
  oiChange: number;
}

export function legBuildup(leg: OptionLeg): LegBuildup {
  if (!isLiquid(leg)) return { kind: null, priceChangePct: 0, oiChange: 0 };
  const priceChange = leg.ltp - leg.prevClose;
  const oiChange = leg.oi - leg.prevOi;
  return {
    kind: classifyBuildup(priceChange, oiChange),
    priceChangePct: (priceChange / leg.prevClose) * 100,
    oiChange,
  };
}

export interface BuildupBreakdown {
  /** share of contracts per class, 0–100 */
  byContracts: Record<Buildup, number>;
  /** share of absolute OI change per class, 0–100 */
  byOiChange: Record<Buildup, number>;
  contracts: Record<Buildup, number>;
  totalContracts: number;
}

const emptyRecord = (): Record<Buildup, number> => ({
  "long-buildup": 0,
  "short-covering": 0,
  "short-buildup": 0,
  "long-unwinding": 0,
});

export function buildupBreakdown(rows: ChainRow[]): BuildupBreakdown {
  const contracts = emptyRecord();
  const oiWeight = emptyRecord();
  let total = 0;
  let totalOi = 0;
  for (const r of rows) {
    for (const leg of [r.call, r.put]) {
      const b = legBuildup(leg);
      if (!b.kind) continue;
      contracts[b.kind] += 1;
      oiWeight[b.kind] += Math.abs(b.oiChange);
      total += 1;
      totalOi += Math.abs(b.oiChange);
    }
  }
  const pct = (rec: Record<Buildup, number>, denom: number) => {
    const out = emptyRecord();
    for (const k of BUILDUP_ORDER) out[k] = denom > 0 ? (rec[k] / denom) * 100 : 0;
    return out;
  };
  return {
    byContracts: pct(contracts, total),
    byOiChange: pct(oiWeight, totalOi),
    contracts,
    totalContracts: total,
  };
}

export interface GridRow {
  strike: number;
  isAtm: boolean;
  call: LegBuildup;
  put: LegBuildup;
}

/** Strikes around ATM, each leg classified — the cells of the buildup heatmap. */
export function buildupGrid(rows: ChainRow[], atmStrike: number, window = 8): GridRow[] {
  const idx = rows.findIndex((r) => r.strike === atmStrike);
  if (idx < 0) return [];
  return rows.slice(Math.max(0, idx - window), idx + window + 1).map((r) => ({
    strike: r.strike,
    isAtm: r.strike === atmStrike,
    call: legBuildup(r.call),
    put: legBuildup(r.put),
  }));
}

/* ---------------------------------------------------------------- stats ------ */

export interface OiLevel {
  strike: number;
  oi: number;
}

export interface ChainStats {
  atmStrike: number;
  atmIv: number | null;
  /** put OI ÷ call OI across the whole chain */
  pcr: number | null;
  maxPain: number | null;
  callOiTotal: number;
  putOiTotal: number;
  /** highest first; index 1 is the "second highest" */
  topCalls: OiLevel[];
  topPuts: OiLevel[];
}

export function chainStats(rows: ChainRow[], spot: number): ChainStats | null {
  if (rows.length === 0) return null;

  let atm = rows[0];
  for (const r of rows) if (Math.abs(r.strike - spot) < Math.abs(atm.strike - spot)) atm = r;

  const ivs = [atm.call.iv, atm.put.iv].filter((v) => v > 0);
  const atmIv = ivs.length ? ivs.reduce((s, v) => s + v, 0) / ivs.length : null;

  const callOiTotal = rows.reduce((s, r) => s + r.call.oi, 0);
  const putOiTotal = rows.reduce((s, r) => s + r.put.oi, 0);
  const pcr = callOiTotal > 0 ? putOiTotal / callOiTotal : null;

  // Max pain: the expiry price at which option writers' total payout is smallest.
  let maxPain: number | null = null;
  let best = Infinity;
  for (const k of rows) {
    let pain = 0;
    for (const r of rows) {
      pain += r.call.oi * Math.max(0, k.strike - r.strike);
      pain += r.put.oi * Math.max(0, r.strike - k.strike);
    }
    if (pain < best) {
      best = pain;
      maxPain = k.strike;
    }
  }

  const top = (pick: (r: ChainRow) => number): OiLevel[] =>
    rows
      .map((r) => ({ strike: r.strike, oi: pick(r) }))
      .filter((l) => l.oi > 0)
      .sort((a, b) => b.oi - a.oi)
      .slice(0, 2);

  return {
    atmStrike: atm.strike,
    atmIv,
    pcr,
    maxPain,
    callOiTotal,
    putOiTotal,
    topCalls: top((r) => r.call.oi),
    topPuts: top((r) => r.put.oi),
  };
}

/* ------------------------------------------------------------ simulation ----- */

/** Used only when Upstox isn't configured or reachable — always labelled "simulated". */
const STRIKE_STEP: Record<string, number> = {
  NIFTY: 50,
  NIFTY50: 50,
  BANKNIFTY: 100,
  FINNIFTY: 50,
  MIDCPNIFTY: 25,
  SENSEX: 100,
};

export function strikeStep(underlying: string, spot: number): number {
  return (
    STRIKE_STEP[underlying] ?? (spot > 10000 ? 100 : spot > 2000 ? 50 : spot > 500 ? 20 : 5)
  );
}

const DAY = 86_400_000;
const sq = (x: number) => x * x;

function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function lastTuesdayUtc(year: number, month: number): number {
  const lastDay = Date.UTC(year, month + 1, 0);
  const dow = new Date(lastDay).getUTCDay(); // 0 = Sun
  return lastDay - ((dow - 2 + 7) % 7) * DAY;
}

/** Plausible upcoming expiries: weekly Tuesdays for NIFTY, monthly last-Tuesdays otherwise. */
export function simulatedExpiries(underlying: string, now: Date = new Date()): string[] {
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const out: number[] = [];
  if (underlying === "NIFTY" || underlying === "NIFTY50") {
    const dow = new Date(todayMs).getUTCDay();
    let t = todayMs + ((2 - dow + 7) % 7) * DAY;
    for (let i = 0; i < 4; i++, t += 7 * DAY) out.push(t);
  }
  for (let m = 0; out.length < (underlying === "NIFTY" || underlying === "NIFTY50" ? 7 : 3); m++) {
    const d = new Date(todayMs);
    const lt = lastTuesdayUtc(d.getUTCFullYear(), d.getUTCMonth() + m);
    if (lt >= todayMs && !out.includes(lt)) out.push(lt);
    if (m > 12) break;
  }
  return out.sort((a, b) => a - b).map(isoOf);
}

/** Approximate lot sizes for the simulated chain only — live chains carry the exchange value. */
const SIM_LOT: Record<string, number> = {
  NIFTY50: 65, NIFTY: 65, BANKNIFTY: 30, FINNIFTY: 60, MIDCPNIFTY: 120, SENSEX: 20,
  RELIANCE: 500, TCS: 175, INFY: 400, HDFCBANK: 550, SBIN: 750, TATAMOTORS: 800,
};

export function simulateChain(
  underlying: string,
  spot: number,
  expiry: string | null,
  now: Date = new Date()
): OptionChain {
  const expiries = simulatedExpiries(underlying, now);
  const exp = expiry && expiries.includes(expiry) ? expiry : expiries[0];
  const step = strikeStep(underlying, spot);
  const atm = Math.round(spot / step) * step;
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dte = Math.max(1, Math.round((Date.parse(exp) - todayMs) / DAY));
  const t = Math.sqrt(dte / 365);
  const rand = seededRandom(strSeed(`${underlying}|${exp}|${atm}`));
  const baseIv = 0.13 + rand() * 0.04;

  const leg = (strike: number, isCall: boolean): OptionLeg => {
    const m = (strike - spot) / spot;
    const sigT = baseIv * t;
    const timeValue = spot * sigT * 0.4 * Math.exp(-sq(m / sigT) / 2);
    const intrinsic = isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    const ltp = Math.max(0.05, intrinsic + timeValue);
    // OI clusters at round strikes; calls pile up above spot, puts below.
    const decay = (x: number) => Math.exp(-sq(x / 0.02));
    const side = isCall ? decay(Math.max(0, -m)) : decay(Math.max(0, m));
    const oi = Math.round((2e4 + rand() * 6e5) * Math.exp(-sq(m / 0.04)) * (0.35 + side));
    return {
      ltp: Math.round(ltp * 100) / 100,
      prevClose: Math.round(ltp * (1 + (rand() - 0.5) * 0.3) * 100) / 100,
      oi,
      prevOi: Math.round(oi * (1 + (rand() - 0.5) * 0.5)),
      volume: Math.round(oi * (0.2 + rand() * 1.4)),
      iv: Math.round((baseIv * 100 + Math.abs(m) * 120 + rand() * 2) * 100) / 100,
    };
  };

  const rows: ChainRow[] = [];
  for (let i = -14; i <= 14; i++) {
    const strike = atm + i * step;
    rows.push({ strike, call: leg(strike, true), put: leg(strike, false) });
  }

  return {
    underlying,
    spot,
    expiry: exp,
    expiries,
    lotSize: SIM_LOT[underlying] ?? 1,
    rows,
    vix: Math.round((13 + rand() * 4) * 100) / 100,
    source: "simulated",
  };
}
