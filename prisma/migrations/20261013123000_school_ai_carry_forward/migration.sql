ALTER TABLE invoices ADD COLUMN carry_forward_amount INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER school_ai_result_revision_immutable_before_update
  BEFORE UPDATE ON school_ai_exam_result_revisions
  FOR EACH ROW EXECUTE FUNCTION school_ai_revision_immutable();
