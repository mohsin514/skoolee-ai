import { ANNUAL_DISCOUNT, type BillingPeriod } from "@/config/plans";
import type { PlanPricing } from "@/types";

/**
 * Billing maths for "free core, paid flagship" (catalogue 2026-11-12.1). Checkout, Billing & plan, the setup
 * package chooser, owner review and the pricing page all quote through these, so every surface shows the
 * amount the provider charges. Pure: safe in client components.
 *
 * A per-student plan charges `price × billed students`, where billed students = max(active students,
 * minBilledStudents). Terms approved before 2026-11-12.1 are "per_school": one flat monthly price.
 * Annual billing takes ANNUAL_DISCOUNT off twelve months of the unit price, rounded to whole rupees per unit
 * (the per-unit amount a provider price carries), so a yearly bill is that unit price × billed students.
 */

/** The pricing fields of a catalogue plan or a school's saved terms. */
export type PricedTerms = { price: number | null; pricing?: PlanPricing; minBilledStudents?: number };

export function isPerStudent(terms: { pricing?: PlanPricing }) {
  return terms.pricing === "per_student";
}

function wholeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Students a plan bills for: the active count raised to the plan's minimum; 0 for a free or flat-priced plan. */
export function billedStudentCount(terms: PricedTerms, activeStudents: number) {
  if (!isPerStudent(terms) || !terms.price) return 0;
  return Math.max(wholeCount(activeStudents), terms.minBilledStudents ?? 0);
}

/** Units a provider charges: billed students for a per-student plan, one for a flat price. */
export function billedUnits(terms: PricedTerms, activeStudents: number) {
  return isPerStudent(terms) ? billedStudentCount(terms, activeStudents) : 1;
}

/** One unit's price for the period (a student, or the whole school); null = quoted. */
export function periodUnitPrice(price: number | null | undefined, period: BillingPeriod) {
  if (price == null) return null;
  return period === "annual" ? Math.round(price * (1 - ANNUAL_DISCOUNT) * 12) : price;
}

/** The amount for one billing period: the unit price × billed students, or the flat price; null = quoted. */
export function planPeriodAmount(terms: PricedTerms, activeStudents: number, period: BillingPeriod) {
  const unit = periodUnitPrice(terms.price, period);
  if (unit == null) return null;
  return isPerStudent(terms) ? unit * billedStudentCount(terms, activeStudents) : unit;
}

/** The catalogue's price label: "PKR 15 per student/mo", "PKR 4,000/mo", "Free", or "Custom" when quoted. */
export function planPriceLabel(terms: PricedTerms, currency = "PKR") {
  if (terms.price == null) return "Custom";
  if (terms.price === 0) return "Free";
  const amount = `${currency} ${terms.price.toLocaleString("en-US")}`;
  return isPerStudent(terms) ? `${amount} per student/mo` : `${amount}/mo`;
}

/** A plan's monthly AI credit allowance: the larger of its fixed credits and its per-student credits. */
export function monthlyAiCreditAllowance(terms: { aiCredits: number; aiCreditsPerStudent?: number }, activeStudents: number) {
  if (terms.aiCredits < 0) return terms.aiCredits;
  return Math.max(terms.aiCredits, Math.max(0, terms.aiCreditsPerStudent ?? 0) * wholeCount(activeStudents));
}

/**
 * The allowance an AI charge is checked against. A per-student plan's allowance is set on the school
 * (`aiCreditsLimit`) when the plan activates and at each calendar-month reset, never below the plan's fixed
 * credits; any other plan uses its saved credits, as before.
 */
export function aiCreditLimit(terms: { aiCredits: number; aiCreditsPerStudent?: number }, storedAllowance: number | null | undefined) {
  if (!((terms.aiCreditsPerStudent ?? 0) > 0)) return terms.aiCredits;
  return Math.max(terms.aiCredits, storedAllowance ?? 0);
}
