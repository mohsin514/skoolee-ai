-- CreateTable
CREATE TABLE "school_ai_records" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL,
    "subject_id" TEXT,
    "class_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_revisions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT,
    "record_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_exam_assignments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "paper_version" INTEGER NOT NULL,
    "paper_snapshot" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "student_ids" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mode" TEXT NOT NULL DEFAULT 'STANDARD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_exam_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_exam_attempts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "responses" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "submitted_at" TIMESTAMP(3),
    "score_proposal" JSONB,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "review" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_records_school_id_campus_id_kind_updated_at_idx" ON "school_ai_records"("school_id", "campus_id", "kind", "updated_at");

-- CreateIndex
CREATE INDEX "school_ai_records_school_id_campus_id_created_by_id_updated_idx" ON "school_ai_records"("school_id", "campus_id", "created_by_id", "updated_at");

-- CreateIndex
CREATE INDEX "school_ai_records_school_id_campus_id_subject_id_status_idx" ON "school_ai_records"("school_id", "campus_id", "subject_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_records_school_id_created_by_id_idempotency_key_key" ON "school_ai_records"("school_id", "created_by_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_records_id_school_id_key" ON "school_ai_records"("id", "school_id");

-- CreateIndex
CREATE INDEX "school_ai_revisions_school_id_campus_id_created_at_idx" ON "school_ai_revisions"("school_id", "campus_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_revisions_record_id_version_key" ON "school_ai_revisions"("record_id", "version");

-- CreateIndex
CREATE INDEX "school_ai_exam_assignments_school_id_campus_id_class_id_sta_idx" ON "school_ai_exam_assignments"("school_id", "campus_id", "class_id", "starts_at");

-- CreateIndex
CREATE INDEX "school_ai_exam_assignments_school_id_created_by_id_status_idx" ON "school_ai_exam_assignments"("school_id", "created_by_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_assignments_id_school_id_campus_id_key" ON "school_ai_exam_assignments"("id", "school_id", "campus_id");

-- CreateIndex
CREATE INDEX "school_ai_exam_attempts_school_id_campus_id_student_id_stat_idx" ON "school_ai_exam_attempts"("school_id", "campus_id", "student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_attempts_assignment_id_user_id_key" ON "school_ai_exam_attempts"("assignment_id", "user_id");

-- AddForeignKey
ALTER TABLE "school_ai_records" ADD CONSTRAINT "school_ai_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_records" ADD CONSTRAINT "school_ai_records_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_revisions" ADD CONSTRAINT "school_ai_revisions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_revisions" ADD CONSTRAINT "school_ai_revisions_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_revisions" ADD CONSTRAINT "school_ai_revisions_record_id_school_id_fkey" FOREIGN KEY ("record_id", "school_id") REFERENCES "school_ai_records"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_assignments" ADD CONSTRAINT "school_ai_exam_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_assignments" ADD CONSTRAINT "school_ai_exam_assignments_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_assignments" ADD CONSTRAINT "school_ai_exam_assignments_paper_id_school_id_fkey" FOREIGN KEY ("paper_id", "school_id") REFERENCES "school_ai_records"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_attempts" ADD CONSTRAINT "school_ai_exam_attempts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_attempts" ADD CONSTRAINT "school_ai_exam_attempts_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_attempts" ADD CONSTRAINT "school_ai_exam_attempts_assignment_id_school_id_campus_id_fkey" FOREIGN KEY ("assignment_id", "school_id", "campus_id") REFERENCES "school_ai_exam_assignments"("id", "school_id", "campus_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Constrain lifecycle and payload bounds independently of the application validator.
ALTER TABLE "school_ai_records"
  ADD CONSTRAINT "school_ai_records_kind_check" CHECK ("kind" IN ('ONBOARDING','SOURCE','CURRICULUM','PAPER','WORKFLOW','POLICY')),
  ADD CONSTRAINT "school_ai_records_status_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED')),
  ADD CONSTRAINT "school_ai_records_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "school_ai_records_data_check" CHECK (jsonb_typeof("data") = 'object' AND octet_length("data"::text) <= 1048576);
ALTER TABLE "school_ai_revisions"
  ADD CONSTRAINT "school_ai_revisions_status_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED')),
  ADD CONSTRAINT "school_ai_revisions_action_check" CHECK ("action" IN ('CREATE','SAVE','REVIEW','APPROVE','ARCHIVE')),
  ADD CONSTRAINT "school_ai_revisions_version_check" CHECK ("version" > 0);
ALTER TABLE "school_ai_exam_assignments"
  ADD CONSTRAINT "school_ai_exam_assignments_window_check" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "school_ai_exam_assignments_version_check" CHECK ("version" > 0 AND "paper_version" > 0),
  ADD CONSTRAINT "school_ai_exam_assignments_students_check" CHECK (jsonb_typeof("student_ids") = 'array' AND jsonb_array_length("student_ids") BETWEEN 1 AND 2000);
ALTER TABLE "school_ai_exam_attempts"
  ADD CONSTRAINT "school_ai_exam_attempts_sequence_check" CHECK ("sequence" >= 0),
  ADD CONSTRAINT "school_ai_exam_attempts_deadline_check" CHECK ("deadline_at" >= "started_at");

-- Revisions may only be appended; tenant deletion can still cascade and remove its data.
CREATE FUNCTION school_ai_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'School AI revisions are immutable; append a new version';
END;
$$;
CREATE TRIGGER school_ai_revision_immutable_before_update
  BEFORE UPDATE ON "school_ai_revisions"
  FOR EACH ROW EXECUTE FUNCTION school_ai_revision_immutable();
