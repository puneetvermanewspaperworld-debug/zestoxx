"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type Logical } from "lightweight-charts";
import { anchorToPixel, makeViewport, pixelToAnchor, type Viewport } from "@/lib/chart/coords";
import { createDrawing, dragHandle, fibLabel, moveDrawing, pointsNeeded, rangeLabel, type Anchor, type Dash, type Drawing, type DrawingKind, type ToolId } from "@/lib/chart/drawings";
import { HANDLE_RADIUS, MOUSE_TOLERANCE, TOUCH_TOLERANCE, hitTest, shapeOf, type Shape } from "@/lib/chart/hit";
import { measure, measureText } from "@/lib/chart/measure";
import { fmtPrice } from "@/lib/chart/price";
import { snapToCandle } from "@/lib/chart/snap";
import type { TimedCandle } from "@/lib/chart/series";
import { fmtINR } from "@/lib/helpers";
import type { AssetType } from "@/lib/types";

/**
 * The drawing layer: an SVG laid over the chart's plot area. Drawings are kept by (time, price); every frame the layer asks the chart
 * where those are on screen (lib/chart/coords.ts), so zooming, panning, resizing, a new timeframe and the price scale re-fitting all
 * keep drawings where they belong. Horizontal levels are the chart's own price lines, so their price tag sits on the right axis.
 *
 * Touch and mouse: taps on the chart (a press that does not move, with one finger) select or place points; drags and two-finger
 * gestures are never taps, so a pan or pinch never draws. Only the selected drawing has anything in the layer that catches pointer
 * events (its handles, 44 px targets, and its body), so everywhere else the chart receives touches as usual.
 */
export interface DrawingLayerProps {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  bars: TimedCandle[];
  drawings: Drawing[];
  selectedId: string | null;
  tool: ToolId;
  magnet: boolean;
  hidden: boolean;
  /** ids of the horizontal levels that have a price alert: they carry a bell */
  alerted?: ReadonlySet<string>;
  /** lot size of the index's future, when known (the Measure tool's rupees per lot) */
  lot: number | null;
  isIndex: boolean;
  /** the symbol's market, for how prices are written */
  assetType: AssetType;
  onAdd: (d: Drawing) => void;
  onSelect: (id: string | null) => void;
  onLive: (d: Drawing) => void;
  onCommitLive: () => void;
  onUpdate: (id: string, patch: Partial<Drawing>) => void;
}

const dashArray = (dash: Dash, w: number) => (dash === "dashed" ? `${w * 4 + 2} ${w * 3 + 1}` : dash === "dotted" ? `${w} ${w * 2.5 + 1}` : undefined);
const LINE_STYLE: Record<Dash, LineStyle> = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted };
const TAP_MOVE_PX = 10;
const TAP_MS = 700;
/** a brush stroke takes a new point each time the finger has moved this far */
const BRUSH_STEP_PX = 3;

interface Measured {
  a: Anchor;
  b: Anchor;
  final: boolean;
}
interface Interaction {
  tool: ToolId;
  pending: Anchor[];
  hover: Anchor | null;
  measured: Measured | null;
}
type DragMode = { kind: "handle"; handle: string } | { kind: "body" };

