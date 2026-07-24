DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'students'
  ) THEN
    ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "student_user_id" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "students_student_user_id_key" ON "students"("student_user_id");

    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'users'
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'students_student_user_id_fkey'
    ) THEN
      ALTER TABLE "students"
        ADD CONSTRAINT "students_student_user_id_fkey"
        FOREIGN KEY ("student_user_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
