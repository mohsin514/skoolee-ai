-- ===========================================================
-- Multi-tenant hardening: school_id on every tenant-owned table.
-- Backfills school_id by walking each table's ownership chain up
-- to schools, then makes it NOT NULL with an FK + index.
-- Idempotent. FAILS LOUDLY (never deletes) if any row cannot be
-- attributed to a school, so bad data is fixed by a human, not
-- destroyed silently.
-- ===========================================================

-- StaffProfile (staff_profiles)
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "staff_profiles" t SET "school_id" = j0."school_id"
  FROM "users" j0
  WHERE j0.id = t."user_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "staff_profiles" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "staff_profiles" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "staff_profiles" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "staff_profiles" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "staff_profiles_school_id_idx" ON "staff_profiles"("school_id");
DO $$ BEGIN
  ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StaffDocument (staff_documents)
ALTER TABLE "staff_documents" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "staff_documents" t SET "school_id" = j0."school_id"
  FROM "users" j0
  WHERE j0.id = t."user_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "staff_documents" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "staff_documents" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "staff_documents" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "staff_documents" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "staff_documents_school_id_idx" ON "staff_documents"("school_id");
DO $$ BEGIN
  ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StaffTimelineEvent (staff_timeline_events)
ALTER TABLE "staff_timeline_events" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "staff_timeline_events" t SET "school_id" = j0."school_id"
  FROM "users" j0
  WHERE j0.id = t."user_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "staff_timeline_events" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "staff_timeline_events" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "staff_timeline_events" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "staff_timeline_events" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "staff_timeline_events_school_id_idx" ON "staff_timeline_events"("school_id");
DO $$ BEGIN
  ALTER TABLE "staff_timeline_events" ADD CONSTRAINT "staff_timeline_events_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LeaveType (leave_types)
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "leave_types" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "leave_types" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "leave_types" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "leave_types" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "leave_types" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "leave_types_school_id_idx" ON "leave_types"("school_id");
DO $$ BEGIN
  ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LeaveAllocation (leave_allocations)
ALTER TABLE "leave_allocations" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "leave_allocations" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "leave_allocations" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "leave_allocations" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "leave_allocations" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "leave_allocations" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "leave_allocations_school_id_idx" ON "leave_allocations"("school_id");
DO $$ BEGIN
  ALTER TABLE "leave_allocations" ADD CONSTRAINT "leave_allocations_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LeaveRequest (leave_requests)
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "leave_requests" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "leave_requests" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "leave_requests" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "leave_requests" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "leave_requests" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "leave_requests_school_id_idx" ON "leave_requests"("school_id");
DO $$ BEGIN
  ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PayrollRun (payroll_runs)
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "payroll_runs" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "payroll_runs" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "payroll_runs" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "payroll_runs" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "payroll_runs" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "payroll_runs_school_id_idx" ON "payroll_runs"("school_id");
DO $$ BEGIN
  ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PayrollLine (payroll_lines)
ALTER TABLE "payroll_lines" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "payroll_lines" t SET "school_id" = j0."school_id"
  FROM "users" j0
  WHERE j0.id = t."user_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "payroll_lines" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "payroll_lines" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "payroll_lines" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "payroll_lines" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "payroll_lines_school_id_idx" ON "payroll_lines"("school_id");
DO $$ BEGIN
  ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Class (classes)
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "classes" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "classes" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "classes" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "classes" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "classes" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "classes_school_id_idx" ON "classes"("school_id");
DO $$ BEGIN
  ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Student (students)
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "students" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "students" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "students" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "students" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "students" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "students_school_id_idx" ON "students"("school_id");
DO $$ BEGIN
  ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StudentDocument (student_documents)
ALTER TABLE "student_documents" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "student_documents" t SET "school_id" = j1."school_id"
  FROM "students" j0, "campuses" j1
  WHERE j0.id = t."student_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "student_documents" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "student_documents" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "student_documents" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "student_documents" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "student_documents_school_id_idx" ON "student_documents"("school_id");
