/**
 * Domain colours for the console.
 *
 * Every screen used the same purple icon tile, so nothing about a page's
 * colour told you which part of the school you were in. These give each domain
 * one signature hue, applied to the page header's tile and rail and to the
 * section strip's icons.
 *
 * Two rules keep this from turning into confetti:
 *
 *  1. Purple and pink stay the brand. Purple drives every primary button,
 *     active nav state and focus ring; pink is the school's second identity
 *     colour and is spent on fees, where "money" is the obvious read.
 *  2. Emerald / amber / rose keep meaning status — good, pending, bad — so a
 *     domain only borrows one where the domain genuinely is that idea
 *     (attendance is presence; the exam pipeline is work in progress).
 *
 * A screen shows exactly one domain colour at a time. The rest of its palette
 * is still brand plus status.
 */

export type ModuleTone =
  | "brand"
  | "students"
  | "classes"
  | "timetable"
  | "attendance"
  | "exams"
  | "reports"
  | "fees"
  | "staff"
  | "leave"
  | "ai";

export interface ToneSpec {
  /** Gradient for the solid header tile the page icon sits in. */
  tile: string;
  /** The hairline rail across the top of a page header. */
  rail: string;
  /** Soft background + foreground, for inline icon chips. */
  chip: string;
  /** Foreground only, for an icon on its own. */
  text: string;
  /** Raw hex — inline styles, charts, shadows. */
  hex: string;
}

export const MODULE_TONES: Record<ModuleTone, ToneSpec> = {
  brand: {
    tile: "from-[#8127cf] to-[#6a1fb0]",
    rail: "from-[#8127cf] via-[#9c48ea] to-[#8127cf]",
    chip: "bg-[#fbf0fe] text-[#8127cf]",
    text: "text-[#8127cf]",
    hex: "#8127cf",
  },
  students: {
    tile: "from-[#8127cf] to-[#6a1fb0]",
    rail: "from-[#8127cf] via-[#b876f0] to-[#8127cf]",
    chip: "bg-[#fbf0fe] text-[#8127cf]",
    text: "text-[#8127cf]",
    hex: "#8127cf",
  },
  classes: {
    tile: "from-indigo-500 to-indigo-700",
    rail: "from-indigo-500 via-indigo-400 to-indigo-500",
    chip: "bg-indigo-50 text-indigo-600",
    text: "text-indigo-600",
    hex: "#4f46e5",
  },
  timetable: {
    tile: "from-cyan-500 to-cyan-700",
    rail: "from-cyan-500 via-cyan-400 to-cyan-500",
    chip: "bg-cyan-50 text-cyan-600",
    text: "text-cyan-600",
    hex: "#0891b2",
  },
  attendance: {
    tile: "from-emerald-500 to-emerald-700",
    rail: "from-emerald-500 via-emerald-400 to-emerald-500",
    chip: "bg-emerald-50 text-emerald-600",
    text: "text-emerald-600",
    hex: "#059669",
  },
  exams: {
    tile: "from-amber-500 to-amber-600",
    rail: "from-amber-500 via-amber-400 to-amber-500",
    chip: "bg-amber-50 text-amber-600",
    text: "text-amber-600",
    hex: "#d97706",
  },
  reports: {
    tile: "from-blue-500 to-blue-700",
    rail: "from-blue-500 via-blue-400 to-blue-500",
    chip: "bg-blue-50 text-blue-600",
    text: "text-blue-600",
    hex: "#2563eb",
  },
  fees: {
    // The school's second brand colour. Money is the one domain worth
    // spending it on.
    tile: "from-[#b10e6b] to-[#8a0a53]",
    rail: "from-[#b10e6b] via-[#d4318c] to-[#b10e6b]",
    chip: "bg-[#fdf0f7] text-[#b10e6b]",
    text: "text-[#b10e6b]",
    hex: "#b10e6b",
  },
  staff: {
    tile: "from-teal-500 to-teal-700",
    rail: "from-teal-500 via-teal-400 to-teal-500",
    chip: "bg-teal-50 text-teal-600",
    text: "text-teal-600",
    hex: "#0d9488",
  },
  leave: {
    tile: "from-orange-500 to-orange-600",
    rail: "from-orange-500 via-orange-400 to-orange-500",
    chip: "bg-orange-50 text-orange-600",
    text: "text-orange-600",
    hex: "#ea580c",
  },
  ai: {
    tile: "from-fuchsia-500 to-fuchsia-700",
    rail: "from-fuchsia-500 via-fuchsia-400 to-fuchsia-500",
    chip: "bg-fuchsia-50 text-fuchsia-600",
    text: "text-fuchsia-600",
    hex: "#c026d3",
  },
};

export function toneOf(tone: ModuleTone = "brand"): ToneSpec {
  return MODULE_TONES[tone] ?? MODULE_TONES.brand;
}
