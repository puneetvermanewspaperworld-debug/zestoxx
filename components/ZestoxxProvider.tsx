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
import { SYMBOLS, SYMBOL_MAP, VOL, EXPIRIES } from "@/lib/symbols";
import { buildHistory } from "@/lib/history";
import { fmt } from "@/lib/helpers";
import { storage } from "@/lib/storage";
import type {
  Candle,
  Holdings,
  OrderLogEntry,
  OpenOrder,
  PriceAlert,
  Toast,
  Drawing,
  LiveSource,
  Timeframe,
  SymbolInfo,
} from "@/lib/types";

type ViewId =
  | "dashboard"
  | "trade"
  | "pulse"
  | "markets"
  | "options"
  | "fiidii"
  | "news"
  | "alerts"
  | "orders"
  | "portfolio";

interface TradeInput {
  mode: "market" | "limit";
  side: "buy" | "sell";
  qty: number;
  limitPrice?: number;
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
  timeframe: Timeframe;
  setTimeframe: React.Dispatch<React.SetStateAction<Timeframe>>;
  showMA: boolean;
  setShowMA: React.Dispatch<React.SetStateAction<boolean>>;
  showVolume: boolean;
  setShowVolume: React.Dispatch<React.SetStateAction<boolean>>;
  showRSI: boolean;
  setShowRSI: React.Dispatch<React.SetStateAction<boolean>>;
  showBB: boolean;
  setShowBB: React.Dispatch<React.SetStateAction<boolean>>;
  showEMA: boolean;
  setShowEMA: React.Dispatch<React.SetStateAction<boolean>>;
  compareWith: string | null;
  setCompareWith: React.Dispatch<React.SetStateAction<string | null>>;
  expiry: string;
  setExpiry: React.Dispatch<React.SetStateAction<string>>;
  alerts: PriceAlert[];
  setAlerts: React.Dispatch<React.SetStateAction<PriceAlert[]>>;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  alertPrefill: string | null;
  drawMode: string;
  setDrawMode: React.Dispatch<React.SetStateAction<string>>;
  drawings: Drawing[];
  onAddDrawing: (d: Drawing) => void;
  onClearDrawings: () => void;
  formula: string;
  setFormula: React.Dispatch<React.SetStateAction<string>>;
  sym: SymbolInfo;
  price: number;
  chg: number;
  setActiveView: (v: ViewId) => void;
  onTrade: (t: TradeInput) => void;
  onAddAlert: (symId: string) => void;
  cancelOrder: (id: number) => void;
  addToWatchlist: (id: string) => void;
  removeFromWatchlist: (id: string) => void;
}

const ZestoxxContext = createContext<ZestoxxContextValue | null>(null);