DO $$ BEGIN
  ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StudentTimelineEvent (student_timeline_events)
ALTER TABLE "student_timeline_events" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "student_timeline_events" t SET "school_id" = j1."school_id"
  FROM "students" j0, "campuses" j1
  WHERE j0.id = t."student_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "student_timeline_events" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "student_timeline_events" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "student_timeline_events" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "student_timeline_events" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "student_timeline_events_school_id_idx" ON "student_timeline_events"("school_id");
DO $$ BEGIN
  ALTER TABLE "student_timeline_events" ADD CONSTRAINT "student_timeline_events_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AdmissionQuery (admission_queries)
ALTER TABLE "admission_queries" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "admission_queries" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "admission_queries" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "admission_queries" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "admission_queries" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "admission_queries" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "admission_queries_school_id_idx" ON "admission_queries"("school_id");
DO $$ BEGIN
  ALTER TABLE "admission_queries" ADD CONSTRAINT "admission_queries_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AdmissionQueryFollowUp (admission_query_follow_ups)
ALTER TABLE "admission_query_follow_ups" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "admission_query_follow_ups" t SET "school_id" = j1."school_id"
  FROM "admission_queries" j0, "campuses" j1
  WHERE j0.id = t."query_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "admission_query_follow_ups" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "admission_query_follow_ups" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "admission_query_follow_ups" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "admission_query_follow_ups" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "admission_query_follow_ups_school_id_idx" ON "admission_query_follow_ups"("school_id");
DO $$ BEGIN
  ALTER TABLE "admission_query_follow_ups" ADD CONSTRAINT "admission_query_follow_ups_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StudentCategory (student_categories)
ALTER TABLE "student_categories" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "student_categories" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "student_categories" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "student_categories" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "student_categories" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "student_categories" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "student_categories_school_id_idx" ON "student_categories"("school_id");
DO $$ BEGIN
  ALTER TABLE "student_categories" ADD CONSTRAINT "student_categories_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StudentGroup (student_groups)
ALTER TABLE "student_groups" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "student_groups" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "student_groups" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "student_groups" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "student_groups" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "student_groups" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "student_groups_school_id_idx" ON "student_groups"("school_id");
DO $$ BEGIN
  ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Subject (subjects)
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "subjects" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "subjects" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "subjects" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "subjects" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "subjects" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "subjects_school_id_idx" ON "subjects"("school_id");
DO $$ BEGIN
  ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SyllabusTopic (syllabus_topics)
ALTER TABLE "syllabus_topics" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "syllabus_topics" t SET "school_id" = j1."school_id"
  FROM "subjects" j0, "campuses" j1
  WHERE j0.id = t."subject_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "syllabus_topics" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "syllabus_topics" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "syllabus_topics" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "syllabus_topics" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "syllabus_topics_school_id_idx" ON "syllabus_topics"("school_id");
DO $$ BEGIN
  ALTER TABLE "syllabus_topics" ADD CONSTRAINT "syllabus_topics_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Exam (exams)
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "exams" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "exams" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "exams" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "exams" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "exams" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "exams_school_id_idx" ON "exams"("school_id");
DO $$ BEGIN
  ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ExamSchedule (exam_schedules)
ALTER TABLE "exam_schedules" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "exam_schedules" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "exam_schedules" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "exam_schedules" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "exam_schedules" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "exam_schedules" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "exam_schedules_school_id_idx" ON "exam_schedules"("school_id");
DO $$ BEGIN
  ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Weekend (campus_weekends)
