import type { Viewport } from "./coords";
import type { Drawing, DrawingKind } from "./drawings";
import { fibLevels, priceOnLine } from "./drawings";

export interface Pt {
  x: number;
  y: number;
}
export interface Handle extends Pt {
  id: string;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A drawing placed on screen, in plot-area pixels. */
export interface Shape {
  kind: DrawingKind;
  segments: [Pt, Pt][];
  /** a filled area that selects by being tapped inside (range box) */
  rect?: Box;
  /** a text note's box */
  textBox?: Box;
  /** the dashed midline of a range box */
  midline?: [Pt, Pt];
  /** the polygon between a channel's two lines */
  fill?: Pt[];
  /** a Fibonacci retracement's lines: the ratio, its price and where it sits */
  levels?: { ratio: number; price: number; y: number }[];
  /** a freehand stroke's points in order */
  path?: Pt[];
  handles: Handle[];
}

/** A finger is at least 44 CSS pixels wide: handles are hit within this radius of their centre. */
export const HANDLE_RADIUS = 22;
export const TOUCH_TOLERANCE = 16;
export const MOUSE_TOLERANCE = 8;
export const TEXT_LINE_HEIGHT = 22;
/** an estimate of the width of a text note, in pixels per character */
export const TEXT_CHAR_PX = 7.2;

const RAY_REACH = 4000;

export function shapeOf(d: Drawing, vp: Viewport): Shape | null {
  const px = (a: { time: number; price: number }): Pt | null => {
    const x = vp.timeToX(a.time);
    const y = vp.priceToY(a.price);
    return x === null || y === null ? null : { x, y };
  };
  switch (d.kind) {
    case "hline": {
      const y = vp.priceToY(d.price);
      if (y === null) return null;
      return { kind: d.kind, segments: [[{ x: 0, y }, { x: vp.width, y }]], handles: [{ id: "p", x: vp.width / 2, y }] };
    }
    case "text": {
      const p = px(d.at);
      if (!p) return null;
      return { kind: d.kind, segments: [], textBox: { x: p.x, y: p.y - TEXT_LINE_HEIGHT / 2, w: Math.max(24, d.text.length * TEXT_CHAR_PX + 12), h: TEXT_LINE_HEIGHT }, handles: [] };
    }
    case "trend": {
      const a = px(d.a);
      const b = px(d.b);
      if (!a || !b) return null;
      return { kind: d.kind, segments: [[a, b]], handles: [{ id: "a", ...a }, { id: "b", ...b }] };
    }
    case "ray": {
      const a = px(d.a);
      const b = px(d.b);
      if (!a || !b) return null;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const far: Pt = len < 1e-6 ? b : { x: a.x + (dx / len) * RAY_REACH, y: a.y + (dy / len) * RAY_REACH };
      return { kind: d.kind, segments: [[a, far]], handles: [{ id: "a", ...a }, { id: "b", ...b }] };
    }
    case "rect": {
      const a = px(d.a);
      const b = px(d.b);
      if (!a || !b) return null;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      const tl: Pt = { x, y };
      const tr: Pt = { x: x + w, y };
      const br: Pt = { x: x + w, y: y + h };
      const bl: Pt = { x, y: y + h };
      return {
        kind: d.kind,
        segments: [[tl, tr], [tr, br], [br, bl], [bl, tl]],
        rect: { x, y, w, h },
        midline: d.midline ? [{ x, y: y + h / 2 }, { x: x + w, y: y + h / 2 }] : undefined,
        // a and b are two opposite corners; c is (a.time, b.price) and d is (b.time, a.price)
        handles: [{ id: "a", ...a }, { id: "b", ...b }, { id: "c", x: a.x, y: b.y }, { id: "d", x: b.x, y: a.y }],
      };
    }
    case "fib": {
      const a = px(d.a);
      const b = px(d.b);
      if (!a || !b) return null;
      // the lines run from the leftmost of the two points to the right edge of the plot, so a narrow swing still reads against today's candles
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(vp.width, a.x, b.x);
      const levels: { ratio: number; price: number; y: number }[] = [];
      for (const l of fibLevels(d.a, d.b)) {
        const y = vp.priceToY(l.price);
        if (y !== null) levels.push({ ...l, y });
      }
      if (levels.length === 0) return null;
      return {
        kind: d.kind,
        segments: [...levels.map((l): [Pt, Pt] => [{ x: x0, y: l.y }, { x: x1, y: l.y }]), [a, b]],
        levels,
        handles: [{ id: "a", ...a }, { id: "b", ...b }],
      };
    }
    case "brush": {
      const path: Pt[] = [];
      for (const q of d.points) {
        const p = px(q);
        if (p) path.push(p);
      }
      if (path.length < 2) return null;
      const segments: [Pt, Pt][] = [];
      for (let i = 1; i < path.length; i++) segments.push([path[i - 1], path[i]]);
      return { kind: d.kind, segments, path, handles: [] };
    }
    case "channel": {
      const a = px(d.a);
      const b = px(d.b);
      const a2 = px({ time: d.a.time, price: d.a.price + d.offset });
      const b2 = px({ time: d.b.time, price: d.b.price + d.offset });
      if (!a || !b || !a2 || !b2) return null;
      const midTime = (d.a.time + d.b.time) / 2;
      const o = px({ time: midTime, price: priceOnLine(d.a, d.b, midTime) + d.offset });
      if (!o) return null;
      return {
        kind: d.kind,
        segments: [[a, b], [a2, b2]],
        fill: [a, b, b2, a2],
        handles: [{ id: "a", ...a }, { id: "b", ...b }, { id: "o", ...o }],
      };
    }
  }
}

/** Distance from a point to a segment. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const inBox = (p: Pt, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

function inPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether a point is on a shape's body: near a line, inside a range box or channel, or inside a text note. */
export function bodyHit(s: Shape, p: Pt, tolerance: number): boolean {
  if (s.textBox) return inBox(p, { x: s.textBox.x - tolerance / 2, y: s.textBox.y - tolerance / 2, w: s.textBox.w + tolerance, h: s.textBox.h + tolerance });
  if (s.rect && inBox(p, s.rect)) return true;
  if (s.fill && inPolygon(p, s.fill)) return true;
  return s.segments.some(([a, b]) => distToSegment(p, a, b) <= tolerance);
}

export type Hit = { id: string; part: "body" } | { id: string; part: "handle"; handle: string };

export interface HitOptions {
  /** how close to a line counts as on it: bigger for a finger */
  tolerance: number;
  /** the drawing whose handles are showing */
  selectedId?: string | null;
  handleRadius?: number;
}

/**
 * What is under a point. The selected drawing's handles come first (a finger needs 44 px: the radius is 22), then bodies, topmost
 * (latest) first. Locked drawings can still be selected, but their handles do not exist.
 */
export function hitTest(drawings: readonly Drawing[], vp: Viewport, p: Pt, o: HitOptions): Hit | null {
  const radius = o.handleRadius ?? HANDLE_RADIUS;
  if (o.selectedId) {
    const d = drawings.find((x) => x.id === o.selectedId);
    const s = d && !d.locked ? shapeOf(d, vp) : null;
    if (d && s) {
      let best: { id: string; dist: number } | null = null;
      for (const h of s.handles) {
        const dist = Math.hypot(h.x - p.x, h.y - p.y);
        if (dist <= radius && (best === null || dist < best.dist)) best = { id: h.id, dist };
      }
      if (best) return { id: d.id, part: "handle", handle: best.id };
    }
  }
  for (let i = drawings.length - 1; i >= 0; i--) {
    const s = shapeOf(drawings[i], vp);
    if (s && bodyHit(s, p, o.tolerance)) return { id: drawings[i].id, part: "body" };
  }
  return null;
}
