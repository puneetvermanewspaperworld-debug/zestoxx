"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { SYMBOLS, SYMBOL_MAP, VOL, typeOf } from "@/lib/symbols";
import { MAX_QUOTE_SYMBOLS, infoFor, isDynamicEquity, isTradableId, type DynamicQuote, type QuoteState } from "@/lib/dynamic-symbols";
import { buildHistory } from "@/lib/history";
import { fmt, fmtINR, istClock } from "@/lib/helpers";
import { storage } from "@/lib/storage";
import { parseContractId } from "@/lib/contract";
import { simulateChain } from "@/lib/options";
import { resampleToDaily } from "@/lib/resample";
import {
  isRestingOrderExpired,
  isSipExecutable,
  nextSipDate,
  sipError,
  sipFill,
  type OrderStatus,
  type OrderType,
  type SipFrequency,
  type SipPlan,
  type SipStatus,
} from "@/lib/orders";
import { MAX_SYMBOLS_PER_LIST, PRIMARY_LIST, listNameError, type CustomList } from "@/lib/watchlists";
import { fillShortfall, fundsError, type OrderRequest, type OrderResult } from "@/lib/order-check";
import { ORDER_TYPE_LABEL } from "@/lib/orders";
import { GTT_CATCHUP_KEY, GTT_CATCHUP_SYMBOLS, MAX_OPEN_GTT, catchUpOnce, catchUpWindow, firstCrossing, type CatchUpEnv, gttError, gttKind, triggerDirection } from "@/lib/gtt";
import type {
  Candle,
  Holdings,
  OrderLogEntry,
  OpenOrder,
  PriceAlert,
  Toast,
  LiveSource,
  SymbolInfo,
} from "@/lib/types";

type ViewId =
  | "dashboard"
  | "trade"
  | "pulse"
  | "markets"
  | "movers"
  | "watchlist"
  | "fno"
  | "options"
  | "buildup"
  | "fiidii"
  | "mtf"
  | "news"
  | "alerts"
  | "orders"
  | "portfolio";

interface TradeInput {
  mode: "market" | "limit" | "gtd";
  side: "buy" | "sell";
  qty: number;
  limitPrice?: number;
  /** YYYY-MM-DD — required for "gtd" */
  expiryDate?: string;
}

interface NewSip {
  symbol: string;
  amount: number;
  frequency: SipFrequency;
  startDate: string;
}

interface ZestoxxContextValue {
  watchlist: string[];
  selected: string;
  setSelected: (id: string) => void;
  histories: Record<string, Candle[]>;
  live: Record<string, number>;
  liveSource: LiveSource;
  cash: number;
  holdings: Holdings;
  orderLog: OrderLogEntry[];
  openOrders: OpenOrder[];
  compareWith: string | null;
  setCompareWith: React.Dispatch<React.SetStateAction<string | null>>;
  alerts: PriceAlert[];
  setAlerts: React.Dispatch<React.SetStateAction<PriceAlert[]>>;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  alertPrefill: string | null;
  formula: string;
  setFormula: React.Dispatch<React.SetStateAction<string>>;
  sym: SymbolInfo;
  price: number;
  chg: number;
  /** Day-change % for any symbol (price vs previous close). */
  chgFor: (id: string) => number;
  /** Previous-close reference for any symbol. */
  prevCloseFor: (id: string) => number;
  /** True only when this symbol's price and previous close came from a live feed (not the simulation). */
  hasFeedQuote: (id: string) => boolean;
  /** True only when this symbol's candle history came from a feed. Until then `histories` holds the 250 invented starting bars. */
  hasRealHistory: (id: string) => boolean;
  setActiveView: (v: ViewId) => void;
  /** Place a paper order for the selected symbol. Returns the reason it was refused (funds, holdings, no price), or null when it was placed or filled. */
  onTrade: (t: TradeInput) => string | null;
  /** Place a paper order for any symbol and get what came of it: filled, resting, or refused with the reason. */
  placeOrder: (o: OrderRequest) => OrderResult;
  /** Market paper trade in an option contract (id from makeContractId); qty is in units, not lots. */
  tradeContract: (t: { id: string; side: "buy" | "sell"; qty: number; price: number }) => void;
  onAddAlert: (symId: string) => void;
  cancelOrder: (id: number) => void;
  /** Place a GTT / stop-loss order: trades the quantity when the price reaches the trigger. Returns an error message, or null when placed. */
  /**
   * Place a GTT. With `replaceId` it edits one: the open GTT with that id is cancelled and the new one is created, starting now (the time it was
   * placed resets). Returns an error message, or null when placed.
   */
  createGtt: (o: { symbol: string; side: "buy" | "sell"; qty: number; trigger: number }, replaceId?: number) => string | null;
  /**
   * Keep live quotes coming for these symbols while the caller is on screen (the owner key is the caller's own; an empty list stops it). Only
   * NSE equities and ETFs the app does not chart on its own need this: the twelve it charts are always priced.
   */
  watchQuotes: (owner: string, ids: string[]) => void;
  /** What the feed last said about a symbol the app does not chart on its own; undefined until it has answered. "none" = no recent trades. */
  quoteStateOf: (id: string) => QuoteState | "unavailable" | undefined;
  /** the guest's notes on symbols */
  notes: Record<string, string>;
  setNote: (symbol: string, text: string) => void;
  /** Add to any list, the primary one included (which holds only symbols the app can chart). Returns an error message, or null when added. */
  addToAnyList: (list: string, symbol: string) => string | null;
  removeFromAnyList: (list: string, symbol: string) => void;
  /** Move a symbol one place up or down in a list. */
  moveInList: (list: string, symbol: string, direction: -1 | 1) => void;
  /** "Reset my paper account": the starting balance and nothing else, for this guest. Reloads the page on success; false when it failed. */
  resetPaperAccount: () => Promise<boolean>;
  sips: SipPlan[];
  /** Returns an error message, or null when the plan was created. */
  createSip: (s: NewSip) => string | null;
  setSipStatus: (id: number, status: SipStatus) => void;
  cancelSip: (id: number) => void;
  /** Sells the whole position at the last price. */
  exitPosition: (id: string) => void;
  /** Returns an error message (a symbol that cannot be charted or traded, a full list), or null when added. */
  addToWatchlist: (id: string) => string | null;
  removeFromWatchlist: (id: string) => void;
  /** Custom watchlists beside the primary one; their symbols are any NSE trading symbols. */
  lists: CustomList[];
  /** Returns an error message, or null when the list was created. */
  createList: (name: string, symbols?: string[]) => string | null;
  deleteList: (name: string) => void;
  /** Returns an error message, or null when added. */
  addToList: (name: string, symbol: string) => string | null;
  removeFromList: (name: string, symbol: string) => void;
}

