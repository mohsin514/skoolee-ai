-- AI Workflows live switch: an APP_OWNER may let one school's AI Workflows save real records before the
-- release evaluation is recorded. Null (the default) keeps the school in practice mode.
ALTER TABLE "schools" ADD COLUMN "ai_workflows_live_at" TIMESTAMP(3);
ALTER TABLE "schools" ADD COLUMN "ai_workflows_live_by_id" TEXT;
