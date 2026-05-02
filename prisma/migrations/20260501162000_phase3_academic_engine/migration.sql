ALTER TABLE IF EXISTS "exams"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "marks_entry_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exams') THEN
    UPDATE "exams"
    SET "status" = CASE WHEN "is_locked" THEN 'LOCKED' ELSE COALESCE("status", 'DRAFT') END;
  END IF;
END $$;

ALTER TABLE IF EXISTS "report_cards"
  ADD COLUMN IF NOT EXISTS "total_marks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "obtained_marks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "grade" TEXT,
  ADD COLUMN IF NOT EXISTS "rank" INTEGER,
  ADD COLUMN IF NOT EXISTS "attendance_present" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "attendance_total" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "remarks_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "approved_by" TEXT,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'GENERATED',
  ADD COLUMN IF NOT EXISTS "sent_via" TEXT,
  ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "delivery_status" TEXT NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN IF NOT EXISTS "delivery_error" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exams') THEN
    CREATE INDEX IF NOT EXISTS "exams_campus_id_status_idx" ON "exams"("campus_id", "status");
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'report_cards') THEN
    CREATE INDEX IF NOT EXISTS "report_cards_exam_id_status_idx" ON "report_cards"("exam_id", "status");
    CREATE INDEX IF NOT EXISTS "report_cards_delivery_status_idx" ON "report_cards"("delivery_status");
  END IF;
END $$;
