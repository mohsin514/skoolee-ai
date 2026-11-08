/**
 * Placement engine for surfaces that float beside an anchor (the spotlight tour card; generalised from the
 * Tooltip's place()). Sides are logical — `start`/`end` follow the document direction — and the surface flips to the
 * opposite side, then to whichever side has the most room, before it is clamped inside the viewport.
 * Pure arithmetic: pass `viewport` in tests; in the browser it defaults to the visual viewport size.
 */

export type LogicalSide = "top" | "bottom" | "start" | "end";
type PhysicalSide = "top" | "bottom" | "left" | "right";

export interface FloatingPlacement {
  top: number;
  left: number;
  side: LogicalSide;
  /** Distance from the surface's top-left edge (along the attached edge) to the anchor's centre, for an arrow. */
  arrowOffset: number;
}

const toPhysical = (side: LogicalSide, dir: "ltr" | "rtl"): PhysicalSide =>
  side === "start" ? (dir === "rtl" ? "right" : "left") : side === "end" ? (dir === "rtl" ? "left" : "right") : side;

const toLogical = (side: PhysicalSide, dir: "ltr" | "rtl"): LogicalSide =>
  side === "left" ? (dir === "rtl" ? "end" : "start") : side === "right" ? (dir === "rtl" ? "start" : "end") : side;

const OPPOSITE: Record<PhysicalSide, PhysicalSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };

const clampTo = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** Reads the document direction the way the spec asks (computed style of <html>), defaulting to ltr. */
export function documentDirection(): "ltr" | "rtl" {
  if (typeof document === "undefined") return "ltr";
  return getComputedStyle(document.documentElement).direction === "rtl" ? "rtl" : "ltr";
}

export function placeFloating(
  anchor: DOMRect | { top: number; left: number; right: number; bottom: number; width: number; height: number },
  surface: { width: number; height: number },
  opts: { side?: LogicalSide | "auto"; offset?: number; clamp?: number; dir: "ltr" | "rtl"; viewport?: { width: number; height: number } },
): FloatingPlacement {
  const offset = opts.offset ?? 12;
  const edge = opts.clamp ?? 8;
  const vw = opts.viewport?.width ?? (typeof document !== "undefined" ? document.documentElement.clientWidth : 1024);
  const vh = opts.viewport?.height ?? (typeof window !== "undefined" ? window.innerHeight : 768);
  const room: Record<PhysicalSide, number> = {
    top: anchor.top - offset - edge,
    bottom: vh - anchor.bottom - offset - edge,
    left: anchor.left - offset - edge,
    right: vw - anchor.right - offset - edge,
  };
  const need = (side: PhysicalSide) => (side === "top" || side === "bottom" ? surface.height : surface.width);
  const fits = (side: PhysicalSide) => room[side] >= need(side);

  const requested = opts.side && opts.side !== "auto" ? toPhysical(opts.side, opts.dir) : null;
  // Auto prefers below, then above, then the inline end (toward the content in either direction), then start.
  const auto: PhysicalSide[] = ["bottom", "top", toPhysical("end", opts.dir), toPhysical("start", opts.dir)];
  const order: PhysicalSide[] = requested ? [requested, OPPOSITE[requested], ...auto.filter((s) => s !== requested && s !== OPPOSITE[requested])] : auto;
  const chosen = order.find(fits) ?? order.reduce((best, s) => (room[s] / need(s) > room[best] / need(best) ? s : best), order[0]);

  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2;
  let top: number;
  let left: number;
  if (chosen === "top" || chosen === "bottom") {
    top = chosen === "top" ? anchor.top - offset - surface.height : anchor.bottom + offset;
    left = clampTo(cx - surface.width / 2, edge, vw - surface.width - edge);
  } else {
    left = chosen === "left" ? anchor.left - offset - surface.width : anchor.right + offset;
    top = clampTo(cy - surface.height / 2, edge, vh - surface.height - edge);
  }
  top = clampTo(top, edge, vh - surface.height - edge);
  left = clampTo(left, edge, vw - surface.width - edge);
  const along = chosen === "top" || chosen === "bottom" ? cx - left : cy - top;
  const length = chosen === "top" || chosen === "bottom" ? surface.width : surface.height;
  return { top: Math.round(top), left: Math.round(left), side: toLogical(chosen, opts.dir), arrowOffset: Math.round(clampTo(along, 16, length - 16)) };
}
