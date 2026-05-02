ALTER TABLE "students" ADD COLUMN "student_user_id" TEXT;

CREATE UNIQUE INDEX "students_student_user_id_key" ON "students"("student_user_id");

ALTER TABLE "students"
  ADD CONSTRAINT "students_student_user_id_fkey"
  FOREIGN KEY ("student_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
