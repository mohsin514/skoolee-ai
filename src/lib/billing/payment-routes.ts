import type { Country } from "@/lib/locale/country";

export type OnboardingPaymentMethod = "stripe" | "safepay" | "bank_transfer";

// Every school can pay for its package itself, wherever it is. Stripe takes
// international cards and bank transfer works from anywhere; SafePay serves
// Pakistani cards and wallets only, so it is offered to Pakistani schools.
// Prices stay in the approved PKR catalogue (the card issuer converts).
const SAFEPAY_COUNTRIES: ReadonlySet<Country> = new Set(["PK"]);

/** Whether a school in `country` can pay online at all (given a configured rail). */
export function automatedCheckoutAvailable(_country: Country): boolean {
  return true;
}

/** Payment methods a school in `country` may actually use, out of those configured. */
export function regionalPaymentMethods(country: Country, configured: readonly OnboardingPaymentMethod[]): OnboardingPaymentMethod[] {
  return configured.filter((method) => method !== "safepay" || SAFEPAY_COUNTRIES.has(country));
}

export function safePayAvailable(country: Country): boolean {
  return SAFEPAY_COUNTRIES.has(country);
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
