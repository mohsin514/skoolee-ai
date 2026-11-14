-- SKAI-1170: add a nullable country code to schools so expansion-trigger metrics can count schools per country.
-- Additive and backwards-compatible: nullable column, no default, no backfill. Existing schools stay NULL until set.
-- Rollback: ALTER TABLE "schools" DROP COLUMN IF EXISTS "country";
SET lock_timeout = '10s';

ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "country" TEXT;
