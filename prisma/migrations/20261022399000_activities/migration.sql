-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "class_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "staff_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cost_amount" INTEGER NOT NULL DEFAULT 0,
    "cost_currency" TEXT NOT NULL DEFAULT 'PKR',
    "trip_id" TEXT,
    "offer_hours" INTEGER NOT NULL DEFAULT 48,
    "cancellation_terms" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "coordinator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_places" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "activity_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "offer_expires_at" TIMESTAMP(3),
    "fee_status" TEXT NOT NULL DEFAULT 'NONE',
    "invoice_id" TEXT,
    "payment_id" TEXT,
    "refund_state" TEXT,
    "refund_adjustment_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancel_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_sessions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "activity_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_attendances" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_by_id" TEXT NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activities_trip_id_key" ON "activities"("trip_id");

-- CreateIndex
CREATE INDEX "activities_school_id_campus_id_starts_at_idx" ON "activities"("school_id", "campus_id", "starts_at");

-- CreateIndex
CREATE INDEX "activity_places_school_id_student_id_idx" ON "activity_places"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_places_activity_id_student_id_key" ON "activity_places"("activity_id", "student_id");

-- CreateIndex
CREATE INDEX "activity_sessions_school_id_activity_id_idx" ON "activity_sessions"("school_id", "activity_id");

-- CreateIndex
CREATE INDEX "activity_attendances_school_id_student_id_idx" ON "activity_attendances"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_attendances_session_id_student_id_key" ON "activity_attendances"("session_id", "student_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_places" ADD CONSTRAINT "activity_places_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_places" ADD CONSTRAINT "activity_places_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attendances" ADD CONSTRAINT "activity_attendances_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-440: closed sets; capacity and cost are sane; an offer has an expiry; a cancelled place says when.
ALTER TABLE "activities" ADD CONSTRAINT "activities_shape_check" CHECK ("kind" IN ('CLUB','SPORT','TRIP') AND "status" IN ('PUBLISHED','CANCELLED') AND "capacity" BETWEEN 1 AND 2000 AND "cost_amount" >= 0 AND "ends_at" > "starts_at" AND "offer_hours" BETWEEN 1 AND 336 AND length(btrim("cancellation_terms")) > 0);
ALTER TABLE "activity_places" ADD CONSTRAINT "activity_places_state_check" CHECK ("status" IN ('WAITLIST','OFFERED','RESERVED','CONFIRMED','DECLINED','EXPIRED','CANCELLED') AND "fee_status" IN ('NONE','DUE','PAID','WAIVED') AND ("status" <> 'OFFERED' OR "offer_expires_at" IS NOT NULL) AND ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL) AND ("refund_state" IS NULL OR "refund_state" IN ('NEEDED','REQUESTED')));
ALTER TABLE "activity_attendances" ADD CONSTRAINT "activity_attendances_status_check" CHECK ("status" IN ('PRESENT','ABSENT','LATE_WITHDRAWAL'));
