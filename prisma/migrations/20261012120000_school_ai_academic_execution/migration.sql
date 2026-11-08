-- AlterTable
ALTER TABLE "school_ai_exam_assignments" ADD COLUMN     "accommodations" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "school_ai_exam_assignments"
  ADD CONSTRAINT "school_ai_exam_assignments_accommodations_check" CHECK (jsonb_typeof("accommodations") = 'object');

ALTER TABLE "school_ai_executions" DROP CONSTRAINT "school_ai_executions_operation_check";
ALTER TABLE "school_ai_executions"
  ADD CONSTRAINT "school_ai_executions_operation_check" CHECK ("operation" IN ('curriculum.import_topics', 'academics.setup_year'));
