-- Incident-specific forward completion for already-created, empty School AI tables.
-- Reconcile exact columns/indexes/foreign keys against a clean migration replay first.
-- Stops if records appeared, review backfill is needed, or an existing definition differs.
-- Never use this on a newer execution-operation set.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE school_ai_document_jobs, school_ai_exam_appeals, school_ai_exam_result_revisions, school_ai_runs, school_ai_substitute_duties, school_ai_exam_attempts, school_ai_executions IN SHARE ROW EXCLUSIVE MODE;
DO $repair$
BEGIN
  IF EXISTS (SELECT 1 FROM school_ai_document_jobs) THEN RAISE EXCEPTION 'Expected empty incident table: school_ai_document_jobs'; END IF;
  IF EXISTS (SELECT 1 FROM school_ai_exam_appeals) THEN RAISE EXCEPTION 'Expected empty incident table: school_ai_exam_appeals'; END IF;
  IF EXISTS (SELECT 1 FROM school_ai_exam_result_revisions) THEN RAISE EXCEPTION 'Expected empty incident table: school_ai_exam_result_revisions'; END IF;
  IF EXISTS (SELECT 1 FROM school_ai_runs) THEN RAISE EXCEPTION 'Expected empty incident table: school_ai_runs'; END IF;
  IF EXISTS (SELECT 1 FROM school_ai_substitute_duties) THEN RAISE EXCEPTION 'Expected empty incident table: school_ai_substitute_duties'; END IF;
  IF EXISTS (SELECT 1 FROM school_ai_exam_attempts WHERE review_version <> 0 OR (reviewed_at IS NOT NULL AND review IS NOT NULL AND review <> 'null'::jsonb)) THEN RAISE EXCEPTION 'Existing result history requires an independently reviewed backfill'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_document_jobs'::regclass AND conname='school_ai_document_jobs_kind_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_document_jobs" ADD CONSTRAINT "school_ai_document_jobs_kind_check" CHECK ((kind = ANY (ARRAY['EXTRACT'::text, 'DELETE_ORIGINAL'::text])));
  ELSIF existing_definition <> 'CHECK ((kind = ANY (ARRAY[''EXTRACT''::text, ''DELETE_ORIGINAL''::text])))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_document_jobs_kind_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_document_jobs'::regclass AND conname='school_ai_document_jobs_status_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_document_jobs" ADD CONSTRAINT "school_ai_document_jobs_status_check" CHECK ((status = ANY (ARRAY['QUEUED'::text, 'PROCESSING'::text, 'READY'::text, 'APPLIED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'FAILED'::text])));
  ELSIF existing_definition <> 'CHECK ((status = ANY (ARRAY[''QUEUED''::text, ''PROCESSING''::text, ''READY''::text, ''APPLIED''::text, ''COMPLETED''::text, ''CANCELLED''::text, ''FAILED''::text])))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_document_jobs_status_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_document_jobs'::regclass AND conname='school_ai_document_jobs_values_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_document_jobs" ADD CONSTRAINT "school_ai_document_jobs_values_check" CHECK (((version > 0) AND (record_version > 0) AND ((attempts >= 0) AND (attempts <= 3))));
  ELSIF existing_definition <> 'CHECK (((version > 0) AND (record_version > 0) AND ((attempts >= 0) AND (attempts <= 3))))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_document_jobs_values_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_exam_appeals'::regclass AND conname='school_ai_appeal_status_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_exam_appeals" ADD CONSTRAINT "school_ai_appeal_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'UPHELD'::text, 'DISMISSED'::text, 'RESOLVED'::text])));
  ELSIF existing_definition <> 'CHECK ((status = ANY (ARRAY[''OPEN''::text, ''UPHELD''::text, ''DISMISSED''::text, ''RESOLVED''::text])))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_appeal_status_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_exam_appeals'::regclass AND conname='school_ai_appeal_version_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_exam_appeals" ADD CONSTRAINT "school_ai_appeal_version_check" CHECK (((version >= 1) AND (result_version >= 1)));
  ELSIF existing_definition <> 'CHECK (((version >= 1) AND (result_version >= 1)))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_appeal_version_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_exam_attempts'::regclass AND conname='school_ai_attempt_review_version_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_exam_attempts" ADD CONSTRAINT "school_ai_attempt_review_version_check" CHECK ((review_version >= 0));
  ELSIF existing_definition <> 'CHECK ((review_version >= 0))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_attempt_review_version_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_exam_result_revisions'::regclass AND conname='school_ai_result_revision_version_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_exam_result_revisions" ADD CONSTRAINT "school_ai_result_revision_version_check" CHECK ((version >= 1));
  ELSIF existing_definition <> 'CHECK ((version >= 1))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_result_revision_version_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_runs'::regclass AND conname='school_ai_run_bounds_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_runs" ADD CONSTRAINT "school_ai_run_bounds_check" CHECK (((version >= 1) AND (next_step >= 0) AND (jsonb_typeof(steps) = 'array'::text) AND ((jsonb_array_length(steps) >= 1) AND (jsonb_array_length(steps) <= 20)) AND (next_step <= jsonb_array_length(steps)) AND (expires_at > scheduled_at)));
  ELSIF existing_definition <> 'CHECK (((version >= 1) AND (next_step >= 0) AND (jsonb_typeof(steps) = ''array''::text) AND ((jsonb_array_length(steps) >= 1) AND (jsonb_array_length(steps) <= 20)) AND (next_step <= jsonb_array_length(steps)) AND (expires_at > scheduled_at)))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_run_bounds_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_runs'::regclass AND conname='school_ai_run_status_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_runs" ADD CONSTRAINT "school_ai_run_status_check" CHECK ((status = ANY (ARRAY['QUEUED'::text, 'PAUSED'::text, 'BLOCKED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'EXPIRED'::text])));
  ELSIF existing_definition <> 'CHECK ((status = ANY (ARRAY[''QUEUED''::text, ''PAUSED''::text, ''BLOCKED''::text, ''COMPLETED''::text, ''CANCELLED''::text, ''EXPIRED''::text])))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_run_status_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_substitute_duties'::regclass AND conname='school_ai_substitute_slot_fk';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_substitute_duties" ADD CONSTRAINT "school_ai_substitute_slot_fk" FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slots(id) ON DELETE RESTRICT;
  ELSIF existing_definition <> 'FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slots(id) ON DELETE RESTRICT' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_substitute_slot_fk'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_substitute_duties'::regclass AND conname='school_ai_substitute_status_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_substitute_duties" ADD CONSTRAINT "school_ai_substitute_status_check" CHECK ((status = ANY (ARRAY['ASSIGNED'::text, 'CANCELLED'::text])));
  ELSIF existing_definition <> 'CHECK ((status = ANY (ARRAY[''ASSIGNED''::text, ''CANCELLED''::text])))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_substitute_status_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_substitute_duties'::regclass AND conname='school_ai_substitute_version_check';
  IF existing_definition IS NULL THEN ALTER TABLE "school_ai_substitute_duties" ADD CONSTRAINT "school_ai_substitute_version_check" CHECK ((version >= 1));
  ELSIF existing_definition <> 'CHECK ((version >= 1))' THEN RAISE EXCEPTION 'Unexpected definition: school_ai_substitute_version_check'; END IF;
