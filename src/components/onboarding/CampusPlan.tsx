"use client";

import { useId, useState } from "react";
import { DIORAMA_STROKE, DioramaLock, DioramaOffice, DioramaSchool } from "@/components/auth/CampusDiorama";
import { cn } from "@/lib/utils";

/**
 * The setup cover's campus plan: the group office at the top and up to six
 * campus places on a gentle arc beneath it, drawn in the diorama's hand.
 *
 * - active: a sealed (dashed) ring with its padlock clasp and schoolhouse,
 *           joined to the office by a dotted line — it will be activated.
 * - draft:  a dimmer dotted ring with the schoolhouse, no clasp and no line
 *           (truthful: drafts are not activated).
 * - slot:   an empty dashed ring — an unused place in the package.
 *
 * Places glide to their new positions when the count changes (360ms), and a
 * newly added campus presses in once. No names, no text inside the drawing:
 * the cover precedes the desk in the DOM and must never duplicate a pinned
 * string. Decorative: aria-hidden.
 */
export type PlanNodeState = "active" | "draft" | "slot";

export type CampusPlanProps = {
  nodes: { key: string; state: PlanNodeState }[];
  more?: number;          // places not drawn (beyond six): "+n"
  unlimited?: boolean;    // an unlimited package: "∞"
  className?: string;
};

const MAX_NODES = 6;
const OFFICE = { x: 160, y: 44, r: 28 } as const;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Place = { x: number; y: number; r: number };

/** PLAN_LAYOUT[n]: the n places on a smile arc around the office's axis. */
const PLAN_LAYOUT: Place[][] = Array.from({ length: MAX_NODES + 1 }, (_, n) => {
  if (n === 0) return [];
  const span = Math.min(240, (n - 1) * 76);
  const r = n <= 2 ? 34 : n <= 4 ? 28 : 23;
  return Array.from({ length: n }, (_, i) => {
    const x = n === 1 ? 160 : 160 - span / 2 + (span / (n - 1)) * i;
    return { x: r2(x), y: r2(172 - 0.0012 * (x - 160) ** 2), r };
  });
});

/** Dotted connector from a campus ring's edge to the office ring's edge, as a path (so it can glide). */
function link(place: Place) {
  const dx = OFFICE.x - place.x;
  const dy = OFFICE.y - place.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const gap = 6;
  const x1 = r2(place.x + ux * (place.r + gap));
  const y1 = r2(place.y + uy * (place.r + gap));
  const x2 = r2(OFFICE.x - ux * (OFFICE.r + gap));
  const y2 = r2(OFFICE.y - uy * (OFFICE.r + gap));
  return { d: `M${x1} ${y1}L${x2} ${y2}`, tx: r2(OFFICE.x - ux * OFFICE.r), ty: r2(OFFICE.y - uy * OFFICE.r) };
}

export function CampusPlan({ nodes, more = 0, unlimited = false, className }: CampusPlanProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const drawn = nodes.slice(0, MAX_NODES);
  const layout = PLAN_LAYOUT[drawn.length];
  const r = layout[0]?.r ?? 34;
  const scale = r2(r / 36);
  const lock = { x: r2(r * Math.SQRT1_2), y: r2(-r * Math.SQRT1_2) };
  const maskId = `sk-plan-${uid}-clasp`;

  // Keys drawn on the previous render (state adjusted while rendering, React's
  // documented pattern): a campus key that was not there before presses in
  // once. Nothing presses on the first render.
  const signature = drawn.map((node) => `${node.key}:${node.state}`).join("|");
  const [seen, setSeen] = useState({ signature, keys: drawn.map((node) => node.key), fresh: [] as string[] });
  if (seen.signature !== signature) {
    const before = new Set(seen.keys);
    setSeen({
      signature,
      keys: drawn.map((node) => node.key),
      fresh: drawn.filter((node) => node.state !== "slot" && !before.has(node.key)).map((node) => node.key),
    });
  }
  const fresh = new Set(seen.signature === signature ? seen.fresh : []);
  const tail = unlimited ? "∞" : more > 0 ? `+${more}` : null;

  return (
    <div className={cn("sk-plan-frame", className)}>
      <svg
        viewBox="0 0 320 220"
        width={320}
        height={220}
        aria-hidden="true"
        focusable="false"
        className="sk-diorama sk-plan sk-ink-mirror h-auto w-full max-w-[20rem] text-brand-200"
      >
        <defs>
          {/* Cuts each active ring where its padlock sits, so the lock reads as the ring's clasp. */}
          <mask id={maskId} maskUnits="userSpaceOnUse" x={-r * 2} y={-r * 2} width={r * 4} height={r * 4}>
            <rect x={-r * 2} y={-r * 2} width={r * 4} height={r * 4} fill="#fff" />
            <circle cx={lock.x} cy={lock.y} r={r2(8 * scale + 1)} fill="#000" />
          </mask>
        </defs>

        {/* Lines only from each ACTIVE campus up to the group office. */}
        {drawn.map((node, i) => {
          if (node.state !== "active") return null;
          const line = link(layout[i]);
          return (
            <g key={`link-${node.key}`} data-link="">
              {/* `d`, `cx` and `cy` are presentation attributes, so the glide transitions them where supported. */}
              <path d={line.d} {...DIORAMA_STROKE} strokeWidth={1.75} strokeDasharray="1 6" />
              <circle cx={line.tx} cy={line.ty} r={2.4} fill="currentColor" />
            </g>
          );
        })}

        <g transform={`translate(${OFFICE.x} ${OFFICE.y})`}>
          <circle cx="0" cy="0" r={OFFICE.r} {...DIORAMA_STROKE} fill="currentColor" fillOpacity={0.08} strokeWidth={2} />
          <g transform="scale(0.94)"><DioramaOffice detail /></g>
        </g>

        {drawn.map((node, i) => {
          const place = layout[i];
          return (
            <g
              key={node.key}
              data-slot=""
              data-state={node.state}
              data-new={fresh.has(node.key) ? "" : undefined}
              style={{ transform: `translate(${place.x}px, ${place.y}px)` }}
            >
              <g>
                <circle cx="0" cy="0" r={r} fill="currentColor" fillOpacity={node.state === "slot" ? 0 : 0.05} stroke="none" />
                <circle
                  cx="0"
                  cy="0"
                  r={r}
                  mask={node.state === "active" ? `url(#${maskId})` : undefined}
                  {...DIORAMA_STROKE}
                  strokeWidth={node.state === "active" ? 2 : 1.6}
                  strokeDasharray={node.state === "active" ? "2 6" : node.state === "draft" ? "0.5 4.5" : "2 7"}
                />
                {node.state !== "slot" ? (
                  <g transform={`scale(${scale})`}><DioramaSchool detail /></g>
                ) : null}
                {node.state === "active" ? (
                  <g transform={`translate(${lock.x} ${lock.y}) scale(${r2(Math.max(0.8, scale))})`}><DioramaLock /></g>
                ) : null}
              </g>
            </g>
          );
        })}
      </svg>
      {tail ? <span className="sk-folio sk-plan-more">{tail}</span> : null}
    </div>
  );
}
