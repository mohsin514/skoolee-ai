import type { Country } from "@/lib/locale/country";

export type OnboardingPaymentMethod = "stripe" | "safepay" | "bank_transfer";

// The approved catalogue is priced in PKR and the configured rails (SafePay,
// the Pakistani bank account, the PKR Stripe prices) are only validated for
// Pakistani schools. Elsewhere, paid packages go through a sales-assisted
// quote instead of an automated checkout we have not verified for that market.
const AUTOMATED_CHECKOUT_COUNTRIES: ReadonlySet<Country> = new Set(["PK"]);

export function automatedCheckoutAvailable(country: Country): boolean {
  return AUTOMATED_CHECKOUT_COUNTRIES.has(country);
}

/** Payment methods a school in `country` may actually use, out of those configured. */
export function regionalPaymentMethods(country: Country, configured: readonly OnboardingPaymentMethod[]): OnboardingPaymentMethod[] {
  return automatedCheckoutAvailable(country) ? [...configured] : [];
}

/**
 * A paid package chosen where no online payment is possible (region not
 * automated, or no rail configured): the choice is recorded as reserved
 * (status PENDING_SETTLEMENT) and the team confirms price and payment. No
 * money moves and no plan activates until it is settled.
 */
export const SALES_ASSISTED_PROVIDER = "SALES_ASSISTED" as const;

/** A paid package chosen with "pay later": payment due, nothing charged, the plan activates once paid. */
export const PAY_LATER_PROVIDER = "PAY_LATER" as const;
