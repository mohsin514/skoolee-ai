-- SKO-404: reviewed, versioned year-end rollover plans.
ALTER TABLE "classes" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "classes" ADD CONSTRAINT "classes_capacity_range" CHECK ("capacity" IS NULL OR "capacity" BETWEEN 0 AND 500);

CREATE TABLE "rollover_plans" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "source_year" INTEGER NOT NULL,
    "destination_year" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effective_date" DATE NOT NULL,
    "class_map" JSONB NOT NULL DEFAULT '{}',
    "approved_version" INTEGER,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "baseline" JSONB,
    "lease_until" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rollover_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rollover_plans_campus_id_source_year_key" ON "rollover_plans"("campus_id", "source_year");
CREATE INDEX "rollover_plans_school_id_idx" ON "rollover_plans"("school_id");

CREATE TABLE "rollover_decisions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "plan_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "source_class_id" TEXT NOT NULL,
    "source_enrollment_id" TEXT NOT NULL,
    "source_roll_no" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "evidence_detail" JSONB,
    "decision" TEXT NOT NULL,
    "destination_class_id" TEXT,
    "reason" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "execution_status" TEXT NOT NULL DEFAULT 'PENDING',
    "execution_note" TEXT,
    "new_enrollment_id" TEXT,
    "new_roll_no" TEXT,
    "executed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rollover_decisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rollover_decisions_plan_id_student_id_key" ON "rollover_decisions"("plan_id", "student_id");
CREATE INDEX "rollover_decisions_plan_id_execution_status_idx" ON "rollover_decisions"("plan_id", "execution_status");
CREATE INDEX "rollover_decisions_school_id_idx" ON "rollover_decisions"("school_id");

CREATE TABLE "rollover_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "plan_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rollover_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "rollover_events_plan_id_created_at_idx" ON "rollover_events"("plan_id", "created_at");
CREATE INDEX "rollover_events_school_id_idx" ON "rollover_events"("school_id");
