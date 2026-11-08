-- Forward repair for the inspected schema-push collision on 20261012170000.
-- Run only after confirming all migration tables, columns, indexes and foreign keys match.
-- This adds missing validation; it never deletes or rewrites business records.
-- Stops on an unexpected constraint definition or invalid existing rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $repair$
DECLARE found_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_conversations'::regclass AND conname = 'school_ai_conversations_purpose_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_conversations" ADD CONSTRAINT "school_ai_conversations_purpose_check" CHECK ((purpose = ANY (ARRAY['WORKSPACE'::text, 'SETUP'::text])));
  ELSIF found_definition <> $definition$CHECK ((purpose = ANY (ARRAY['WORKSPACE'::text, 'SETUP'::text])))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_conversations_purpose_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_conversations'::regclass AND conname = 'school_ai_conversations_subject_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_conversations" ADD CONSTRAINT "school_ai_conversations_subject_check" CHECK ((((subject_id IS NULL) AND (class_id IS NULL)) OR ((subject_id IS NOT NULL) AND (class_id IS NOT NULL) AND (campus_id IS NOT NULL))));
  ELSIF found_definition <> $definition$CHECK ((((subject_id IS NULL) AND (class_id IS NULL)) OR ((subject_id IS NOT NULL) AND (class_id IS NOT NULL) AND (campus_id IS NOT NULL))))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_conversations_subject_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_conversations'::regclass AND conname = 'school_ai_conversations_title_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_conversations" ADD CONSTRAINT "school_ai_conversations_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 180)));
  ELSIF found_definition <> $definition$CHECK (((char_length(title) >= 1) AND (char_length(title) <= 180)))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_conversations_title_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_conversations'::regclass AND conname = 'school_ai_conversations_version_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_conversations" ADD CONSTRAINT "school_ai_conversations_version_check" CHECK ((version >= 0));
  ELSIF found_definition <> $definition$CHECK ((version >= 0))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_conversations_version_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_executions'::regclass AND conname = 'school_ai_executions_operation_check';
  IF found_definition = $definition$CHECK ((operation = ANY (ARRAY['curriculum.import_topics'::text, 'academics.setup_year'::text, 'timetable.create_draft'::text, 'communications.queue_announcement'::text])))$definition$ THEN
    ALTER TABLE public."school_ai_executions" DROP CONSTRAINT "school_ai_executions_operation_check";
    found_definition := NULL;
  END IF;
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_executions" ADD CONSTRAINT "school_ai_executions_operation_check" CHECK ((operation = ANY (ARRAY['curriculum.import_topics'::text, 'academics.setup_year'::text, 'timetable.create_draft'::text, 'communications.queue_announcement'::text, 'exams.create_session_plan'::text, 'fees.generate_invoices'::text])));
  ELSIF found_definition <> $definition$CHECK ((operation = ANY (ARRAY['curriculum.import_topics'::text, 'academics.setup_year'::text, 'timetable.create_draft'::text, 'communications.queue_announcement'::text, 'exams.create_session_plan'::text, 'fees.generate_invoices'::text])))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_executions_operation_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_requests'::regclass AND conname = 'school_ai_requests_conversation_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_requests" ADD CONSTRAINT "school_ai_requests_conversation_check" CHECK ((((conversation_id IS NULL) AND (conversation_version IS NULL) AND (user_message IS NULL)) OR ((conversation_id IS NOT NULL) AND (conversation_version IS NOT NULL) AND (conversation_version >= 1) AND (user_message IS NOT NULL) AND ((char_length(user_message) >= 1) AND (char_length(user_message) <= 8000)))));
  ELSIF found_definition <> $definition$CHECK ((((conversation_id IS NULL) AND (conversation_version IS NULL) AND (user_message IS NULL)) OR ((conversation_id IS NOT NULL) AND (conversation_version IS NOT NULL) AND (conversation_version >= 1) AND (user_message IS NOT NULL) AND ((char_length(user_message) >= 1) AND (char_length(user_message) <= 8000)))))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_requests_conversation_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_setup_tasks'::regclass AND conname = 'school_ai_setup_tasks_answer_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_setup_tasks" ADD CONSTRAINT "school_ai_setup_tasks_answer_check" CHECK (((answer IS NULL) OR ((char_length(answer) >= 1) AND (char_length(answer) <= 4000))));
  ELSIF found_definition <> $definition$CHECK (((answer IS NULL) OR ((char_length(answer) >= 1) AND (char_length(answer) <= 4000))))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_setup_tasks_answer_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_setup_tasks'::regclass AND conname = 'school_ai_setup_tasks_field_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_setup_tasks" ADD CONSTRAINT "school_ai_setup_tasks_field_check" CHECK ((field_key = ANY (ARRAY['schoolName'::text, 'country'::text, 'timezone'::text, 'campuses'::text, 'grades'::text, 'academicYear'::text, 'startDate'::text, 'endDate'::text, 'workingDays'::text, 'firstOutcome'::text, 'curriculum'::text, 'assessmentPolicy'::text, 'feePolicy'::text, 'communications'::text, 'resources'::text, 'staff'::text, 'students'::text, 'migrationSource'::text])));
  ELSIF found_definition <> $definition$CHECK ((field_key = ANY (ARRAY['schoolName'::text, 'country'::text, 'timezone'::text, 'campuses'::text, 'grades'::text, 'academicYear'::text, 'startDate'::text, 'endDate'::text, 'workingDays'::text, 'firstOutcome'::text, 'curriculum'::text, 'assessmentPolicy'::text, 'feePolicy'::text, 'communications'::text, 'resources'::text, 'staff'::text, 'students'::text, 'migrationSource'::text])))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_setup_tasks_field_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_setup_tasks'::regclass AND conname = 'school_ai_setup_tasks_question_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_setup_tasks" ADD CONSTRAINT "school_ai_setup_tasks_question_check" CHECK (((char_length(question) >= 1) AND (char_length(question) <= 300) AND (char_length(instructions) <= 2000)));
  ELSIF found_definition <> $definition$CHECK (((char_length(question) >= 1) AND (char_length(question) <= 300) AND (char_length(instructions) <= 2000)))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_setup_tasks_question_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_setup_tasks'::regclass AND conname = 'school_ai_setup_tasks_status_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_setup_tasks" ADD CONSTRAINT "school_ai_setup_tasks_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'ANSWERED'::text, 'ACCEPTED'::text, 'CANCELLED'::text])));
  ELSIF found_definition <> $definition$CHECK ((status = ANY (ARRAY['OPEN'::text, 'ANSWERED'::text, 'ACCEPTED'::text, 'CANCELLED'::text])))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_setup_tasks_status_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_setup_tasks'::regclass AND conname = 'school_ai_setup_tasks_version_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_setup_tasks" ADD CONSTRAINT "school_ai_setup_tasks_version_check" CHECK ((version >= 1));
  ELSIF found_definition <> $definition$CHECK ((version >= 1))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_setup_tasks_version_check';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO found_definition FROM pg_constraint
    WHERE conrelid = 'public.school_ai_requests'::regclass AND conname = 'school_ai_requests_language_check';
  IF found_definition IS NULL THEN
    ALTER TABLE public."school_ai_requests" ADD CONSTRAINT "school_ai_requests_language_check" CHECK (((request_language IS NULL) OR (request_language = ANY (ARRAY['en'::text, 'ar'::text, 'ur'::text]))));
  ELSIF found_definition <> $definition$CHECK (((request_language IS NULL) OR (request_language = ANY (ARRAY['en'::text, 'ar'::text, 'ur'::text]))))$definition$ THEN
    RAISE EXCEPTION 'Unexpected constraint definition: school_ai_requests_language_check';
  END IF;
END
$repair$;
COMMIT;
