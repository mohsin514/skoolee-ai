-- SKO-408: the workspace registers DELIVERY_POLICY, BRIEF and PRACTICE records, but the original
-- kind constraint predates them, so a brief or delivery policy could never be stored. Widen the
-- constraint to exactly the registered kinds (src/lib/school-ai/types.ts WORKSPACE_KINDS).
ALTER TABLE "school_ai_records" DROP CONSTRAINT IF EXISTS "school_ai_records_kind_check";
ALTER TABLE "school_ai_records" ADD CONSTRAINT "school_ai_records_kind_check"
  CHECK ("kind" IN ('ONBOARDING','SOURCE','CURRICULUM','PAPER','WORKFLOW','POLICY','DELIVERY_POLICY','BRIEF','PRACTICE'));