const ZestoxxContext = createContext<ZestoxxContextValue | null>(null);

/** Symbols the app does not chart on its own: polled every 15 s while the page is visible, and never twice within 5 s. */
const QUOTE_POLL_MS = 15_000;
const QUOTE_GAP_MS = 5_000;

export function useZestoxx(): ZestoxxContextValue {
  const ctx = useContext(ZestoxxContext);
  if (!ctx) throw new Error("useZestoxx must be used within <ZestoxxProvider>");
  return ctx;
}

/** Client-only ids aren't stored; the database mints its own. */
function withoutId<T extends { id: unknown }>(o: T): Omit<T, "id"> {
  const copy = { ...o };
  delete (copy as { id?: unknown }).id;
  return copy;
}

export function ZestoxxProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [watchlist, setWatchlist] = useState<string[]>([
    "RELIANCE",
    "TCS",
    "NIFTY50",
    "BANKNIFTY",
    "BTC",
  ]);
  const [selected, setSelectedState] = useState("RELIANCE");
  const selectedRef = useRef(selected);
  const setSelected = useCallback((id: string) => {
    selectedRef.current = id;
    setSelectedState(id);
  }, []);

  const [histories, setHistories] = useState<Record<string, Candle[]>>(() => {
    const h: Record<string, Candle[]> = {};
    SYMBOLS.forEach((s) => (h[s.id] = buildHistory(s)));
    return h;
  });
  const [live, setLive] = useState<Record<string, number>>(() => {
    const l: Record<string, number> = {};
    SYMBOLS.forEach((s) => {
      const c = histories[s.id];
      l[s.id] = c[c.length - 1].close;
    });
    return l;
  });
  // Previous close per symbol, from the live feeds (Upstox `cp` / crypto 24h). Symbols
  // without a feed entry fall through to the simulated history in `prevCloseFor`.
  const [prevClose, setPrevClose] = useState<Record<string, number>>({});
  const [cash, setCash] = useState(1000000);
  const [holdings, setHoldings] = useState<Holdings>({});
  const [lists, setLists] = useState<CustomList[]>([]);
  const [sips, setSips] = useState<SipPlan[]>([]);
  const [orderLog, setOrderLog] = useState<OrderLogEntry[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [alertPrefill, setAlertPrefill] = useState<string | null>(null);
  const [formula, setFormula] = useState("");
  const [liveSource, setLiveSource] = useState<LiveSource>({});
  const [realHistory, setRealHistory] = useState<Record<string, boolean>>({});
  // NSE equities and ETFs beyond the twelve the app charts: what the quote feed said about each, and the name the instrument list gave it.
  const [dynState, setDynState] = useState<Record<string, QuoteState | "unavailable">>({});
  const [dynNames, setDynNames] = useState<Record<string, string>>({});
  const hydrated = useRef(false);
  const firedOrders = useRef(new Set<number>());
  const cashRef = useRef(cash);
  const holdingsRef = useRef(holdings);
  /** cancels a GTT that cannot trade when it triggers (set below, once closeOrders exists) */
  const closeGttRef = useRef<(o: OpenOrder, status: "cancelled", text: string) => void>(() => {});
  /** true once the first market-data pull has answered (or failed): until then `live` is just seed prices */
  const feedSettled = useRef(false);
  // Symbols that already have a live quote (price + previous close arrive as one unit).
  const quotedRef = useRef<Set<string>>(new Set());

  const setActiveView = useCallback(
    (v: ViewId) => {
      if (v === "trade") router.push(`/app/trade/${selectedRef.current}`);
      else router.push(`/app/${v}`);
    },
    [router]
  );

  const onAddAlert = useCallback(
    (symId: string) => {
      setAlertPrefill(symId);
      router.push("/app/alerts");
    },
    [router]
  );
  const dismissToast = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    []
  );

  const tickTargets = useMemo(
    () => Array.from(new Set([...watchlist, selected])),
    [watchlist, selected]
  );

  const fillOrder = useCallback(
    (symbol: string, side: "buy" | "sell", qty: number, price: number, orderType: OrderType = "MARKET", extra?: { simulated?: boolean; date?: string; time?: string }) => {
      const cost = price * qty;
      // keep the refs the funds checks read up to date at once (state, and the refs copied from it, only catch up on the next render)
      cashRef.current += side === "buy" ? -cost : cost;
      const heldNow = holdingsRef.current[symbol];
      const heldQty = (heldNow?.qty ?? 0) + (side === "buy" ? qty : -qty);
      const nextHoldings = { ...holdingsRef.current };
      if (heldQty <= 0) delete nextHoldings[symbol];
      else nextHoldings[symbol] = { qty: heldQty, avgPrice: side === "buy" ? ((heldNow?.avgPrice ?? 0) * (heldNow?.qty ?? 0) + cost) / heldQty : (heldNow?.avgPrice ?? 0) };
      holdingsRef.current = nextHoldings;
      if (side === "buy") {
        setCash((c) => c - cost);
        setHoldings((h) => {
          const cur = h[symbol] || { qty: 0, avgPrice: 0 };
          const newQty = cur.qty + qty;
          const newAvg = (cur.avgPrice * cur.qty + cost) / newQty;
          return { ...h, [symbol]: { qty: newQty, avgPrice: newAvg } };
        });
      } else {
        setCash((c) => c + cost);
        setHoldings((h) => {
          const cur = h[symbol];
          if (!cur) return h;
          const newQty = cur.qty - qty;
          const copy = { ...h };
          if (newQty <= 0) delete copy[symbol];
          else copy[symbol] = { ...cur, qty: newQty };
          return copy;
        });
      }
      setOrderLog((log) =>
        [
          {
            id: Date.now() + Math.random(),
            symbol,
            side,
            qty,
            price,
            mode: orderType === "LIMIT" || orderType === "GTD" ? ("limit" as const) : ("market" as const),
            orderType,
            status: "filled" as const,
            time: extra?.time ?? new Date().toLocaleTimeString("en-IN"),
            date: extra?.date ?? istClock().date,
            simulated: extra?.simulated || undefined,
          },
          ...log,
        ].slice(0, 100)
      );
    },
    []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setLive((prev) => {
        const next = { ...prev };
        tickTargets.forEach((id) => {
          if (liveSource[id] === "live") return; // real data owns this symbol
          const sym = SYMBOL_MAP[id];
          if (!sym) return; // any other symbol is never simulated: it has its feed's price or none
          const vol = VOL[sym.type];
          next[id] = Math.max(0.01, prev[id] * (1 + (Math.random() - 0.5) * vol));
        });
        openOrders.forEach((o) => {
          const p = next[o.symbol];
          if (!(p > 0)) return;
          const gtt = o.orderType === "GTT";
          const crossed = gtt ? (o.trigger === "above" ? p >= o.limitPrice : p <= o.limitPrice) : o.side === "buy" ? p <= o.limitPrice : p >= o.limitPrice;
          // This runs inside a state updater, which React may invoke twice in dev — fire once.
          if (crossed && !firedOrders.current.has(o.id)) {
            firedOrders.current.add(o.id);
            // Any resting order is checked again at the moment it fills (the account may have changed since it was placed): a GTT trades at the
            // price that crossed its trigger, a limit or GTD order at its limit price. If the account cannot do it, the order is cancelled with the reason.
            const at = gtt ? p : o.limitPrice;
            const short = fundsError({ side: o.side, qty: o.qty, price: at, cash: cashRef.current, held: holdingsRef.current[o.symbol]?.qty ?? 0, symbol: o.symbol });
            if (short) {
              const label = gtt ? "GTT" : ORDER_TYPE_LABEL[o.orderType];
              queueMicrotask(() => closeGttRef.current(o, "cancelled", `${label} ${o.side} ${o.qty} ${o.symbol} was cancelled when it triggered: ${fillShortfall(o.side)}.`));
              return;
            }
            fillOrder(o.symbol, o.side, o.qty, at, o.orderType);
            setOpenOrders((cur) => cur.filter((x) => x.id !== o.id));
            if (gtt) {
              const text = `${gttKind(o.side, o.trigger ?? "above")} triggered: ${o.side} ${o.qty} ${o.symbol} @ ${fmt(p, typeOf(o.symbol))}`;
              queueMicrotask(() => setToasts((t) => [...t, { id: Date.now() + Math.random(), text }]));
            }
          }
        });
        alerts.forEach((a) => {
          const p = next[a.symbol];
          const crossed = a.condition === "above" ? p >= a.target : p <= a.target;
          if (crossed) {
            setToasts((t) => [
              ...t,
              {
                id: Date.now() + Math.random(),
                text: `${a.symbol} is now ${a.condition} ${fmt(a.target, typeOf(a.symbol))}`,
              },
            ]);
            setAlerts((cur) => cur.filter((x) => x.id !== a.id));
          }
        });
        return next;
      });
      setHistories((prev) => {
        const id = selectedRef.current;
        if (liveSource[id] === "live") return prev; // real candle history owns this symbol
        const arr = prev[id];
        if (!arr || arr.length === 0) return prev;
        const last = arr[arr.length - 1];
        const p = live[id];
        const updated = { ...last, close: p, high: Math.max(last.high, p), low: Math.min(last.low, p) };
        return { ...prev, [id]: [...arr.slice(0, -1), updated] };
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [tickTargets, live, openOrders, fillOrder, alerts, liveSource]);

  /* ---- real market data ----
   * Everything is a seeded random walk until a real feed answers for a symbol, then that
   * symbol is upgraded in place and its badge flips to "Live data":
   *   - crypto (BTC/ETH/SOL): CoinGecko, key-less
   *   - NSE/BSE equities & indices: Upstox (Analytics Token), when configured
   * Both are proxied through /api/market-data so credentials and CORS stay server-side.
   * Any failure is silent — the simulation just keeps running for that symbol. */
  useEffect(() => {
    let cancelled = false;

    /** `tzOffsetMs`: how far ahead of UTC the feed's calendar day is (IST, 5.5 h, for Indian symbols); a bar's `t` is its calendar day at 00:00 UTC. */
    const applyHistory = (data: Record<string, number[][]>, tzOffsetMs = 0) => {
      const ids = Object.keys(data).filter((id) => Array.isArray(data[id]) && data[id].length >= 10);
      if (cancelled || ids.length === 0) return;
      setHistories((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = data[id].map((c) => ({
            t: Math.floor((c[0] + tzOffsetMs) / 86_400_000) * 86_400,
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            // real feeds send volume at index 5; CoinGecko's OHLC doesn't, so synthesize
            volume: Number.isFinite(c[5]) ? c[5] : Math.round((50000 + Math.random() * 480000) * 3),
          }));
        });
        return next;
      });
      // Seed the price from the last candle only where no quote has arrived. A quote's
      // price and previous close are one consistent unit — overwriting just the price
      // would pair it with a previous close from a different moment (absurd day-change).
      const unquoted = ids.filter((id) => !quotedRef.current.has(id));
      if (unquoted.length > 0) {
        setLive((prev) => {
          const next = { ...prev };
          unquoted.forEach((id) => (next[id] = data[id][data[id].length - 1][4]));
          return next;
        });
      }
      setLiveSource((prev) => {
        const next = { ...prev };
        ids.forEach((id) => (next[id] = "live"));
        return next;
      });
      setRealHistory((prev) => {
        const next = { ...prev };
        ids.forEach((id) => (next[id] = true));
        return next;
      });
    };

    (async () => {
      for (const asset of ["crypto-ohlc", "equity-ohlc"]) {
        try {
          const res = await fetch(`/api/market-data?asset=${asset}`);
          if (!res.ok || cancelled) continue;
          const data = (await res.json()) as Record<string, number[][]>;
          // CoinGecko sends 4-hour bars; everything downstream (the chart's D timeframe, Pulse's RSI) is daily. UTC day boundaries.
          if (asset === "crypto-ohlc") for (const id of Object.keys(data)) if (Array.isArray(data[id])) data[id] = resampleToDaily(data[id]);
          applyHistory(data, asset === "crypto-ohlc" ? 0 : 19_800_000);
        } catch {
          // that family stays simulated
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const pull = async () => {
      for (const asset of ["crypto", "equity"]) {
        try {
          const res = await fetch(`/api/market-data?asset=${asset}`);
          if (!res.ok) continue;
          const quotes: Record<string, { price: number; prevClose: number }> = await res.json();
          const ids = Object.keys(quotes).filter((id) => quotes[id]?.price > 0);
          if (ids.length === 0) continue;
          ids.forEach((id) => quotedRef.current.add(id));
          setLive((prev) => {
            const next = { ...prev };
            ids.forEach((id) => (next[id] = quotes[id].price));
            return next;
          });
          setPrevClose((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
              if (quotes[id].prevClose > 0) next[id] = quotes[id].prevClose;
            });
            return next;
          });
          setHistories((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
              if (!next[id]) return;
              const arr = next[id];
              const last = arr[arr.length - 1];
              const p = quotes[id].price;
              next[id] = [
                ...arr.slice(0, -1),
                { ...last, close: p, high: Math.max(last.high, p), low: Math.min(last.low, p) },
              ];
            });
            return next;
          });
          setLiveSource((prev) => {
            if (ids.every((id) => prev[id] === "live")) return prev;
            const next = { ...prev };
            ids.forEach((id) => (next[id] = "live"));
            return next;
          });
        } catch {
          // keep last known values
        }
      }
      feedSettled.current = true;
    };
    pull();
    const poll = setInterval(pull, 25000);
    return () => clearInterval(poll);
  }, []);

  /* ---- persistence (survives refresh, this browser only) ---- */
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("zestoxx:portfolio");
        if (res?.value) {
          const saved = JSON.parse(res.value);
          if (saved.watchlist) setWatchlist(saved.watchlist);
          if (Array.isArray(saved.lists)) setLists(saved.lists);
          // Resting orders and SIPs are stored without client ids — mint fresh ones.
          if (Array.isArray(saved.openOrders)) {
            setOpenOrders(saved.openOrders.map((o: Omit<OpenOrder, "id">) => ({ ...o, id: Date.now() + Math.random() })));
          }
          if (Array.isArray(saved.sips)) {
            setSips(saved.sips.map((p: Omit<SipPlan, "id">) => ({ ...p, id: Date.now() + Math.random() })));
          }
          if (saved.cash != null) setCash(saved.cash);
          if (saved.holdings) setHoldings(saved.holdings);
          if (saved.orderLog) setOrderLog(saved.orderLog);
          if (saved.alerts) setAlerts(saved.alerts);
          if (saved.notes && typeof saved.notes === "object") setNotes(saved.notes);
        }
      } catch {
        // no saved data yet — start fresh
      } finally {
        hydrated.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      if (!hydrated.current) return; // a reset is under way
      storage
        .set("zestoxx:portfolio", JSON.stringify({
            watchlist,
            lists,
            cash,
            holdings,
            orderLog,
            openOrders: openOrders.map(withoutId),
            sips: sips.map(withoutId),
            alerts,
            notes,
          }))
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [watchlist, lists, cash, holdings, orderLog, openOrders, sips, alerts, notes]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts((cur) => cur.slice(1)), 4500);
    return () => clearTimeout(t);
  }, [toasts]);

  // Mark-to-market for held option contracts. Their ids aren't in SYMBOLS, so nothing else
  // prices them: poll Upstox for live contracts, re-price simulated ones from the
  // simulated chain at the current underlying spot.
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const contractIds = useMemo(
    () => Object.keys(holdings).filter((id) => id.includes("#")).sort().join("\n"),
    [holdings]
  );

  useEffect(() => {
    if (!contractIds) return;
    let cancelled = false;

    const refresh = async () => {
      const marks: Record<string, number> = {};
      const idByKey: Record<string, string> = {};
      for (const id of contractIds.split("\n")) {
        const p = parseContractId(id);
        if (!p) continue;
        if (!p.sim) {
          idByKey[p.key] = id;
          continue;
        }
        const spot = liveRef.current[p.sim.underlying];
        if (!(spot > 0)) continue;
        const row = simulateChain(p.sim.underlying, spot, p.sim.expiry).rows.find(
          (r) => r.strike === p.sim!.strike
        );
        const leg = row && (p.sim.type === "CE" ? row.call : row.put);
        if (leg) marks[id] = leg.ltp;
      }

      const keys = Object.keys(idByKey).slice(0, 50);
      if (keys.length) {
        try {
          const res = await fetch(`/api/option-marks?keys=${encodeURIComponent(keys.join(","))}`);
          const data = res.ok ? await res.json() : null;
          if (data?.source === "live") {
            for (const [k, ltp] of Object.entries(data.marks as Record<string, number>)) {
              if (idByKey[k]) marks[idByKey[k]] = ltp;
            }
          }
        } catch {
          // keep the previous marks
        }
      }
      if (!cancelled && Object.keys(marks).length) setLive((l) => ({ ...l, ...marks }));
    };

    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [contractIds]);

  /**
   * Place a paper order for any symbol: a market order fills at the live price now; a limit or GTD order rests until the live price reaches it
   * (while the app is open). Every order is checked against the account first (lib/order-check.ts), and a resting one again when it fills.
   */
  const placeOrder = useCallback(
    ({ symbol, mode, side, qty, limitPrice, expiryDate }: OrderRequest): OrderResult => {
      const refuse = (reason: string): OrderResult => ({ status: "refused", reason });
      if (!isTradableId(symbol)) return refuse("Zestoxx cannot trade this symbol.");
      const held = holdingsRef.current[symbol]?.qty ?? 0;
      if (mode === "market") {
        // a paper market order fills at the live price; with none (a symbol with no recent trades) there is no order
        const at = live[symbol];
        if (!(at > 0)) return refuse("There is no live price for this symbol, so there is nothing to fill an order at.");
        const err = fundsError({ side, qty, price: at, cash: cashRef.current, held, symbol });
        if (err) return refuse(err);
        fillOrder(symbol, side, qty, at);
        return { status: "filled", symbol, side, qty, price: at, cashAfter: cashRef.current };
      }
      // a resting order is checked now, at its limit price, and again when it fills
      if (!(Number(limitPrice) > 0)) return refuse("Enter a limit price above 0.");
      const err = fundsError({ side, qty, price: limitPrice as number, cash: cashRef.current, held, symbol });
      if (err) return refuse(err);
      const orderType = mode === "gtd" ? "GTD" : "LIMIT";
      setOpenOrders((cur) => [
        {
          id: Date.now() + Math.random(),
          symbol,
          side,
          qty,
          limitPrice: limitPrice as number,
          time: new Date().toLocaleTimeString("en-IN"),
          orderType,
          placedDate: istClock().date,
          expiryDate: mode === "gtd" ? expiryDate : undefined,
        },
        ...cur,
      ]);
      return { status: "pending", symbol, side, qty, limitPrice: limitPrice as number, orderType, expiryDate: mode === "gtd" ? expiryDate : undefined };
    },
    [live, fillOrder]
  );

  /** The desktop form's order for the selected symbol: the reason it was refused, or null. */
  const onTrade = useCallback(
    (t: TradeInput): string | null => {
      const r = placeOrder({ ...t, symbol: selectedRef.current });
      return r.status === "refused" ? r.reason : null;
    },
    [placeOrder]
  );

  const tradeContract = useCallback(
    ({ id, side, qty, price }: { id: string; side: "buy" | "sell"; qty: number; price: number }) => {
      fillOrder(id, side, qty, price);
      // Seed the mark with the fill so the portfolio is right until the next poll.
      setLive((l) => ({ ...l, [id]: price }));
    },
    [fillOrder]
  );

  /* ---- order lifecycle: cancel, expire, SIPs ---- */

  const openOrdersRef = useRef(openOrders);
  const sipsRef = useRef(sips);
  useEffect(() => {
    openOrdersRef.current = openOrders;
    sipsRef.current = sips;
    cashRef.current = cash;
    holdingsRef.current = holdings;
  }, [openOrders, sips, cash, holdings]);

  /* ---- any other NSE equity or ETF: quotes and candles on demand ----
   * Quotes are fetched only for symbols that need watching, all in one request (at most MAX_QUOTE_SYMBOLS), at most every QUOTE_GAP_MS, and only
   * while the page is visible:
   *   - symbols on screen, which a view registers with watchQuotes (the chart, the symbol sheet, the portfolio);
   *   - symbols held, because the account value in the header shows them;
   *   - symbols with an open order, GTT or alert, because those are what fire while the app is open.
   * A symbol the feed has no last price for is "none" (no recent trades): its price is left out, never made up. */
  const watched = useRef(new Map<string, string[]>());
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteLastAt = useRef(0);
  const quoteBusy = useRef(false);
  const alertsRef = useRef(alerts);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const quoteIds = useCallback((): string[] => {
    const ids: string[] = [];
    const add = (id: string) => {
      if (isDynamicEquity(id) && !ids.includes(id)) ids.push(id);
    };
    for (const list of watched.current.values()) list.forEach(add);
    Object.keys(holdingsRef.current).forEach(add);
    openOrdersRef.current.forEach((o) => add(o.symbol));
    alertsRef.current.forEach((a) => add(a.symbol));
    return ids.slice(0, MAX_QUOTE_SYMBOLS);
  }, []);

  const pollQuotes = useCallback(async () => {
    if (quoteBusy.current || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    const ids = quoteIds();
    if (ids.length === 0) return;
    quoteBusy.current = true;
    quoteLastAt.current = Date.now();
    try {
      const res = await fetch(`/api/quotes?symbols=${ids.map(encodeURIComponent).join(",")}`);
      const data = res.ok ? ((await res.json()) as { source?: string; quotes?: Record<string, DynamicQuote> }) : null;
      if (!data || data.source !== "live" || !data.quotes) {
        // the feed did not answer: keep any price already held, and say "unavailable" only for symbols with none
        setDynState((prev) => {
          const next = { ...prev };
          for (const id of ids) if (!(liveRef.current[id] > 0)) next[id] = "unavailable";
          return next;
        });
        return;
      }
      const quotes = data.quotes;
      const got = ids.filter((id) => quotes[id]);
      const livePriced = got.filter((id) => quotes[id].state === "live" && (quotes[id].ltp ?? 0) > 0);
      const none = got.filter((id) => quotes[id].state !== "live");
      livePriced.forEach((id) => quotedRef.current.add(id));
      setDynState((prev) => {
        const next = { ...prev };
        got.forEach((id) => (next[id] = quotes[id].state));
        return next;
      });
      setDynNames((prev) => {
        const next = { ...prev };
        got.forEach((id) => {
          if (quotes[id].name) next[id] = quotes[id].name as string;
        });
        return next;
      });
      setLive((prev) => {
        const next = { ...prev };
        livePriced.forEach((id) => (next[id] = quotes[id].ltp as number));
        none.forEach((id) => delete next[id]); // no recent trades: no price, not a stale one
        return next;
      });
      setPrevClose((prev) => {
        const next = { ...prev };
        livePriced.forEach((id) => {
          if (quotes[id].prevClose > 0) next[id] = quotes[id].prevClose;
        });
        return next;
      });
      setLiveSource((prev) => {
        if (livePriced.every((id) => prev[id] === "live")) return prev;
        const next = { ...prev };
        livePriced.forEach((id) => (next[id] = "live"));
        return next;
      });
      setHistories((prev) => {
        const next = { ...prev };
        livePriced.forEach((id) => {
          const arr = next[id];
          if (!arr || arr.length === 0) return;
          const last = arr[arr.length - 1];
          const p = quotes[id].ltp as number;
          next[id] = [...arr.slice(0, -1), { ...last, close: p, high: Math.max(last.high, p), low: Math.min(last.low, p) }];
        });
        return next;
      });
    } catch {
      // keep the last known values; the next poll tries again
    } finally {
      quoteBusy.current = false;
    }
  }, [quoteIds]);

  /** Poll soon (at least QUOTE_GAP_MS after the last poll), once however many views ask in the same moment. */
  const scheduleQuotes = useCallback(() => {
    if (quoteTimer.current) return;
    const wait = Math.max(250, quoteLastAt.current + QUOTE_GAP_MS - Date.now());
    quoteTimer.current = setTimeout(() => {
      quoteTimer.current = null;
      void pollQuotes();
    }, wait);
  }, [pollQuotes]);

  const watchQuotes = useCallback(
    (owner: string, ids: string[]) => {
      if (ids.length > 0) watched.current.set(owner, ids);
      else watched.current.delete(owner);
      if (ids.length > 0) scheduleQuotes();
    },
    [scheduleQuotes]
  );

  const openOrderKey = openOrders.map((o) => o.symbol).join(",");
  const alertKey = alerts.map((a) => a.symbol).join(",");
  const heldKey = Object.keys(holdings).join(",");
  useEffect(() => {
    // what needs watching changed (a position, an order or an alert on one of these symbols): look soon
    scheduleQuotes();
  }, [openOrderKey, alertKey, heldKey, scheduleQuotes]);
  useEffect(() => {
    const timer = setInterval(() => void pollQuotes(), QUOTE_POLL_MS);
    const visible = () => {
      if (document.visibilityState === "visible") scheduleQuotes();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
      quoteTimer.current = null;
    };
  }, [pollQuotes, scheduleQuotes]);

  const quoteStateOf = useCallback((id: string) => dynState[id], [dynState]);

  // The chart's daily candles for a symbol the app does not chart on its own, fetched once when it is selected (the same /api/candles, with its
  // caching and limits). Until they arrive, or when they cannot be had, the chart has nothing to draw and says so: no invented history.
  const histRequested = useRef(new Set<string>());
  useEffect(() => {
    const requested = histRequested.current;
    if (!isDynamicEquity(selected) || requested.has(selected)) return;
    requested.add(selected);
    let cancelled = false;
    let done = false;
    (async () => {
      try {
        const res = await fetch(`/api/candles?symbol=${encodeURIComponent(selected)}&interval=1D&range=1Y`);
        const data = res.ok ? await res.json() : null;
        if (cancelled || data?.source !== "live" || !Array.isArray(data.bars) || data.bars.length === 0) {
          requested.delete(selected); // try again the next time it is selected
          return;
        }
        const candles = (data.bars as number[][]).map((c) => ({
          t: Math.floor((c[0] + 19_800_000) / 86_400_000) * 86_400,
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
          volume: Number.isFinite(c[5]) ? c[5] : 0,
        }));
        setHistories((prev) => ({ ...prev, [selected]: candles }));
        setRealHistory((prev) => ({ ...prev, [selected]: true }));
        setLiveSource((prev) => ({ ...prev, [selected]: "live" }));
        done = true;
      } catch {
        requested.delete(selected);
      }
    })();
    return () => {
      cancelled = true;
      if (!done) requested.delete(selected); // asked for, not answered: ask again if it is selected again
    };
  }, [selected]);


  /** Move resting orders into the history as cancelled/expired — they never filled. */
  const closeOrders = useCallback((orders: OpenOrder[], status: Exclude<OrderStatus, "filled">) => {
    if (orders.length === 0) return;
    const ids = new Set(orders.map((o) => o.id));
    setOpenOrders((cur) => cur.filter((o) => !ids.has(o.id)));
    setOrderLog((log) =>
      [
        ...orders.map((o) => ({
          id: Date.now() + Math.random(),
          symbol: o.symbol,
          side: o.side,
          qty: o.qty,
          price: o.limitPrice,
          mode: "limit" as const,
          orderType: o.orderType,
          status,
          expiryDate: o.expiryDate,
          time: new Date().toLocaleTimeString("en-IN"),
          date: istClock().date,
        })),
        ...log,
      ].slice(0, 100)
    );
  }, []);

  const cancelOrder = useCallback(
    (id: number) => closeOrders(openOrdersRef.current.filter((o) => o.id === id), "cancelled"),
    [closeOrders]
  );

  const resetPaperAccount = useCallback(async (): Promise<boolean> => {
    // stop the autosave first: it must not write the old account back after the reset
    hydrated.current = false;
    try {
      const res = await fetch("/api/account/reset", { method: "POST" });
      if (!res.ok) {
        hydrated.current = true;
        return false;
      }
      window.location.reload();
      return true;
    } catch {
      hydrated.current = true;
      return false;
    }
  }, []);

  // A day LIMIT dies when the IST date turns; a GTD after its expiry date. Checked once the
  // saved orders have loaded, then every 30 s (the terminal can stay open across midnight).
  useEffect(() => {
    const sweep = () => {
      if (!hydrated.current) return;
      const today = istClock().date;
      closeOrders(openOrdersRef.current.filter((o) => isRestingOrderExpired(o, today)), "expired");
    };
    const first = setTimeout(sweep, 1500);
    const timer = setInterval(sweep, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [closeOrders]);

  const notify = useCallback(
    (text: string) => setToasts((t) => [...t, { id: Date.now() + Math.random(), text }]),
    []
  );

  useEffect(() => {
    closeGttRef.current = (o, status, text) => {
      closeOrders([o], status);
      notify(text);
    };
  }, [closeOrders, notify]);

  /** Place a GTT / stop-loss order at the price now: it fires while the app is open, and the next visit checks the candles it missed. */
  const createGtt = useCallback(
    ({ symbol, side, qty, trigger }: { symbol: string; side: "buy" | "sell"; qty: number; trigger: number }, replaceId?: number): string | null => {
      const priceNow = liveRef.current[symbol];
      const old = replaceId == null ? undefined : openOrdersRef.current.find((o) => o.id === replaceId && o.orderType === "GTT");
      if (replaceId != null && !old) return "That GTT is no longer open: it may have triggered or been cancelled.";
      if (!isTradableId(symbol)) return "Zestoxx cannot trade this symbol.";
      if (!(priceNow > 0)) return isDynamicEquity(symbol) ? "There is no live price for this symbol (no recent trades), so a GTT cannot be placed yet." : "There is no price for this symbol yet. Try again in a moment.";
      if (openOrdersRef.current.filter((o) => o.orderType === "GTT" && o !== old).length >= MAX_OPEN_GTT) return `You can have up to ${MAX_OPEN_GTT} open GTT orders. Cancel one first.`;
      const err = gttError({ side, qty, trigger, priceNow, heldQty: holdingsRef.current[symbol]?.qty ?? 0, cash: cashRef.current });
      if (err) return err;
      const direction = triggerDirection(trigger, priceNow);
      if (old) closeOrders([old], "cancelled"); // an edit is a cancel and a new order: the old one stays in the history as cancelled
      setOpenOrders((cur) => [
        { id: Date.now() + Math.random(), symbol, side, qty, limitPrice: trigger, time: new Date().toLocaleTimeString("en-IN"), orderType: "GTT" as const, placedDate: istClock().date, trigger: direction, placedAtMs: Date.now() },
        ...cur,
      ]);
      return null;
    },
    [closeOrders]
  );

  const setNote = useCallback((symbol: string, text: string) => {
    setNotes((cur) => {
      const next = { ...cur };
      if (text.trim()) next[symbol] = text.slice(0, 500);
      else delete next[symbol];
      return next;
    });
  }, []);

  // On the first pass after the saved orders and the first prices are in: a GTT placed on an earlier visit could not be watched while the app
  // was shut. Ask for the candles since it was placed and fill it at the first one that crossed the trigger, saying the fill is simulated.
  //
  // It can never fill an order twice, and it is gentle on the candle feed:
  //   - one pass per page load (caughtUp), and only one tab at a time (a Web Lock; a second tab that is open at the same moment skips it);
  //   - an order is only filled if it is still open at that moment and no live tick has fired it (firedOrders), so a tick and the catch-up cannot both fill it;
  //   - the saved portfolio is replaced as a whole, so even two tabs that both filled it store one fill, never two;
  //   - one request per symbol (all that symbol's orders share it), at most GTT_CATCHUP_SYMBOLS symbols a pass, a second apart, and no new pass
  //     within GTT_CATCHUP_GAP_MS of the last one on this device (a reload loop cannot hammer the feed).
  const sessionStart = useRef(0);
  const caughtUp = useRef(false);
  useEffect(() => {
    sessionStart.current = Date.now();
    let tries = 0;
    const pass = async () => {
      const pending = openOrdersRef.current.filter((o) => o.orderType === "GTT" && o.placedAtMs && o.placedAtMs < sessionStart.current - 30_000 && o.trigger);
      const bySymbol = new Map<string, OpenOrder[]>();
      for (const o of pending) {
        if (!isTradableId(o.symbol) || SYMBOL_MAP[o.symbol]?.type === "crypto") continue;
        bySymbol.set(o.symbol, [...(bySymbol.get(o.symbol) ?? []), o]);
      }
      let n = 0;
      for (const [symbol, orders] of bySymbol) {
        if (n++ >= GTT_CATCHUP_SYMBOLS) break; // the rest wait for the next visit
        if (n > 1) await new Promise((r) => setTimeout(r, 1000));
        const earliest = Math.min(...orders.map((o) => o.placedAtMs as number));
        const win = catchUpWindow(earliest, Date.now());
        if (!win) continue;
        try {
          const res = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${win.interval}&range=${win.range}`);
          const data = res.ok ? await res.json() : null;
          if (data?.source !== "live" || !Array.isArray(data.bars)) continue; // no candles now: they stay open, and the next visit tries again
          const bars = (data.bars as number[][]).map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3] }));
          for (const o of orders) {
            // still open, and not fired by a live tick while the candles were on their way
            if (!openOrdersRef.current.some((x) => x.id === o.id) || firedOrders.current.has(o.id)) continue;
            const hit = firstCrossing(bars, { trigger: o.limitPrice, direction: o.trigger as "above" | "below", placedAtMs: o.placedAtMs as number });
            if (!hit) continue;
            const type = typeOf(o.symbol);
            const date = new Date(hit.t + 5.5 * 3_600_000).toISOString().slice(0, 10);
            const time = new Date(hit.t).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
            const short = o.side === "buy" ? o.qty * hit.price > cashRef.current : (holdingsRef.current[o.symbol]?.qty ?? 0) < o.qty;
            firedOrders.current.add(o.id);
            if (short) {
              closeOrders([o], "cancelled");
              notify(`GTT ${o.side} ${o.qty} ${o.symbol} was cancelled: it crossed its trigger while you were away, but ${o.side === "buy" ? "there was not enough virtual cash" : "you no longer hold enough"}.`);
              continue;
            }
            fillOrder(o.symbol, o.side, o.qty, hit.price, "GTT", { simulated: true, date, time });
            setOpenOrders((cur) => cur.filter((x) => x.id !== o.id));
            notify(`${gttKind(o.side, o.trigger as "above" | "below")} filled (simulated): ${o.side} ${o.qty} ${o.symbol} @ ${fmt(hit.price, type)}. It crossed ${fmt(o.limitPrice, type)} in the ${time} candle on ${date}. Zestoxx cannot watch prices while it is closed, so this fill is worked out from the candles.`);
          }
        } catch {
          // candles not reachable: the orders stay open for the next visit
        }
      }
    };
    const timer = setInterval(async () => {
      if (caughtUp.current) return;
      if (!hydrated.current || !feedSettled.current) {
        if (++tries > 30) clearInterval(timer);
        return;
      }
      caughtUp.current = true;
      clearInterval(timer);
      if (!openOrdersRef.current.some((o) => o.orderType === "GTT")) return;
      // one tab at a time, and not again so soon after the last pass on this device (a reload loop): see catchUpOnce
      await catchUpOnce(
        {
          locks: (navigator as Navigator & { locks?: CatchUpEnv["locks"] }).locks,
          readStamp: () => {
            try {
              return Number(window.localStorage.getItem(GTT_CATCHUP_KEY) ?? 0);
            } catch {
              return 0; // storage blocked: no memory of the last pass, so the lock and the once-per-load rule are what limit it
            }
          },
          writeStamp: (ms) => {
            try {
              window.localStorage.setItem(GTT_CATCHUP_KEY, String(ms));
            } catch {
              // see above
            }
          },
          now: () => Date.now(),
        },
        pass
      );
    }, 2000);
    return () => clearInterval(timer);
  }, [closeOrders, fillOrder, notify]);


  const moveInList = useCallback((list: string, symbol: string, direction: -1 | 1) => {
    const move = (arr: string[]) => {
      const i = arr.indexOf(symbol);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    };
    if (list === PRIMARY_LIST) setWatchlist(move);
    else setLists((cur) => cur.map((l) => (l.name === list ? { ...l, symbols: move(l.symbols) } : l)));
  }, []);

  const runSips = useCallback(() => {
    // Never buy at the seed prices `live` starts with — wait for the first real answer.
    if (!hydrated.current || !feedSettled.current) return;
    const now = istClock();
    const due = sipsRef.current.filter((p) => p.status === "active" && isSipExecutable(p.nextDate, now));
    if (due.length === 0) return;

    let cashLeft = cashRef.current;
    const patches = new Map<number, Partial<SipPlan>>();
    for (const p of due) {
      const price = liveRef.current[p.symbol];
      if (!(price > 0)) continue; // no price yet — try again on the next pass
      // Advance first: an installment is run once, and missed ones are skipped, not stacked.
      const nextDate = nextSipDate(p, now.date);
      const { qty, cost } = sipFill(p.amount, price);
      if (qty < 1) {
        notify(`SIP skipped: ${fmtINR(p.amount)} doesn't buy a whole ${p.symbol} share at ${fmt(price, "stock")}.`);
        patches.set(p.id, { nextDate });
      } else if (cost > cashLeft) {
        notify(`SIP skipped: not enough virtual cash for ${p.symbol}.`);
        patches.set(p.id, { nextDate });
      } else {
        cashLeft -= cost;
        fillOrder(p.symbol, "buy", qty, price, "SIP");
        notify(`SIP bought ${qty} ${p.symbol} @ ${fmt(price, "stock")}`);
        patches.set(p.id, { nextDate, installments: p.installments + 1 });
      }
    }
    if (patches.size === 0) return;
    // Update the ref immediately so an overlapping pass can't run the same installment twice.
    sipsRef.current = sipsRef.current.map((p) => (patches.has(p.id) ? { ...p, ...patches.get(p.id) } : p));
    setSips(sipsRef.current);
  }, [fillOrder, notify]);

  useEffect(() => {
    const first = setTimeout(runSips, 2500);
    const timer = setInterval(runSips, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [runSips]);

  const createSip = useCallback(({ symbol, amount, frequency, startDate }: NewSip): string | null => {
    if (SYMBOL_MAP[symbol]?.type !== "stock") return "Stock SIPs are available for stocks only.";
    const err = sipError({ amount, startDate }, istClock().date, sipsRef.current.length);
    if (err) return err;
    setSips((cur) => [
      ...cur,
      {
        id: Date.now() + Math.random(),
        symbol,
        amount,
        frequency,
        nextDate: startDate,
        anchorDay: Number(startDate.slice(8)),
        status: "active",
        installments: 0,
        createdAt: new Date().toLocaleDateString("en-IN"),
      },
    ]);
    return null;
  }, []);

  const setSipStatus = useCallback((id: number, status: SipStatus) => {
    const today = istClock().date;
    setSips((cur) =>
      cur.map((p) => {
        if (p.id !== id) return p;
        // Resuming never back-fills: if the due date slipped past, jump to the next one.
        const nextDate = status === "active" && p.nextDate < today ? nextSipDate(p, today) : p.nextDate;
        return { ...p, status, nextDate };
      })
    );
  }, []);
  const cancelSip = useCallback((id: number) => setSips((cur) => cur.filter((p) => p.id !== id)), []);

  const exitPosition = useCallback(
    (id: string) => {
      const qty = holdings[id]?.qty ?? 0;
      const price = live[id];
      if (qty > 0 && price > 0) fillOrder(id, "sell", qty, price);
    },
    [holdings, live, fillOrder]
  );

  const addToWatchlist = useCallback(
    (id: string): string | null => {
      // the main list is the terminal's own: every symbol in it opens a chart and an order form, so any stock or ETF may be in it (and the
      // built-in indices), but not another index, which Zestoxx cannot chart or trade
      if (!isTradableId(id)) return "My Watchlist holds stocks and ETFs, because each symbol in it opens a chart and an order form. Add an index to another list.";
      if (watchlist.includes(id)) return null;
      if (watchlist.length >= MAX_SYMBOLS_PER_LIST) return `A watchlist holds up to ${MAX_SYMBOLS_PER_LIST} symbols.`;
      setWatchlist((w) => (w.includes(id) ? w : [...w, id]));
      return null;
    },
    [watchlist]
  );
  const removeFromWatchlist = useCallback(
    (id: string) => {
      setWatchlist((w) => {
        const rest = w.filter((x) => x !== id);
        if (selectedRef.current === id && rest.length) setSelected(rest[0]);
        return rest;
      });
    },
    [setSelected]
  );

  const createList = useCallback(
    (name: string, symbols: string[] = []): string | null => {
      const err = listNameError(name, lists.map((l) => l.name));
      if (err) return err;
      setLists((cur) => [...cur, { name: name.trim(), symbols: [...new Set(symbols)].slice(0, MAX_SYMBOLS_PER_LIST) }]);
      return null;
    },
    [lists]
  );
  const deleteList = useCallback((name: string) => setLists((cur) => cur.filter((l) => l.name !== name)), []);
  const addToList = useCallback(
    (name: string, symbol: string): string | null => {
      const list = lists.find((l) => l.name === name);
      if (!list) return "That watchlist no longer exists.";
      if (list.symbols.includes(symbol)) return `${symbol} is already in ${name}.`;
      if (list.symbols.length >= MAX_SYMBOLS_PER_LIST) return `A watchlist holds up to ${MAX_SYMBOLS_PER_LIST} symbols.`;
      setLists((cur) => cur.map((l) => (l.name === name ? { ...l, symbols: [...l.symbols, symbol] } : l)));
      return null;
    },
    [lists]
  );
  const removeFromList = useCallback(
    (name: string, symbol: string) =>
      setLists((cur) => cur.map((l) => (l.name === name ? { ...l, symbols: l.symbols.filter((x) => x !== symbol) } : l))),
    []
  );

  const addToAnyList = useCallback(
    (list: string, symbol: string): string | null => {
      if (list !== PRIMARY_LIST) return addToList(list, symbol);
      if (watchlist.includes(symbol)) return `${symbol} is already in My Watchlist.`;
      return addToWatchlist(symbol);
    },
    [addToList, addToWatchlist, watchlist]
  );
  const removeFromAnyList = useCallback(
    (list: string, symbol: string) => (list === PRIMARY_LIST ? removeFromWatchlist(symbol) : removeFromList(list, symbol)),
    [removeFromList, removeFromWatchlist]
  );

  /**
   * Reference close for the day-change ("Chg %"). Live symbols use the real previous
   * close from their feed (Upstox `cp` / crypto 24h-ago); simulated symbols use the
   * prior candle in their generated history. Falls back so this never divides by 0.
   */
  const prevCloseFor = useCallback(
    (id: string): number => {
      const feed = prevClose[id];
      if (typeof feed === "number" && feed > 0) return feed;
      const h = histories[id];
      return h?.[h.length - 2]?.close ?? h?.[0]?.open ?? live[id] ?? 0;
    },
    [prevClose, histories, live]
  );

  const hasFeedQuote = useCallback((id: string): boolean => (prevClose[id] ?? 0) > 0, [prevClose]);
  const hasRealHistory = useCallback((id: string): boolean => realHistory[id] === true, [realHistory]);

  /** Day-change % for a symbol: (price − previous close) / previous close. */
  const chgFor = useCallback(
    (id: string): number => {
      const pc = prevCloseFor(id);
      const p = live[id];
      return pc > 0 && typeof p === "number" ? ((p - pc) / pc) * 100 : 0;
    },
    [prevCloseFor, live]
  );

  const sym = infoFor(selected, dynNames[selected]);
  const price = live[selected];
  const chg = chgFor(selected);

  const value: ZestoxxContextValue = {
    watchlist,
    selected,
    setSelected,
    histories,
    live,
    liveSource,
    cash,
    holdings,
    orderLog,
    openOrders,
    compareWith,
    setCompareWith,
    alerts,
    setAlerts,
    toasts,
    dismissToast,
    alertPrefill,
    formula,
    setFormula,
    sym,
    price,
    chg,
    chgFor,
    prevCloseFor,
    hasFeedQuote,
    hasRealHistory,
    setActiveView,
    onTrade,
    placeOrder,
    tradeContract,
    onAddAlert,
    cancelOrder,
    createGtt,
    notes,
    setNote,
    watchQuotes,
    quoteStateOf,
    addToAnyList,
    removeFromAnyList,
    moveInList,
    resetPaperAccount,
    sips,
    createSip,
    setSipStatus,
    cancelSip,
    exitPosition,
    addToWatchlist,
    removeFromWatchlist,
    lists,
    createList,
    deleteList,
    addToList,
    removeFromList,
  };

  return <ZestoxxContext.Provider value={value}>{children}</ZestoxxContext.Provider>;
}
