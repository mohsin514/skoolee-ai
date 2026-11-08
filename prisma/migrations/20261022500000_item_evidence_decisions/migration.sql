-- CreateTable
CREATE TABLE "item_evidence_decisions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "curriculum_version" INTEGER NOT NULL,
    "paper_id" TEXT NOT NULL,
    "paper_version" INTEGER NOT NULL,
    "question_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "flag_category" TEXT,
    "statement" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "cited_attempt_ids" JSONB NOT NULL DEFAULT '[]',
    "outcome_ids" JSONB NOT NULL DEFAULT '[]',
    "evidence_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "group_student_ids" JSONB NOT NULL DEFAULT '[]',
    "group_reason" TEXT,
    "action_plan_ids" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_evidence_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_evidence_decisions_school_id_curriculum_id_paper_id_pa_idx" ON "item_evidence_decisions"("school_id", "curriculum_id", "paper_id", "paper_version", "question_id");

