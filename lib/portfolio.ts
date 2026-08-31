import { prisma } from "@/lib/db";

/**
 * The single blob the terminal reads/writes through `storage` (was one localStorage
 * key: "zestoxx:portfolio"). `loadPortfolio` reassembles it from the relational tables;
 * `savePortfolio` decomposes it back. Keeping this shape identical is what lets the
 * React components stay untouched.
 */
export interface PortfolioBlob {
  watchlist: string[];
  cash: number;
  holdings: Record<string, { qty: number; avgPrice: number }>;
  orderLog: {
    id: string;
    symbol: string;
    side: "buy" | "sell";
    qty: number;
    price: number;
    mode: "market" | "limit";
    time: string;
  }[];
  alerts: {
    id: string;
    symbol: string;
    condition: "above" | "below";
    target: number;
    createdAt: string;
  }[];
}

/** Returns null when the user has never saved anything, so the client keeps its defaults. */
export async function loadPortfolio(userId: string): Promise<PortfolioBlob | null> {
  const [user, watchlist, holdings, orders, alerts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.watchlist.findMany({ where: { userId }, orderBy: { position: "asc" } }),
    prisma.holding.findMany({ where: { userId } }),
    prisma.order.findMany({
      where: { userId, status: "filled" },
      orderBy: { placedAt: "desc" },
      take: 40,
    }),
    prisma.alert.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!user) return null;
  const isEmpty =
    watchlist.length === 0 &&
    holdings.length === 0 &&
    orders.length === 0 &&
    alerts.length === 0;
  if (isEmpty) return null;

  return {
    watchlist: watchlist.map((w) => w.symbol),
    cash: user.cash,
    holdings: Object.fromEntries(
      holdings.map((h) => [h.symbol, { qty: h.qty, avgPrice: h.avgPrice }])
    ),
    orderLog: orders.map((o) => ({
      id: o.id,
      symbol: o.symbol,
      side: o.side as "buy" | "sell",
      qty: o.qty,
      price: o.price ?? 0,
      mode: o.mode as "market" | "limit",
      time: o.timeLabel ?? "",
    })),
    alerts: alerts.map((a) => ({
      id: a.id,
      symbol: a.symbol,
      condition: a.condition as "above" | "below",
      target: a.target,
      createdAt: a.createdAtLabel ?? "",
    })),
  };
}

/**
 * Overwrites the user's stored portfolio with `blob`. The terminal already holds the
 * authoritative in-memory state and debounces these writes, so a full replace inside
 * one transaction is simplest and race-free.
 */
export async function savePortfolio(userId: string, blob: PortfolioBlob): Promise<void> {
  const watchlist = Array.isArray(blob.watchlist) ? blob.watchlist : [];
  const holdings = blob.holdings ?? {};
  const orderLog = Array.isArray(blob.orderLog) ? blob.orderLog : [];
  const alerts = Array.isArray(blob.alerts) ? blob.alerts : [];

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { cash: typeof blob.cash === "number" ? blob.cash : 1000000 },
    }),

    prisma.watchlist.deleteMany({ where: { userId } }),
    prisma.watchlist.createMany({
      data: watchlist.map((symbol, position) => ({ userId, symbol, position })),
    }),

    prisma.holding.deleteMany({ where: { userId } }),
    prisma.holding.createMany({
      data: Object.entries(holdings).map(([symbol, h]) => ({
        userId,
        symbol,
        qty: h.qty,
        avgPrice: h.avgPrice,
      })),
    }),

    prisma.order.deleteMany({ where: { userId, status: "filled" } }),
    prisma.order.createMany({
      data: orderLog.map((o) => ({
        userId,
        symbol: o.symbol,
        side: o.side,
        mode: o.mode,
        qty: o.qty,
        price: o.price,
        status: "filled",
        timeLabel: o.time,
      })),
    }),

    prisma.alert.deleteMany({ where: { userId } }),
    prisma.alert.createMany({
      data: alerts.map((a) => ({
        userId,
        symbol: a.symbol,
        condition: a.condition,
        target: a.target,
        createdAtLabel: a.createdAt,
      })),
    }),
  ]);
}
