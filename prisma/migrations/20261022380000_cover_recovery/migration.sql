-- CreateTable
CREATE TABLE "cover_handovers" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "duty_id" TEXT NOT NULL,
    "objective" TEXT,
    "instructions" TEXT,
    "resource_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" TEXT,
    "outcome" TEXT,
    "actual_activity" TEXT,
    "outcome_at" TIMESTAMP(3),
    "outcome_by_id" TEXT,

    CONSTRAINT "cover_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_recoveries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "timetable_slot_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_name" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "duty_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DECISION_NEEDED',
    "title" TEXT,
    "instructions" TEXT,
    "due_date" TEXT,
    "decision_note" TEXT,
    "evidence_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cover_handovers_duty_id_key" ON "cover_handovers"("duty_id");

-- CreateIndex
CREATE INDEX "cover_handovers_school_id_idx" ON "cover_handovers"("school_id");

-- CreateIndex
CREATE INDEX "lesson_recoveries_school_id_owner_id_status_idx" ON "lesson_recoveries"("school_id", "owner_id", "status");

-- CreateIndex
CREATE INDEX "lesson_recoveries_school_id_class_id_status_idx" ON "lesson_recoveries"("school_id", "class_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_recoveries_school_id_timetable_slot_id_date_key" ON "lesson_recoveries"("school_id", "timetable_slot_id", "date");

-- AddForeignKey
ALTER TABLE "cover_handovers" ADD CONSTRAINT "cover_handovers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_recoveries" ADD CONSTRAINT "lesson_recoveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-442: outcomes and recovery states are closed sets; an outcome carries who and when; a completed
-- recovery names who completed it, and "not needed" carries its reason.
ALTER TABLE "cover_handovers" ADD CONSTRAINT "cover_handovers_outcome_check" CHECK ("outcome" IS NULL OR ("outcome" IN ('DELIVERED','SUPERVISED_ONLY','NOT_HELD') AND "outcome_at" IS NOT NULL AND "outcome_by_id" IS NOT NULL));
ALTER TABLE "lesson_recoveries" ADD CONSTRAINT "lesson_recoveries_state_check" CHECK ("source" IN ('SUPERVISED_ONLY','NOT_HELD','UNCOVERED') AND "status" IN ('DECISION_NEEDED','PLANNED','PUBLISHED','COMPLETED','NOT_NEEDED') AND ("status" <> 'COMPLETED' OR ("completed_at" IS NOT NULL AND "completed_by_id" IS NOT NULL)) AND ("status" <> 'NOT_NEEDED' OR length(coalesce("decision_note", '')) > 0) AND ("status" NOT IN ('PLANNED','PUBLISHED') OR ("title" IS NOT NULL AND "due_date" IS NOT NULL)));
