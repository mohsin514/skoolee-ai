/**
 * Chart colour tokens.
 *
 * Every value here was produced by the palette validator, not by eye — the
 * checks that matter (colour-blind separation, normal-vision separation,
 * contrast against the white card the charts sit on) are computable, so they
 * were computed. Re-run the validator before changing any hex:
 *
 *   node scripts/validate_palette.js "<hex,hex,...>" --mode light --surface "#ffffff"
 *
 * Recorded results, surface #ffffff:
 *   SERIES (adjacent pairs — bars, lines, stacks) ....... all checks PASS
 *   SERIES first 3 slots (all pairs — donuts, scatter) .. all checks PASS
 *   STATUS good/warning/critical (all pairs) ............ all checks PASS
 *   RAMP_BRAND (ordinal) ................................ all checks PASS
 *   GRADE_HIGH / GRADE_LOW arms (ordinal, each) ......... all checks PASS
 */

/**
 * Categorical identity. Assigned in this fixed order and never cycled — a
 * seventh series folds into "Other" or becomes a small multiple instead.
 * Validated on *adjacent* pairs, which is the pairlist for bars, lines and
 * stacks (neighbours are what a reader actually compares).
 */
export const SERIES = ["#8127cf", "#eb6834", "#1baf7a", "#2a78d6", "#eda100", "#e34948"] as const;

/**
 * Donuts, scatter and anything where every pair can end up side by side need
 * the stricter all-pairs gate, which only the first three slots clear. Past
 * three, fold the tail into "Other" or facet — never reach for slot four.
 */
export const ALL_PAIRS_LIMIT = 3;

/**
 * State, not identity. Never borrowed for "series 4", and never carried by
 * colour alone — every use in this kit ships an icon or a written label.
 */
export const STATUS = {
  good: "#1baf7a",
  warning: "#eda100",
  critical: "#d4183d",
  /** Chromaless on purpose: "nothing here" should not compete for attention. */
  neutral: "#918a95",
} as const;

/** Magnitude, in the brand hue. Light → dark, one hue, visible steps. */
export const RAMP_BRAND = ["#c795f0", "#ab63e4", "#8f3fd8", "#7621b8", "#5e1a92", "#47136d"] as const;

/**
 * Grades have polarity, so they get a diverging construction: two arms that
 * read as opposite, each validated as its own single-hue ordinal ramp. The
 * darker the step, the further from the middle.
 */
export const GRADE_HIGH = ["#86b6ef", "#2a78d6", "#184f95"] as const; // B, A, A+
export const GRADE_LOW = ["#e88b8b", "#e34948", "#9b1c1c"] as const; // C, D, F

export const GRADE_COLOR: Record<string, string> = {
  "A+": GRADE_HIGH[2],
  A: GRADE_HIGH[1],
  "A-": GRADE_HIGH[1],
  B: GRADE_HIGH[0],
  "B+": GRADE_HIGH[0],
  "B-": GRADE_HIGH[0],
  C: GRADE_LOW[0],
  "C+": GRADE_LOW[0],
  D: GRADE_LOW[1],
  E: GRADE_LOW[2],
  F: GRADE_LOW[2],
};

/** Grades in report order, so a distribution never comes out shuffled. */
export const GRADE_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "E", "F"];

/**
 * Chrome. Grid and axis sit one step off the surface and stay hairline-thin;
 * the data is the only thing allowed to be loud.
 */
export const INK = {
  surface: "#ffffff",
  grid: "#ece7ef",
  axis: "#cfc2d6",
  muted: "#746c7a",
  secondary: "#635a6b",
  primary: "#1f1a23",
} as const;

/** Recharts axis/tick text. Text never wears the data colour. */
export const AXIS_TICK = { fontSize: 10, fill: INK.muted, fontWeight: 700 } as const;

/**
 * Entry animation, off — spread onto every Recharts series in the app.
 *
 * Recharts' own entry animation does not survive the re-render that
 * ResponsiveContainer triggers when it measures the card. `useAnimationId`
 * keys the animation off the series' props object by reference, so a new props
 * object remounts `JavascriptAnimate` and resets its progress to t=0; the
 * restarted animation then never runs, and the series renders with zero
 * geometry — a `<Rectangle width={0}>`, which draws nothing at all.
 *
 * The result was that every chart in the product — parent, student, teacher,
 * campus, principal, finance, library, front-desk, owner — drew its axes,
 * grid, legend and caption, and then went blank about a second and a half
 * after it appeared. The data was always correct and always present; only the
 * marks were missing, which is the one failure a chart cannot survive.
 *
 * Reproduced against a production build, on recharts 3.8.1 and on 3.10.1, with
 * `prefers-reduced-motion: no-preference` and React StrictMode off. Setting
 * `isAnimationActive={false}` renders every series correctly and immediately.
 *
 * Recharts identifies series by element type, so this cannot be hidden behind
 * a wrapper component — a `<Bar>` has to stay a `<Bar>`. Spreading a shared
 * constant is the next best thing: one place to grep, one place to delete when
 * the upstream animation is fixed.
 */
export const NO_ENTRY_ANIMATION = { isAnimationActive: false } as const;

/** 1,284 → "1,284"; 12,900 → "12.9K"; 4,200,000 → "4.2M". */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return value.toLocaleString();
}

/**
 * Invoice and payment amounts are stored in the minor unit (paisa). Every
 * family- and finance-facing screen divides before it prints — `formatPKR`
 * does it too — so the derivation layer converts once, here, and every chart
 * downstream works in whole rupees.
 */
export function fromMinor(minor: number): number {
  return (minor || 0) / 100;
}

/** Money, compacted, without pretending to know the reader's locale currency.
 *  Expects major units — run `fromMinor` on anything straight out of the
 *  database first. */
export function money(value: number): string {
  return compact(Math.round(value));
}