ALTER TABLE "campus_weekends" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "campus_weekends" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "campus_weekends" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "campus_weekends" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "campus_weekends" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "campus_weekends" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "campus_weekends_school_id_idx" ON "campus_weekends"("school_id");
DO $$ BEGIN
  ALTER TABLE "campus_weekends" ADD CONSTRAINT "campus_weekends_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Holiday (holidays)
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "holidays" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "holidays" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "holidays" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "holidays" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "holidays" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "holidays_school_id_idx" ON "holidays"("school_id");
DO $$ BEGIN
  ALTER TABLE "holidays" ADD CONSTRAINT "holidays_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- GradeWeightConfig (grade_weight_configs)
ALTER TABLE "grade_weight_configs" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "grade_weight_configs" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "grade_weight_configs" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "grade_weight_configs" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "grade_weight_configs" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "grade_weight_configs" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "grade_weight_configs_school_id_idx" ON "grade_weight_configs"("school_id");
DO $$ BEGIN
  ALTER TABLE "grade_weight_configs" ADD CONSTRAINT "grade_weight_configs_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mark (marks)
ALTER TABLE "marks" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "marks" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "marks" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "marks" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "marks" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "marks" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "marks_school_id_idx" ON "marks"("school_id");
DO $$ BEGIN
  ALTER TABLE "marks" ADD CONSTRAINT "marks_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ReportCard (report_cards)
ALTER TABLE "report_cards" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "report_cards" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "report_cards" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "report_cards" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "report_cards" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "report_cards" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "report_cards_school_id_idx" ON "report_cards"("school_id");
DO $$ BEGIN
  ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Attendance (attendance)
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "attendance" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "attendance" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "attendance" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "attendance" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "attendance" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "attendance_school_id_idx" ON "attendance"("school_id");
DO $$ BEGIN
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AttendanceEditHistory (attendance_edit_history)
ALTER TABLE "attendance_edit_history" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "attendance_edit_history" t SET "school_id" = j1."school_id"
  FROM "attendance" j0, "campuses" j1
  WHERE j0.id = t."attendance_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "attendance_edit_history" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "attendance_edit_history" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "attendance_edit_history" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "attendance_edit_history" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "attendance_edit_history_school_id_idx" ON "attendance_edit_history"("school_id");
DO $$ BEGIN
  ALTER TABLE "attendance_edit_history" ADD CONSTRAINT "attendance_edit_history_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeeStructure (fee_structures)
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "fee_structures" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "fee_structures" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "fee_structures" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "fee_structures" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fee_structures" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "fee_structures_school_id_idx" ON "fee_structures"("school_id");
DO $$ BEGIN
  ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeeType (fee_types)
ALTER TABLE "fee_types" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "fee_types" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "fee_types" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "fee_types" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "fee_types" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fee_types" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "fee_types_school_id_idx" ON "fee_types"("school_id");
DO $$ BEGIN
  ALTER TABLE "fee_types" ADD CONSTRAINT "fee_types_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeeGroup (fee_groups)
ALTER TABLE "fee_groups" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "fee_groups" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "fee_groups" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "fee_groups" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "fee_groups" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fee_groups" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "fee_groups_school_id_idx" ON "fee_groups"("school_id");
DO $$ BEGIN
  ALTER TABLE "fee_groups" ADD CONSTRAINT "fee_groups_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeesMasterLine (fees_master_lines)
ALTER TABLE "fees_master_lines" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "fees_master_lines" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "fees_master_lines" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "fees_master_lines" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "fees_master_lines" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fees_master_lines" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "fees_master_lines_school_id_idx" ON "fees_master_lines"("school_id");
DO $$ BEGIN
  ALTER TABLE "fees_master_lines" ADD CONSTRAINT "fees_master_lines_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeeGroupAssignment (fee_group_assignments)
ALTER TABLE "fee_group_assignments" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "fee_group_assignments" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "fee_group_assignments" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "fee_group_assignments" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "fee_group_assignments" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fee_group_assignments" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "fee_group_assignments_school_id_idx" ON "fee_group_assignments"("school_id");
DO $$ BEGIN
  ALTER TABLE "fee_group_assignments" ADD CONSTRAINT "fee_group_assignments_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeeDiscount (fee_discounts)
