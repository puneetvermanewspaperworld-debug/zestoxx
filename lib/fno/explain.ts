import { evaluate, marginKind, type GreekRow, type Market, type PreparedLeg, type StaticResult } from "./engine";
import type { StrikeColumn } from "./strikes";
import { CMP_MOVES } from "./strikes";
import { TONE_CLASS, nf, pct, rs, rsS, tone, type Tone } from "./format";

/**
 * The page's plain-language commentary. Each line is a small HTML string built only from numbers
 * and fixed words (underlying names come from our own table), so it is safe to render as HTML.
 */

export type LineKind = "" | "warn" | "bad" | "good";
export interface Line {
  kind: LineKind;
  html: string;
}

const b = (t: Tone, text: string) => `<b class="${TONE_CLASS[t]}">${text}</b>`;

export function explain(
  P: PreparedLeg[],
  m: Market,
  st: StaticResult,
  sc: ReturnType<typeof evaluate>,
  gk: { net: { delta: number; gamma: number; theta: number; vega: number } },
  name: string,
  exitDays: number
): Line[] {
  const L: Line[] = [];
  const spot = m.spot;
  const T0 = m.dte / 365;
  const sigT = (m.iv / 100) * Math.sqrt(T0);

  for (const l of P) {
    const what = l.type === "FUT" ? `${name} future` : `${name} ${nf(l.strike)} ${l.type === "CE" ? "call" : "put"}`;
    const src = l.priceSource === "chain" ? (l.quoteBasis === "mid" ? " (middle of the live bid and ask)" : " (live chain price)") : l.priceSource === "typed" ? " (your price)" : " (model price)";
    L.push({
      kind: "",
      html: `<b>${l.sign > 0 ? "Buy" : "Sell"} ${l.lots} lot${l.lots > 1 ? "s" : ""} (${nf(l.qty)} qty) ${what}</b> at ${rs(l.entry, 2)}${src}${l.ivNote === "implied" ? `, implied volatility ${((l.iv as number) * 100).toFixed(1)}%` : ""}.`,
    });
  }

  const debit = P.reduce((a, l) => a + (l.isOpt ? l.sign * l.entry * l.qty : 0), 0);
  const hasShort = P.some((l) => l.sign < 0 || !l.isOpt);
  if (P.some((l) => l.isOpt)) {
    if (debit > 0.5) L.push({ kind: "", html: `You pay <b>${rs(debit)}</b> upfront as premium.${hasShort ? "" : " That is the most you can lose, plus charges."}` });
    else if (debit < -0.5) L.push({ kind: "warn", html: `You receive <b>${rs(-debit)}</b> upfront, but the risk you take on can be far larger than that.` });
  }
  const margin = marginKind(P);
  if (margin === "full") {
    L.push({ kind: "warn", html: "This trade needs margin, not just premium. Check the exact amount in your broker’s margin calculator before you place it." });
  } else if (margin === "hedged") {
    L.push({ kind: "", html: "Margin is usually lower for hedged spreads. Check the exact amount in your broker's margin calculator." });
  }
  L.push({
    kind: st.unlimLoss ? "bad" : "",
    html: `Worst case at expiry, after charges: ${b("down", st.unlimLoss ? "unlimited loss" : rs(st.minV))}. Best case: ${b("up", st.unlimProfit ? "unlimited profit" : rs(st.maxV))}.`,
  });

  if (st.beNet.length) {
    const parts = st.beNet.map((x) => `<b>${nf(x)}</b> (${pct((x / spot - 1) * 100)})`).join(" and ");
    let extra = "";
    if (st.beGross.length === st.beNet.length && st.beNet.length === 1) {
      const dpt = Math.abs(st.beNet[0] - st.beGross[0]);
      extra = dpt >= 1
        ? ` Charges alone push this out by about ${nf(dpt)} ${Math.round(dpt) === 1 ? "point" : "points"} (before charges it would be ${nf(st.beGross[0])}).`
        : " Charges barely move this level.";
    }
    L.push({ kind: "", html: `You break even at expiry if ${name} finishes at ${parts}.${extra}` });
  } else L.push({ kind: "", html: "There is no breakeven level inside the range that was checked." });

  L.push({ kind: st.pop >= 0.5 ? "good" : "", html: `Chance of finishing in profit at expiry: <b>about ${Math.round(st.pop * 100)}%</b>. This is a model estimate that assumes the volatility you entered is right.` });

  const th = gk.net.theta;
  if (Math.abs(th) > 0.5) {
    const ofPrem = Math.abs(debit) > 1 ? (Math.abs(th) / Math.abs(debit)) * 100 : null;
    if (th < 0) L.push({ kind: "warn", html: `Time works against you. If nothing moves, you lose about ${b("down", `${rs(-th)} a day`)}${ofPrem && debit > 0 ? ` (about ${ofPrem.toFixed(1)}% of the premium)` : ""}, and decay speeds up as expiry gets closer.` });
    else L.push({ kind: "", html: `Time works for you. If nothing moves, you gain about ${b("up", `${rs(th)} a day`)}. A big move against you can wipe out many days of this in one session.` });
  }

  const mv = m.step * 2;
  const gUp = evaluate(P, m, spot + mv, 0, 0, "square").gross;
  const gDn = evaluate(P, m, spot - mv, 0, 0, "square").gross;
  const lots = Math.abs(gk.net.delta) / m.lot;
  L.push({
    kind: "",
    html: `If ${name} moves <b>${nf(mv)} points</b> today: up gives about ${b(tone(gUp), rsS(gUp))}, down gives about ${b(tone(gDn), rsS(gDn))}. Right now your position behaves like being <b>${gk.net.delta >= 0 ? "long " : "short "}${nf(lots, 2)} lot${lots === 1 ? "" : "s"} of ${name}</b> (about ${rs(Math.abs(gk.net.delta) * spot)} of exposure).`,
  });
  if (Math.abs(gk.net.vega) > 0.5) {
    L.push({ kind: "", html: `If the VIX rises by 1 point you gain about ${b(tone(gk.net.vega), rsS(gk.net.vega))}; if it falls by 1 point you lose the opposite. Option buyers are hurt when the VIX drops after an event, even if the index moves their way.` });
  }
  const d1 = spot * (m.iv / 100) * Math.sqrt(1 / 365);
  L.push({ kind: "", html: `A volatility of ${m.iv.toFixed(1)} means the market expects about <b>±${nf(d1)} points per day</b> and <b>±${nf(spot * sigT)} points by expiry</b> (about 2 days in 3).` });

  const ptsCover = Math.abs(gk.net.delta) > 0.5 ? sc.total / Math.abs(gk.net.delta) : null;
  const ptsTxt = ptsCover == null ? "" : ptsCover < 10 ? nf(ptsCover, 1) : nf(ptsCover);
  L.push({ kind: "", html: `Charges at the exit you picked come to <b>${rs(sc.total)}</b>${ptsCover ? `, so the index must move roughly <b>${ptsTxt} points</b> in your favour just to pay for them` : ""}.` });
  if (m.exitStyle === "expire" && sc.sttEx > 0) {
    L.push({ kind: "warn", html: `You hold an in-the-money option to expiry, so you pay <b>${rs(sc.sttEx)}</b> extra STT on exercise. Squaring off before expiry avoids this.` });
  }
  if (sc.pre > 0) L.push({ kind: "good", html: `At your exit, profit after charges is ${b("up", rs(sc.pre))}. After about ${Math.round(m.slab * 1.04 * 10) / 10}% tax at your slab, ${b("up", rs(sc.net))} reaches your pocket.` });
  else if (sc.pre < -0.5) L.push({ kind: "bad", html: `At your exit, the result after charges is ${b("down", rs(sc.pre))}. No tax is due, and the loss can usually be set off against future F&amp;O profit.` });
  void exitDays;
  return L;
}

