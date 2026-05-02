ALTER TABLE IF EXISTS "students" ADD COLUMN IF NOT EXISTS "guardian_name" TEXT;
ALTER TABLE IF EXISTS "students" ADD COLUMN IF NOT EXISTS "guardian_phone" TEXT;
ALTER TABLE IF EXISTS "students" ADD COLUMN IF NOT EXISTS "guardian_whatsapp" TEXT;
ALTER TABLE IF EXISTS "students" ADD COLUMN IF NOT EXISTS "guardian_email" TEXT;
ALTER TABLE IF EXISTS "students" ADD COLUMN IF NOT EXISTS "address" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'invoices'
      AND column_name IN ('student_id', 'term', 'academic_year')
    GROUP BY table_name
    HAVING COUNT(*) = 3
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "invoices_student_id_term_academic_year_key"
    ON "invoices"("student_id", "term", "academic_year");
  END IF;
END $$;