ALTER TABLE "fee_discounts" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "fee_discounts" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "fee_discounts" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "fee_discounts" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "fee_discounts" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fee_discounts" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "fee_discounts_school_id_idx" ON "fee_discounts"("school_id");
DO $$ BEGIN
  ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeeDiscountAssignment (fee_discount_assignments)
ALTER TABLE "fee_discount_assignments" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "fee_discount_assignments" t SET "school_id" = j1."school_id"
  FROM "fee_discounts" j0, "campuses" j1
  WHERE j0.id = t."discount_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "fee_discount_assignments" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "fee_discount_assignments" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "fee_discount_assignments" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fee_discount_assignments" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "fee_discount_assignments_school_id_idx" ON "fee_discount_assignments"("school_id");
DO $$ BEGIN
  ALTER TABLE "fee_discount_assignments" ADD CONSTRAINT "fee_discount_assignments_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeeCarryForward (fee_carry_forwards)
ALTER TABLE "fee_carry_forwards" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "fee_carry_forwards" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "fee_carry_forwards" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "fee_carry_forwards" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "fee_carry_forwards" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fee_carry_forwards" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "fee_carry_forwards_school_id_idx" ON "fee_carry_forwards"("school_id");
DO $$ BEGIN
  ALTER TABLE "fee_carry_forwards" ADD CONSTRAINT "fee_carry_forwards_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Invoice (invoices)
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "invoices" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "invoices" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "invoices" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "invoices" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "invoices_school_id_idx" ON "invoices"("school_id");
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Payment (payments)
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "payments" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "payments" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "payments" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "payments" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "payments_school_id_idx" ON "payments"("school_id");
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ChartOfAccount (chart_of_accounts)
ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "chart_of_accounts" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "chart_of_accounts" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "chart_of_accounts" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "chart_of_accounts" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "chart_of_accounts" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "chart_of_accounts_school_id_idx" ON "chart_of_accounts"("school_id");
DO $$ BEGIN
  ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PaymentMethodRef (payment_method_refs)
ALTER TABLE "payment_method_refs" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "payment_method_refs" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "payment_method_refs" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "payment_method_refs" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "payment_method_refs" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "payment_method_refs" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "payment_method_refs_school_id_idx" ON "payment_method_refs"("school_id");
DO $$ BEGIN
  ALTER TABLE "payment_method_refs" ADD CONSTRAINT "payment_method_refs_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BankAccount (bank_accounts)
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "bank_accounts" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "bank_accounts" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "bank_accounts" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "bank_accounts" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "bank_accounts" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "bank_accounts_school_id_idx" ON "bank_accounts"("school_id");
DO $$ BEGIN
  ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LedgerEntry (ledger_entries)
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "ledger_entries" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "ledger_entries" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "ledger_entries" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "ledger_entries" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "ledger_entries" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "ledger_entries_school_id_idx" ON "ledger_entries"("school_id");
DO $$ BEGIN
  ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeeFineRule (fee_fine_rules)
ALTER TABLE "fee_fine_rules" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "fee_fine_rules" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "fee_fine_rules" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "fee_fine_rules" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "fee_fine_rules" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fee_fine_rules" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "fee_fine_rules_school_id_idx" ON "fee_fine_rules"("school_id");
DO $$ BEGIN
  ALTER TABLE "fee_fine_rules" ADD CONSTRAINT "fee_fine_rules_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OnlinePaymentOrder (online_payment_orders)
ALTER TABLE "online_payment_orders" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "online_payment_orders" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "online_payment_orders" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "online_payment_orders" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "online_payment_orders" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "online_payment_orders" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "online_payment_orders_school_id_idx" ON "online_payment_orders"("school_id");
DO $$ BEGIN
  ALTER TABLE "online_payment_orders" ADD CONSTRAINT "online_payment_orders_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PaymentPlan (payment_plans)
