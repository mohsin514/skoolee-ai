-- DropIndex
DROP INDEX "students_admission_no_key";

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "consolidated_into_id" TEXT;

-- AlterTable
ALTER TABLE "report_cards" ADD COLUMN     "enrollment_id" TEXT;

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "enrollment_id" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "enrollment_id" TEXT;

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "student_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "campus_name" TEXT NOT NULL,
    "class_name" TEXT NOT NULL,
    "curriculum" TEXT NOT NULL,
    "academic_year" INTEGER NOT NULL,
    "roll_no" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "origin" TEXT NOT NULL DEFAULT 'REVIEWED',

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_proposals" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "student_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "from_enrollment_id" TEXT NOT NULL,
    "target_class_id" TEXT NOT NULL,
    "roll_no" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "confirmed_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "enrollment_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_student_id_start_date_idx" ON "student_enrollments"("school_id", "student_id", "start_date");

-- CreateIndex
CREATE INDEX "enrollment_proposals_school_id_student_id_idx" ON "enrollment_proposals"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_admission_no_key" ON "students"("school_id", "admission_no");

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_proposals" ADD CONSTRAINT "enrollment_proposals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_proposals" ADD CONSTRAINT "enrollment_proposals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One concurrent enrollment per pupil is the explicit school policy in v1.
-- Half-open ranges allow a transfer on the old period's exclusive end date.
ALTER TABLE student_enrollments ADD CONSTRAINT enrollment_dates CHECK (end_date IS NULL OR end_date > start_date);
CREATE UNIQUE INDEX enrollment_one_open_period ON student_enrollments(student_id) WHERE end_date IS NULL AND status = 'ACTIVE';
INSERT INTO student_enrollments (id,school_id,student_id,campus_id,class_id,campus_name,class_name,curriculum,academic_year,roll_no,status,start_date,origin)
SELECT 'initial-'||s.id,s.school_id,s.id,s.campus_id,s.class_id,c.name,concat_ws(' ',cl.name,cl.section),coalesce(c.board,'Unspecified'),cl.academic_year,s.roll_no,'ACTIVE',s.enrollment_date::date,'MIGRATION_CURRENT'
FROM students s JOIN campuses c ON c.id=s.campus_id JOIN classes cl ON cl.id=s.class_id;

-- Legacy sources may predate the current placement. Keep their original class
-- where available; do not claim that an inferred legacy period is authoritative.
INSERT INTO student_enrollments (id,school_id,student_id,campus_id,class_id,campus_name,class_name,curriculum,academic_year,roll_no,status,start_date,origin)
SELECT 'legacy-att-'||a.id,a.school_id,a.student_id,a.campus_id,coalesce(a.class_id,s.class_id),c.name,concat_ws(' ',cl.name,cl.section),coalesce(c.board,'Unspecified'),cl.academic_year,s.roll_no,'HISTORICAL',a.date,'LEGACY_SOURCE'
FROM attendance a JOIN students s ON s.id=a.student_id JOIN campuses c ON c.id=a.campus_id JOIN classes cl ON cl.id=coalesce(a.class_id,s.class_id);
UPDATE attendance SET enrollment_id='legacy-att-'||id;
INSERT INTO student_enrollments (id,school_id,student_id,campus_id,class_id,campus_name,class_name,curriculum,academic_year,roll_no,status,start_date,origin)
SELECT 'legacy-report-'||r.id,r.school_id,r.student_id,r.campus_id,e.class_id,c.name,concat_ws(' ',cl.name,cl.section),coalesce(c.board,'Unspecified'),cl.academic_year,s.roll_no,'HISTORICAL',r.generated_at::date,'LEGACY_SOURCE'
FROM report_cards r JOIN students s ON s.id=r.student_id JOIN exams e ON e.id=r.exam_id JOIN campuses c ON c.id=r.campus_id JOIN classes cl ON cl.id=e.class_id;
UPDATE report_cards SET enrollment_id='legacy-report-'||id;
INSERT INTO student_enrollments (id,school_id,student_id,campus_id,class_id,campus_name,class_name,curriculum,academic_year,roll_no,status,start_date,origin)
SELECT 'legacy-invoice-'||i.id,i.school_id,i.student_id,i.campus_id,s.class_id,c.name,concat_ws(' ',cl.name,cl.section),coalesce(c.board,'Unspecified'),cl.academic_year,s.roll_no,'HISTORICAL',i.invoice_date::date,'LEGACY_INFERRED_CLASS'
FROM invoices i JOIN students s ON s.id=i.student_id JOIN campuses c ON c.id=i.campus_id JOIN classes cl ON cl.id=s.class_id;
UPDATE invoices SET enrollment_id='legacy-invoice-'||id;

