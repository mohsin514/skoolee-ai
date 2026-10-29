-- SKAI-1154: opt-in regulator fee caps. Additive and nullable/defaulted, so existing rows and code are unaffected.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "fee_cap_mode" TEXT NOT NULL DEFAULT 'OFF';
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "fee_cap_framework" TEXT NOT NULL DEFAULT 'KHDA_ECI';
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "approved_fee" INTEGER;
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "approved_fee_reference" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "approved_fee" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "approved_fee_reference" TEXT;
