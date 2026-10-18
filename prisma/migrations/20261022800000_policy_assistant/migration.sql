-- CreateTable
CREATE TABLE "school_policies" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "topic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE NOT NULL,
    "effective_until" DATE,
    "supersedes_id" TEXT,
    "sections" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_questions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "asked_by_id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "feedback" TEXT,
    "feedback_note" TEXT,
    "escalation" JSONB,
    "escalated_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_eval_cases" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "expected_topic" TEXT NOT NULL,
    "expected_section" TEXT,
    "expect_no_answer" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "runs" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_eval_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_policies_school_id_status_audience_idx" ON "school_policies"("school_id", "status", "audience");

-- CreateIndex
CREATE INDEX "school_policies_school_id_topic_idx" ON "school_policies"("school_id", "topic");

-- CreateIndex
CREATE INDEX "policy_questions_school_id_asked_by_id_created_at_idx" ON "policy_questions"("school_id", "asked_by_id", "created_at");

-- CreateIndex
CREATE INDEX "policy_questions_school_id_escalated_at_idx" ON "policy_questions"("school_id", "escalated_at");

-- CreateIndex
CREATE INDEX "policy_eval_cases_school_id_idx" ON "policy_eval_cases"("school_id");

