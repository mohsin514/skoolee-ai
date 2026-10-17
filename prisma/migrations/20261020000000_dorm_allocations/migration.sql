-- SKO-463: dated dormitory allocations with continuous move history, and out-of-service rooms.
-- AlterTable
ALTER TABLE "dorm_rooms" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "status_reason" TEXT;

-- CreateTable
CREATE TABLE "dorm_allocations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "end_reason" TEXT,
    "previous_id" TEXT,
    "idempotency_key" TEXT,
    "request_hash" TEXT,
    "created_by_id" TEXT NOT NULL,
    "ended_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dorm_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dorm_allocations_previous_id_key" ON "dorm_allocations"("previous_id");

-- CreateIndex
CREATE INDEX "dorm_allocations_room_id_start_date_idx" ON "dorm_allocations"("room_id", "start_date");

-- CreateIndex
CREATE INDEX "dorm_allocations_student_id_start_date_idx" ON "dorm_allocations"("student_id", "start_date");

-- CreateIndex
CREATE INDEX "dorm_allocations_school_id_idx" ON "dorm_allocations"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "dorm_allocations_campus_id_idempotency_key_key" ON "dorm_allocations"("campus_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "dorm_allocations" ADD CONSTRAINT "dorm_allocations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dorm_allocations" ADD CONSTRAINT "dorm_allocations_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dorm_allocations" ADD CONSTRAINT "dorm_allocations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "dorm_rooms"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dorm_allocations" ADD CONSTRAINT "dorm_allocations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dorm_allocations" ADD CONSTRAINT "dorm_allocations_previous_id_fkey" FOREIGN KEY ("previous_id") REFERENCES "dorm_allocations"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- A stay must end after it starts; statuses are closed sets; rooms always have at least one place.
ALTER TABLE "dorm_allocations" ADD CONSTRAINT "dorm_allocations_dates_check" CHECK (end_date IS NULL OR end_date > start_date);
ALTER TABLE "dorm_allocations" ADD CONSTRAINT "dorm_allocations_status_check" CHECK (status IN ('ACTIVE','CANCELLED'));
ALTER TABLE "dorm_rooms" ADD CONSTRAINT "dorm_rooms_status_check" CHECK (status IN ('AVAILABLE','OUT_OF_SERVICE'));
ALTER TABLE "dorm_rooms" ADD CONSTRAINT "dorm_rooms_capacity_check" CHECK (capacity > 0);

-- Existing current-room assignments become open-ended stays starting today, so history starts somewhere.
INSERT INTO "dorm_allocations" (id, school_id, campus_id, room_id, student_id, start_date, status, reason, created_by_id, updated_at)
SELECT gen_random_uuid()::text, s.school_id, s.campus_id, s.dorm_room_id, s.id, CURRENT_DATE, 'ACTIVE', 'Migrated from the previous current-room field', 'system', CURRENT_TIMESTAMP
FROM "students" s JOIN "dorm_rooms" r ON r.id = s.dorm_room_id AND r.campus_id = s.campus_id
WHERE s.dorm_room_id IS NOT NULL;
