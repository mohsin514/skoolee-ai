/**
 * SKAI-161: one reading of "where does the school's package stand", shared by the setup wizard's package step and
 * the order status page so both name the same state and offer the same next action.
 */
export type PackageStatusKey =
  | "active" | "reserved" | "requested" | "bank" | "checkout" | "due"
  | "grace" | "expired" | "failed" | "cancelled";

export type PackageNextAction = "none" | "pay" | "track" | "renew" | "choose";

export type PackageChoice = { status: string; provider: string };
export type SchoolLifecycle = { status?: string | null; lifecycleState?: string | null; graceEndsAt?: string | Date | null };

const GRACE_STATES = new Set(["PAST_DUE_GRACE", "APPROVED_GRACE"]);

export function packageStatus(choice: PackageChoice, school?: SchoolLifecycle | null, now = new Date()): { key: PackageStatusKey; next: PackageNextAction } {
  const { status, provider } = choice;
  if (status === "FAILED") return { key: "failed", next: "choose" };
  if (status === "CANCELLED") return { key: "cancelled", next: "choose" };
  if (status === "CUSTOM_QUOTE") return { key: "requested", next: "track" };
  if (status === "FREE_SELECTED" || status === "SETTLED") {
    // An active package can still lapse: the school's subscription lifecycle decides grace and expiry.
    const graceEnds = school?.graceEndsAt ? new Date(school.graceEndsAt) : null;
    if (school?.lifecycleState && GRACE_STATES.has(school.lifecycleState)) {
      return graceEnds && graceEnds > now ? { key: "grace", next: "renew" } : { key: "expired", next: "renew" };
    }
    if (String(school?.status || "").toUpperCase() === "SUSPENDED" || school?.lifecycleState === "PAST_DUE" || school?.lifecycleState === "EXPIRED") {
      return { key: "expired", next: "renew" };
    }
    return { key: "active", next: "none" };
  }
  if (provider === "SALES_ASSISTED") return { key: "reserved", next: "track" };
  if (provider === "BANK_TRANSFER") return { key: "bank", next: "track" };
  if (provider === "PAY_LATER") return { key: "due", next: "pay" };
  return { key: "checkout", next: "track" };
}

/** Amounts in the reader's language, with the catalogue's currency (null when unknown). */
export function formatPackageAmount(amount: number, currency: string | null, language: string) {
  const locale = language === "ar" ? "ar" : language === "ur" ? "ur-PK" : "en";
  if (!currency) return amount.toLocaleString(locale);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(locale)}`;
  }
}
