-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "role" TEXT NOT NULL,
    "teacher_id" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teaching_assignments_school_id_campus_id_class_id_idx" ON "teaching_assignments"("school_id", "campus_id", "class_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_subject_id_idx" ON "teaching_assignments"("subject_id");

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-462: one active class per campus, name, section and year, and one subject per class and name,
-- enforced at commit so two concurrent creates cannot both succeed. Names compare trimmed and case-insensitively.
CREATE UNIQUE INDEX "classes_active_identity_key" ON "classes" ("campus_id", lower(btrim("name")), lower(btrim(coalesce("section", ''))), "academic_year") WHERE "archived_at" IS NULL;
CREATE UNIQUE INDEX "subjects_class_name_key" ON "subjects" ("class_id", lower(btrim("name")));

-- Teaching assignments: one open row per class role or subject; rows are only ever closed, never rewritten.
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignment_shape" CHECK (
  "role" IN ('CLASS_TEACHER', 'SUBJECT_TEACHER') AND (("role" = 'SUBJECT_TEACHER') = ("subject_id" IS NOT NULL))
  AND ("effective_to" IS NULL OR "effective_to" >= "effective_from"));
CREATE UNIQUE INDEX "teaching_assignments_one_open" ON "teaching_assignments" ("class_id", coalesce("subject_id", ''), "role") WHERE "effective_to" IS NULL;
CREATE FUNCTION teaching_assignment_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Teaching assignment history is kept';
  END IF;
  IF OLD.effective_to IS NOT NULL OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id OR NEW.class_id IS DISTINCT FROM OLD.class_id
    OR NEW.subject_id IS DISTINCT FROM OLD.subject_id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
    RAISE EXCEPTION 'A teaching assignment is only ever closed, once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teaching_assignment_history_guard BEFORE UPDATE OR DELETE ON "teaching_assignments" FOR EACH ROW EXECUTE FUNCTION teaching_assignment_history_guard();

-- Backfill: the current assignments become the open rows, effective from the migration date (creation time is not recorded on these tables).
INSERT INTO "teaching_assignments" ("id", "school_id", "campus_id", "class_id", "subject_id", "role", "teacher_id", "effective_from", "created_by_id")
SELECT gen_random_uuid()::text, c."school_id", c."campus_id", c."id", NULL, 'CLASS_TEACHER', c."class_teacher_id", CURRENT_DATE, 'migration'
FROM "classes" c WHERE c."class_teacher_id" IS NOT NULL;
INSERT INTO "teaching_assignments" ("id", "school_id", "campus_id", "class_id", "subject_id", "role", "teacher_id", "effective_from", "created_by_id")
SELECT gen_random_uuid()::text, s."school_id", s."campus_id", s."class_id", s."id", 'SUBJECT_TEACHER', s."teacher_id", CURRENT_DATE, 'migration'
FROM "subjects" s WHERE s."teacher_id" IS NOT NULL;
