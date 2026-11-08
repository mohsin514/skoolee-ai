-- SKAI-155: setup task tracking (due date, reminder time, optimistic version). Additive and nullable/defaulted.
ALTER TABLE "readiness_tasks" ADD COLUMN IF NOT EXISTS "due_on" DATE;
ALTER TABLE "readiness_tasks" ADD COLUMN IF NOT EXISTS "reminded_at" TIMESTAMP(3);
ALTER TABLE "readiness_tasks" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
-- Widen the status check to add IN_PROGRESS; existing rows already satisfy it.
ALTER TABLE "readiness_tasks" DROP CONSTRAINT IF EXISTS "readiness_task_status";
ALTER TABLE "readiness_tasks" ADD CONSTRAINT "readiness_task_status" CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'DONE', 'DEFERRED'));
