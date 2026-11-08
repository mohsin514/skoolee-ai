"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The Skoolee wax seal: a 14-lobe scalloped disc whose emblem is the
 * wordmark's first "o" — an eye (ring and pupil) wearing a mortarboard.
 *
 * - wax:    poured brand wax (radial brand-400 → brand-800), recessed well,
 *           raised light emblem, soft brand drop shadow.
 * - foil:   lilac/silver foil for the dark cover masthead; emblem in brand-800.
 * - emboss: stroke-only in currentColor, for the cover watermark.
 * State `press` plays the one-shot `.sk-seal-press`; `broken` splits it in two.
 * Decorative only: aria-hidden, no <title>/<text>, ids from useId().
 */
export type WaxSealProps = { size?: number /* px, default 40 */; finish?: "wax" | "foil" | "emboss"; state?: "static" | "press" | "broken"; className?: string };

export function WaxSeal({ size = 40, finish = "wax", state = "static", className }: WaxSealProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-finish={finish}
      data-state={state}
      className={cn("sk-seal", state === "press" && "sk-seal-press", className)}
    >
      <SealArt palette={finish} broken={state === "broken"} detail={size >= 56} />
    </svg>
  );
}

/* ── geometry (module constants, so server and client markup are identical) ── */

const LOBES = 14;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Scalloped disc: quadratic lobes between pointed valleys. `wobble` makes poured wax slightly uneven. */
function scallop(valley: number, peak: number, wobble: readonly number[] = []): string {
  const step = (Math.PI * 2) / LOBES;
  const top = -Math.PI / 2;
  const at = (radius: number, angle: number) => `${r2(50 + radius * Math.cos(angle))} ${r2(50 + radius * Math.sin(angle))}`;
  let d = `M${at(valley + (wobble[LOBES - 1] ?? 0) * 0.35, top - step / 2)}`;
  for (let i = 0; i < LOBES; i++) {
    const w = wobble[i] ?? 0;
    d += ` Q${at(peak + w, top + i * step)} ${at(valley + w * 0.35, top + (i + 0.5) * step)}`;
  }
  return `${d}Z`;
}

const WAX_WOBBLE = [0.6, -0.5, 0.9, -0.2, 0.4, -0.8, 0.3, 0.7, -0.4, 0.2, -0.7, 0.8, -0.1, 0.5] as const;
const WAX_EDGE = scallop(41.5, 51.2, WAX_WOBBLE);
const CLEAN_EDGE = scallop(42, 51);
const BEADS = Array.from({ length: 28 }, (_, i) => {
  const angle = (i / 28) * Math.PI * 2;
  return { cx: r2(50 + 38.6 * Math.cos(angle)), cy: r2(50 + 38.6 * Math.sin(angle)) };
});

/* The crack for `broken`: a jagged line from top to bottom. */
const CRACK = "50 -6 46.5 14 53.5 27 47 41 54 55 47.5 69 53 84 49 106";
const LEFT_HALF = `-6 -6 ${CRACK} -6 106`;
const RIGHT_HALF = `106 -6 ${CRACK} 106 106`;

type Palette = "wax" | "foil" | "emboss" | "muted" | "warning";

type Ink = {
  edgeHi: string; edgeLo: string;
  well: string; wellHi: string; rimLo: string; rimHi: string;
  emblem: string; ground: string; shadow?: string; bead: string;
  stops: [string, string][]; linear?: boolean; gloss?: boolean;
};

