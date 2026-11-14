import { NIFTY_INDEX_NAME, closesFrom, type IndexClose } from "./nifty";
import type { FiiDiiDayRow } from "./types";

/** What /api/fiidii answers: the stored FII/DII days and, alongside, Nifty 50's stored closes for those days. */
export interface FiiDiiPayload {
  status: "ok" | "empty" | "unavailable";
  rows: FiiDiiDayRow[];
  /** stored Nifty 50 closes covering the rows (and the days just before them); empty when none are stored or they could not be read */
  nifty: IndexClose[];
}

export interface PayloadDeps {
  listDays: (limit: number) => Promise<FiiDiiDayRow[]>;
  listCloses: (indexName: string, from: string, to: string) => Promise<IndexClose[]>;
}

/**
 * The days and the closes are read separately: the days failing is "unavailable" as before; the closes failing leaves the days
 * intact with no closes, so the Nifty % column shows "--" and nothing else on the page is affected.
 */
export async function buildFiiDiiPayload(deps: PayloadDeps, limit = 300): Promise<FiiDiiPayload> {
  let rows: FiiDiiDayRow[];
  try {
    rows = await deps.listDays(limit);
  } catch {
    return { status: "unavailable", rows: [], nifty: [] };
  }
  if (rows.length === 0) return { status: "empty", rows: [], nifty: [] };
  let nifty: IndexClose[] = [];
  try {
    nifty = await deps.listCloses(NIFTY_INDEX_NAME, closesFrom(rows[0].date), rows[rows.length - 1].date);
  } catch {
    nifty = [];
  }
  return { status: "ok", rows, nifty };
}
