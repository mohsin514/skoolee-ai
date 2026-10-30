-- Module 9 — Leave Management
-- Days are stored as Int tenths (5 = half day, 10 = one day).

CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_allocations" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "role" TEXT,
    "user_id" TEXT,
    "days" INTEGER NOT NULL DEFAULT 0,
    "academic_year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "from_date" TIMESTAMP(3) NOT NULL,
    "to_date" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 10,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "attachment_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_types_campus_id_name_key" ON "leave_types"("campus_id", "name");
CREATE INDEX "leave_requests_campus_id_status_idx" ON "leave_requests"("campus_id", "status");
CREATE INDEX "leave_allocations_campus_id_idx" ON "leave_allocations"("campus_id");
CREATE INDEX "leave_requests_user_id_idx" ON "leave_requests"("user_id");

ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_allocations" ADD CONSTRAINT "leave_allocations_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_allocations" ADD CONSTRAINT "leave_allocations_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_allocations" ADD CONSTRAINT "leave_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