const INKS: Record<Exclude<Palette, "emboss">, Ink> = {
  wax: {
    edgeHi: "var(--brand-300)", edgeLo: "var(--brand-950)",
    well: "var(--brand-700)", wellHi: "var(--brand-600)", rimLo: "var(--brand-950)", rimHi: "var(--brand-300)",
    emblem: "var(--brand-50)", ground: "var(--brand-700)", shadow: "var(--brand-950)", bead: "var(--brand-300)",
    stops: [["0%", "var(--brand-400)"], ["38%", "var(--brand-500)"], ["78%", "var(--brand-700)"], ["100%", "var(--brand-800)"]],
    gloss: true,
  },
  foil: {
    edgeHi: "#fff", edgeLo: "var(--brand-300)",
    well: "var(--brand-100)", wellHi: "#fff", rimLo: "var(--brand-300)", rimHi: "#fff",
    emblem: "var(--brand-800)", ground: "var(--brand-100)", bead: "var(--brand-300)",
    stops: [["0%", "var(--brand-200)"], ["42%", "#fff"], ["68%", "var(--brand-200)"], ["100%", "var(--brand-300)"]],
    linear: true,
  },
  muted: {
    edgeHi: "#fff", edgeLo: "var(--ink-faint)",
    well: "var(--surface-sunken)", wellHi: "#fff", rimLo: "var(--ink-faint)", rimHi: "#fff",
    emblem: "var(--ink-subtle)", ground: "var(--surface-sunken)", bead: "var(--ink-faint)",
    stops: [["0%", "var(--surface-sunken)"], ["100%", "var(--edge)"]],
  },
  warning: {
    edgeHi: "var(--status-warning-surface)", edgeLo: "var(--status-warning-text)",
    well: "var(--status-warning-text)", wellHi: "var(--status-warning-text)", rimLo: "var(--status-warning-text)", rimHi: "var(--status-warning-border)",
    emblem: "var(--status-warning-surface)", ground: "var(--status-warning-text)", shadow: "var(--status-warning-text)", bead: "var(--status-warning-border)",
    stops: [["0%", "var(--status-warning-border)"], ["100%", "var(--status-warning-text)"]],
    gloss: true,
  },
};

