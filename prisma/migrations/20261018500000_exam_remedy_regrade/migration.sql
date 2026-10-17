-- SKO-408 R17.7: rubric correction and re-marking join key correction and item neutralization.
ALTER TABLE "school_ai_exam_remedies" DROP CONSTRAINT "school_ai_exam_remedy_shape";
ALTER TABLE "school_ai_exam_remedies" ADD CONSTRAINT "school_ai_exam_remedy_shape" CHECK (
  "type" IN ('KEY_CORRECTION', 'ITEM_NEUTRALIZATION', 'RUBRIC_CORRECTION', 'REGRADE') AND "status" IN ('PROPOSED', 'APPLIED', 'WITHDRAWN')
  AND (("status" = 'APPLIED') = ("applied_at" IS NOT NULL AND "authorized_by_id" IS NOT NULL AND "outcomes" IS NOT NULL)));
