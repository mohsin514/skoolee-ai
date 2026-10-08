-- Structured teaching specialities so teachers can be badged ("Math teacher")
-- and warned about when assigned outside their subject.
ALTER TABLE "users" ADD COLUMN "subject_specialties" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "users" ADD COLUMN "teaches_all_subjects" BOOLEAN NOT NULL DEFAULT false;

-- Best-effort backfill from the existing free-text `specialization` column.
-- Values there look like "Mathematics" or "Mathematics, Physics", so split on
-- commas and trim. Rows with an empty/blank specialization are left as '{}'.
UPDATE "users"
SET "subject_specialties" = ARRAY(
  SELECT btrim(part)
  FROM unnest(string_to_array("specialization", ',')) AS part
  WHERE btrim(part) <> ''
)
WHERE "specialization" IS NOT NULL
  AND btrim("specialization") <> '';

-- Teachers who describe themselves as generalists shouldn't be nagged about
-- teaching "outside" a speciality.
UPDATE "users"
SET "teaches_all_subjects" = true
WHERE "specialization" IS NOT NULL
  AND lower(btrim("specialization")) IN ('all', 'all subjects', 'general', 'generalist', 'any');