/** The eye wearing a mortarboard, in a 100×100 space. `ground` knocks shapes apart. */
function Emblem({ fill, ground, knock = true }: { fill: string; ground?: string; knock?: boolean }) {
  const knockout = knock && ground ? { stroke: ground, strokeWidth: 2.4, paintOrder: "stroke" as const, strokeLinejoin: "round" as const } : {};
  return (
    <g>
      {/* the eye: ring, then a pupil glancing up at its cap */}
      <circle cx="50" cy="58.5" r="10.6" fill="none" stroke={fill} strokeWidth="3.8" />
      <circle cx="51.7" cy="57" r="4.3" fill={fill} />
      <g transform="rotate(-12 50 46)">
        {/* skull cap, seated on the eye */}
        <path d="M40.2 40.5V46.4C44 50.3 56 50.3 59.8 46.4V40.5Z" fill={fill} {...knockout} />
        {/* the board */}
        <path d="M27.5 39.2 50 30.6 72.5 39.2 50 47.8Z" fill={fill} {...knockout} />
        {knock && ground ? <path d="M50 39.2 67 41.6" fill="none" stroke={ground} strokeWidth="1.5" strokeLinecap="round" /> : null}
        {knock && ground ? <circle cx="50" cy="39.2" r="1.7" fill={ground} /> : null}
        {/* tassel: cord off the board edge, then the tuft */}
        <path d="M69.2 41.9V50.6" fill="none" stroke={fill} strokeWidth="1.7" strokeLinecap="round" />
        <path d="M67.3 50.1H71.1L71.9 56.4H66.5Z" fill={fill} strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** The emblem as a line drawing in currentColor (emboss finish, empty seal slot). */
export function EmblemOutline({ strokeWidth = 1.1 }: { strokeWidth?: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <circle cx="50" cy="58.5" r="10.6" />
      <circle cx="51.7" cy="57" r="3.6" fill="currentColor" stroke="none" />
      <g transform="rotate(-12 50 46)">
        <path d="M40.2 41.5V46.4C44 50.3 56 50.3 59.8 46.4V41.5" />
        <path d="M27.5 39.2 50 30.6 72.5 39.2 50 47.8Z" />
        <path d="M50 39.2 69.2 41.9V50.6" />
        <path d="M67.3 50.1H71.1L71.9 56.4H66.5Z" />
      </g>
    </g>
  );
}

/** Emboss: the same seal as a blind-stamped outline in currentColor. */
function EmbossArt({ detail }: { detail: boolean }) {
  return (
    <g>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d={CLEAN_EDGE} strokeWidth="1.1" />
        <circle cx="50" cy="50" r="33" strokeWidth="0.9" />
        <circle cx="50" cy="50" r="30.6" strokeWidth="0.45" />
      </g>
      {detail ? BEADS.map((b, i) => <circle key={i} cx={b.cx} cy={b.cy} r="0.8" fill="currentColor" />) : null}
      <EmblemOutline />
    </g>
  );
}

/** Seal artwork as an SVG <g> in a 0–100 space; WaxSeal and SealedEnvelope both draw it. */
export function SealArt({ palette, broken = false, detail = false }: { palette: Palette; broken?: boolean; detail?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `sk-seal-${uid}-${name}`;

  let defs = null;
  let art;
  if (palette === "emboss") {
    art = <EmbossArt detail={detail} />;
  } else {
    const ink = INKS[palette];
    const edge = palette === "wax" || palette === "warning" ? WAX_EDGE : CLEAN_EDGE;
    defs = (
      <defs>
        {ink.linear ? (
          <linearGradient id={id("body")} x1="12%" y1="6%" x2="88%" y2="94%">
            {ink.stops.map(([offset, color]) => <stop key={offset} offset={offset} style={{ stopColor: color }} />)}
          </linearGradient>
        ) : (
          <radialGradient id={id("body")} cx="38%" cy="30%" r="78%">
            {ink.stops.map(([offset, color]) => <stop key={offset} offset={offset} style={{ stopColor: color }} />)}
          </radialGradient>
        )}
        <linearGradient id={id("edge")} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" style={{ stopColor: ink.edgeHi, stopOpacity: 0.75 }} />
          <stop offset="55%" style={{ stopColor: ink.edgeHi, stopOpacity: 0 }} />
          <stop offset="100%" style={{ stopColor: ink.edgeLo, stopOpacity: 0.55 }} />
        </linearGradient>
        <radialGradient id={id("well")} cx="50%" cy="64%" r="62%">
          <stop offset="0%" style={{ stopColor: ink.wellHi }} />
          <stop offset="100%" style={{ stopColor: ink.well }} />
        </radialGradient>
        <linearGradient id={id("rim")} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: ink.rimLo, stopOpacity: 0.6 }} />
          <stop offset="50%" style={{ stopColor: ink.rimLo, stopOpacity: 0 }} />
          <stop offset="100%" style={{ stopColor: ink.rimHi, stopOpacity: 0.85 }} />
        </linearGradient>
        {ink.gloss ? (
          <radialGradient id={id("gloss")} cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: "#fff", stopOpacity: 0.42 }} />
            <stop offset="100%" style={{ stopColor: "#fff", stopOpacity: 0 }} />
          </radialGradient>
        ) : null}
      </defs>
    );
    art = (
      <g>
        {/* poured body with a lit upper edge */}
        <path d={edge} fill={`url(#${id("body")})`} />
        <path d={edge} fill="none" stroke={`url(#${id("edge")})`} strokeWidth="1.1" />
        {detail ? BEADS.map((b, i) => <circle key={i} cx={b.cx} cy={b.cy} r="0.85" fill={ink.bead} opacity="0.55" />) : null}
        {/* the pressed well, darker at its top inner edge, lit at the bottom */}
        <circle cx="50" cy="50" r="33" fill={`url(#${id("well")})`} />
        <circle cx="50" cy="50" r="32.9" fill="none" stroke={`url(#${id("rim")})`} strokeWidth="1.7" />
        {ink.shadow ? (
          <g transform="translate(0 1.3)" opacity="0.5">
            <Emblem fill={ink.shadow} knock={false} />
          </g>
        ) : null}
        <Emblem fill={ink.emblem} ground={ink.ground} />
        {ink.gloss ? <ellipse cx="31" cy="23.5" rx="13" ry="6" transform="rotate(-34 31 23.5)" fill={`url(#${id("gloss")})`} /> : null}
      </g>
    );
  }

  if (!broken) return <g>{defs}{art}</g>;
  return (
    <g>
      {defs}
      <defs>
        <clipPath id={id("left")}><polygon points={LEFT_HALF} /></clipPath>
        <clipPath id={id("right")}><polygon points={RIGHT_HALF} /></clipPath>
      </defs>
      <g transform="translate(-2.5 1.5) rotate(-5 50 98)"><g clipPath={`url(#${id("left")})`}>{art}</g></g>
      <g transform="translate(2.5 1.5) rotate(5 50 98)"><g clipPath={`url(#${id("right")})`}>{art}</g></g>
    </g>
  );
}
