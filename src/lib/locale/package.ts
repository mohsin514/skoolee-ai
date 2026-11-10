import { z } from "zod";
import { countrySchema, currencyForCountry } from "./country";
import { isCampusOperator, isInstitutionAuthority, type InstitutionKind } from "@/lib/auth/institution";
import type { UserRole } from "@/lib/roles";

import { CURRENCIES, LANGUAGES, defaultLocale, type Language, type LocalePackage } from "./package-core";

export * from "./package-core";
export const localePackageSchema = z.object({
  language: z.enum(LANGUAGES),
  country: countrySchema.optional(),
  timezone: z.string().refine((zone) => { try { if (zone !== "UTC" && !zone.includes("/")) return false; return !!new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone; } catch { return false; } }, "timezone"),
  calendar: z.enum(["gregory", "iso8601"]),
  numberingSystem: z.enum(["latn", "arab"]),
  currency: z.enum(CURRENCIES),
  weekStartsOn: z.number().int().min(0).max(6),
  weekend: z.array(z.number().int().min(0).max(6)).max(6).refine((v) => new Set(v).size === v.length),
}).strict();
// The hand-written type in ./package-core must match the schema both ways.
type ParsedLocalePackage = z.infer<typeof localePackageSchema>;
const _toCore = (v: ParsedLocalePackage): LocalePackage => v;
const _fromCore = (v: LocalePackage): ParsedLocalePackage => v;
void _toCore; void _fromCore;
export const POLICY_KEYS = Object.keys(localePackageSchema.shape) as (keyof LocalePackage)[];
export const localePatchSchema = localePackageSchema.partial();
// Registration stores country identity alongside locale preferences. It is metadata,
// not a delegated locale setting; keep incoming locale edits strictly validated.
const storedLocaleSettingsSchema = localePatchSchema.extend({
  countryIso: z.string().regex(/^[A-Z]{2}$/).optional(),
});
export function parseStoredLocaleSettings(value: unknown): Partial<LocalePackage> {
  const { countryIso: _countryIso, ...settings } = storedLocaleSettingsSchema.parse(value);
  return settings;
}
export function resolvePackage(school: Partial<LocalePackage>, campus: Partial<LocalePackage> = {}, personal?: Language | null): LocalePackage {
  const merged = { ...defaultLocale, ...school, ...campus, ...(personal ? { language: personal } : {}) };
  if (campus.country && !campus.currency) merged.currency = currencyForCountry(campus.country);
  else if (school.country && !school.currency && !campus.currency) merged.currency = currencyForCountry(school.country);
  return localePackageSchema.parse(merged);
}
/** Who is changing the locale: the role plus the institution kind and owner flag the authority rule reads (§1.1). */
export type LocaleActor = { role: UserRole; institutionKind?: InstitutionKind; isInstitutionOwner?: boolean; canPurchaseSubscription?: boolean };
/**
 * School-scope language and region belong to the institution authority (§2.1 #9, G13): the group admin of a school
 * group, the school admin of a single school. Never decided by campus count.
 */
export function canManageSchool(user: LocaleActor) { return isInstitutionAuthority(user); }
/**
 * Campus-scope changes: the authority may change anything; a campus operator (CAMPUS_ADMIN / ADMIN) only the keys
 * the school delegated, and only on their own campus. The principal is academic and never edits locale (G13).
 */
export function assertDelegatedChanges(user: LocaleActor, ownCampus: string | null, targetCampus: string | null, delegated: string[], patch: Partial<LocalePackage>) {
  if (canManageSchool(user)) return;
  if (!targetCampus || ownCampus !== targetCampus || !isCampusOperator(user) || Object.keys(patch).some((key) => !delegated.includes(key))) throw new Error("permission");
}
