// ─────────────────────────────────────────────────────────────────
// SKAI-114: school identity and branding.
//
// A school picks its brand colour from a fixed palette rather than typing a hex, so every colour it can pick
// keeps white text and white paper legible (WCAG AA, 4.5:1) on headers, report cards and PDFs. The official
// name may also be stored in Urdu and Arabic; documents printed in those languages use it.
// ─────────────────────────────────────────────────────────────────

export const BRAND_PALETTE = [
  { id: "plum", label: "Plum", hex: "#6B21A8" },
  { id: "indigo", label: "Indigo", hex: "#3730A3" },
  { id: "blue", label: "Blue", hex: "#1D4ED8" },
  { id: "teal", label: "Teal", hex: "#0F766E" },
  { id: "green", label: "Green", hex: "#15803D" },
  { id: "maroon", label: "Maroon", hex: "#9F1239" },
  { id: "bronze", label: "Bronze", hex: "#92400E" },
  { id: "slate", label: "Slate", hex: "#334155" },
] as const;

export type BrandColorId = (typeof BRAND_PALETTE)[number]["id"];

/** WCAG relative-luminance contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A palette id, or null for "use the default". Anything else (including raw hex) is refused. */
export function parseBrandColor(value: unknown): BrandColorId | null {
  if (value === null || value === undefined || value === "") return null;
  const match = BRAND_PALETTE.find((entry) => entry.id === value);
  if (!match) throw new Error("Choose a brand colour from the palette.");
  return match.id;
}

/** The hex for a stored palette id, or null when unset or no longer in the palette. */
export function brandHex(id: string | null | undefined): string | null {
  return BRAND_PALETTE.find((entry) => entry.id === id)?.hex ?? null;
}

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/** An optional Urdu or Arabic official name: it has to be written in Arabic script and fit on one header line. */
export function assertScriptName(value: string | null, field: string): string | null {
  if (!value) return null;
  if (!ARABIC_SCRIPT.test(value)) throw new Error(`${field} must be written in Arabic script.`);
  if (value.length > 120) throw new Error(`${field} must be 120 characters or fewer.`);
  return value;
}

/** A short name for tight spaces (sidebars, SMS): 2 to 24 characters. */
export function assertShortName(value: string | null): string | null {
  if (!value) return null;
  if (value.length < 2 || value.length > 24) throw new Error("Short name must be 2 to 24 characters.");
  return value;
}

/** The official name in the document's language, falling back to the English name. */
export function localizedSchoolName(school: { name: string; nameUr?: string | null; nameAr?: string | null } | null | undefined, language: string): string {
  if (!school) return "";
  if (language === "ur" && school.nameUr) return school.nameUr;
  if (language === "ar" && school.nameAr) return school.nameAr;
  return school.name;
}
