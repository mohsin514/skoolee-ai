import type { AuthUser } from "@/lib/auth";
import { canOwnSubscription, kindFor } from "@/lib/auth/institution";

/**
 * Where the SkooleeAI subscription lives (§6.2, C12). Pure and client-safe: the `/billing` resolver page, Stripe
 * and SafePay return URLs, notifications and the suspended screen all ask this one function.
 */

/** Return parameters a payment provider or the suspended screen may hand back to the billing workspace. */
export const BILLING_RETURN_PARAMS = ["success", "canceled", "session_id", "safepay_status"] as const;

/** Neutral plan copy shared by the proxy, entitlements and AI credits (G51, D19): it names who acts and never
 *  links to billing, so it reads correctly for every role. */
export const SUBSCRIPTION_PAUSED_MESSAGE = "This school's SkooleeAI plan is paused until the account owner renews it.";

type Who = Pick<AuthUser, "role"> & Partial<Pick<AuthUser, "institutionKind" | "isInstitutionOwner" | "canPurchaseSubscription">>;

/**
 * GROUP payer → `/super?view=billing`; STANDALONE payer → `/admin?view=billing`; anyone else → null (they see
 * "Managed by {name}" instead). Params are appended with URLSearchParams, never concatenated.
 */
export function billingHubPath(user: Who, params?: Record<string, string>): string | null {
  if (!canOwnSubscription(user)) return null;
  const kind = kindFor(user);
  const base = kind === "GROUP" ? "/super" : kind === "STANDALONE" ? "/admin" : null;
  if (!base) return null;
  const query = new URLSearchParams({ view: "billing" });
  for (const [key, value] of Object.entries(params ?? {})) {
    if (key !== "view" && typeof value === "string" && value.length > 0) query.set(key, value);
  }
  return `${base}?${query.toString()}`;
}

/** Keeps only the listed keys with a single string value (Next `searchParams` may hold arrays). */
export function pickParams(source: Record<string, string | string[] | undefined>, keys: readonly string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === "string" && single.length > 0 && single.length <= 256) picked[key] = single;
  }
  return picked;
}
