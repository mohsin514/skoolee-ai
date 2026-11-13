-- SKAI-1258: an offer may carry enrolment terms and an acceptance deposit; the family's agreement is recorded.
-- Additive, nullable columns only (backwards-compatible).
ALTER TABLE "admission_applications" ADD COLUMN IF NOT EXISTS "offer_terms" TEXT;
ALTER TABLE "admission_applications" ADD COLUMN IF NOT EXISTS "deposit_amount" INTEGER;
ALTER TABLE "admission_applications" ADD COLUMN IF NOT EXISTS "deposit_currency" TEXT;
ALTER TABLE "admission_applications" ADD COLUMN IF NOT EXISTS "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "admission_applications" ADD COLUMN IF NOT EXISTS "terms_hash" TEXT;
