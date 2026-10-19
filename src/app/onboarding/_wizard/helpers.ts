import {
  Building, CalendarRange, ClipboardCheck, Layers, Package, Users, type LucideIcon,
} from "lucide-react";
import type { CampusDraft, SetupStepId } from "@/lib/onboarding/setup-state";
import type { Language } from "@/lib/locale/package";

export const STEP_ICONS: Record<SetupStepId, LucideIcon> = {
  structure: Layers, identity: Building, package: Package, campuses: Users, academic: CalendarRange, review: ClipboardCheck,
};

/** ISO weekday numbering — 1 = Monday … 7 = Sunday, matching the Weekend model. */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7];

export const TIMEZONES = [
  { value: "Asia/Karachi", label: "Pakistan — Asia/Karachi (PKT)" },
  { value: "Asia/Dubai", label: "UAE — Asia/Dubai (GST)" },
  { value: "Asia/Riyadh", label: "Saudi Arabia — Asia/Riyadh (AST)" },
  { value: "Asia/Kolkata", label: "India — Asia/Kolkata (IST)" },
  { value: "Asia/Dhaka", label: "Bangladesh — Asia/Dhaka (BST)" },
  { value: "Asia/Kabul", label: "Afghanistan — Asia/Kabul (AFT)" },
  { value: "Europe/London", label: "UK — Europe/London" },
  { value: "America/New_York", label: "US Eastern — America/New_York" },
  { value: "UTC", label: "UTC" },
];

export const generateId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

/** "2026-27" from 2026 — the label a school actually writes on a report card. */
export const sessionLabelFor = (year: number) => `${year}-${String((year + 1) % 100).padStart(2, "0")}`;

export type CampusForm = Omit<CampusDraft, "key">;
export const emptyCampus = (): CampusForm => ({
  name: '', city: '', address: '', phone: '', email: '', website: '', principalName: '',
  // "" = the first board for the school's country (shown by the composer, resolved at activation).
  regId: generateId('BR'), autoId: true, board: '',
});

/** Featured zones first, then every IANA zone the browser knows, so a school anywhere can pick its own. */
export function timezoneOptions(): { value: string; label: string }[] {
  let all: string[] = [];
  try { all = (Intl as unknown as { supportedValuesOf?(key: string): string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { all = []; }
  const featured = new Set(TIMEZONES.map((z) => z.value));
  return [...TIMEZONES, ...all.filter((zone) => !featured.has(zone)).map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))];
}

export { weekdayName } from "@/components/onboarding/weekday";

/** The saved setup's language as one of the shell's three (AuthShell, WeekStrip and InstitutionPreview take it). */
export const toLanguage = (raw: string | null | undefined): Language => {
  const code = (raw || "en").slice(0, 2).toLowerCase();
  return code === "ar" ? "ar" : code === "ur" ? "ur" : "en";
};

/** The step that owns each validated field: drives the rail's attention dots and the cover ledger's flags. */
export const FIELD_STEP: Record<string, SetupStepId> = {
  adoptionMode: "structure",
  website: "identity", name: "identity", city: "identity", phone: "identity", email: "identity", establishedYear: "identity", regId: "identity",
  campuses: "campuses",
  academicYear: "academic", sessionLabel: "academic", sessionStart: "academic", sessionEnd: "academic", weekends: "academic",
};

/** The owning step of an error key (`campus:<key>` rows belong to campuses), or null when unknown. */
export const fieldStep = (field: string): SetupStepId | null =>
  field.startsWith("campus:") ? "campuses" : FIELD_STEP[field] ?? null;
