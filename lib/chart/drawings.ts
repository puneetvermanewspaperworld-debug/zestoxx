/**
 * Chart drawings. A drawing is stored by (time, price), never by pixels, so it stays where it belongs when the chart is zoomed, panned,
 * resized or switched to another timeframe. `time` is the bar's calendar day (seconds since the epoch at 00:00 UTC), the same time the
 * chart's bars carry; a time between two bars (or past the last one, for a ray) is allowed and is placed by interpolation.
 */
export interface Anchor {
  /** seconds since the epoch */
  time: number;
  price: number;
}

export type ToolId = "select" | "hline" | "trend" | "ray" | "rect" | "channel" | "text" | "measure";
export type DrawingKind = Exclude<ToolId, "select" | "measure">;
export type Dash = "solid" | "dashed" | "dotted";
export type Width = 1 | 2 | 3 | 4;

interface Base {
  id: string;
  color: string;
  width: Width;
  dash: Dash;
  locked: boolean;
}
export type HLine = Base & { kind: "hline"; price: number };
export type Trend = Base & { kind: "trend"; a: Anchor; b: Anchor };
export type Ray = Base & { kind: "ray"; a: Anchor; b: Anchor };
/** a range box: two opposite corners, a translucent fill, an optional dashed midline and a label with its height */
export type Rect = Base & { kind: "rect"; a: Anchor; b: Anchor; midline: boolean };
/** a parallel channel: a line through a and b, and a parallel one `offset` price units above it (negative: below) */
export type Channel = Base & { kind: "channel"; a: Anchor; b: Anchor; offset: number };
export type TextNote = Base & { kind: "text"; at: Anchor; text: string };
export type Drawing = HLine | Trend | Ray | Rect | Channel | TextNote;