END
$repair$;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition FROM pg_constraint WHERE conrelid='public.school_ai_executions'::regclass AND conname='school_ai_executions_operation_check';
  IF existing_definition = 'CHECK ((operation = ANY (ARRAY[''curriculum.import_topics''::text, ''academics.setup_year''::text, ''timetable.create_draft''::text, ''communications.queue_announcement''::text, ''exams.create_session_plan''::text, ''fees.generate_invoices''::text])))' THEN
    ALTER TABLE school_ai_executions DROP CONSTRAINT school_ai_executions_operation_check;
    ALTER TABLE school_ai_executions ADD CONSTRAINT school_ai_executions_operation_check CHECK ((operation = ANY (ARRAY['curriculum.import_topics'::text, 'academics.setup_year'::text, 'timetable.create_draft'::text, 'communications.queue_announcement'::text, 'exams.create_session_plan'::text, 'fees.generate_invoices'::text, 'finance.apply_operation'::text, 'timetable.create_school_drafts'::text, 'attendance.record_register'::text, 'timetable.assign_substitutes'::text, 'academics.transition_year'::text, 'students.promote_enrollment'::text])));
  ELSIF existing_definition IS DISTINCT FROM 'CHECK ((operation = ANY (ARRAY[''curriculum.import_topics''::text, ''academics.setup_year''::text, ''timetable.create_draft''::text, ''communications.queue_announcement''::text, ''exams.create_session_plan''::text, ''fees.generate_invoices''::text, ''finance.apply_operation''::text, ''timetable.create_school_drafts''::text, ''attendance.record_register''::text, ''timetable.assign_substitutes''::text, ''academics.transition_year''::text, ''students.promote_enrollment''::text])))' THEN RAISE EXCEPTION 'Unexpected execution operation definition'; END IF;
