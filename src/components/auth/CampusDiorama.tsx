"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * A truthful picture of tenant isolation. A school group is three campuses in
 * sealed (dashed) rings, each joined only to the group office — never to each
 * other. A single campus is one large sealed ring. Switching type re-flows
 * the nodes with a 360ms CSS transition (instant under reduced motion).
 *
 * `cover` (320×220) draws in brand-200 on the ink cover; `glyph` (48×48)
 * draws in currentColor for an icon tile. Mirrored in RTL, so each padlock
 * sits at its ring's top inline-end. Decorative: aria-hidden, no text.
 */
export type CampusDioramaProps = { type: "school_group" | "single_campus"; size?: "cover" | "glyph" /* cover 320×220, glyph 48×48 */; className?: string };

type Point = { x: number; y: number };
type Geometry = {
  width: number; height: number;
  office: Point & { r: number };
  campuses: [Point, Point, Point];
  r: number;
  /** CSS transform that brings the middle campus to the centre for a single campus. */
  focus: string;
  lock: Point;
  lockScale: number;
  detail: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

const GEOMETRY: Record<NonNullable<CampusDioramaProps["size"]>, Geometry> = {
  cover: {
    width: 320, height: 220,
    office: { x: 160, y: 46, r: 30 },
    campuses: [{ x: 60, y: 156 }, { x: 160, y: 170 }, { x: 260, y: 156 }],
    r: 36,
    focus: "translate(0px, -60px) scale(1.5556)",
    lock: { x: r2(36 * Math.SQRT1_2), y: r2(-36 * Math.SQRT1_2) },
    lockScale: 1,
    detail: true,
  },
  glyph: {
    width: 48, height: 48,
    office: { x: 24, y: 9, r: 5.5 },
    campuses: [{ x: 8.5, y: 33 }, { x: 24, y: 38.5 }, { x: 39.5, y: 33 }],
    r: 7,
    focus: "translate(0px, -14px) scale(2.2857)",
    lock: { x: r2(7 * Math.SQRT1_2), y: r2(-7 * Math.SQRT1_2) },
    lockScale: 0.36,
    detail: false,
  },
};

/** Dashed connector from a campus ring to the office ring (edge to edge). */
function connector(g: Geometry, c: Point) {
  const dx = g.office.x - c.x;
  const dy = g.office.y - c.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const gap = g.detail ? 6 : 2.5;
  return {
    x1: r2(c.x + ux * (g.r + gap)), y1: r2(c.y + uy * (g.r + gap)),
    x2: r2(g.office.x - ux * (g.office.r + gap)), y2: r2(g.office.y - uy * (g.office.r + gap)),
    tx: r2(g.office.x - ux * g.office.r), ty: r2(g.office.y - uy * g.office.r),
  };
}

const STROKE = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;

/** A schoolhouse: roof, body, arched door, gable window and a flag. */
function School({ detail }: { detail: boolean }) {
  if (!detail) {
    return (
      <g {...STROKE} strokeWidth="1.6">
        <path d="M-4.2 -0.4 0 -4.3 4.2 -0.4" />
        <path d="M-3 -0.8V3.6H3V-0.8" />
      </g>
    );
  }
  return (
    <g {...STROKE} strokeWidth="1.75">
      <path d="M0 -14V-22.5" />
      <path d="M0.4 -22.4 7.2 -20.3 0.4 -18.2Z" fill="currentColor" />
      <path d="M-16.5 -1.5 0 -14 16.5 -1.5" />
      <path d="M-12 -3.4V14.5H12V-3.4" />
      <circle cx="0" cy="-6" r="2.3" />
      <path d="M-3.6 14.5V9.2A3.6 3.6 0 0 1 3.6 9.2V14.5" />
      <path d="M-8.4 4.2H-5.2M5.2 4.2H8.4" />
      <path d="M-18.5 14.5H18.5" />
    </g>
  );
}

/** The group office: a columned hall. */
function Office({ detail }: { detail: boolean }) {
  if (!detail) return <circle cx="0" cy="0" r="1.9" fill="currentColor" />;
  return (
    <g {...STROKE} strokeWidth="1.75">
      <path d="M-13.5 -3.5 0 -12 13.5 -3.5Z" />
      <path d="M-8.5 -0.5V8M0 -0.5V8M8.5 -0.5V8" />
      <path d="M-13.5 11H13.5M-11.5 8H11.5" />
    </g>
  );
}

/** A small padlock: the campus is sealed. Sits in a gap cut in the ring. */
function Lock() {
  return (
    <g>
      <path d="M-2.7 -0.6V-2.7A2.7 2.7 0 0 1 2.7 -2.7V-0.6" {...STROKE} strokeWidth="1.6" />
      <rect x="-4.1" y="-0.9" width="8.2" height="6.4" rx="1.5" fill="currentColor" />
    </g>
  );
}

export function CampusDiorama({ type, size = "cover", className }: CampusDioramaProps) {
  const g = GEOMETRY[size];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const maskId = `sk-diorama-${uid}-seal`;
  const single = type === "single_campus";
  const hidden = single ? "" : undefined;
  const lockGap = g.detail ? 8 : 2.6;

  return (
    <svg
      viewBox={`0 0 ${g.width} ${g.height}`}
      width={g.width}
      height={g.height}
      aria-hidden="true"
      focusable="false"
      data-type={type}
      data-size={size}
      className={cn("sk-diorama sk-ink-mirror", size === "cover" ? "h-auto w-full max-w-[20rem] text-brand-200" : "shrink-0", className)}
      style={{ ["--sk-diorama-focus" as string]: g.focus }}
    >
      <defs>
        {/* Cuts the ring where the padlock sits, so the lock reads as the ring's clasp. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-g.r * 2} y={-g.r * 2} width={g.r * 4} height={g.r * 4}>
          <rect x={-g.r * 2} y={-g.r * 2} width={g.r * 4} height={g.r * 4} fill="#fff" />
          <circle cx={g.lock.x} cy={g.lock.y} r={lockGap} fill="#000" />
        </mask>
      </defs>

      {/* Lines only from each campus up to the group office. */}
      {g.campuses.map((c, i) => {
        const line = connector(g, c);
        return (
          <g key={`link-${i}`} data-node={`link-${i}`} data-hidden={hidden}>
            <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} {...STROKE} strokeWidth={g.detail ? 1.75 : 1.4} strokeDasharray={g.detail ? "1 6" : "0.5 2.6"} />
            <circle cx={line.tx} cy={line.ty} r={g.detail ? 2.4 : 1.1} fill="currentColor" />
          </g>
        );
      })}

      <g transform={`translate(${g.office.x} ${g.office.y})`}>
        <g data-node="office" data-hidden={hidden}>
          <circle cx="0" cy="0" r={g.office.r} {...STROKE} fill="currentColor" fillOpacity={g.detail ? 0.08 : 0} strokeWidth={g.detail ? 2 : 1.75} />
          <Office detail={g.detail} />
        </g>
      </g>

      {g.campuses.map((c, i) => {
        const focus = i === 1;
        return (
          <g key={`campus-${i}`} transform={`translate(${c.x} ${c.y})`}>
            <g data-node={focus ? "focus" : `campus-${i}`} data-hidden={focus ? undefined : hidden}>
              <circle cx="0" cy="0" r={g.r} fill="currentColor" fillOpacity={g.detail ? 0.05 : 0} stroke="none" />
              <circle cx="0" cy="0" r={g.r} mask={`url(#${maskId})`} {...STROKE} strokeWidth={g.detail ? 2 : 1.6} strokeDasharray={g.detail ? "2 6" : "1 2.6"} />
              {g.detail ? <School detail /> : (
                <>
                  {/* glyph: a quiet dot per campus; the schoolhouse appears only for one big campus */}
                  <g data-node={`mark-${i}`} data-hidden={focus && single ? "" : undefined}>
                    <circle cx="0" cy="0" r="2" fill="currentColor" />
                  </g>
                  {focus ? (
                    <g data-node="house" data-hidden={single ? undefined : ""}>
                      <School detail={false} />
                    </g>
                  ) : null}
                </>
              )}
              <g transform={`translate(${g.lock.x} ${g.lock.y}) scale(${g.lockScale})`}>
                <g data-node={`lock-${i}`} data-hidden={!g.detail && !(focus && single) ? "" : undefined}>
                  <Lock />
                </g>
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
