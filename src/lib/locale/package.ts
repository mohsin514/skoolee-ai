import { z } from "zod";
import { countrySchema, currencyForCountry } from "./country";
import { isCampusOperator, isInstitutionAuthority, type InstitutionKind } from "@/lib/auth/institution";
import type { UserRole } from "@/lib/roles";

export const LANGUAGES = ["en", "ar", "ur"] as const;
export type Language = typeof LANGUAGES[number];
export const CURRENCIES = ["PKR", "SAR", "USD", "EUR", "GBP", "AED", "JPY", "KRW", "KWD", "BHD", "OMR"] as const;
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
export type LocalePackage = z.infer<typeof localePackageSchema>;
export const POLICY_KEYS = Object.keys(localePackageSchema.shape) as (keyof LocalePackage)[];
export const localePatchSchema = localePackageSchema.partial();
export const defaultLocale: LocalePackage = { language: "en", timezone: "Asia/Karachi", calendar: "gregory", numberingSystem: "latn", country: "OTHER", currency: "USD", weekStartsOn: 1, weekend: [0] };
export function localeTag(policy: LocalePackage) { return `${policy.language}-u-ca-${policy.calendar}-nu-${policy.numberingSystem}`; }
export function resolvePackage(school: Partial<LocalePackage>, campus: Partial<LocalePackage> = {}, personal?: Language | null): LocalePackage {
  const merged = { ...defaultLocale, ...school, ...campus, ...(personal ? { language: personal } : {}) };
  if (campus.country && !campus.currency) merged.currency = currencyForCountry(campus.country);
  else if (school.country && !school.currency && !campus.currency) merged.currency = currencyForCountry(school.country);
  return localePackageSchema.parse(merged);
}
export function dateOnly(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("date");
  return value;
}
export function formatDateOnly(value: string, policy: LocalePackage): string {
  return new Intl.DateTimeFormat(localeTag(policy), { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${dateOnly(value)}T00:00:00Z`));
}
export function formatInstant(value: string | Date, policy: LocalePackage): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error("instant");
  return new Intl.DateTimeFormat(localeTag(policy), { dateStyle: "long", timeStyle: "short", timeZone: policy.timezone }).format(instant);
}
/** The calendar date of an instant in the policy's timezone ("22 October 2026"), without the time. */
export function formatInstantDate(value: string | Date, policy: LocalePackage): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error("instant");
  return new Intl.DateTimeFormat(localeTag(policy), { dateStyle: "long", timeZone: policy.timezone }).format(instant);
}
export function minorUnits(currency: string): number {
  if (!CURRENCIES.includes(currency as typeof CURRENCIES[number])) throw new Error("currency");
  // Financial units are a versioned application contract, independent of runtime CLDR updates.
  const units: Record<typeof CURRENCIES[number], number> = { PKR: 2, SAR: 2, USD: 2, EUR: 2, GBP: 2, AED: 2, JPY: 0, KRW: 0, KWD: 3, BHD: 3, OMR: 3 };
  return units[currency as typeof CURRENCIES[number]];
}
export type Money = { minor: number; currency: string };
export function parseMoney(decimal: string, currency: string): Money {
  const precision = minorUnits(currency);
  if (!/^-?\d+(\.\d+)?$/.test(decimal)) throw new Error("amount");
  const [whole, fraction = ""] = decimal.replace(/^-/, "").split(".");
  // Explicit half-away-from-zero rounding, entirely in integer arithmetic.
  let magnitude = BigInt(whole) * BigInt(10) ** BigInt(precision) + BigInt(fraction.padEnd(precision, "0").slice(0, precision) || "0");
  if (Number(fraction[precision] || "0") >= 5) magnitude += BigInt(1);
  const minor = Number(decimal.startsWith("-") ? -magnitude : magnitude);
  if (!Number.isSafeInteger(minor)) throw new Error("amount");
  return { minor, currency };
}
export function sumMoney(values: Money[]): Money {
  if (!values.length) throw new Error("amount");
  const currency = values[0].currency;
  minorUnits(currency);
  if (values.some((v) => v.currency !== currency || !Number.isSafeInteger(v.minor))) throw new Error("mixedCurrency");
  const minor = values.reduce((sum, v) => sum + BigInt(v.minor), BigInt(0));
  if (!Number.isSafeInteger(Number(minor))) throw new Error("amount");
  return { currency, minor: Number(minor) };
}
export function formatMoney(value: Money, policy: LocalePackage): string {
  if (!Number.isSafeInteger(value.minor)) throw new Error("amount");
  const precision = minorUnits(value.currency);
  const digits = Math.abs(value.minor).toString().padStart(precision + 1, "0");
  const exact = `${value.minor < 0 ? "-" : ""}${precision ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}` : digits}`;
  // ECMA-402 ToIntlMathematicalValue preserves decimal strings exactly;
  // TypeScript's NumberFormat declaration predates string inputs.
  return new Intl.NumberFormat(localeTag(policy), { style: "currency", currency: value.currency, minimumFractionDigits: precision, maximumFractionDigits: precision }).format(exact as unknown as number);
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