export default function DrawingLayer(p: DrawingLayerProps) {
  const { chart, series, bars, drawings, selectedId, tool, magnet, hidden, alerted } = p;
  const times = useMemo(() => bars.map((b) => b.t), [bars]);
  const [, setTick] = useState(0);
  // What is being placed or measured belongs to one tool: when the tool changes it is simply no longer current, so a new tool starts clean.
  const [ix, setIx] = useState<Interaction>({ tool, pending: [], hover: null, measured: null });
  const cur: Interaction = ix.tool === tool ? ix : { tool, pending: [], hover: null, measured: null };
  const { pending, hover, measured } = cur;
  const pendingRef = useRef<{ tool: ToolId; pts: Anchor[] }>({ tool, pts: [] });
  const [editingId, setEditingId] = useState<string | null>(null);

  const read = useCallback((): Viewport => {
    const ts = chart.timeScale();
    return makeViewport({
      times,
      width: Math.max(0, Math.round(ts.width())),
      height: Math.max(0, Math.round(chart.panes()[0]?.getHeight() ?? 0)),
      logicalToX: (l) => ts.logicalToCoordinate(l as Logical) as number | null,
      xToLogical: (x) => ts.coordinateToLogical(x) as number | null,
      priceToY: (price) => series.priceToCoordinate(price) as number | null,
      yToPrice: (y) => series.coordinateToPrice(y) as number | null,
    });
  }, [chart, series, times]);
  const vp = read();
  const vpRef = useRef(vp);
  const live = useRef({ ...p, magnet });
  useEffect(() => {
    vpRef.current = vp;
    live.current = { ...p, magnet };
  });
  const patch = useCallback((t: ToolId, part: Partial<Omit<Interaction, "tool">>) => setIx((prev) => ({ ...(prev.tool === t ? prev : { tool: t, pending: [], hover: null, measured: null }), ...part })), []);
  const setPending = useCallback(
    (pts: Anchor[]) => {
      pendingRef.current = { tool: live.current.tool, pts };
      patch(live.current.tool, { pending: pts });
    },
    [patch]
  );
  const setHover = useCallback((a: Anchor | null) => patch(live.current.tool, { hover: a }), [patch]);
  const setMeasured = useCallback((m: Measured | null | ((prev: Measured | null) => Measured | null)) => setIx((prev) => {
    const base = prev.tool === live.current.tool ? prev : { tool: live.current.tool, pending: [], hover: null, measured: null };
    return { ...base, measured: typeof m === "function" ? m(base.measured) : m };
  }), []);

  // Re-draw whenever the chart's scales change: panning, zooming, resizing, the price axis re-fitting. The chart has no event for the
  // last of these, so a cheap check each frame compares where a few probe points sit and re-renders only when they moved.
  useEffect(() => {
    let raf = 0;
    let last = "";
    const loop = () => {
      const ts = chart.timeScale();
      const sig = [ts.width(), chart.panes()[0]?.getHeight(), ts.logicalToCoordinate(0 as Logical), ts.logicalToCoordinate(100 as Logical), series.priceToCoordinate(1), series.priceToCoordinate(1000), times.length, times[times.length - 1]].join("|");
      if (sig !== last) {
        last = sig;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [chart, series, times]);

  // A tool in hand: the page must not scroll under the finger. With Measure, one-finger drags are the tool's, not a pan.
  useEffect(() => {
    const el = chart.chartElement();
    // idle: a vertical swipe scrolls the page and a horizontal drag is the chart's; with a tool in hand the finger belongs to the chart
    el.style.touchAction = tool === "select" ? "pan-y" : "none";
    chart.applyOptions({
      handleScroll: tool === "measure" || tool === "brush" ? { mouseWheel: true, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false } : { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    });
    return () => {
      el.style.touchAction = "";
    };
  }, [chart, tool]);

  // Horizontal levels are the chart's own price lines: a coloured tag on the right axis, drawn and moved by the chart itself.
  const lines = useRef(new Map<string, IPriceLine>());
  useEffect(() => {
    const want = new Map(hidden ? [] : drawings.filter((d): d is Extract<Drawing, { kind: "hline" }> => d.kind === "hline").map((d) => [d.id, d]));
    for (const [id, line] of lines.current) {
      if (!want.has(id)) {
        series.removePriceLine(line);
        lines.current.delete(id);
      }
    }
    for (const [id, d] of want) {
      const opts = { price: d.price, color: d.color, lineWidth: d.width, lineStyle: LINE_STYLE[d.dash], axisLabelVisible: true, title: alerted?.has(id) ? "🔔" : "" };
      const have = lines.current.get(id);
      if (have) have.applyOptions(opts);
      else lines.current.set(id, series.createPriceLine(opts));
    }
  }, [drawings, hidden, series, alerted]);
  useEffect(
    () => () => {
      for (const line of lines.current.values()) {
        try {
          series.removePriceLine(line);
        } catch {
          // the series is already gone with its chart
        }
      }
      lines.current.clear();
    },
    [series]
  );

  const local = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const r = chart.chartElement().getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    },
    [chart]
  );
  const toAnchor = useCallback(
    (x: number, y: number): Anchor | null => {
      const a = pixelToAnchor(vpRef.current, x, y);
      if (!a) return null;
      return live.current.magnet ? snapToCandle(a, live.current.bars, vpRef.current) : a;
    },
    []
  );

  const finish = useCallback((kind: DrawingKind, pts: Anchor[]) => {
    const d = createDrawing(kind, pts);
    if (!d) return;
    live.current.onAdd(d);
    if (kind === "text") setEditingId(d.id);
  }, []);

  // Taps and the measure drag, on the chart itself.
  useEffect(() => {
    const el = chart.chartElement();
    const pointers = new Set<number>();
    let down: { x: number; y: number; at: number; valid: boolean; type: string } | null = null;
    let mdrag: { a: Anchor; moved: boolean; id: number } | null = null;
    // a freehand stroke being drawn: the points so far (by time and price) and where the last one was on screen
    let bdrag: { pts: Anchor[]; last: { x: number; y: number }; id: number } | null = null;

    const inPlot = (x: number, y: number) => x >= 0 && y >= 0 && x <= vpRef.current.width && y <= vpRef.current.height;

    const onDown = (e: PointerEvent) => {
      pointers.add(e.pointerId);
      const { x, y } = local(e);
      if (pointers.size > 1) {
        if (down) down.valid = false; // a second finger: a pinch or two-finger pan, never a tap
        mdrag = null;
        if (bdrag) {
          bdrag = null; // a second finger: a pinch or two-finger pan, never a stroke
          setPending([]);
        }
        setMeasured((m) => (m && !m.final ? null : m));
        return;
      }
      down = { x, y, at: performance.now(), valid: e.button === 0 || e.pointerType === "touch", type: e.pointerType };
      if (live.current.tool === "brush" && inPlot(x, y)) {
        const a = pixelToAnchor(vpRef.current, x, y);
        if (a) {
          bdrag = { pts: [a], last: { x, y }, id: e.pointerId };
          setPending([a]);
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            // not capturable: the stroke still follows while the pointer stays over the chart
          }
        }
      }
      if (live.current.tool === "measure" && inPlot(x, y)) {
        const a = toAnchor(x, y);
        if (a) {
          mdrag = { a, moved: false, id: e.pointerId };
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            // not capturable: the drag still works while the pointer stays over the chart
          }
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      if (bdrag && e.pointerId === bdrag.id && pointers.size === 1) {
        if (Math.hypot(x - bdrag.last.x, y - bdrag.last.y) >= BRUSH_STEP_PX) {
          const a = pixelToAnchor(vpRef.current, x, y);
          if (a) {
            bdrag.pts.push(a);
            bdrag.last = { x, y };
            setPending([...bdrag.pts]);
          }
        }
        return;
      }
      if (mdrag && e.pointerId === mdrag.id && pointers.size === 1) {
        if (!mdrag.moved && down && Math.hypot(x - down.x, y - down.y) > TAP_MOVE_PX) mdrag.moved = true;
        if (mdrag.moved) {
          const b = toAnchor(x, y);
          if (b) setMeasured({ a: mdrag.a, b, final: false });
        }
        return;
      }
      if (e.pointerType !== "touch" && inPlot(x, y)) setHover(toAnchor(x, y));
      if (down && Math.hypot(x - down.x, y - down.y) > TAP_MOVE_PX) down.valid = false; // a drag is a pan, not a tap
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      const { x, y } = local(e);
      if (bdrag && e.pointerId === bdrag.id) {
        const s = bdrag;
        bdrag = null;
        const end = e.type === "pointercancel" ? null : pixelToAnchor(vpRef.current, x, y);
        if (end && Math.hypot(x - s.last.x, y - s.last.y) >= 1) s.pts.push(end);
        setPending([]);
        if (down) down.valid = false;
        if (e.type !== "pointercancel" && s.pts.length >= 2) finish("brush", s.pts);
        return;
      }
      if (mdrag && e.pointerId === mdrag.id) {
        const m = mdrag;
        mdrag = null;
        if (m.moved) {
          const b = toAnchor(x, y);
          if (b) setMeasured({ a: m.a, b, final: true });
          if (down) down.valid = false;
          return;
        }
      }
      const d = down;
      if (pointers.size === 0) down = null;
      if (!d || !d.valid || e.type === "pointercancel") return;
      if (performance.now() - d.at > TAP_MS || Math.hypot(x - d.x, y - d.y) > TAP_MOVE_PX || !inPlot(x, y)) return;
      tap(x, y, d.type);
    };
    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      down = null;
      mdrag = null;
      if (bdrag) {
        bdrag = null;
        setPending([]);
      }
    };

    const tap = (x: number, y: number, pointerType: string) => {
      const L = live.current;
      if (L.tool === "select") {
        const hit = hitTest(L.drawings, vpRef.current, { x, y }, { tolerance: pointerType === "mouse" ? MOUSE_TOLERANCE : TOUCH_TOLERANCE, selectedId: L.selectedId });
        L.onSelect(hit ? hit.id : null);
        const d = hit ? L.drawings.find((v) => v.id === hit.id) : null;
        if (d && d.kind === "text" && hit && L.selectedId === hit.id && !d.locked) setEditingId(d.id); // a second tap edits the note
        return;
      }
      if (L.tool === "brush") return; // a stroke is drawn by dragging; a tap places nothing
      const a = toAnchor(x, y);
      if (!a) return;
      const need = pointsNeeded(L.tool);
      if (need === 1) {
        finish(L.tool as DrawingKind, [a]);
        return;
      }
      const base = pendingRef.current.tool === L.tool ? pendingRef.current.pts : [];
      const next = [...base, a];
      setHover(null);
      if (next.length < need) {
        setPending(next);
        return;
      }
      setPending([]);
      if (L.tool === "measure") setMeasured({ a: next[0], b: next[1], final: true });
      else finish(L.tool as DrawingKind, next);
    };

    // Capture phase: the chart handles touches itself and may stop them from bubbling, but it cannot stop what we see on the way down.
    const onLeave = () => setHover(null);
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("pointercancel", onCancel, true);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("pointercancel", onCancel, true);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [chart, local, toAnchor, finish, setPending, setHover, setMeasured]);

  // Keys: Escape, Delete, undo and redo are handled by the toolbox; here only Escape (cancel what is being placed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPending([]);
        setMeasured(null);
        setEditingId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPending, setMeasured]);

  /* ------------------------------------------------------------- dragging the selected drawing -- */
  const drag = useRef<{ mode: DragMode; snapshot: Drawing; a0: Anchor; pointerId: number } | null>(null);
  const startDrag = (e: React.PointerEvent, mode: DragMode, d: Drawing) => {
    e.stopPropagation();
    e.preventDefault();
    const pt = local(e);
    const a0 = pixelToAnchor(vpRef.current, pt.x, pt.y);
    if (!a0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, snapshot: d, a0, pointerId: e.pointerId };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const pt = local(e);
    if (g.mode.kind === "handle") {
      const to = toAnchor(pt.x, pt.y);
      if (to) p.onLive(dragHandle(g.snapshot, g.mode.handle, to));
    } else {
      const cur = pixelToAnchor(vpRef.current, pt.x, pt.y);
      if (cur) p.onLive(moveDrawing(g.snapshot, cur.time - g.a0.time, cur.price - g.a0.price));
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.pointerId !== e.pointerId) return;
    e.stopPropagation();
    drag.current = null;
    p.onCommitLive();
  };

  /* ------------------------------------------------------------------------------- drawing -- */
  const shown = hidden ? [] : drawings;
  const selected = shown.find((d) => d.id === selectedId) ?? null;
  const w = vp.width;
  const h = vp.height;

  const px = (a: Anchor) => anchorToPixel(vp, a);
  const mid = measured ? measure(measured.a, measured.b, times, p.lot, p.isIndex) : null;
  const rubber = pending.length === 1 && hover && tool !== "select" && pointsNeeded(tool) === 2 ? { a: px(pending[0]), b: px(hover) } : null;

  const body = (d: Drawing, s: Shape) => {
    const stroke = { stroke: d.color, strokeWidth: d.width, strokeDasharray: dashArray(d.dash, d.width), strokeLinecap: "round" as const, fill: "none" };
    const sel = d.id === selectedId;
    const halo = sel ? s.segments.map(([a, b], i) => <line key={`h${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={d.color} strokeOpacity={0.25} strokeWidth={d.width + 6} strokeLinecap="round" />) : null;
    switch (d.kind) {
      case "hline":
        // the line itself is the chart's price line; here only the selection halo
        return <g key={d.id}>{halo}</g>;
      case "text":
        return (
          <g key={d.id} data-drawing={d.id}>
            {s.textBox && (
              <>
                <rect x={s.textBox.x} y={s.textBox.y} width={s.textBox.w} height={s.textBox.h} rx={4} fill="#ffffff" fillOpacity={0.88} stroke={sel ? d.color : "none"} strokeWidth={1} />
                <text x={s.textBox.x + 6} y={s.textBox.y + 15} fontSize={12} fill={d.color} fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight={600}>
                  {d.text}
                </text>
              </>
            )}
          </g>
        );
      case "rect":
        return (
          <g key={d.id} data-drawing={d.id}>
            {s.rect && <rect x={s.rect.x} y={s.rect.y} width={s.rect.w} height={s.rect.h} fill={d.color} fillOpacity={0.14} stroke={d.color} strokeWidth={d.width} strokeDasharray={dashArray(d.dash, d.width)} />}
            {s.midline && <line x1={s.midline[0].x} y1={s.midline[0].y} x2={s.midline[1].x} y2={s.midline[1].y} stroke={d.color} strokeWidth={1} strokeDasharray="5 4" />}
            {s.rect && (
              <text x={s.rect.x + 5} y={s.rect.y + 14} fontSize={11} fill={d.color} fontFamily="ui-monospace, monospace" fontWeight={600} data-testid="rect-label">
                {rangeLabel(d.a, d.b)}
              </text>
            )}
          </g>
        );
      case "fib":
        return (
          <g key={d.id} data-drawing={d.id}>
            {halo}
            {s.levels?.map((l, i) => (
              <g key={l.ratio}>
                <line x1={s.segments[i][0].x} y1={l.y} x2={s.segments[i][1].x} y2={l.y} {...stroke} strokeOpacity={l.ratio === 0 || l.ratio === 1 ? 1 : 0.8} />
                <text x={s.segments[i][0].x + 4} y={l.y - 3} fontSize={10.5} fill={d.color} fontFamily="ui-monospace, monospace" fontWeight={600} data-testid="fib-label">
                  {fibLabel(l.ratio)} ({fmtPrice(l.price, p.assetType)})
                </text>
              </g>
            ))}
            {s.segments.length > 0 && <line x1={s.segments[s.segments.length - 1][0].x} y1={s.segments[s.segments.length - 1][0].y} x2={s.segments[s.segments.length - 1][1].x} y2={s.segments[s.segments.length - 1][1].y} stroke={d.color} strokeWidth={1} strokeDasharray="4 3" />}
          </g>
        );
      case "brush":
        return (
          <g key={d.id} data-drawing={d.id}>
            {sel && s.path && <polyline points={s.path.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke={d.color} strokeOpacity={0.25} strokeWidth={d.width + 6} strokeLinecap="round" strokeLinejoin="round" />}
            {s.path && <polyline points={s.path.map((q) => `${q.x},${q.y}`).join(" ")} {...stroke} strokeLinejoin="round" data-testid="brush-stroke" />}
          </g>
        );
      case "channel":
        return (
          <g key={d.id} data-drawing={d.id}>
            {s.fill && <polygon points={s.fill.map((q) => `${q.x},${q.y}`).join(" ")} fill={d.color} fillOpacity={0.1} />}
            {halo}
            {s.segments.map(([a, b], i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...stroke} />
            ))}
          </g>
        );
      default:
        return (
          <g key={d.id} data-drawing={d.id}>
            {halo}
            {s.segments.map(([a, b], i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...stroke} />
            ))}
          </g>
        );
    }
  };

  const selShape = selected ? shapeOf(selected, vp) : null;
  const editing = editingId ? shown.find((d): d is Extract<Drawing, { kind: "text" }> => d.id === editingId && d.kind === "text") : null;
  const editShape = editing ? shapeOf(editing, vp) : null;

  // where bar 0 and bar 100 sit, and where prices 1 and 1000 sit: enough to place any (bar, price) on screen, for tests and for anyone debugging
  const scaleAttr = JSON.stringify({ x0: chart.timeScale().logicalToCoordinate(0 as Logical), x100: chart.timeScale().logicalToCoordinate(100 as Logical), y1: series.priceToCoordinate(1), y1000: series.priceToCoordinate(1000) });
  if (w <= 0 || h <= 0) return null;
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-10" style={{ width: w, height: h, touchAction: "none" }} data-testid="drawing-layer" data-scale={scaleAttr} data-alerted={JSON.stringify([...(alerted ?? [])])} data-levels={JSON.stringify(shown.filter((d) => d.kind === "hline").map((d) => (d as Extract<Drawing, { kind: "hline" }>).price))}>
      <svg width={w} height={h} className="absolute left-0 top-0 overflow-hidden" style={{ touchAction: "none" }} data-drawings={shown.length}>
        {shown.map((d) => {
          const s = shapeOf(d, vp);
          return s ? body(d, s) : null;
        })}

        {tool === "brush" && pending.length > 1 && (
          <polyline points={pending.map((a) => px(a)).filter((q): q is { x: number; y: number } => !!q).map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="#f43f5e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" data-testid="brush-live" />
        )}
        {rubber && rubber.a && rubber.b && <line x1={rubber.a.x} y1={rubber.a.y} x2={rubber.b.x} y2={rubber.b.y} stroke="#64748b" strokeDasharray="4 3" strokeWidth={1.5} />}
        {pending.length === 1 && tool !== "brush" &&
          (() => {
            const q = px(pending[0]);
            return q ? <circle cx={q.x} cy={q.y} r={5} fill="#2563eb" stroke="#fff" strokeWidth={1.5} /> : null;
          })()}

        {measured &&
          mid &&
          (() => {
            const A = px(measured.a);
            const B = px(measured.b);
            if (!A || !B) return null;
            const t = measureText(mid);
            const up = mid.points >= 0;
            const col = up ? "#059669" : "#e11d48";
            const lines = [t.move, t.time, ...(p.isIndex ? [mid.rupeesPerLot !== null ? `≈ ${fmtINR(Math.round(mid.rupeesPerLot))} per lot of a future` : "-- per lot (lot size not available)"] : [])];
            const bw = 6 + Math.max(...lines.map((l) => l.length)) * 6.6;
            const bh = 8 + lines.length * 15;
            const bx = Math.max(2, Math.min(w - bw - 2, B.x + 8));
            const by = Math.max(2, Math.min(h - bh - 2, B.y - bh - 8));
            return (
              <g data-testid="measure" data-final={measured.final ? "1" : "0"}>
                <rect x={Math.min(A.x, B.x)} y={Math.min(A.y, B.y)} width={Math.abs(B.x - A.x)} height={Math.abs(B.y - A.y)} fill={col} fillOpacity={0.08} />
                <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={col} strokeWidth={1.5} strokeDasharray="5 3" />
                <circle cx={A.x} cy={A.y} r={4} fill={col} />
                <circle cx={B.x} cy={B.y} r={4} fill={col} />
                <rect x={bx} y={by} width={bw} height={bh} rx={5} fill="#0f172a" fillOpacity={0.92} />
                {lines.map((l, i) => (
                  <text key={i} x={bx + 6} y={by + 15 + i * 15} fontSize={11} fill="#fff" fontFamily="ui-monospace, monospace" data-testid={`measure-line-${i}`}>
                    {l}
                  </text>
                ))}
              </g>
            );
          })()}

        {/* the selected drawing: what catches pointers, and its handles (44 px targets) */}
        {selected && selShape && !selected.locked && (
          <g>
            {selShape.rect && (
              <rect x={selShape.rect.x} y={selShape.rect.y} width={selShape.rect.w} height={selShape.rect.h} fill="transparent" style={{ pointerEvents: "all", touchAction: "none", cursor: "move" }} data-testid="drag-body" onPointerDown={(e) => startDrag(e, { kind: "body" }, selected)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
            )}
            {selShape.textBox && (
              <rect x={selShape.textBox.x} y={selShape.textBox.y} width={selShape.textBox.w} height={selShape.textBox.h} fill="transparent" style={{ pointerEvents: "all", touchAction: "none", cursor: "move" }} data-testid="drag-body" onPointerDown={(e) => startDrag(e, { kind: "body" }, selected)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
            )}
            {selShape.path ? (
              <polyline points={selShape.path.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="transparent" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "stroke", touchAction: "none", cursor: "move" }} data-testid="drag-body" onPointerDown={(e) => startDrag(e, { kind: "body" }, selected)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
            ) : (
              selShape.segments.map(([a, b], i) => (
                <line key={`b${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={30} strokeLinecap="round" style={{ pointerEvents: "stroke", touchAction: "none", cursor: "move" }} data-testid="drag-body" onPointerDown={(e) => startDrag(e, { kind: "body" }, selected)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
              ))
            )}
            {selShape.handles.map((hd) => (
              <g key={hd.id}>
                <circle cx={hd.x} cy={hd.y} r={6} fill="#fff" stroke={selected.color} strokeWidth={2} pointerEvents="none" />
                <circle cx={hd.x} cy={hd.y} r={HANDLE_RADIUS} fill="transparent" data-testid={`handle-${hd.id}`} style={{ pointerEvents: "all", touchAction: "none", cursor: "grab" }} onPointerDown={(e) => startDrag(e, { kind: "handle", handle: hd.id }, selected)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
              </g>
            ))}
          </g>
        )}
        {selected && selShape && selected.locked && selShape.handles.length > 0 && (
          <g pointerEvents="none">
            {selShape.handles.map((hd) => (
              <circle key={hd.id} cx={hd.x} cy={hd.y} r={4} fill="#94a3b8" />
            ))}
          </g>
        )}
      </svg>

      {editing && editShape?.textBox && (
        <input
          autoFocus
          aria-label="Note text"
          defaultValue={editing.text}
          maxLength={120}
          className="pointer-events-auto absolute rounded border border-blue-400 bg-white px-1.5 text-[12px] font-semibold outline-none"
          style={{ left: editShape.textBox.x, top: editShape.textBox.y + editShape.textBox.h / 2 - 22, height: 44, width: Math.max(140, editShape.textBox.w), color: editing.color }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              p.onUpdate(editing.id, { text: (e.currentTarget.value || "Note").trim() || "Note" } as Partial<Drawing>);
              setEditingId(null);
            } else if (e.key === "Escape") setEditingId(null);
          }}
          onBlur={(e) => {
            p.onUpdate(editing.id, { text: (e.currentTarget.value || "Note").trim() || "Note" } as Partial<Drawing>);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}
