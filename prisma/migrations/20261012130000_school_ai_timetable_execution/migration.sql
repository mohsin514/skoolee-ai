ALTER TABLE "school_ai_executions" DROP CONSTRAINT "school_ai_executions_operation_check";
ALTER TABLE "school_ai_executions" ADD CONSTRAINT "school_ai_executions_operation_check"
  CHECK ("operation" IN ('curriculum.import_topics', 'academics.setup_year', 'timetable.create_draft'));