export const COLORS = ["#2563eb", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6", "#06b6d4", "#475569", "#111827"] as const;
export const WIDTHS: Width[] = [1, 2, 3, 4];
export const DASHES: Dash[] = ["solid", "dashed", "dotted"];

/** Tools in the order the rail shows them. */
export const TOOLS: { id: ToolId; label: string; points: number }[] = [
  { id: "select", label: "Select", points: 0 },
  { id: "hline", label: "Horizontal level", points: 1 },
  { id: "trend", label: "Trendline", points: 2 },
  { id: "ray", label: "Ray", points: 2 },
  { id: "rect", label: "Range box", points: 2 },
  { id: "channel", label: "Parallel channel", points: 2 },
  { id: "text", label: "Text note", points: 1 },
  { id: "measure", label: "Measure", points: 2 },
];
export const pointsNeeded = (tool: ToolId): number => TOOLS.find((t) => t.id === tool)?.points ?? 0;

export const DEFAULT_STYLE: Record<DrawingKind, { color: string; width: Width; dash: Dash }> = {
  hline: { color: COLORS[3], width: 2, dash: "dashed" },
  trend: { color: COLORS[0], width: 2, dash: "solid" },
  ray: { color: COLORS[4], width: 2, dash: "solid" },
  rect: { color: COLORS[1], width: 1, dash: "solid" },
  channel: { color: COLORS[5], width: 2, dash: "solid" },
  text: { color: COLORS[7], width: 1, dash: "solid" },
};

let counter = 0;
/** A new id: time-ordered and unique within a session and across devices. */
export function newId(now: number = Date.now(), rand: () => number = Math.random): string {
  counter = (counter + 1) % 1_000_000;
  return `d${now.toString(36)}${counter.toString(36)}${Math.floor(rand() * 1e6).toString(36)}`;
}

/** The distance between a rectangle's two anchors in price, and as a per cent of its lower price: the range box's label. */
export function rangeStats(a: Anchor, b: Anchor): { points: number; pct: number } {
  const lo = Math.min(a.price, b.price);
  const points = Math.abs(b.price - a.price);
  return { points, pct: lo > 0 ? (points / lo) * 100 : 0 };
}

/** "Height 12.50 pts (0.84%)" */
export const rangeLabel = (a: Anchor, b: Anchor): string => {
  const s = rangeStats(a, b);
  return `Height ${s.points.toFixed(2)} pts (${s.pct.toFixed(2)}%)`;
};

/** A default offset for a new channel: 4% of the price the line sits at. */
export const defaultChannelOffset = (a: Anchor, b: Anchor): number => ((a.price + b.price) / 2) * 0.04;

/** Build a drawing from the points the user placed. null when there are not enough, or a number is not finite. */
export function createDrawing(kind: DrawingKind, pts: Anchor[], id: string = newId()): Drawing | null {
  const ok = (p?: Anchor): p is Anchor => !!p && Number.isFinite(p.time) && Number.isFinite(p.price);
  const base = { id, locked: false, ...DEFAULT_STYLE[kind] };
  switch (kind) {
    case "hline":
      return ok(pts[0]) ? { ...base, kind, price: pts[0].price } : null;
    case "text":
      return ok(pts[0]) ? { ...base, kind, at: pts[0], text: "Note" } : null;
    case "trend":
    case "ray":
      return ok(pts[0]) && ok(pts[1]) ? { ...base, kind, a: pts[0], b: pts[1] } : null;
    case "rect":
      return ok(pts[0]) && ok(pts[1]) ? { ...base, kind, a: pts[0], b: pts[1], midline: false } : null;
    case "channel":
      return ok(pts[0]) && ok(pts[1]) ? { ...base, kind, a: pts[0], b: pts[1], offset: defaultChannelOffset(pts[0], pts[1]) } : null;
  }
}

/** A copy with a new id, moved by `dTime` seconds and `dPrice`, and unlocked. */
export function cloneDrawing(d: Drawing, id: string, dTime: number, dPrice: number): Drawing {
  const shift = (p: Anchor): Anchor => ({ time: p.time + dTime, price: p.price + dPrice });
  const c = { ...d, id, locked: false };
  switch (c.kind) {
    case "hline":
      return { ...c, price: c.price + dPrice };
    case "text":
      return { ...c, at: shift(c.at) };
    default:
      return { ...c, a: shift(c.a), b: shift(c.b) };
  }
}

/** Move a whole drawing by `dTime` seconds and `dPrice`. */
export function moveDrawing<T extends Drawing>(d: T, dTime: number, dPrice: number): T {
  const shift = (p: Anchor): Anchor => ({ time: p.time + dTime, price: p.price + dPrice });
  switch (d.kind) {
    case "hline":
      return { ...d, price: d.price + dPrice };
    case "text":
      return { ...d, at: shift(d.at) };
    default:
      return { ...d, a: shift((d as Trend).a), b: shift((d as Trend).b) } as T;
  }
}

/** The price of the line through a and b at `time` (for a channel's parallel line). */
export function priceOnLine(a: Anchor, b: Anchor, time: number): number {
  if (b.time === a.time) return a.price;
  return a.price + ((b.price - a.price) * (time - a.time)) / (b.time - a.time);
}

/** Drag one handle of a drawing to a new anchor. Handles: "a", "b" (endpoints/corners), "c", "d" (the other rectangle corners), "o" (channel width), "p" (level). */
export function dragHandle(d: Drawing, handle: string, to: Anchor): Drawing {
  switch (d.kind) {
    case "hline":
      return handle === "p" ? { ...d, price: to.price } : d;
    case "text":
      return d;
    case "trend":
    case "ray":
      return handle === "a" ? { ...d, a: to } : handle === "b" ? { ...d, b: to } : d;
    case "rect":
      if (handle === "a") return { ...d, a: to };
      if (handle === "b") return { ...d, b: to };
      // c is (a.time, b.price): moving it changes a's time and b's price; d is (b.time, a.price)
      if (handle === "c") return { ...d, a: { ...d.a, time: to.time }, b: { ...d.b, price: to.price } };
      if (handle === "d") return { ...d, b: { ...d.b, time: to.time }, a: { ...d.a, price: to.price } };
      return d;
    case "channel":
      if (handle === "a") return { ...d, a: to };
      if (handle === "b") return { ...d, b: to };
      if (handle === "o") return { ...d, offset: to.price - priceOnLine(d.a, d.b, to.time) };
      return d;
  }
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const anchor = (v: unknown): Anchor | null => {
  const o = v as Partial<Anchor> | null;
  return o && finite(o.time) && finite(o.price) ? { time: o.time, price: o.price } : null;
};

/** Read drawings back from storage: anything malformed is dropped, never repaired or guessed. */
export function parseDrawings(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const out: Drawing[] = [];
  for (const r of raw.slice(0, 300)) {
    const o = r as Record<string, unknown> | null;
    if (!o || typeof o.id !== "string" || typeof o.color !== "string" || !/^#[0-9a-fA-F]{3,8}$/.test(o.color)) continue;
    const width = WIDTHS.includes(o.width as Width) ? (o.width as Width) : 2;
    const dash = DASHES.includes(o.dash as Dash) ? (o.dash as Dash) : "solid";
    const base = { id: o.id, color: o.color, width, dash, locked: o.locked === true };
    switch (o.kind) {
      case "hline":
        if (finite(o.price)) out.push({ ...base, kind: "hline", price: o.price });
        break;
      case "text": {
        const at = anchor(o.at);
        if (at && typeof o.text === "string") out.push({ ...base, kind: "text", at, text: o.text.slice(0, 200) });
        break;
      }
      case "trend":
      case "ray":
      case "rect":
      case "channel": {
        const a = anchor(o.a);
        const b = anchor(o.b);
        if (!a || !b) break;
        if (o.kind === "rect") out.push({ ...base, kind: "rect", a, b, midline: o.midline === true });
        else if (o.kind === "channel") {
          if (finite(o.offset)) out.push({ ...base, kind: "channel", a, b, offset: o.offset });
        } else out.push({ ...base, kind: o.kind, a, b });
        break;
      }
    }
  }
  return out;
}
