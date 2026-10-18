-- AlterTable
ALTER TABLE "intervention_plans" ADD COLUMN     "stale_reason" TEXT,
ADD COLUMN     "stale_repair_id" TEXT,
ADD COLUMN     "stale_since" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "school_ai_assessment_repairs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "paper_version" INTEGER NOT NULL,
    "question_id" TEXT NOT NULL,
    "correction" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "public_explanation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "fingerprint" TEXT NOT NULL,
    "impact" JSONB NOT NULL,
    "plan" JSONB NOT NULL,
    "receipt" JSONB NOT NULL DEFAULT '[]',
    "idempotency_key" TEXT NOT NULL,
    "proposed_by_id" TEXT NOT NULL,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_assessment_repairs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_assessment_repairs_school_id_campus_id_assignment_idx" ON "school_ai_assessment_repairs"("school_id", "campus_id", "assignment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_assessment_repairs_school_id_idempotency_key_key" ON "school_ai_assessment_repairs"("school_id", "idempotency_key");