END
$repair$;
DO $repair$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_document_jobs' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "school_ai_document_jobs" USING (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text)) WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text));
  ELSIF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_document_jobs' AND policyname='tenant_isolation' AND permissive='PERMISSIVE' AND roles::text='{public}' AND cmd='ALL' AND qual='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))' AND with_check='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))') THEN RAISE EXCEPTION 'Unexpected tenant policy: school_ai_document_jobs'; END IF;
END
$repair$;
ALTER TABLE "school_ai_document_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_document_jobs" FORCE ROW LEVEL SECURITY;
DO $repair$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_exam_appeals' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "school_ai_exam_appeals" USING (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text)) WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text));
  ELSIF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_exam_appeals' AND policyname='tenant_isolation' AND permissive='PERMISSIVE' AND roles::text='{public}' AND cmd='ALL' AND qual='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))' AND with_check='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))') THEN RAISE EXCEPTION 'Unexpected tenant policy: school_ai_exam_appeals'; END IF;
END
$repair$;
ALTER TABLE "school_ai_exam_appeals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_appeals" FORCE ROW LEVEL SECURITY;
DO $repair$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_exam_result_revisions' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "school_ai_exam_result_revisions" USING (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text)) WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text));
  ELSIF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_exam_result_revisions' AND policyname='tenant_isolation' AND permissive='PERMISSIVE' AND roles::text='{public}' AND cmd='ALL' AND qual='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))' AND with_check='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))') THEN RAISE EXCEPTION 'Unexpected tenant policy: school_ai_exam_result_revisions'; END IF;
END
$repair$;
ALTER TABLE "school_ai_exam_result_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_result_revisions" FORCE ROW LEVEL SECURITY;
DO $repair$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_runs' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "school_ai_runs" USING (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text)) WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text));
  ELSIF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_runs' AND policyname='tenant_isolation' AND permissive='PERMISSIVE' AND roles::text='{public}' AND cmd='ALL' AND qual='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))' AND with_check='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))') THEN RAISE EXCEPTION 'Unexpected tenant policy: school_ai_runs'; END IF;
END
$repair$;
ALTER TABLE "school_ai_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_runs" FORCE ROW LEVEL SECURITY;
DO $repair$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_substitute_duties' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON "school_ai_substitute_duties" USING (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text)) WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id'::text, true), ''::text));
  ELSIF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='school_ai_substitute_duties' AND policyname='tenant_isolation' AND permissive='PERMISSIVE' AND roles::text='{public}' AND cmd='ALL' AND qual='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))' AND with_check='(school_id = NULLIF(current_setting(''app.current_school_id''::text, true), ''''::text))') THEN RAISE EXCEPTION 'Unexpected tenant policy: school_ai_substitute_duties'; END IF;
END
$repair$;
ALTER TABLE "school_ai_substitute_duties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_substitute_duties" FORCE ROW LEVEL SECURITY;
DO $repair$
DECLARE existing_definition TEXT;
BEGIN
  SELECT pg_get_triggerdef(oid) INTO existing_definition FROM pg_trigger WHERE tgrelid='public.school_ai_exam_result_revisions'::regclass AND tgname='school_ai_result_revision_immutable_before_update';
  IF existing_definition IS NULL THEN CREATE TRIGGER school_ai_result_revision_immutable_before_update BEFORE UPDATE ON public.school_ai_exam_result_revisions FOR EACH ROW EXECUTE FUNCTION school_ai_revision_immutable();
  ELSIF existing_definition <> 'CREATE TRIGGER school_ai_result_revision_immutable_before_update BEFORE UPDATE ON public.school_ai_exam_result_revisions FOR EACH ROW EXECUTE FUNCTION school_ai_revision_immutable()' THEN RAISE EXCEPTION 'Unexpected result immutability trigger'; END IF;
END
$repair$;
COMMIT;