export function useZestoxx(): ZestoxxContextValue {
  const ctx = useContext(ZestoxxContext);
  if (!ctx) throw new Error("useZestoxx must be used within <ZestoxxProvider>");
  return ctx;
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
      const c = buildHistory(s);
      l[s.id] = c[c.length - 1].close;
    });
    return l;
  });
  const [cash, setCash] = useState(1000000);
  const [holdings, setHoldings] = useState<Holdings>({});
  const [orderLog, setOrderLog] = useState<OrderLogEntry[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>("D");
  const [showMA, setShowMA] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showRSI, setShowRSI] = useState(false);
  const [showBB, setShowBB] = useState(false);
  const [showEMA, setShowEMA] = useState(false);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [expiry, setExpiry] = useState(EXPIRIES[0]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [alertPrefill, setAlertPrefill] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState("none");
  const [drawingsBySymbol, setDrawingsBySymbol] = useState<Record<string, Drawing[]>>({});
  const [formula, setFormula] = useState("");
  const [liveSource, setLiveSource] = useState<LiveSource>({});
  const hydrated = useRef(false);

  const onAddDrawing = useCallback(
    (d: Drawing) => {
      setDrawingsBySymbol((prev) => ({
        ...prev,
        [selectedRef.current]: [...(prev[selectedRef.current] || []), d],
      }));
      setDrawMode("none");
    },
    []
  );
  const onClearDrawings = useCallback(() => {
    setDrawingsBySymbol((prev) => ({ ...prev, [selectedRef.current]: [] }));
  }, []);

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
    (symbol: string, side: "buy" | "sell", qty: number, price: number) => {
      const cost = price * qty;
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
            mode: "market" as const,
            time: new Date().toLocaleTimeString("en-IN"),
          },
          ...log,
        ].slice(0, 40)
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
          const vol = VOL[sym.type];
          next[id] = Math.max(0.01, prev[id] * (1 + (Math.random() - 0.5) * vol));
        });
        openOrders.forEach((o) => {
          const p = next[o.symbol];
          const crossed = o.side === "buy" ? p <= o.limitPrice : p >= o.limitPrice;
          if (crossed) {
            fillOrder(o.symbol, o.side, o.qty, o.limitPrice);
            setOpenOrders((cur) => cur.filter((x) => x.id !== o.id));
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
                text: `${a.symbol} is now ${a.condition} ${fmt(a.target, SYMBOL_MAP[a.symbol].type)}`,
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

    const applyHistory = (data: Record<string, number[][]>) => {
      const ids = Object.keys(data).filter((id) => Array.isArray(data[id]) && data[id].length >= 10);
      if (cancelled || ids.length === 0) return;
      setHistories((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = data[id].map((c) => ({
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
      setLive((prev) => {
        const next = { ...prev };
        ids.forEach((id) => (next[id] = data[id][data[id].length - 1][4]));
        return next;
      });
      setLiveSource((prev) => {
        const next = { ...prev };
        ids.forEach((id) => (next[id] = "live"));
        return next;
      });
    };

    (async () => {
      for (const asset of ["crypto-ohlc", "equity-ohlc"]) {
        try {
          const res = await fetch(`/api/market-data?asset=${asset}`);
          if (!res.ok || cancelled) continue;
          applyHistory(await res.json());
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
          const priceFor: Record<string, number> = await res.json();
          const ids = Object.keys(priceFor).filter((id) => priceFor[id] > 0);
          if (ids.length === 0) continue;
          setLive((prev) => {
            const next = { ...prev };
            ids.forEach((id) => (next[id] = priceFor[id]));
            return next;
          });
          setHistories((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
              if (!next[id]) return;
              const arr = next[id];
              const last = arr[arr.length - 1];
              const p = priceFor[id];
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
          if (saved.cash != null) setCash(saved.cash);
          if (saved.holdings) setHoldings(saved.holdings);
          if (saved.orderLog) setOrderLog(saved.orderLog);
          if (saved.alerts) setAlerts(saved.alerts);
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
      storage
        .set("zestoxx:portfolio", JSON.stringify({ watchlist, cash, holdings, orderLog, alerts }))
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [watchlist, cash, holdings, orderLog, alerts]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts((cur) => cur.slice(1)), 4500);
    return () => clearTimeout(t);
  }, [toasts]);

  const onTrade = useCallback(
    ({ mode, side, qty, limitPrice }: TradeInput) => {
      if (mode === "market") {
        fillOrder(selectedRef.current, side, qty, live[selectedRef.current]);
      } else {
        setOpenOrders((cur) => [
          {
            id: Date.now() + Math.random(),
            symbol: selectedRef.current,
            side,
            qty,
            limitPrice: limitPrice as number,
            time: new Date().toLocaleTimeString("en-IN"),
          },
          ...cur,
        ]);
      }
    },
    [live, fillOrder]
  );

  const cancelOrder = useCallback(
    (id: number) => setOpenOrders((cur) => cur.filter((o) => o.id !== id)),
    []
  );
  const addToWatchlist = useCallback(
    (id: string) => setWatchlist((w) => (w.includes(id) ? w : [...w, id])),
    []
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

  const sym = SYMBOL_MAP[selected];
  const price = live[selected];
  const openRef = histories[selected][0].open;
  const chg = ((price - openRef) / openRef) * 100;

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
    timeframe,
    setTimeframe,
    showMA,
    setShowMA,
    showVolume,
    setShowVolume,
    showRSI,
    setShowRSI,
    showBB,
    setShowBB,
    showEMA,
    setShowEMA,
    compareWith,
    setCompareWith,
    expiry,
    setExpiry,
    alerts,
    setAlerts,
    toasts,
    dismissToast,
    alertPrefill,
    drawMode,
    setDrawMode,
    drawings: drawingsBySymbol[selected] || [],
    onAddDrawing,
    onClearDrawings,
    formula,
    setFormula,
    sym,
    price,
    chg,
    setActiveView,
    onTrade,
    onAddAlert,
    cancelOrder,
    addToWatchlist,
    removeFromWatchlist,
  };

  return <ZestoxxContext.Provider value={value}>{children}</ZestoxxContext.Provider>;
}
