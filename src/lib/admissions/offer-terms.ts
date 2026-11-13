import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/scope";

// SKAI-1258: an offer may carry enrolment terms (the contract the family agrees to) and an acceptance deposit.
// The family must tick agreement to the exact terms shown; we keep the time and a hash of that text, so a later
// edit of the offer never rewrites what was agreed. The deposit is recorded as owed on acceptance; the school
// raises the invoice once the pupil is enrolled (an applicant has no student record to bill yet).

export type OfferTerms = { offerTerms: string | null; depositAmount: number | null; depositCurrency: string | null };

export function parseOfferTerms(body: Record<string, unknown>): OfferTerms {
  const terms = String(body.offerTerms ?? "").trim();
  if (terms.length > 10_000) throw new ApiError("The enrolment terms are too long (max 10000).", 400);
  if (terms && terms.length < 10) throw new ApiError("The enrolment terms need at least 10 characters.", 400);
  const raw = body.depositAmount;
  if (raw === undefined || raw === null || raw === "") return { offerTerms: terms || null, depositAmount: null, depositCurrency: null };
  const amount = Number(raw);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000_000) throw new ApiError("Enter the deposit as a whole amount greater than zero.", 400);
  const currency = String(body.depositCurrency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError("Choose the deposit currency (for example PKR, SAR, USD).", 400);
  return { offerTerms: terms || null, depositAmount: amount, depositCurrency: currency };
}

export const termsHash = (terms: string) => createHash("sha256").update(terms).digest("hex");

/** What a family acceptance writes. Terms on the offer must be explicitly agreed to. */
export function acceptTerms(application: { offerTerms: string | null }, agreed: unknown, now = new Date()) {
  if (!application.offerTerms) return { termsAcceptedAt: null, termsHash: null };
  if (agreed !== true) throw new ApiError("Read and agree to the enrolment terms before accepting the place.", 400);
  return { termsAcceptedAt: now, termsHash: termsHash(application.offerTerms) };
}
