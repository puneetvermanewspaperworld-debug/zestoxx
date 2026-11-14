import { PrismaClient } from "@prisma/client";
import { istDateString } from "../lib/helpers";
import { fetchAmfiText, navHistoryUrl, NAV_ALL_URL, refreshReturns, toSchemeRow, type SchemeRow } from "../lib/mf/ingest";
import { parseNavAll, parseNavHistory } from "../lib/mf/parse";
import { BYTES_PER_NAV_ROW, candidates, planDays, type PlannedDay } from "../lib/mf/plan";
import { makeMfStore } from "../lib/mf/store";
import { COVERAGE_LABEL, trackedSchemes } from "../lib/mf/universe";

/**
 * Mutual fund NAV history: dry run, database check, and backfill. Run from your own computer.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/mf-backfill.ts            DRY RUN (the default): reads AMFI, counts rows, writes nothing
 *   npx tsx --tsconfig tsconfig.json scripts/mf-backfill.ts --check    database size, what the new tables would add, headroom
 *   npx tsx --tsconfig tsconfig.json scripts/mf-backfill.ts --write    the backfill (resumable: a day already stored is skipped)
 *
 * The database URL comes ONLY from the environment variable MF_DATABASE_URL, which you set yourself in your own terminal session
 * (PowerShell: $env:MF_DATABASE_URL = "..."). It is never read from a file, never printed, never written anywhere. Use the direct
 * (non-pooled) connection string. DB_LIMIT_MB (also set by you) is your plan's storage limit in MB, for the headroom figure.
 *
 * Covers Direct plans, Growth option, open ended schemes only. NAV data is AMFI's; see docs/mf/DATA-APPROACH.md on its terms of use.
 */

const args = new Set(process.argv.slice(2));
const MODE = args.has("--write") ? "write" : args.has("--check") ? "check" : "dry";
const SLEEP_MS = 1500;
const url = process.env.MF_DATABASE_URL;
const limitMb = process.env.DB_LIMIT_MB ? Number(process.env.DB_LIMIT_MB) : null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;
const n = (v: number) => v.toLocaleString("en-IN");

function connect(): PrismaClient {
  if (!url) {
    console.error("MF_DATABASE_URL is not set. Set it in this terminal session only, for example (PowerShell):\n  $env:MF_DATABASE_URL = \"<your direct database URL>\"");
    process.exit(2);
  }
  return new PrismaClient({ datasourceUrl: url, log: [] });
}

/** A database error described without its message, which can carry connection details. */
function describe(e: unknown): string {
  const code = (e as { code?: string })?.code;
  return `database error${code ? ` (${code})` : ""}; check MF_DATABASE_URL, that the migrations are applied, and that the database is reachable`;
}

async function liveSchemes(): Promise<SchemeRow[]> {
  const parsed = parseNavAll(await fetchAmfiText(NAV_ALL_URL));
  const tracked = trackedSchemes(parsed.items, istDateString());
  console.log(`AMFI NAV file: ${n(parsed.items.length)} rows read, ${n(parsed.skipped.length)} skipped, ${n(tracked.length)} tracked (${COVERAGE_LABEL}, fresh, not matured)`);
  return tracked.map(toSchemeRow);
}

/** NAV rows for the tracked codes on the first of a day's candidate dates that has any. */
async function fetchDay(p: PlannedDay, codes: Set<number>): Promise<{ date: string; rows: { code: number; date: string; nav: number }[] } | null> {
  for (const date of candidates(p)) {
    const { items } = parseNavHistory(await fetchAmfiText(navHistoryUrl(date)));
    const rows = items.filter((r) => codes.has(Number(r.code))).map((r) => ({ code: Number(r.code), date: r.date, nav: r.nav }));
    if (rows.length > 0) return { date, rows };
  }
  return null;
}

async function dryRun() {
  console.log("DRY RUN: nothing is written to any database.\n");
  const schemes = await liveSchemes();
  const codes = new Set(schemes.map((s) => s.code));
  const today = istDateString();
  const plan = planDays(today);
  const daily = plan.filter((p) => p.kind === "daily").length;
  const weekly = plan.length - daily;
  console.log(`Plan: ${n(plan.length)} days to fetch (${n(daily)} daily over the last 400 days, ${n(weekly)} weekly Fridays before that), oldest ${plan[plan.length - 1].date}`);
  console.log(`      about ${n(plan.length)} requests of 1 MB each; at roughly ${SLEEP_MS / 1000} s of pause plus 3-10 s per request, about ${Math.round((plan.length * (SLEEP_MS / 1000 + 6)) / 60)} minutes\n`);

  // Three sample days from the plan: a recent one, one in the middle and the oldest weekly one. Counted for real from AMFI.
  const picks = [plan[2], plan[Math.floor(plan.length / 2)], plan[plan.length - 1]];
  const counts: number[] = [];
  for (const p of picks) {
    const got = await fetchDay(p, codes);
    counts.push(got ? got.rows.length : 0);
    console.log(`  sample ${p.kind.padEnd(6)} ${p.date}${got && got.date !== p.date ? ` (used ${got.date})` : ""}: ${got ? n(got.rows.length) : "no NAVs"} rows for the ${n(codes.size)} tracked schemes`);
    await sleep(SLEEP_MS);
  }
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const lo = Math.min(...counts) * plan.length;
  const hi = Math.max(...counts) * plan.length;
  const mid = Math.round(avg * plan.length);
  console.log(`\nExpected NAV rows: about ${n(mid)} (between ${n(lo)} and ${n(hi)}; older days have fewer schemes because funds launched later)`);
  console.log(`Expected size: about ${mb(mid * BYTES_PER_NAV_ROW)} for MfNav (${BYTES_PER_NAV_ROW} bytes a row, an estimate), plus under 1 MB for ${n(codes.size)} schemes`);
  console.log(`Growth after that: about ${n(codes.size)} rows a night, roughly ${mb(codes.size * 260 * BYTES_PER_NAV_ROW)} a year`);

  if (url) {
    const db = connect();
    try {
      const [{ nav, sch }] = await db.$queryRaw<{ nav: bigint; sch: bigint }[]>`SELECT (SELECT count(*) FROM "MfNav") AS nav, (SELECT count(*) FROM "MfScheme") AS sch`;
      console.log(`\nDatabase (read only): ${n(Number(sch))} schemes and ${n(Number(nav))} NAV rows are stored already`);
    } catch (e) {
      console.log(`\nDatabase not read: ${describe(e)}`);
    } finally {
      await db.$disconnect();
    }
  } else {
    console.log("\nMF_DATABASE_URL is not set, so nothing about your database was read. Use --check with it set to see size and headroom.");
  }
  console.log("\nNothing was written.");
}

