-- Persist how teaching is organised per section.
-- SINGLE  = the class teacher takes every subject
-- SUBJECT = each subject has its own teacher
ALTER TABLE "classes" ADD COLUMN "teaching_mode" TEXT NOT NULL DEFAULT 'SINGLE';

-- Backfill existing rows: a class already has per-subject teaching if any of its
-- subjects is taught by someone other than the class teacher (or by a teacher
-- while the class itself has none). Everything else stays SINGLE.
UPDATE "classes" c
SET "teaching_mode" = 'SUBJECT'
WHERE EXISTS (
  SELECT 1
  FROM "subjects" s
  WHERE s."class_id" = c."id"
    AND s."teacher_id" IS NOT NULL
    AND (c."class_teacher_id" IS NULL OR s."teacher_id" <> c."class_teacher_id")
);
