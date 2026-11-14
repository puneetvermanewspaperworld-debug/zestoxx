/**
 * The category grid. AMFI's category names come in two generations ("Equity Scheme - Large Cap Fund" and the older
 * "Equity Schemes - Large Cap Fund", "Income/Debt Oriented Schemes" and "Debt Scheme"), and a scheme can sit in more than one tile:
 * a Large Cap fund is also an Equity fund. Every category lands in at least one tile; what matches none is "Others".
 */
export type TileId = "equity" | "equity-hybrid" | "tax-saver" | "large-cap" | "mid-cap" | "small-cap" | "debt" | "money-market" | "index" | "fof" | "others";

export const TILES: { id: TileId; label: string; blurb: string }[] = [
  { id: "equity", label: "Equity Funds", blurb: "Mainly shares" },
  { id: "equity-hybrid", label: "Equity Hybrid", blurb: "Shares mixed with bonds" },
  { id: "tax-saver", label: "Tax Saver", blurb: "ELSS, three-year lock-in" },
  { id: "large-cap", label: "Large Cap", blurb: "The biggest companies" },
  { id: "mid-cap", label: "Mid Cap", blurb: "Mid-sized companies" },
  { id: "small-cap", label: "Small Cap", blurb: "Smaller companies" },
  { id: "debt", label: "Debt Funds", blurb: "Bonds and other debt" },
  { id: "money-market", label: "Money Market Funds", blurb: "Very short-term debt" },
  { id: "index", label: "Index Funds", blurb: "Track an index" },
  { id: "fof", label: "FoFs", blurb: "Funds that hold other funds" },
  { id: "others", label: "Others", blurb: "Everything else" },
];

export const TILE_BY_ID: Record<TileId, (typeof TILES)[number]> = Object.fromEntries(TILES.map((t) => [t.id, t])) as Record<TileId, (typeof TILES)[number]>;

const norm = (c: string) => c.toLowerCase().replace(/\s+/g, " ").trim();

/** The tiles a category belongs to (never empty). */
export function tilesFor(category: string): TileId[] {
  const c = norm(category);
  const out = new Set<TileId>();
  const equity = /^equity schemes? -/.test(c);
  const hybrid = /^hybrid schemes? -/.test(c);
  const debt = /^(debt schemes? -|income\/debt oriented schemes -|income$|gilt$)/.test(c);
  const index = /^index funds -|^other schemes? - index funds/.test(c);
  const fof = /fund of funds|\bfof\b/.test(c);

  if (equity) out.add("equity");
  if (/\belss\b|tax saver/.test(c)) {
    out.add("tax-saver");
    out.add("equity");
  }
  if (equity && /- large cap fund$/.test(c)) out.add("large-cap");
  if (equity && /- mid cap fund$/.test(c)) out.add("mid-cap");
  if (equity && /- small cap fund$/.test(c)) out.add("small-cap");
  // hybrid funds that hold mostly shares; conservative hybrids hold mostly bonds and count as debt
  if (hybrid) out.add(/conservative hybrid/.test(c) ? "debt" : "equity-hybrid");
  if (debt) out.add("debt");
  if (/money market/.test(c)) {
    out.add("money-market");
    out.add("debt");
  }
  if (index) out.add("index");
  if (fof) out.add("fof");
  if (out.size === 0) out.add("others");
  return [...out];
}

/** Whether a category belongs to a tile. */
export const inTile = (category: string, tile: TileId): boolean => tilesFor(category).includes(tile);