async function check() {
  const db = connect();
  try {
    const [{ size }] = await db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    const used = Number(size);
    const tables = await db.$queryRaw<{ name: string; bytes: bigint }[]>`
      SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE c.relkind = 'r' AND ns.nspname = 'public' ORDER BY bytes DESC LIMIT 8`;
    const mf = tables.filter((t) => t.name === "MfNav" || t.name === "MfScheme");
    console.log(`Database size now: ${mb(used)}`);
    console.log("Largest tables:");
    for (const t of tables) console.log(`  ${t.name.padEnd(18)} ${mb(Number(t.bytes))}`);
    if (mf.length === 0) console.log("  (the mutual fund tables do not exist yet: the migration has not been applied to this database)");

    const plan = planDays(istDateString());
    const schemes = (await liveSchemes()).length;
    const estRows = Math.round(plan.length * schemes * 0.85); // see the dry run for a counted figure
    const estBytes = estRows * BYTES_PER_NAV_ROW + schemes * 300;
    console.log(`\nThe new tables would add about ${mb(estBytes)} (an estimate: ${n(estRows)} rows; run the dry run for counted figures).`);
    if (limitMb && Number.isFinite(limitMb)) {
      const headroom = limitMb * 1_048_576 - used;
      console.log(`Your limit (DB_LIMIT_MB): ${limitMb} MB. Headroom today: ${mb(headroom)}. After the backfill: ${mb(headroom - estBytes)} (${(((headroom - estBytes) / (limitMb * 1_048_576)) * 100).toFixed(0)}% of the limit free).`);
      if (headroom - estBytes < 0.1 * limitMb * 1_048_576) console.log("WARNING: less than 10% of the limit would be left. Consider fewer days or upgrading before writing.");
    } else {
      console.log("DB_LIMIT_MB is not set, so there is no headroom figure. Set it to your plan's storage limit in MB (your provider's usage page shows it).");
    }
  } catch (e) {
    console.error(describe(e));
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

async function write() {
  if (!limitMb && !args.has("--i-checked-storage")) {
    console.error("Refusing to write: DB_LIMIT_MB is not set. Run with --check first, or pass --i-checked-storage once you have looked at your plan's limit and usage.");
    process.exit(2);
  }
  const db = connect();
  const store = makeMfStore(db);
  try {
    const schemes = await liveSchemes();
    const codes = new Set(schemes.map((s) => s.code));
    await store.upsertSchemes(schemes);
    const today = await store.insertNavs(schemes.map((s) => ({ code: s.code, date: s.navDate, nav: s.nav })));
    console.log(`Schemes stored; today's NAV rows added: ${n(today)}`);

    const have = new Set((await db.$queryRaw<{ d: string }[]>`SELECT DISTINCT to_char("date", 'YYYY-MM-DD') AS d FROM "MfNav"`).map((r) => r.d));
    const plan = planDays(istDateString());
    let added = 0;
    let done = 0;
    let failures = 0;
    for (const p of plan) {
      done++;
      if (candidates(p).some((d) => have.has(d))) continue;
      try {
        const got = await fetchDay(p, codes);
        failures = 0;
        if (got) {
          added += await store.insertNavs(got.rows);
          have.add(got.date);
        }
      } catch (e) {
        failures++;
        console.log(`  ${p.date}: failed (${e instanceof Error ? e.message : "error"}); will be picked up on a re-run`);
        if (failures >= 5) {
          console.error("Five failures in a row; stopping. Run the same command again to continue where it stopped.");
          break;
        }
        await sleep(5000);
        continue;
      }
      if (done % 10 === 0) console.log(`  ${done}/${plan.length} days, ${n(added)} NAV rows added so far`);
      await sleep(SLEEP_MS);
    }
    const updated = await refreshReturns(store, schemes);
    console.log(`Done. ${n(added)} NAV rows added; returns refreshed for ${n(updated)} schemes. Run --check to see the size.`);
  } catch (e) {
    console.error(describe(e));
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

(MODE === "write" ? write() : MODE === "check" ? check() : dryRun()).catch((e) => {
  console.error(e instanceof Error ? e.message : "failed");
  process.exit(1);
});
