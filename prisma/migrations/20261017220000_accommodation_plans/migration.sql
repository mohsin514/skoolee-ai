-- AlterTable
ALTER TABLE "school_ai_exam_attempts" ADD COLUMN     "accommodation_snapshot" JSONB;

-- CreateTable
CREATE TABLE "accommodation_plans" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "valid_from" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "assessment_types" TEXT[],
    "extra_minutes" INTEGER NOT NULL DEFAULT 0,
    "extra_percent" INTEGER NOT NULL DEFAULT 0,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "capabilities" JSONB NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "approved_by_id" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "ended_by_id" TEXT,
    "end_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accommodation_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_support_records" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "plan_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accommodation_support_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_rehearsals" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "plan_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accommodation_rehearsals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_live_adjustments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "added_minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "old_deadline" TIMESTAMP(3) NOT NULL,
    "new_deadline" TIMESTAMP(3) NOT NULL,
    "approved_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accommodation_live_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accommodation_plans_school_id_campus_id_status_idx" ON "accommodation_plans"("school_id", "campus_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_plans_school_id_student_id_version_key" ON "accommodation_plans"("school_id", "student_id", "version");

-- CreateIndex
CREATE INDEX "accommodation_support_records_school_id_plan_id_idx" ON "accommodation_support_records"("school_id", "plan_id");

-- CreateIndex
CREATE INDEX "accommodation_rehearsals_school_id_student_id_idx" ON "accommodation_rehearsals"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "accommodation_live_adjustments_school_id_assignment_id_idx" ON "accommodation_live_adjustments"("school_id", "assignment_id");

-- AddForeignKey
ALTER TABLE "accommodation_plans" ADD CONSTRAINT "accommodation_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_support_records" ADD CONSTRAINT "accommodation_support_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_support_records" ADD CONSTRAINT "accommodation_support_records_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "accommodation_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_rehearsals" ADD CONSTRAINT "accommodation_rehearsals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_rehearsals" ADD CONSTRAINT "accommodation_rehearsals_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "accommodation_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_live_adjustments" ADD CONSTRAINT "accommodation_live_adjustments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-410 invariants.
ALTER TABLE "accommodation_plans" ADD CONSTRAINT "accommodation_plan_status" CHECK ("status" IN ('ACTIVE', 'SUPERSEDED', 'REVOKED'));
ALTER TABLE "accommodation_plans" ADD CONSTRAINT "accommodation_plan_window" CHECK ("valid_until" >= "valid_from");
ALTER TABLE "accommodation_plans" ADD CONSTRAINT "accommodation_plan_ranges" CHECK ("extra_minutes" BETWEEN 0 AND 240 AND "extra_percent" BETWEEN 0 AND 100 AND "break_minutes" BETWEEN 0 AND 120 AND "version" > 0);
ALTER TABLE "accommodation_plans" ADD CONSTRAINT "accommodation_plan_types" CHECK (cardinality("assessment_types") > 0 AND "assessment_types" <@ ARRAY['EXAM', 'ASSIGNMENT', 'PRACTICE']::text[]);
ALTER TABLE "accommodation_plans" ADD CONSTRAINT "accommodation_plan_ended" CHECK (("status" = 'ACTIVE') = ("ended_at" IS NULL));
-- At most one active plan per learner.
CREATE UNIQUE INDEX "accommodation_plans_one_active" ON "accommodation_plans" ("school_id", "student_id") WHERE "status" = 'ACTIVE';
ALTER TABLE "accommodation_live_adjustments" ADD CONSTRAINT "accommodation_live_adjustment_forward" CHECK ("added_minutes" BETWEEN 1 AND 120 AND "new_deadline" > "old_deadline");

-- A plan revision is immutable; it may only end once (superseded or revoked).
CREATE FUNCTION accommodation_plan_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Accommodation plans are kept; revoke or supersede instead';
  END IF;
  IF OLD.status <> 'ACTIVE' OR (to_jsonb(NEW) - ARRAY['status', 'ended_at', 'ended_by_id', 'end_reason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'ended_at', 'ended_by_id', 'end_reason']) THEN
    RAISE EXCEPTION 'An accommodation plan revision cannot be changed; record a new version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accommodation_plan_immutable BEFORE UPDATE OR DELETE ON "accommodation_plans" FOR EACH ROW EXECUTE FUNCTION accommodation_plan_immutable();

-- Live adjustments, rehearsals and supporting records are history.
CREATE FUNCTION accommodation_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- PL/pgSQL does not short-circuit AND, so the plan column is read through JSON only where it exists.
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
    IF TG_TABLE_NAME <> 'accommodation_live_adjustments' THEN
      IF NOT EXISTS (SELECT 1 FROM accommodation_plans WHERE id = to_jsonb(OLD) ->> 'plan_id') THEN RETURN OLD; END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'Accommodation history is kept';
END $$;
CREATE TRIGGER accommodation_live_adjustment_append_only BEFORE UPDATE OR DELETE ON "accommodation_live_adjustments" FOR EACH ROW EXECUTE FUNCTION accommodation_history_append_only();
CREATE TRIGGER accommodation_rehearsal_append_only BEFORE UPDATE OR DELETE ON "accommodation_rehearsals" FOR EACH ROW EXECUTE FUNCTION accommodation_history_append_only();
CREATE TRIGGER accommodation_support_record_append_only BEFORE UPDATE OR DELETE ON "accommodation_support_records" FOR EACH ROW EXECUTE FUNCTION accommodation_history_append_only();
