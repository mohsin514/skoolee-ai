-- Exam sessions, room physical layout, and grid seat coordinates.

-- ── Rooms: where they are and how they are laid out ────────────────────
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "building" TEXT;
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "floor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "wing" TEXT;
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "room_type" TEXT NOT NULL DEFAULT 'CLASSROOM';
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "rows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "benchesPerRow" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "seatsPerBench" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "exam_seats_per_bench" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "is_exam_hall" BOOLEAN NOT NULL DEFAULT false;

-- ── Exam sessions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exam_sessions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "academic_year" INTEGER NOT NULL,
    "exam_type" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "exam_sessions_campus_id_academic_year_idx" ON "exam_sessions"("campus_id", "academic_year");
CREATE INDEX IF NOT EXISTS "exam_sessions_school_id_idx" ON "exam_sessions"("school_id");

ALTER TABLE "exam_sessions" DROP CONSTRAINT IF EXISTS "exam_sessions_school_id_fkey";
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_sessions" DROP CONSTRAINT IF EXISTS "exam_sessions_campus_id_fkey";
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_campus_id_fkey"
    FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "session_id" TEXT;
ALTER TABLE "exams" DROP CONSTRAINT IF EXISTS "exams_session_id_fkey";
ALTER TABLE "exams" ADD CONSTRAINT "exams_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Seats know where they sit ──────────────────────────────────────────
ALTER TABLE "exam_seats" ADD COLUMN IF NOT EXISTS "row_no" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "exam_seats" ADD COLUMN IF NOT EXISTS "bench_no" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "exam_seats" ADD COLUMN IF NOT EXISTS "seat_on_bench" INTEGER NOT NULL DEFAULT 0;
