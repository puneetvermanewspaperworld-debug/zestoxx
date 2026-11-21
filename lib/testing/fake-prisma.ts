/**
 * A small in-memory stand-in for the parts of the Prisma client the user-data code uses (User, Watchlist, Holding, Order, Alert, Sip and
 * GuestCreation), for tests that have no database. It enforces the same unique keys and cascades deletes from a user, so a test that
 * passes here is not passing because the fake is lenient about the things that matter for isolation.
 */
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const UNIQUE: Record<string, string[][]> = {
  user: [["email"], ["tokenHash"]],
  watchlist: [["userId", "listName", "symbol"]],
  holding: [["userId", "symbol"]],
};
const DEFAULTS: Record<string, () => Row> = {
  user: () => ({ cash: 1000000, kind: "member", tokenHash: null, claimedAt: null, name: null, createdAt: new Date(), updatedAt: new Date() }),
  watchlist: () => ({ listName: "My Watchlist", position: 0 }),
  holding: () => ({}),
  order: () => ({ orderType: "MARKET", status: "filled", price: null, limitPrice: null, expiryDate: null, placedDate: null, timeLabel: null, placedAt: new Date() }),
  alert: () => ({ createdAtLabel: null, createdAt: new Date() }),
  sip: () => ({ status: "active", installments: 0, createdLabel: null, position: 0 }),
  guestCreation: () => ({ createdAt: new Date() }),
};

let seq = 0;
const matches = (row: Row, where: Where = {}): boolean =>
  Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("lt" in c && !((v as Date) < (c.lt as Date))) return false;
      if ("gte" in c && !((v as Date) >= (c.gte as Date))) return false;
      return true;
    }
    return v === cond;
  });

export function createFakePrisma() {
  const tables: Record<string, Row[]> = { user: [], watchlist: [], holding: [], order: [], alert: [], sip: [], guestCreation: [] };
  const fk = ["watchlist", "holding", "order", "alert", "sip"];

  const checkUnique = (table: string, row: Row, ignore?: Row) => {
    for (const key of UNIQUE[table] ?? []) {
      if (key.some((k) => row[k] === null || row[k] === undefined)) continue;
      if (tables[table].some((r) => r !== ignore && key.every((k) => r[k] === row[k]))) throw new Error(`Unique constraint failed on ${table}(${key.join(",")})`);
    }
  };
  const delegate = (table: string) => {
    const withDefaults = (data: Row): Row => ({ id: `${table}_${++seq}`, ...DEFAULTS[table](), ...data });
    return {
      findUnique: async ({ where }: { where: Where }) => tables[table].find((r) => matches(r, where)) ?? null,
      findMany: async ({ where, orderBy, take }: { where?: Where; orderBy?: Record<string, "asc" | "desc">; take?: number } = {}) => {
        let rows = tables[table].filter((r) => matches(r, where));
        if (orderBy) {
          const [[k, dir]] = Object.entries(orderBy);
          rows = [...rows].sort((a, b) => ((a[k] as number | Date) < (b[k] as number | Date) ? -1 : (a[k] as number | Date) > (b[k] as number | Date) ? 1 : 0) * (dir === "desc" ? -1 : 1));
        }
        return take ? rows.slice(0, take) : rows;
      },
      count: async ({ where }: { where?: Where } = {}) => tables[table].filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Row }) => {
        const row = withDefaults(data);
        checkUnique(table, row);
        tables[table].push(row);
        return row;
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const d of data) {
          const row = withDefaults(d);
          checkUnique(table, row);
          tables[table].push(row);
        }
        return { count: data.length };
      },
      update: async ({ where, data }: { where: Where; data: Row }) => {
        const row = tables[table].find((r) => matches(r, where));
        if (!row) throw new Error(`No ${table} row to update`);
        const next = { ...row, ...data };
        checkUnique(table, next, row);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where?: Where; data: Row }) => {
        const rows = tables[table].filter((r) => matches(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      deleteMany: async ({ where }: { where?: Where } = {}) => {
        const gone = tables[table].filter((r) => matches(r, where));
        tables[table] = tables[table].filter((r) => !gone.includes(r));
        if (table === "user") for (const t of fk) tables[t] = tables[t].filter((r) => !gone.some((u) => u.id === r.userId));
        return { count: gone.length };
      },
    };
  };
  const db: Record<string, unknown> = {
    user: delegate("user"),
    watchlist: delegate("watchlist"),
    holding: delegate("holding"),
    order: delegate("order"),
    alert: delegate("alert"),
    sip: delegate("sip"),
    guestCreation: delegate("guestCreation"),
    $transaction: async (ops: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => (typeof ops === "function" ? ops(db) : Promise.all(ops)),
  };
  return { db, tables };
}
