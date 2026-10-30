-- AlterTable
ALTER TABLE "school_ai_exam_attempts" ADD COLUMN     "review_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "school_ai_substitute_duties" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "timetable_slot_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "original_teacher_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "assigned_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_substitute_duties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_exam_result_revisions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "review" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_exam_result_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_exam_appeals" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "result_version" INTEGER NOT NULL,
    "student_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolution" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_exam_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_runs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "access_version" INTEGER NOT NULL,
    "policy_id" TEXT,
    "policy_version" INTEGER,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "steps" JSONB NOT NULL,
    "next_step" INTEGER NOT NULL DEFAULT 0,
    "receipts" JSONB NOT NULL DEFAULT '[]',
    "error_code" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_substitute_duties_school_id_campus_id_date_teache_idx" ON "school_ai_substitute_duties"("school_id", "campus_id", "date", "teacher_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_substitute_duties_school_id_timetable_slot_id_dat_key" ON "school_ai_substitute_duties"("school_id", "timetable_slot_id", "date");

-- CreateIndex
CREATE INDEX "school_ai_exam_result_revisions_school_id_campus_id_assignm_idx" ON "school_ai_exam_result_revisions"("school_id", "campus_id", "assignment_id", "attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_result_revisions_attempt_id_version_key" ON "school_ai_exam_result_revisions"("attempt_id", "version");

-- CreateIndex
CREATE INDEX "school_ai_exam_appeals_school_id_campus_id_assignment_id_st_idx" ON "school_ai_exam_appeals"("school_id", "campus_id", "assignment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_appeals_attempt_id_result_version_key" ON "school_ai_exam_appeals"("attempt_id", "result_version");

-- CreateIndex
CREATE INDEX "school_ai_runs_status_scheduled_at_id_idx" ON "school_ai_runs"("status", "scheduled_at", "id");

-- CreateIndex
CREATE INDEX "school_ai_runs_school_id_campus_id_created_at_idx" ON "school_ai_runs"("school_id", "campus_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_runs_school_id_actor_id_idempotency_key_key" ON "school_ai_runs"("school_id", "actor_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_attempts_id_school_id_campus_id_key" ON "school_ai_exam_attempts"("id", "school_id", "campus_id");

-- AddForeignKey
ALTER TABLE "school_ai_substitute_duties" ADD CONSTRAINT "school_ai_substitute_duties_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_substitute_duties" ADD CONSTRAINT "school_ai_substitute_duties_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_result_revisions" ADD CONSTRAINT "school_ai_exam_result_revisions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_result_revisions" ADD CONSTRAINT "school_ai_exam_result_revisions_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_result_revisions" ADD CONSTRAINT "school_ai_exam_result_revisions_attempt_id_school_id_campu_fkey" FOREIGN KEY ("attempt_id", "school_id", "campus_id") REFERENCES "school_ai_exam_attempts"("id", "school_id", "campus_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_appeals" ADD CONSTRAINT "school_ai_exam_appeals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_appeals" ADD CONSTRAINT "school_ai_exam_appeals_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_appeals" ADD CONSTRAINT "school_ai_exam_appeals_attempt_id_school_id_campus_id_fkey" FOREIGN KEY ("attempt_id", "school_id", "campus_id") REFERENCES "school_ai_exam_attempts"("id", "school_id", "campus_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_runs" ADD CONSTRAINT "school_ai_runs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_runs" ADD CONSTRAINT "school_ai_runs_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve existing moderated results as the first immutable review version.
UPDATE school_ai_exam_attempts SET review_version=1 WHERE reviewed_at IS NOT NULL AND review IS NOT NULL AND review <> 'null'::jsonb;
INSERT INTO school_ai_exam_result_revisions(id,school_id,campus_id,assignment_id,attempt_id,version,review,reason,created_by_id,created_at)
SELECT 'initial-' || id,school_id,campus_id,assignment_id,id,1,review,'Existing reviewed result preserved during migration',COALESCE(reviewed_by_id,user_id),reviewed_at FROM school_ai_exam_attempts WHERE review_version=1;
ALTER TABLE school_ai_exam_attempts ADD CONSTRAINT school_ai_attempt_review_version_check CHECK (review_version >= 0);
ALTER TABLE school_ai_exam_result_revisions ADD CONSTRAINT school_ai_result_revision_version_check CHECK (version >= 1);
ALTER TABLE school_ai_exam_appeals ADD CONSTRAINT school_ai_appeal_status_check CHECK (status IN ('OPEN','UPHELD','DISMISSED','RESOLVED')), ADD CONSTRAINT school_ai_appeal_version_check CHECK (version >= 1 AND result_version >= 1);
ALTER TABLE school_ai_substitute_duties ADD CONSTRAINT school_ai_substitute_status_check CHECK (status IN ('ASSIGNED','CANCELLED')), ADD CONSTRAINT school_ai_substitute_version_check CHECK (version >= 1);
ALTER TABLE school_ai_substitute_duties ADD CONSTRAINT school_ai_substitute_slot_fk FOREIGN KEY(timetable_slot_id) REFERENCES timetable_slots(id) ON DELETE RESTRICT;
ALTER TABLE school_ai_runs ADD CONSTRAINT school_ai_run_status_check CHECK (status IN ('QUEUED','PAUSED','BLOCKED','COMPLETED','CANCELLED','EXPIRED')), ADD CONSTRAINT school_ai_run_bounds_check CHECK (version >= 1 AND next_step >= 0 AND jsonb_typeof(steps)='array' AND jsonb_array_length(steps) BETWEEN 1 AND 20 AND next_step <= jsonb_array_length(steps) AND expires_at > scheduled_at);

ALTER TABLE "school_ai_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_runs";
CREATE POLICY tenant_isolation ON "school_ai_runs" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));


ALTER TABLE "school_ai_substitute_duties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_substitute_duties" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_substitute_duties";
CREATE POLICY tenant_isolation ON "school_ai_substitute_duties" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));


ALTER TABLE "school_ai_exam_result_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_result_revisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_exam_result_revisions";
CREATE POLICY tenant_isolation ON "school_ai_exam_result_revisions" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));


ALTER TABLE "school_ai_exam_appeals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_appeals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_exam_appeals";
CREATE POLICY tenant_isolation ON "school_ai_exam_appeals" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));
ALTER TABLE school_ai_executions DROP CONSTRAINT school_ai_executions_operation_check;
ALTER TABLE school_ai_executions ADD CONSTRAINT school_ai_executions_operation_check CHECK (operation IN ('curriculum.import_topics','academics.setup_year','timetable.create_draft','communications.queue_announcement','exams.create_session_plan','fees.generate_invoices','finance.apply_operation','timetable.create_school_drafts','attendance.record_register','timetable.assign_substitutes'));
