// ─────────────────────────────────────────────────────────────────
// SKAI-1143: where a school's data is hosted.
//
// Every school runs in the shared Supabase region today (SKAI-1101 §6). The
// attribute exists so that a later in-Kingdom or in-UAE stack can route a
// tenant by its region without rewriting the schema. Changing it moves no
// data on its own; it is a platform-owner decision, recorded and audited.
// ─────────────────────────────────────────────────────────────────

export const DATA_REGIONS = ["DEFAULT", "UAE", "KSA"] as const;
export type DataRegion = (typeof DATA_REGIONS)[number];
export const DEFAULT_DATA_REGION: DataRegion = "DEFAULT";

export const DATA_REGION_LABELS: Record<DataRegion, string> = {
  DEFAULT: "Shared region (current)",
  UAE: "United Arab Emirates",
  KSA: "Saudi Arabia",
};

export function isDataRegion(value: unknown): value is DataRegion {
  return typeof value === "string" && (DATA_REGIONS as readonly string[]).includes(value);
}

/** Accepts any letter case and surrounding spaces; throws on anything outside the list. */
export function parseDataRegion(value: unknown): DataRegion {
  const normalised = typeof value === "string" ? value.trim().toUpperCase() : value;
  if (!isDataRegion(normalised)) throw new Error(`dataRegion must be one of: ${DATA_REGIONS.join(", ")}`);
  return normalised;
}
