-- SKAI-1954 (DB-01), batch 4: actor columns that a platform owner can write (support incidents, grants and
-- actions, subscription reviews, AI workflow jobs, handoffs and school AI requests) now reference a real user.
-- The platform owner's account belongs to the platform's own school, not the row's school, so these keys are
-- plain (<col>) -> users(id), not the school-pinned (school_id, <col>) keys of batches 1-3.
--
-- Optional columns: ON DELETE SET NULL clears the actor and keeps the row. Required columns: ON DELETE NO ACTION.
-- Deleting a school still removes its own rows together with its users in the same statement.
-- Keys are added NOT VALID and then validated.
-- Rollback: DROP CONSTRAINT "<table>_<col>_fkey" and DROP INDEX "<table>_<col>_idx" for the names below.
SET lock_timeout = '10s';

CREATE INDEX IF NOT EXISTS "subscription_requests_reviewed_by_id_idx" ON "subscription_requests"("reviewed_by_id");
CREATE INDEX IF NOT EXISTS "support_incidents_owner_actor_id_idx" ON "support_incidents"("owner_actor_id");
CREATE INDEX IF NOT EXISTS "support_grants_approved_by_id_idx" ON "support_grants"("approved_by_id");
CREATE INDEX IF NOT EXISTS "support_grants_requested_by_id_idx" ON "support_grants"("requested_by_id");
CREATE INDEX IF NOT EXISTS "support_actions_actor_id_idx" ON "support_actions"("actor_id");
CREATE INDEX IF NOT EXISTS "school_ai_requests_actor_id_idx" ON "school_ai_requests"("actor_id");
CREATE INDEX IF NOT EXISTS "ai_workflow_jobs_actor_id_idx" ON "ai_workflow_jobs"("actor_id");
CREATE INDEX IF NOT EXISTS "ai_workflow_handoffs_claimed_by_id_idx" ON "ai_workflow_handoffs"("claimed_by_id");
CREATE INDEX IF NOT EXISTS "ai_workflow_handoffs_completed_by_id_idx" ON "ai_workflow_handoffs"("completed_by_id");
CREATE INDEX IF NOT EXISTS "ai_workflow_handoffs_origin_user_id_idx" ON "ai_workflow_handoffs"("origin_user_id");

ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "support_incidents" ADD CONSTRAINT "support_incidents_owner_actor_id_fkey" FOREIGN KEY ("owner_actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE NOT VALID;
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE NOT VALID;
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "support_actions" ADD CONSTRAINT "support_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE NOT VALID;
ALTER TABLE "school_ai_requests" ADD CONSTRAINT "school_ai_requests_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ai_workflow_jobs" ADD CONSTRAINT "ai_workflow_jobs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ai_workflow_handoffs" ADD CONSTRAINT "ai_workflow_handoffs_origin_user_id_fkey" FOREIGN KEY ("origin_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ai_workflow_handoffs" ADD CONSTRAINT "ai_workflow_handoffs_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ai_workflow_handoffs" ADD CONSTRAINT "ai_workflow_handoffs_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "subscription_requests" VALIDATE CONSTRAINT "subscription_requests_reviewed_by_id_fkey";
ALTER TABLE "support_incidents" VALIDATE CONSTRAINT "support_incidents_owner_actor_id_fkey";
ALTER TABLE "support_grants" VALIDATE CONSTRAINT "support_grants_requested_by_id_fkey";
ALTER TABLE "support_grants" VALIDATE CONSTRAINT "support_grants_approved_by_id_fkey";
ALTER TABLE "support_actions" VALIDATE CONSTRAINT "support_actions_actor_id_fkey";
ALTER TABLE "school_ai_requests" VALIDATE CONSTRAINT "school_ai_requests_actor_id_fkey";
ALTER TABLE "ai_workflow_jobs" VALIDATE CONSTRAINT "ai_workflow_jobs_actor_id_fkey";
ALTER TABLE "ai_workflow_handoffs" VALIDATE CONSTRAINT "ai_workflow_handoffs_origin_user_id_fkey";
ALTER TABLE "ai_workflow_handoffs" VALIDATE CONSTRAINT "ai_workflow_handoffs_claimed_by_id_fkey";
ALTER TABLE "ai_workflow_handoffs" VALIDATE CONSTRAINT "ai_workflow_handoffs_completed_by_id_fkey";
