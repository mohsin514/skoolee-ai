-- SKO-425: structured learning actions on InterventionPlan, check-ins and history.
ALTER TABLE "intervention_plans"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'TEACHER',
  ADD COLUMN "class_id" TEXT,
  ADD COLUMN "subject_id" TEXT,
  ADD COLUMN "concern" TEXT,
  ADD COLUMN "evidence_state" TEXT NOT NULL DEFAULT 'NEEDS_OBSERVATION',
  ADD COLUMN "evidence_refs" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "baseline" JSONB,
  ADD COLUMN "goal" TEXT,
  ADD COLUMN "owner_id" TEXT,
  ADD COLUMN "planned_activity" TEXT,
  ADD COLUMN "minutes_per_week" INTEGER,
  ADD COLUMN "lesson_plan_ref" JSONB,
  ADD COLUMN "review_date" DATE,
  ADD COLUMN "next_check_in_date" DATE,
  ADD COLUMN "family_share" JSONB,
  ADD COLUMN "private_notes" TEXT,
  ADD COLUMN "outcome" JSONB,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Existing AI-generated plans were never structured; they stay drafts.
UPDATE "intervention_plans" SET "origin" = 'AI';
UPDATE "intervention_plans" SET "status" = 'DRAFT' WHERE "status" = 'APPROVED';
CREATE INDEX "intervention_plans_owner_id_status_idx" ON "intervention_plans"("owner_id", "status");

CREATE TABLE "intervention_check_ins" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "plan_id" TEXT NOT NULL,
    "plan_version" INTEGER NOT NULL,
    "due_on" DATE NOT NULL,
    "delivered" BOOLEAN NOT NULL,
    "minutes" INTEGER,
    "participation" TEXT NOT NULL,
    "adjustment" TEXT,
    "pupil_feedback" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "intervention_check_ins_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "intervention_check_ins_plan_id_due_on_idx" ON "intervention_check_ins"("plan_id", "due_on");
CREATE INDEX "intervention_check_ins_school_id_idx" ON "intervention_check_ins"("school_id");

CREATE TABLE "intervention_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "plan_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "intervention_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "intervention_events_plan_id_created_at_idx" ON "intervention_events"("plan_id", "created_at");
CREATE INDEX "intervention_events_school_id_idx" ON "intervention_events"("school_id");
