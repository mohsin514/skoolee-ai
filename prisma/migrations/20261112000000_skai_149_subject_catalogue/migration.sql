-- SKAI-149: additive, nullable/defaulted columns only.
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "is_elective" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
-- A code appears once per class, the "same code means the same subject" rule is school-wide and checked in code.
CREATE UNIQUE INDEX IF NOT EXISTS "subjects_class_id_code_key" ON "subjects" ("class_id", upper("code")) WHERE "code" IS NOT NULL;
