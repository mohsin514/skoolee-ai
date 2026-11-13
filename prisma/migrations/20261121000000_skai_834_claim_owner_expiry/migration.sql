ALTER TABLE "pilot_claims" ADD COLUMN IF NOT EXISTS "owner_name" TEXT;
ALTER TABLE "pilot_claims" ADD COLUMN IF NOT EXISTS "expires_on" DATE;