/* ------------------------------------------------------ strike comparison --- */

const label = (c: StrikeColumn) => (c.kind === "ATM" ? "ATM" : `${c.kind} ${c.dist.toFixed(1)}%`);
export const columnLabel = label;

/** Index of the best element by `score` (highest if `max`), ignoring non-finite scores; -1 if none. */
export function argBest<T>(arr: T[], score: (x: T) => number | null, max: boolean): number {
  let bi = -1;
  let bv: number | null = null;
  arr.forEach((x, i) => {
    const v = score(x);
    if (v == null || !isFinite(v)) return;
    if (bv == null || (max ? v > bv : v < bv)) { bv = v; bi = i; }
  });
  return bi;
}

export function compareInsights(cols: StrikeColumn[], risk: number, dir: "CE" | "PE"): Line[] {
  if (!cols.length) return [];
  const L: Line[] = [];
  const lab = (i: number) => `<b>${label(cols[i])} ${nf(cols[i].K)}</b>`;
  const fit = cols.filter((x) => x.lots >= 1);
  L.push(fit.length
    ? { kind: "", html: `Strikes that fit within your <b>${rs(risk)}</b> limit for at least 1 lot: ${fit.map((x) => `${label(x)} ${nf(x.K)} (${x.lots} lot${x.lots > 1 ? "s" : ""})`).join(", ")}.` }
    : { kind: "warn", html: `No strike fits within ${rs(risk)} for even 1 lot. The cheapest worst case is ${rs(Math.min(...cols.map((x) => x.worst)))}. Raise the limit or pick a cheaper strike.` });

  const iP = argBest(cols, (x) => x.pop, true);
  L.push({ kind: "", html: `Highest chance of profit at expiry: ${lab(iP)} at ${Math.round(cols[iP].pop * 100)}%. It also costs ${rs(cols[iP].cost)} for 1 lot.` });
  const iD = argBest(cols, (x) => x.decayPct, false);
  const iDh = argBest(cols, (x) => x.decayPct, true);
  L.push({ kind: "", html: `Least time decay for each rupee you put in: ${lab(iD)} (${cols[iD].decayPct.toFixed(1)}% of cost per day). The highest is ${lab(iDh)} at ${cols[iDh].decayPct.toFixed(1)}%.` });

  const sign = dir === "CE" ? 1 : -1;
  for (const mv of [1, 2]) {
    const mi = CMP_MOVES.indexOf(mv * sign);
    const roi = (x: StrikeColumn) => (x.worst > 0 ? (x.cells[mi] / x.worst) * 100 : null);
    const bi = argBest(cols, roi, true);
    if (bi < 0) continue;
    const r = roi(cols[bi]) as number;
    L.push({ kind: "", html: `If the index moves ${mv}% your way by your exit, the best return on money at risk is ${lab(bi)} at ${b(tone(r), pct(r, 0))}, but it has only a ${Math.round(cols[bi].pop * 100)}% chance of profit at expiry and a ${Math.round(cols[bi].ruin * 100)}% chance of losing 90% or more.` });
  }
  const z = CMP_MOVES.indexOf(0);
  const iW = argBest(cols, (x) => (x.worst > 0 ? (x.cells[z] / x.worst) * 100 : null), false);
  if (iW >= 0) L.push({ kind: "warn", html: `If the index goes nowhere, every strike loses money. The biggest loss as a share of cost is on ${lab(iW)} (${pct((cols[iW].cells[z] / cols[iW].worst) * 100, 0)}).` });
  L.push({ kind: "", html: "None of these is “best” on its own. The model prices every strike fairly, so the choice changes the shape of your risk, not the average result. Deeper in-the-money strikes cost more and win more often; far out-of-the-money strikes cost little, pay a lot on a big move, and usually expire worthless. Fixed brokerage is also a bigger share of a cheap option." });
  return L;
}

export type { GreekRow };