ALTER TABLE "payment_plans" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "payment_plans" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "payment_plans" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "payment_plans" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "payment_plans" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "payment_plans" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "payment_plans_school_id_idx" ON "payment_plans"("school_id");
DO $$ BEGIN
  ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BankReconciliation (bank_reconciliations)
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "bank_reconciliations" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "bank_reconciliations" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "bank_reconciliations" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "bank_reconciliations_school_id_idx" ON "bank_reconciliations"("school_id");
DO $$ BEGIN
  ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ClassRoom (class_rooms)
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "class_rooms" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "class_rooms" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "class_rooms" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "class_rooms" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "class_rooms" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "class_rooms_school_id_idx" ON "class_rooms"("school_id");
DO $$ BEGIN
  ALTER TABLE "class_rooms" ADD CONSTRAINT "class_rooms_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PeriodDefinition (period_definitions)
ALTER TABLE "period_definitions" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "period_definitions" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "period_definitions" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "period_definitions" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "period_definitions" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "period_definitions" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "period_definitions_school_id_idx" ON "period_definitions"("school_id");
DO $$ BEGIN
  ALTER TABLE "period_definitions" ADD CONSTRAINT "period_definitions_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Timetable (timetables)
ALTER TABLE "timetables" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "timetables" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "timetables" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "timetables" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "timetables" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "timetables" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "timetables_school_id_idx" ON "timetables"("school_id");
DO $$ BEGIN
  ALTER TABLE "timetables" ADD CONSTRAINT "timetables_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TimetableSlot (timetable_slots)
ALTER TABLE "timetable_slots" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "timetable_slots" t SET "school_id" = j1."school_id"
  FROM "timetables" j0, "campuses" j1
  WHERE j0.id = t."timetable_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "timetable_slots" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "timetable_slots" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "timetable_slots" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "timetable_slots" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "timetable_slots_school_id_idx" ON "timetable_slots"("school_id");
DO $$ BEGIN
  ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StaffInvitation (staff_invitations)
ALTER TABLE "staff_invitations" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "staff_invitations" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "staff_invitations" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "staff_invitations" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "staff_invitations" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "staff_invitations" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "staff_invitations_school_id_idx" ON "staff_invitations"("school_id");
DO $$ BEGIN
  ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LoginSession (login_sessions)
ALTER TABLE "login_sessions" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "login_sessions" t SET "school_id" = j0."school_id"
  FROM "users" j0
  WHERE j0.id = t."user_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "login_sessions" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "login_sessions" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "login_sessions" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "login_sessions" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "login_sessions_school_id_idx" ON "login_sessions"("school_id");
DO $$ BEGIN
  ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PasswordHistory (password_history)
ALTER TABLE "password_history" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "password_history" t SET "school_id" = j0."school_id"
  FROM "users" j0
  WHERE j0.id = t."user_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "password_history" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "password_history" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "password_history" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "password_history" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "password_history_school_id_idx" ON "password_history"("school_id");
DO $$ BEGIN
  ALTER TABLE "password_history" ADD CONSTRAINT "password_history_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StudentClassHistory (student_class_history)
ALTER TABLE "student_class_history" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "student_class_history" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "student_class_history" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "student_class_history" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "student_class_history" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "student_class_history" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "student_class_history_school_id_idx" ON "student_class_history"("school_id");
DO $$ BEGIN
  ALTER TABLE "student_class_history" ADD CONSTRAINT "student_class_history_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TeacherAttendance (teacher_attendance)
ALTER TABLE "teacher_attendance" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "teacher_attendance" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "teacher_attendance" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "teacher_attendance" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "teacher_attendance" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "teacher_attendance" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "teacher_attendance_school_id_idx" ON "teacher_attendance"("school_id");
DO $$ BEGIN
  ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AcademicCycle (academic_cycles)
