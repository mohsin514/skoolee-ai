-- SKAI-1142: assessment/interview bookings, offer respond-by dates and waitlist order.
-- Additive only: two nullable columns and one new table.
ALTER TABLE "admission_applications" ADD COLUMN "offer_expires_at" TIMESTAMP(3);
ALTER TABLE "admission_applications" ADD COLUMN "waitlist_rank" INTEGER;

CREATE TABLE "admission_assessments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "application_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "location" TEXT,
    "staff_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "recommendation" TEXT,
    "score" INTEGER,
    "outcome_note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admission_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admission_assessments_kind_check" CHECK ("kind" IN ('INTERVIEW', 'ASSESSMENT', 'TOUR', 'TASTER_DAY')),
    CONSTRAINT "admission_assessments_status_check" CHECK ("status" IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED')),
    CONSTRAINT "admission_assessments_duration_check" CHECK ("duration_min" BETWEEN 5 AND 480)
);

CREATE INDEX "admission_assessments_application_id_scheduled_at_idx" ON "admission_assessments"("application_id", "scheduled_at");
CREATE INDEX "admission_assessments_school_id_scheduled_at_idx" ON "admission_assessments"("school_id", "scheduled_at");
CREATE INDEX "admission_applications_campus_id_waitlist_rank_idx" ON "admission_applications"("campus_id", "waitlist_rank") WHERE "waitlist_rank" IS NOT NULL;

ALTER TABLE "admission_assessments" ADD CONSTRAINT "admission_assessments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admission_assessments" ADD CONSTRAINT "admission_assessments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admission_assessments" ADD CONSTRAINT "admission_assessments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
