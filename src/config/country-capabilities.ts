// SKAI-891: versioned country capability matrix.
// A capability is only "ready" when a qualified/operated service has evidence
// that has not expired and a named accountable owner. A configured UI choice
// (a country in a dropdown, a currency, a board name) never implies support.
import { COUNTRIES, type Country } from "@/lib/locale/country";

export const COUNTRY_CAPABILITY_MATRIX_VERSION = "2026-11-08.1";

export const CAPABILITY_AREAS = ["academic", "finance", "tax", "payments", "payroll", "hosting", "support"] as const;
export type CapabilityArea = typeof CAPABILITY_AREAS[number];

/** "configured" = UI choice exists only; "pilot"/"supported" need evidence. */
export type CapabilityClaim = "unavailable" | "configured" | "pilot" | "supported";
export type CapabilityState = "unavailable" | "configured" | "pilot" | "supported";

export type CapabilityEntry = {
  claim: CapabilityClaim;
  /** Accountable owner role (never a personal name or contact detail). */
  owner?: string;
  /** Link/path to evidence (Jira key, docs path). */
  evidence?: string;
  /** ISO date the evidence was recorded. */
  evidenceDate?: string;
  /** ISO date after which the claim drops back to "configured". */
  evidenceExpires?: string;
  /** Existing-system handoff shown when the area is not ready. */
  alternative?: string;
};

const UNPROVEN: CapabilityEntry = { claim: "configured", alternative: "Keep using your existing system for this area." };
const NONE: CapabilityEntry = { claim: "unavailable", alternative: "Keep using your existing system for this area." };

function row(academic: CapabilityEntry): Record<CapabilityArea, CapabilityEntry> {
  return { academic, finance: UNPROVEN, tax: NONE, payments: NONE, payroll: UNPROVEN, hosting: UNPROVEN, support: UNPROVEN };
}

/**
 * No commercial evidence is recorded yet, so nothing beyond configured/unavailable
 * is claimed. Owners add evidence here (with an expiry) as tickets reach L3/L4.
 */
export const COUNTRY_CAPABILITIES: Record<Country, Record<CapabilityArea, CapabilityEntry>> = {
  PK: row(UNPROVEN),
  SA: row(UNPROVEN),
  AE: row(UNPROVEN),
  KW: row(UNPROVEN),
  OTHER: row(UNPROVEN),
};

export function capabilityState(entry: CapabilityEntry, now: Date = new Date()): CapabilityState {
  if (entry.claim === "unavailable" || entry.claim === "configured") return entry.claim;
  const valid = Boolean(entry.owner && entry.evidence && entry.evidenceDate && entry.evidenceExpires)
    && Date.parse(entry.evidenceDate!) <= now.getTime()
    && Date.parse(entry.evidenceExpires!) > now.getTime();
  return valid ? entry.claim : "configured";
}

export type CapabilityGap = { area: CapabilityArea; state: CapabilityState; alternative?: string };

/** Areas a chosen pilot needs that are not evidenced; empty means the pilot can start. */
export function missingCapabilities(
  country: Country,
  needed: readonly CapabilityArea[],
  options: { now?: Date; matrix?: typeof COUNTRY_CAPABILITIES } = {},
): CapabilityGap[] {
  const matrix = options.matrix ?? COUNTRY_CAPABILITIES;
  const rowFor = matrix[COUNTRIES.includes(country) ? country : "OTHER"];
  return needed.flatMap((area) => {
    const state = capabilityState(rowFor[area], options.now);
    return state === "supported" || state === "pilot" ? [] : [{ area, state, alternative: rowFor[area].alternative }];
  });
}