CREATE FUNCTION pupil_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.school_id<>OLD.school_id THEN RAISE EXCEPTION 'Permanent pupil identity and institution are immutable'; END IF;
 IF (NEW.class_id,NEW.campus_id,NEW.roll_no) IS DISTINCT FROM (OLD.class_id,OLD.campus_id,OLD.roll_no)
 AND current_setting('app.enrollment_reviewed',true) IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Placement changes require an enrollment review'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pupil_identity_guard BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION pupil_identity_guard();
CREATE FUNCTION pupil_first_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO student_enrollments(id,school_id,student_id,campus_id,class_id,campus_name,class_name,curriculum,academic_year,roll_no,status,start_date,origin)
 SELECT 'initial-'||NEW.id,NEW.school_id,NEW.id,NEW.campus_id,NEW.class_id,c.name,concat_ws(' ',cl.name,cl.section),coalesce(c.board,'Unspecified'),cl.academic_year,NEW.roll_no,'ACTIVE',NEW.enrollment_date::date,'ADMISSION'
 FROM classes cl JOIN campuses c ON c.id=cl.campus_id WHERE cl.id=NEW.class_id AND c.id=NEW.campus_id AND c.school_id=NEW.school_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment placement is outside institution'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pupil_first_enrollment AFTER INSERT ON students FOR EACH ROW EXECUTE FUNCTION pupil_first_enrollment();
CREATE FUNCTION enrollment_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM students WHERE id=NEW.student_id AND school_id=NEW.school_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pupil outside institution'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'end_date'-'status') IS DISTINCT FROM (to_jsonb(OLD)-'end_date'-'status') OR OLD.end_date IS NOT NULL THEN
   RAISE EXCEPTION 'Historical enrollment context is immutable';
  END IF;
 END IF;
 IF NEW.origin NOT LIKE 'LEGACY%' AND EXISTS (SELECT 1 FROM student_enrollments e WHERE e.student_id=NEW.student_id AND e.id<>NEW.id AND e.origin NOT LIKE 'LEGACY%' AND daterange(e.start_date,e.end_date,'[)') && daterange(NEW.start_date,NEW.end_date,'[)')) THEN
  RAISE EXCEPTION 'Overlapping enrollment periods are forbidden by school policy';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enrollment_period_guard BEFORE INSERT OR UPDATE ON student_enrollments FOR EACH ROW EXECUTE FUNCTION enrollment_period_guard();
CREATE FUNCTION source_enrollment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period student_enrollments; source_date date; source_class text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.student_id,NEW.school_id,NEW.campus_id,NEW.enrollment_id) IS DISTINCT FROM (OLD.student_id,OLD.school_id,OLD.campus_id,OLD.enrollment_id) THEN RAISE EXCEPTION 'Source enrollment context is immutable'; END IF;
  IF TG_TABLE_NAME='attendance' AND (to_jsonb(NEW)->>'date',to_jsonb(NEW)->>'class_id') IS DISTINCT FROM (to_jsonb(OLD)->>'date',to_jsonb(OLD)->>'class_id') THEN RAISE EXCEPTION 'Attendance date and placement are immutable'; END IF;
  RETURN NEW;
 END IF;
 source_date := CASE TG_TABLE_NAME WHEN 'attendance' THEN (to_jsonb(NEW)->>'date')::date WHEN 'invoices' THEN (to_jsonb(NEW)->>'invoice_date')::date ELSE (to_jsonb(NEW)->>'generated_at')::date END;
 IF TG_TABLE_NAME='attendance' THEN source_class:=to_jsonb(NEW)->>'class_id'; END IF;
 IF TG_TABLE_NAME='report_cards' THEN SELECT class_id INTO source_class FROM exams WHERE id=to_jsonb(NEW)->>'exam_id'; END IF;
 SELECT * INTO period FROM student_enrollments e WHERE e.student_id=NEW.student_id AND e.school_id=NEW.school_id AND e.campus_id=NEW.campus_id AND e.origin NOT LIKE 'LEGACY%' AND e.start_date<=source_date AND (e.end_date IS NULL OR e.end_date>source_date) AND (source_class IS NULL OR e.class_id=source_class);
 IF NOT FOUND THEN RAISE EXCEPTION 'No enrollment for source date and placement'; END IF;
 IF NEW.enrollment_id IS NOT NULL AND NEW.enrollment_id<>period.id THEN RAISE EXCEPTION 'Source enrollment mismatch'; END IF;
 NEW.enrollment_id:=period.id;
 RETURN NEW;
END $$;
CREATE TRIGGER attendance_enrollment BEFORE INSERT OR UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION source_enrollment_guard();
CREATE TRIGGER invoice_enrollment BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION source_enrollment_guard();
CREATE TRIGGER report_enrollment BEFORE INSERT OR UPDATE ON report_cards FOR EACH ROW EXECUTE FUNCTION source_enrollment_guard();
