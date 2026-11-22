import { isTradableId } from "./dynamic-symbols";

/**
 * The phone's action screens (Buy/Sell, GTT, alerts, notes, option orders, SIP) are full-screen layers over whatever page is open. Which one is
 * open lives in the address (?act=order&s=RELIANCE&side=buy), so the browser's back button closes it, a reload brings it back, and the page
 * underneath is never unmounted: it keeps its tab, its scroll and its open sheet.
 */
export type ActionSpec =
  | { kind: "order"; symbol: string; side: "buy" | "sell"; qty?: number }
  | { kind: "option"; underlying: string; expiry: string; strike: number; type: "CE" | "PE"; side: "buy" | "sell" }
  /** a contract's own chart */
  | { kind: "ochart"; underlying: string; expiry: string; strike: number; type: "CE" | "PE" }
  | { kind: "gtt"; symbol: string; editId?: string }
  | { kind: "alert"; symbol: string; editId?: string }
  | { kind: "note"; symbol: string }
  | { kind: "sip" };

/** every parameter an action uses, so they can all be cleared when it closes */
export const ACTION_KEYS = ["act", "s", "side", "q", "u", "x", "k", "t", "e"] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const side = (v: string | null): "buy" | "sell" | null => (v === "buy" || v === "sell" ? v : null);

export function actionToParams(a: ActionSpec): URLSearchParams {
  const p = new URLSearchParams();
  p.set("act", a.kind);
  if ("symbol" in a) p.set("s", a.symbol);
  if (a.kind === "order") {
    p.set("side", a.side);
    if (a.qty) p.set("q", String(a.qty));
  }
  if (a.kind === "option" || a.kind === "ochart") {
    p.set("u", a.underlying);
    p.set("x", a.expiry);
    p.set("k", String(a.strike));
    p.set("t", a.type);
    if (a.kind === "option") p.set("side", a.side);
  }
  if ((a.kind === "gtt" || a.kind === "alert") && a.editId) p.set("e", a.editId);
  return p;
}

/** The action named by an address, or null when there is none or it is not well formed (a made-up address opens nothing). */
export function paramsToAction(p: URLSearchParams): ActionSpec | null {
  const act = p.get("act");
  const s = p.get("s") ?? "";
  const edit = p.get("e");
  const editId = edit && /^[\w.-]{1,40}$/.test(edit) ? edit : undefined;
  switch (act) {
    case "order": {
      const sd = side(p.get("side"));
      const q = Number(p.get("q"));
      if (!sd || !isTradableId(s)) return null;
      return Number.isInteger(q) && q >= 1 && q <= 10_000_000 ? { kind: "order", symbol: s, side: sd, qty: q } : { kind: "order", symbol: s, side: sd };
    }
    case "option": {
      const sd = side(p.get("side"));
      const t = p.get("t");
      const k = Number(p.get("k"));
      const x = p.get("x") ?? "";
      const u = p.get("u") ?? "";
      if (!sd || (t !== "CE" && t !== "PE") || !(k > 0) || !ISO.test(x) || !/^[A-Z0-9&-]{1,20}$/.test(u)) return null;
      return { kind: "option", underlying: u, expiry: x, strike: k, type: t, side: sd };
    }
    case "ochart": {
      const t = p.get("t");
      const k = Number(p.get("k"));
      const x = p.get("x") ?? "";
      const u = p.get("u") ?? "";
      if ((t !== "CE" && t !== "PE") || !(k > 0) || !ISO.test(x) || !/^[A-Z0-9&-]{1,20}$/.test(u)) return null;
      return { kind: "ochart", underlying: u, expiry: x, strike: k, type: t };
    }
    case "gtt":
    case "alert":
      if (!isTradableId(s)) return null;
      return editId ? { kind: act, symbol: s, editId } : { kind: act, symbol: s };
    case "note":
      return isTradableId(s) ? { kind: "note", symbol: s } : null;
    case "sip":
      return { kind: "sip" };
    default:
      return null;
  }
}

/** The exchange to show beside a price: only ones the app really gets prices from. */
export function exchangeOf(symbol: string): string {
  if (symbol === "SENSEX") return "BSE";
  if (["BTC", "ETH", "SOL"].includes(symbol)) return "Crypto";
  return "NSE";
}
