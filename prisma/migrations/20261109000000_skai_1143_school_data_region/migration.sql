-- SKAI-1143: per-school hosting region, so tenants can be routed later without a schema rewrite.
-- Backwards-compatible: every existing school takes the default (the shared region it already runs in).

ALTER TABLE "schools" ADD COLUMN "data_region" TEXT NOT NULL DEFAULT 'DEFAULT';

ALTER TABLE "schools"
  ADD CONSTRAINT "schools_data_region_check" CHECK ("data_region" IN ('DEFAULT', 'UAE', 'KSA'));
