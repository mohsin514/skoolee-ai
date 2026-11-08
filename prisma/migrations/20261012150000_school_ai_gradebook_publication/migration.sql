-- One immutable, assignment-scoped receipt for reviewed gradebook insertion.
ALTER TABLE "school_ai_exam_assignments" ADD COLUMN "gradebook_publication" JSONB;
ALTER TABLE "school_ai_exam_assignments"
  ADD CONSTRAINT "school_ai_exam_assignments_gradebook_publication_check"
  CHECK ("gradebook_publication" IS NULL OR jsonb_typeof("gradebook_publication") = 'object');
