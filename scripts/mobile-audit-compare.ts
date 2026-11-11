/**
 * Writes the human-readable audit documents from the two JSON results:
 *   docs/mobile-audit/BEFORE-AFTER.md      one row per route, before -> after, at 360 / 390 / 414
 *   docs/mobile-audit/before/PROBLEMS.md   what was wrong on each route and size (with example elements)
 *
 *   npm run audit:compare        (after running audit:mobile for "before" and "after")
 */
import fs from "node:fs";
import path from "node:path";

interface M {
  pageScroll: number;
  wide: string[];
  clipped: string[];
  tableOverflow: string[];
  wideScrollTables: number;
  under12: number;
  under14: number;
  smallText: Record<string, number>;
  smallTargets: number;
  smallTargetSamples: string[];
  totalTargets: number;
  smallInputs: number;
  smallInputSamples: string[];
  lowContrast: number;
  lowSamples: string[];
  overlaps: string[];
  tickerHeight: number | null;
}
const dir = path.join("docs", "mobile-audit");
const load = (p: string): Record<string, M> => JSON.parse(fs.readFileSync(path.join(dir, p, "findings.json"), "utf8"));
const before = load("before");
const after = load("after");
const widths = [360, 390, 414];
const routes = [...new Set(Object.keys(before).map((k) => k.split("@")[0]))];
const arrow = (a: number, b: number) => (a === b ? `${a}` : `${a} → ${b}`);

let doc = `# Mobile audit: before and after\n\nMeasured in Chrome with a phone user agent. Each cell is "before → after". Screenshots: \`before/\` and \`after/\` (route-width.jpg, full page, JPEG to keep the repo small).\n\n`;
doc += `Columns: **page scroll** = how many px wider than the screen the page is; **cut off** = content clipped by an overflow-hidden box or a table sticking out of the page; **side-scroll tables** = tables that need sideways scrolling inside their own box (allowed when the first column stays pinned); **text <12px** = elements with text under 12px; **targets <44px** = interactive elements smaller than 44px (a 44px invisible hit area counts as ok); **inputs <16px** = fields that make phones zoom on focus; **low contrast** = text under 4.5:1; **ticker** = ticker strip height.\n\n`;
for (const w of widths) {
  doc += `## ${w}px wide\n\n| route | page scroll | cut off | side-scroll tables | text <12px | targets <44px | inputs <16px | low contrast | ticker |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of routes) {
    const b = before[`${r}@${w}`];
    const a = after[`${r}@${w}`];
    if (!b || !a) continue;
    const cut = (m: M) => m.clipped.length + m.tableOverflow.length;
    doc += `| ${r} | ${arrow(Math.max(0, b.pageScroll), Math.max(0, a.pageScroll))} | ${arrow(cut(b), cut(a))} | ${arrow(b.wideScrollTables, a.wideScrollTables)} | ${arrow(b.under12, a.under12)} | ${arrow(b.smallTargets, a.smallTargets)} | ${arrow(b.smallInputs, a.smallInputs)} | ${arrow(b.lowContrast, a.lowContrast)} | ${b.tickerHeight == null ? "-" : `${Math.round(b.tickerHeight)} → ${Math.round(a.tickerHeight ?? 0)}`} |\n`;
  }
  doc += "\n";
}
doc += `### Still scrolling sideways on purpose\n\n`;
for (const r of routes) {
  const a = after[`${r}@360`];
  if (a && a.wideScrollTables) doc += `- **${r}**: ${a.wideScrollTables} table(s) scroll inside their own box with the first column pinned (the options chain, and the strike-comparison tables whose columns are strikes). The page itself never scrolls sideways.\n`;
}
fs.writeFileSync(path.join(dir, "BEFORE-AFTER.md"), doc);

let probs = `# Problems found, per route (before the fixes)\n\nFrom \`before/findings.json\`. Counts are the same at 360, 390 and 414px unless noted; example elements are from the 360px run.\n\n`;
for (const r of routes) {
  const m = before[`${r}@360`];
  if (!m) continue;
  const lines: string[] = [];
  if (m.pageScroll > 1) lines.push(`**Page scrolls sideways by ${m.pageScroll}px.** ${m.wide.slice(0, 3).map((x) => `\`${x}\``).join(", ")}`);
  if (m.wideScrollTables) lines.push(`${m.wideScrollTables} table(s) need sideways scrolling, so some columns (for example amounts) are off-screen until you scroll.`);
  if (m.clipped.length || m.tableOverflow.length) lines.push(`Content cut off: ${[...m.clipped, ...m.tableOverflow].slice(0, 3).map((x) => `\`${x}\``).join(", ")}`);
  if (m.under12) lines.push(`${m.under12} elements with text under 12px (${Object.entries(m.smallText).map(([k, v]) => `${k}×${v}`).join(", ")}); ${m.under14} under 14px.`);
  if (m.smallTargets) lines.push(`${m.smallTargets} of ${m.totalTargets} tap targets under 44px, e.g. ${m.smallTargetSamples.slice(0, 2).map((x) => `\`${x}\``).join(", ")}`);
  if (m.smallInputs) lines.push(`${m.smallInputs} form fields under 16px (phones zoom in on focus): ${m.smallInputSamples.slice(0, 2).map((x) => `\`${x}\``).join(", ")}`);
  if (m.lowContrast) lines.push(`${m.lowContrast} text elements under 4.5:1 contrast, e.g. ${m.lowSamples.slice(0, 2).map((x) => `\`${x}\``).join(", ")}`);
  if (m.overlaps.length) lines.push(`Overlapping fixed bars: ${m.overlaps.slice(0, 2).join("; ")}`);
  if (m.tickerHeight) lines.push(`Ticker strip is ${Math.round(m.tickerHeight)}px tall (target 32px).`);
  probs += `## ${r}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\n`;
}
fs.writeFileSync(path.join(dir, "before", "PROBLEMS.md"), probs);
console.log("wrote BEFORE-AFTER.md and before/PROBLEMS.md");