ALTER TABLE "academic_cycles" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "academic_cycles" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "academic_cycles" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "academic_cycles" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "academic_cycles" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "academic_cycles" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "academic_cycles_school_id_idx" ON "academic_cycles"("school_id");
DO $$ BEGIN
  ALTER TABLE "academic_cycles" ADD CONSTRAINT "academic_cycles_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TransportRoute (transport_routes)
ALTER TABLE "transport_routes" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "transport_routes" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "transport_routes" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "transport_routes" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "transport_routes" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "transport_routes" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "transport_routes_school_id_idx" ON "transport_routes"("school_id");
DO $$ BEGIN
  ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vehicle (vehicles)
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "vehicles" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "vehicles" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "vehicles" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "vehicles" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "vehicles" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "vehicles_school_id_idx" ON "vehicles"("school_id");
DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RouteVehicle (route_vehicles)
ALTER TABLE "route_vehicles" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "route_vehicles" t SET "school_id" = j1."school_id"
  FROM "transport_routes" j0, "campuses" j1
  WHERE j0.id = t."route_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "route_vehicles" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "route_vehicles" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "route_vehicles" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "route_vehicles" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "route_vehicles_school_id_idx" ON "route_vehicles"("school_id");
DO $$ BEGIN
  ALTER TABLE "route_vehicles" ADD CONSTRAINT "route_vehicles_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DormRoomType (dorm_room_types)
ALTER TABLE "dorm_room_types" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "dorm_room_types" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "dorm_room_types" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "dorm_room_types" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "dorm_room_types" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "dorm_room_types" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "dorm_room_types_school_id_idx" ON "dorm_room_types"("school_id");
DO $$ BEGIN
  ALTER TABLE "dorm_room_types" ADD CONSTRAINT "dorm_room_types_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DormRoom (dorm_rooms)
ALTER TABLE "dorm_rooms" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "dorm_rooms" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "dorm_rooms" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "dorm_rooms" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "dorm_rooms" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "dorm_rooms" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "dorm_rooms_school_id_idx" ON "dorm_rooms"("school_id");
DO $$ BEGIN
  ALTER TABLE "dorm_rooms" ADD CONSTRAINT "dorm_rooms_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BookCategory (book_categories)
ALTER TABLE "book_categories" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "book_categories" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "book_categories" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "book_categories" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "book_categories" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "book_categories" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "book_categories_school_id_idx" ON "book_categories"("school_id");
DO $$ BEGIN
  ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Book (books)
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "books" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "books" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "books" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "books" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "books" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "books_school_id_idx" ON "books"("school_id");
DO $$ BEGIN
  ALTER TABLE "books" ADD CONSTRAINT "books_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LibraryMember (library_members)
ALTER TABLE "library_members" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "library_members" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "library_members" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "library_members" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "library_members" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "library_members" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "library_members_school_id_idx" ON "library_members"("school_id");
DO $$ BEGIN
  ALTER TABLE "library_members" ADD CONSTRAINT "library_members_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BookIssue (book_issues)
ALTER TABLE "book_issues" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "book_issues" t SET "school_id" = j1."school_id"
  FROM "books" j0, "campuses" j1
  WHERE j0.id = t."book_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "book_issues" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "book_issues" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "book_issues" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "book_issues" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "book_issues_school_id_idx" ON "book_issues"("school_id");
DO $$ BEGIN
  ALTER TABLE "book_issues" ADD CONSTRAINT "book_issues_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ItemCategory (item_categories)
ALTER TABLE "item_categories" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "item_categories" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "item_categories" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "item_categories" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "item_categories" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "item_categories" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "item_categories_school_id_idx" ON "item_categories"("school_id");
DO $$ BEGIN
  ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Item (items)
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "items" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "items" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "items" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "items" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "items" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "items_school_id_idx" ON "items"("school_id");
DO $$ BEGIN
  ALTER TABLE "items" ADD CONSTRAINT "items_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ItemStore (item_stores)
