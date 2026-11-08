-- CreateTable
CREATE TABLE "meeting_windows" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "local_date" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "slot_minutes" INTEGER NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
    "max_bookings" INTEGER,
    "mode" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "location" TEXT,
    "cancellation_policy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_bookings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "window_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "guardian_user_id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "agenda" TEXT,
    "access_needs" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "conflict_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "request_key" TEXT NOT NULL,
    "reminded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_booking_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "booking_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "detail" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_follow_ups" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "booking_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "shared_at" TIMESTAMP(3),
    "shared_by_id" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_actions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "booking_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "owner_role" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_staff_notes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "booking_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_staff_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_windows_school_id_teacher_id_local_date_idx" ON "meeting_windows"("school_id", "teacher_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_bookings_request_key_key" ON "meeting_bookings"("request_key");

-- CreateIndex
CREATE INDEX "meeting_bookings_school_id_teacher_id_starts_at_idx" ON "meeting_bookings"("school_id", "teacher_id", "starts_at");

-- CreateIndex
CREATE INDEX "meeting_bookings_school_id_guardian_user_id_idx" ON "meeting_bookings"("school_id", "guardian_user_id");

-- CreateIndex
CREATE INDEX "meeting_booking_events_school_id_idx" ON "meeting_booking_events"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_booking_events_booking_id_version_key" ON "meeting_booking_events"("booking_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_follow_ups_booking_id_key" ON "meeting_follow_ups"("booking_id");

-- CreateIndex
CREATE INDEX "meeting_follow_ups_school_id_idx" ON "meeting_follow_ups"("school_id");

-- CreateIndex
CREATE INDEX "meeting_actions_school_id_owner_user_id_status_idx" ON "meeting_actions"("school_id", "owner_user_id", "status");

-- CreateIndex
CREATE INDEX "meeting_staff_notes_school_id_booking_id_idx" ON "meeting_staff_notes"("school_id", "booking_id");

-- AddForeignKey
ALTER TABLE "meeting_windows" ADD CONSTRAINT "meeting_windows_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_window_id_fkey" FOREIGN KEY ("window_id") REFERENCES "meeting_windows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_booking_events" ADD CONSTRAINT "meeting_booking_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_booking_events" ADD CONSTRAINT "meeting_booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "meeting_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_follow_ups" ADD CONSTRAINT "meeting_follow_ups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_follow_ups" ADD CONSTRAINT "meeting_follow_ups_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "meeting_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_actions" ADD CONSTRAINT "meeting_actions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_actions" ADD CONSTRAINT "meeting_actions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "meeting_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_staff_notes" ADD CONSTRAINT "meeting_staff_notes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_staff_notes" ADD CONSTRAINT "meeting_staff_notes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "meeting_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-420: one live booking per teacher and start instant (concurrent families cannot both hold a slot).
CREATE UNIQUE INDEX "meeting_bookings_live_slot_key" ON "meeting_bookings" ("teacher_id", "starts_at") WHERE "status" IN ('CONFIRMED', 'RESCHEDULE_NEEDED');
ALTER TABLE "meeting_windows" ADD CONSTRAINT "meeting_windows_shape_check" CHECK ("mode" IN ('IN_PERSON','REMOTE','EITHER') AND "status" IN ('OPEN','WITHDRAWN') AND "slot_minutes" BETWEEN 5 AND 120 AND "buffer_minutes" BETWEEN 0 AND 60 AND "start_time" < "end_time" AND ("max_bookings" IS NULL OR "max_bookings" > 0) AND length("cancellation_policy") > 0);
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_shape_check" CHECK ("mode" IN ('IN_PERSON','REMOTE') AND "status" IN ('CONFIRMED','RESCHEDULE_NEEDED','CANCELLED','HELD','NOT_HELD') AND "ends_at" > "starts_at");
ALTER TABLE "meeting_actions" ADD CONSTRAINT "meeting_actions_shape_check" CHECK ("owner_role" IN ('FAMILY','STAFF') AND "status" IN ('OPEN','DONE') AND ("status" = 'OPEN' OR "completed_at" IS NOT NULL) AND length("text") > 0);
