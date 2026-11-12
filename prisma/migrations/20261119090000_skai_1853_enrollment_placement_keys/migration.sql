-- SKAI-1853 (DB-01 Phase 3a): real, school-pinned foreign keys for where an enrollment, an attendance register
-- and a payment allocation sit.
--
-- student_enrollments.class_id/campus_id, attendance_registers.class_id/campus_id and
-- payment_allocations.campus_id had no foreign key: a trigger checked enrollment placement on insert, but a
-- class or campus could be deleted underneath, and nothing tied them to the row's school. Each now references
-- (school_id, id) on classes/campuses, so the class or campus must exist and belong to the same school.
-- ON DELETE NO ACTION: these are history rows, so a class or campus that still has them cannot be deleted on
-- its own (a whole-school purge still cascades).
--
-- campuses_school_id_id_key is also created by SKAI-1845; IF NOT EXISTS lets either migration run first.
-- Dev was checked on 2026-11-13: 0 orphan or cross-school rows. Rollback: drop the five *_fkey constraints,
-- the four indexes and classes_school_id_id_key.

CREATE UNIQUE INDEX IF NOT EXISTS "campuses_school_id_id_key" ON "campuses"("school_id", "id");
CREATE UNIQUE INDEX "classes_school_id_id_key" ON "classes"("school_id", "id");
CREATE INDEX "attendance_registers_school_id_campus_id_idx" ON "attendance_registers"("school_id", "campus_id");
CREATE INDEX "attendance_registers_school_id_class_id_idx" ON "attendance_registers"("school_id", "class_id");
CREATE INDEX "student_enrollments_school_id_campus_id_idx" ON "student_enrollments"("school_id", "campus_id");
CREATE INDEX "student_enrollments_school_id_class_id_idx" ON "student_enrollments"("school_id", "class_id");
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
