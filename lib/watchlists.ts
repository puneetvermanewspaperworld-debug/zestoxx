/**
 * Watchlist shapes and the curated "Popular Watchlists". Shared by the API route that
 * prices them and the UI that lists them.
 *
 * Static lists are plain NSE trading symbols (validated against the instrument master
 * when the list is priced — a delisted symbol simply drops out). Dynamic lists are
 * computed from today's prices. Curated lists are for browsing, not recommendations.
 */

export interface WatchRow {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  /** null when there is no previous close to compare with */
  changePct: number | null;
  volume: number;
  /** 52-week extremes, only on the 52-week lists */
  hi52?: number;
  lo52?: number;
}

export type WatchlistResponse =
  | { source: "live"; asOf: string; rows: WatchRow[]; note?: string }
  | { source: "unavailable" };

export type PopularKind =
  /** fixed symbols */
  | { type: "static"; symbols: string[] }
  /** ISIN-INF (fund-unit) NSE instruments whose name matches, most traded first */
  | { type: "etf"; pattern?: string }
  | { type: "gainers" }
  | { type: "losers" }
  | { type: "high52" }
  | { type: "low52" };

export interface PopularList {
  id: string;
  name: string;
  blurb: string;
  /** tinted card + "Editorial" tag — Zestoxx's own seasonal theme */
  editorial?: boolean;
  kind: PopularKind;
}

export const POPULAR_LISTS: PopularList[] = [
  {
    id: "gainers",
    name: "Top Gainers",
    blurb: "Biggest % risers today across NSE (liquid stocks only)",
    kind: { type: "gainers" },
  },
  {
    id: "losers",
    name: "Top Losers",
    blurb: "Biggest % fallers today across NSE (liquid stocks only)",
    kind: { type: "losers" },
  },
  {
    id: "high52",
    name: "52 Week High",
    blurb: "F&O stocks trading closest to their 52-week high",
    kind: { type: "high52" },
  },
  {
    id: "low52",
    name: "52 Week Low",
    blurb: "F&O stocks trading closest to their 52-week low",
    kind: { type: "low52" },
  },
  {
    id: "all-etf",
    name: "All ETF",
    blurb: "The most actively traded ETFs on NSE today",
    kind: { type: "etf" },
  },
  {
    id: "gold-etf",
    name: "Gold ETF",
    blurb: "Exchange-traded funds that track gold",
    kind: { type: "etf", pattern: "gold" },
  },
  {
    id: "silver-etf",
    name: "Silver ETF",
    blurb: "Exchange-traded funds that track silver",
    kind: { type: "etf", pattern: "silver" },
  },
  {
    id: "nifty-etf",
    name: "Nifty ETF",
    blurb: "Index funds on Nifty 50, Next 50, 100 and Bank Nifty",
    kind: {
      type: "static",
      symbols: [
        "NIFTYBEES", "JUNIORBEES", "NIFTY1", "NIFTYBETA", "NIFTYCASE", "NIFTYETF", "BSLNIFTY", "ENIFTY",
        "IVZINNIFTY", "NIF100BEES", "MOM50", "LICNETFN50", "ENEXT50", "MONEXT50", "NEXT50BETA", "BANKBEES",
      ],
    },
  },
  {
    id: "fmcg",
    name: "FMCG Sector",
    blurb: "Packaged food, beverages and household brands",
    kind: {
      type: "static",
      symbols: [
        "HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA", "TATACONSUM", "DABUR", "GODREJCP", "MARICO",
        "COLPAL", "VBL", "UNITDSPR", "EMAMILTD", "PATANJALI", "RADICO",
      ],
    },
  },
  {
    id: "defence",
    name: "Defence Sector",
    blurb: "Aerospace, shipbuilding and defence electronics",
    kind: {
      type: "static",
      symbols: [
        "HAL", "BEL", "BDL", "MAZDOCK", "COCHINSHIP", "BEML", "SOLARINDS", "DATAPATTNS",
        "ASTRAMICRO", "PARAS", "MTARTECH", "GRSE",
      ],
    },
  },
  {
    id: "healthcare",
    name: "Healthcare",
    blurb: "Pharma makers and hospital chains",
    kind: {
      type: "static",
      symbols: [
        "SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "APOLLOHOSP", "LUPIN", "ZYDUSLIFE", "TORNTPHARM",
        "MAXHEALTH", "AUROPHARMA", "ALKEM", "MANKIND", "BIOCON", "FORTIS",
      ],
    },
  },
  {
    id: "technology",
    name: "Technology",
    blurb: "IT services, product and engineering firms",
    kind: {
      type: "static",
      symbols: [
        "TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "LTM", "PERSISTENT", "COFORGE", "MPHASIS", "OFSS",
        "KPITTECH", "TATAELXSI",
      ],
    },
  },
  {
    id: "automobile",
    name: "Automobile",
    blurb: "Carmakers, two-wheelers, commercial vehicles and parts",
    kind: {
      type: "static",
      symbols: [
        "MARUTI", "TMPV", "TMCV", "M&M", "BAJAJ-AUTO", "EICHERMOT", "HEROMOTOCO", "TVSMOTOR", "ASHOKLEY",
        "BOSCHLTD", "MOTHERSON", "BHARATFORG", "EXIDEIND",
      ],
    },
  },
  {
    id: "festive",
    name: "Festive Season",
    blurb: "Gold, jewellery, retail, consumer and autos — Zestoxx's Diwali theme",
    editorial: true,
    kind: {
      type: "static",
      symbols: [
        "TITAN", "KALYANKJIL", "SENCO", "TRENT", "DMART", "MARUTI", "HINDUNILVR", "ITC", "ASIANPAINT",
        "GOLDBEES", "HAVELLS", "VOLTAS", "BAJAJ-AUTO", "M&M", "NESTLEIND", "BRITANNIA",
      ],
    },
  },
];

export const POPULAR_BY_ID: Record<string, PopularList> = Object.fromEntries(
  POPULAR_LISTS.map((l) => [l.id, l])
);

/* ----------------------------------------------------------- custom lists ---- */

export interface CustomList {
  name: string;
  /** NSE trading symbols */
  symbols: string[];
}

/** Name of the always-present primary list (the sidebar one). */
export const PRIMARY_LIST = "My Watchlist";
export const MAX_LISTS = 10;
export const MAX_SYMBOLS_PER_LIST = 50;
export const MAX_LIST_NAME = 30;

/** Returns an error message, or null if `name` is usable for a new list. */
export function listNameError(name: string, existing: string[]): string | null {
  const n = name.trim();
  if (!n) return "Give the watchlist a name.";
  if (n.length > MAX_LIST_NAME) return `Keep the name under ${MAX_LIST_NAME} characters.`;
  if ([PRIMARY_LIST, "Explore"].some((r) => r.toLowerCase() === n.toLowerCase()) ||
      existing.some((e) => e.toLowerCase() === n.toLowerCase())) {
    return "A watchlist with that name already exists.";
  }
  if (existing.length >= MAX_LISTS) return `You can have up to ${MAX_LISTS} custom watchlists.`;
  return null;
}

/** NSE trading symbols look like RELIANCE, M&M, BAJAJ-AUTO — validate before they hit the API. */
export const isNseSymbol = (s: string): boolean => /^[A-Z0-9&-]{1,20}$/.test(s);
