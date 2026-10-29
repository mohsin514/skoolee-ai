-- SKAI-1123: fee structures are priced per academic year.
-- Backwards-compatible: the column is nullable and existing code paths keep working while it is null.

ALTER TABLE "fee_structures" ADD COLUMN "academic_year_id" TEXT;

-- Backfill each structure to its campus's active academic year (latest year when several are ACTIVE).
UPDATE "fee_structures" fs
SET "academic_year_id" = active."id"
FROM (
  SELECT DISTINCT ON ("campus_id") "id", "campus_id", "school_id"
  FROM "academic_cycles"
  WHERE "status" = 'ACTIVE'
  ORDER BY "campus_id", "academic_year" DESC
) active
WHERE active."campus_id" = fs."campus_id"
  AND active."school_id" = fs."school_id"
  AND fs."academic_year_id" IS NULL;

ALTER TABLE "fee_structures"
  ADD CONSTRAINT "fee_structures_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "fee_structures_academic_year_id_idx" ON "fee_structures"("academic_year_id");

-- Unique key now includes the year, so the same class can have a structure per year.
DROP INDEX IF EXISTS "fee_structures_class_id_active_from_key";
CREATE UNIQUE INDEX "fee_structures_class_id_academic_year_id_active_from_key"
  ON "fee_structures"("class_id", "academic_year_id", "active_from");
