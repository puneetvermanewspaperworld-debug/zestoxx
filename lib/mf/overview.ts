import { TILES, TILE_BY_ID, tilesFor, type TileId } from "./categories";
import { returnsOf, type NavPoint, type Returns } from "./returns";

/** One scheme as the pages see it. */
export interface FundRow {
  code: number;
  name: string;
  amc: string;
  category: string;
  nav: number;
  /** YYYY-MM-DD */
  navDate: string;
  ret1m: number | null;
  ret6m: number | null;
  ret1y: number | null;
  ret3y: number | null;
  ret5y: number | null;
}

export type ReturnKey = "ret1m" | "ret6m" | "ret1y" | "ret3y" | "ret5y";
export const RETURN_COLUMNS: { key: ReturnKey; label: string }[] = [
  { key: "ret1m", label: "1M" },
  { key: "ret6m", label: "6M" },
  { key: "ret1y", label: "1Y" },
  { key: "ret3y", label: "3Y" },
  { key: "ret5y", label: "5Y" },
];

export function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export interface TileSummary {
  id: TileId;
  label: string;
  blurb: string;
  count: number;
  /** median 1-year and 3-year (annualised) return of the schemes in the tile that have one; null when none do */
  median1y: number | null;
  median3y: number | null;
}

/** Counts and median returns per tile. A scheme counts once in every tile its category belongs to. */
export function buildOverview(rows: FundRow[]): TileSummary[] {
  return TILES.map((t) => {
    const inT = rows.filter((r) => tilesFor(r.category).includes(t.id));
    return { id: t.id, label: t.label, blurb: t.blurb, count: inT.length, median1y: median(inT.map((r) => r.ret1y)), median3y: median(inT.map((r) => r.ret3y)) };
  });
}

export const rowsForTile = (rows: FundRow[], tile: TileId): FundRow[] => rows.filter((r) => tilesFor(r.category).includes(tile));

/** Sort by a return, best first; schemes with no figure for it go last, in name order. */
export function sortByReturn(rows: FundRow[], key: ReturnKey): FundRow[] {
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || a.name.localeCompare(b.name);
  });
}

export const isTileId = (s: string): s is TileId => s in TILE_BY_ID;

export interface SchemeDetail {
  scheme: FundRow & { isin: string | null };
  /** oldest first */
  series: NavPoint[];
  returns: Returns;
}

/** The detail a scheme page needs, from the stored row and its stored NAVs (oldest first). */
export function buildDetail(scheme: FundRow & { isin: string | null }, series: NavPoint[]): SchemeDetail {
  return { scheme, series, returns: returnsOf(series) };
}