ALTER TABLE "item_stores" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "item_stores" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "item_stores" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "item_stores" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "item_stores" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "item_stores" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "item_stores_school_id_idx" ON "item_stores"("school_id");
DO $$ BEGIN
  ALTER TABLE "item_stores" ADD CONSTRAINT "item_stores_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supplier (suppliers)
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "suppliers" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "suppliers" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "suppliers" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "suppliers" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "suppliers_school_id_idx" ON "suppliers"("school_id");
DO $$ BEGIN
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ItemStock (item_stock)
ALTER TABLE "item_stock" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "item_stock" t SET "school_id" = j1."school_id"
  FROM "items" j0, "campuses" j1
  WHERE j0.id = t."item_id" AND j1.id = j0."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "item_stock" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "item_stock" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "item_stock" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "item_stock" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "item_stock_school_id_idx" ON "item_stock"("school_id");
DO $$ BEGIN
  ALTER TABLE "item_stock" ADD CONSTRAINT "item_stock_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ItemTransaction (item_transactions)
ALTER TABLE "item_transactions" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "item_transactions" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "item_transactions" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "item_transactions" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "item_transactions" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "item_transactions" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "item_transactions_school_id_idx" ON "item_transactions"("school_id");
DO $$ BEGIN
  ALTER TABLE "item_transactions" ADD CONSTRAINT "item_transactions_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- VisitorLog (visitor_logs)
ALTER TABLE "visitor_logs" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "visitor_logs" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "visitor_logs" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "visitor_logs" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "visitor_logs" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "visitor_logs" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "visitor_logs_school_id_idx" ON "visitor_logs"("school_id");
DO $$ BEGIN
  ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Complaint (complaints)
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "complaints" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "complaints" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "complaints" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "complaints" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "complaints" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "complaints_school_id_idx" ON "complaints"("school_id");
DO $$ BEGIN
  ALTER TABLE "complaints" ADD CONSTRAINT "complaints_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PostalRecord (postal_records)
ALTER TABLE "postal_records" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "postal_records" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "postal_records" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "postal_records" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "postal_records" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "postal_records" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "postal_records_school_id_idx" ON "postal_records"("school_id");
DO $$ BEGIN
  ALTER TABLE "postal_records" ADD CONSTRAINT "postal_records_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PhoneCallLog (phone_call_logs)
ALTER TABLE "phone_call_logs" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "phone_call_logs" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "phone_call_logs" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "phone_call_logs" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "phone_call_logs" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "phone_call_logs" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "phone_call_logs_school_id_idx" ON "phone_call_logs"("school_id");
DO $$ BEGIN
  ALTER TABLE "phone_call_logs" ADD CONSTRAINT "phone_call_logs_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CertificateTemplate (certificate_templates)
ALTER TABLE "certificate_templates" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "certificate_templates" t SET "school_id" = j0."school_id"
  FROM "campuses" j0
  WHERE j0.id = t."campus_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "certificate_templates" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "certificate_templates" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "certificate_templates" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "certificate_templates" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "certificate_templates_school_id_idx" ON "certificate_templates"("school_id");
DO $$ BEGIN
  ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AuditLog (audit_logs)
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
UPDATE "audit_logs" t SET "school_id" = j0."school_id"
  FROM "users" j0
  WHERE j0.id = t."user_id" AND t."school_id" IS NULL;
DO $$ DECLARE orphans BIGINT; BEGIN
  SELECT count(*) INTO orphans FROM "audit_logs" WHERE "school_id" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'tenant backfill: % row(s) in "audit_logs" have no resolvable school_id; resolve manually before migrating', orphans;
  END IF;
END $$;
ALTER TABLE "audit_logs" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "school_id" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "audit_logs_school_id_idx" ON "audit_logs"("school_id");
DO $$ BEGIN
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
