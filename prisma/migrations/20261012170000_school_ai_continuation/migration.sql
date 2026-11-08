-- AlterTable
ALTER TABLE "school_ai_requests" ADD COLUMN     "conversation_id" TEXT,
ADD COLUMN     "conversation_version" INTEGER,
ADD COLUMN     "user_message" TEXT;
ALTER TABLE "school_ai_requests" ADD COLUMN "context_versions" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "school_ai_conversations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "subject_id" TEXT,
    "class_id" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'WORKSPACE',
    "topic_key" TEXT,
    "title" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_setup_tasks" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "assignee_id" TEXT NOT NULL,
    "assignee_role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "accepted_record_version" INTEGER,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "answered_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "school_ai_setup_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_setup_task_revisions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "task_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_setup_task_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_invigilations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "exam_room_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_invigilations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_conversations_school_id_campus_id_actor_id_update_idx" ON "school_ai_conversations"("school_id", "campus_id", "actor_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_conversations_id_school_id_key" ON "school_ai_conversations"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_conversations_school_id_actor_id_idempotency_key_key" ON "school_ai_conversations"("school_id", "actor_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "school_ai_setup_tasks_school_id_campus_id_assignee_id_statu_idx" ON "school_ai_setup_tasks"("school_id", "campus_id", "assignee_id", "status");

-- CreateIndex
CREATE INDEX "school_ai_setup_tasks_school_id_record_id_idx" ON "school_ai_setup_tasks"("school_id", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_setup_tasks_id_school_id_key" ON "school_ai_setup_tasks"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_setup_tasks_school_id_requested_by_id_idempotency_key" ON "school_ai_setup_tasks"("school_id", "requested_by_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "school_ai_setup_task_revisions_school_id_task_id_idx" ON "school_ai_setup_task_revisions"("school_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_setup_task_revisions_task_id_version_key" ON "school_ai_setup_task_revisions"("task_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "exam_invigilations_exam_room_id_key" ON "exam_invigilations"("exam_room_id");

-- CreateIndex
CREATE INDEX "exam_invigilations_school_id_campus_id_teacher_id_idx" ON "exam_invigilations"("school_id", "campus_id", "teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_requests_conversation_id_conversation_version_key" ON "school_ai_requests"("conversation_id", "conversation_version");

-- AddForeignKey
ALTER TABLE "school_ai_requests" ADD CONSTRAINT "school_ai_requests_conversation_id_school_id_fkey" FOREIGN KEY ("conversation_id", "school_id") REFERENCES "school_ai_conversations"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_conversations" ADD CONSTRAINT "school_ai_conversations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_conversations" ADD CONSTRAINT "school_ai_conversations_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_setup_tasks" ADD CONSTRAINT "school_ai_setup_tasks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_setup_tasks" ADD CONSTRAINT "school_ai_setup_tasks_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_setup_tasks" ADD CONSTRAINT "school_ai_setup_tasks_record_id_school_id_fkey" FOREIGN KEY ("record_id", "school_id") REFERENCES "school_ai_records"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_setup_task_revisions" ADD CONSTRAINT "school_ai_setup_task_revisions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_setup_task_revisions" ADD CONSTRAINT "school_ai_setup_task_revisions_task_id_school_id_fkey" FOREIGN KEY ("task_id", "school_id") REFERENCES "school_ai_setup_tasks"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_invigilations" ADD CONSTRAINT "exam_invigilations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_invigilations" ADD CONSTRAINT "exam_invigilations_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_invigilations" ADD CONSTRAINT "exam_invigilations_exam_room_id_fkey" FOREIGN KEY ("exam_room_id") REFERENCES "exam_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_invigilations" ADD CONSTRAINT "exam_invigilations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "school_ai_executions" DROP CONSTRAINT "school_ai_executions_operation_check";
ALTER TABLE "school_ai_executions" ADD CONSTRAINT "school_ai_executions_operation_check"
  CHECK ("operation" IN ('curriculum.import_topics','academics.setup_year','timetable.create_draft','communications.queue_announcement','exams.create_session_plan','fees.generate_invoices'));
ALTER TABLE "school_ai_conversations"
  ADD CONSTRAINT "school_ai_conversations_purpose_check" CHECK ("purpose" IN ('WORKSPACE','SETUP')),
  ADD CONSTRAINT "school_ai_conversations_version_check" CHECK ("version" >= 0),
  ADD CONSTRAINT "school_ai_conversations_title_check" CHECK (char_length("title") BETWEEN 1 AND 180),
  ADD CONSTRAINT "school_ai_conversations_subject_check" CHECK (("subject_id" IS NULL AND "class_id" IS NULL) OR ("subject_id" IS NOT NULL AND "class_id" IS NOT NULL AND "campus_id" IS NOT NULL));
ALTER TABLE "school_ai_requests" ADD CONSTRAINT "school_ai_requests_conversation_check" CHECK (
  ("conversation_id" IS NULL AND "conversation_version" IS NULL AND "user_message" IS NULL) OR
  ("conversation_id" IS NOT NULL AND "conversation_version" IS NOT NULL AND "conversation_version" >= 1 AND "user_message" IS NOT NULL AND char_length("user_message") BETWEEN 1 AND 8000)
);
ALTER TABLE "school_ai_setup_tasks"
  ADD CONSTRAINT "school_ai_setup_tasks_status_check" CHECK ("status" IN ('OPEN','ANSWERED','ACCEPTED','CANCELLED')),
  ADD CONSTRAINT "school_ai_setup_tasks_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "school_ai_setup_tasks_question_check" CHECK (char_length("question") BETWEEN 1 AND 300 AND char_length("instructions") <= 2000),
  ADD CONSTRAINT "school_ai_setup_tasks_answer_check" CHECK ("answer" IS NULL OR char_length("answer") BETWEEN 1 AND 4000),
  ADD CONSTRAINT "school_ai_setup_tasks_field_check" CHECK ("field_key" IN ('schoolName','country','timezone','campuses','grades','academicYear','startDate','endDate','workingDays','firstOutcome','curriculum','assessmentPolicy','feePolicy','communications','resources','staff','students','migrationSource'));
