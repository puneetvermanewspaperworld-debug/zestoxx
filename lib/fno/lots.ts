/**
 * Lot sizes and strike gaps. Lot sizes are revised by the exchange roughly every six months, so
 * the live snapshot reads them from Upstox's contract list; this table is only the fallback when
 * the feed is down. Edit it (and nothing else) when a revision lands.
 */
export interface UnderlyingInfo {
  name: string;
  lot: number;
  step: number;
  /** a plausible spot, used only to seed a clearly-labelled simulated snapshot */
  sampleSpot: number;
  kind: "index" | "stock";
}

export const UNDERLYINGS: Record<string, UnderlyingInfo> = {
  NIFTY: { name: "Nifty", lot: 65, step: 50, sampleSpot: 23000, kind: "index" },
  BANKNIFTY: { name: "Bank Nifty", lot: 30, step: 100, sampleSpot: 54700, kind: "index" },
  FINNIFTY: { name: "Fin Nifty", lot: 60, step: 50, sampleSpot: 25500, kind: "index" },
  MIDCPNIFTY: { name: "Midcap Select", lot: 120, step: 25, sampleSpot: 12500, kind: "index" },
  SENSEX: { name: "Sensex", lot: 20, step: 100, sampleSpot: 75500, kind: "index" },
  RELIANCE: { name: "Reliance", lot: 500, step: 10, sampleSpot: 1165, kind: "stock" },
  TCS: { name: "TCS", lot: 175, step: 20, sampleSpot: 2500, kind: "stock" },
  INFY: { name: "Infosys", lot: 400, step: 10, sampleSpot: 1170, kind: "stock" },
  HDFCBANK: { name: "HDFC Bank", lot: 550, step: 10, sampleSpot: 1680, kind: "stock" },
  SBIN: { name: "SBI", lot: 750, step: 10, sampleSpot: 810, kind: "stock" },
  TATAMOTORS: { name: "Tata Motors", lot: 800, step: 5, sampleSpot: 965, kind: "stock" },
};

export const UNDERLYING_IDS = Object.keys(UNDERLYINGS);

export const lotFallback = (u: string): number => UNDERLYINGS[u]?.lot ?? 1;
