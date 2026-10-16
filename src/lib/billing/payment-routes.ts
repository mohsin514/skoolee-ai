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
