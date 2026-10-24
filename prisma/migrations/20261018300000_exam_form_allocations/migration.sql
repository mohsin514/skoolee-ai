-- AlterTable
ALTER TABLE "school_ai_exam_form_sets" ALTER COLUMN "brief_record_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "school_ai_exam_form_allocations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "form_set_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "form_label" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_exam_form_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_exam_form_allocations_school_id_campus_id_assignm_idx" ON "school_ai_exam_form_allocations"("school_id", "campus_id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_form_allocations_form_set_id_student_id_key" ON "school_ai_exam_form_allocations"("form_set_id", "student_id");

-- AddForeignKey
ALTER TABLE "school_ai_exam_form_allocations" ADD CONSTRAINT "school_ai_exam_form_allocations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_form_allocations" ADD CONSTRAINT "school_ai_exam_form_allocations_form_set_id_school_id_camp_fkey" FOREIGN KEY ("form_set_id", "school_id", "campus_id") REFERENCES "school_ai_exam_form_sets"("id", "school_id", "campus_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-408 invariants: a candidate's form is a label of the set and, once recorded, never changes.
ALTER TABLE "school_ai_exam_form_allocations" ADD CONSTRAINT "school_ai_exam_form_allocation_label" CHECK ("form_label" IN ('A', 'B', 'C', 'D'));
CREATE FUNCTION school_ai_exam_form_allocation_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM school_ai_exam_form_sets WHERE id = OLD.form_set_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'A candidate''s form allocation is frozen once recorded';
END $$;
CREATE TRIGGER school_ai_exam_form_allocation_frozen BEFORE UPDATE OR DELETE ON "school_ai_exam_form_allocations" FOR EACH ROW EXECUTE FUNCTION school_ai_exam_form_allocation_frozen();
