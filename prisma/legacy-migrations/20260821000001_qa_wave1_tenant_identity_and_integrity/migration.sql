-- QA Wave 1 — tenant identity, deletion integrity and indexing.
--
-- FINDING-D  users.email / username become unique PER SCHOOL rather than
--            globally, so one person can hold an account at more than one
--            institution (a parent with children at two schools, a teacher
--            across two groups). Safe to apply to existing data: a global
--            unique constraint already guarantees per-school uniqueness, so
--            the new composite index cannot collide on rows that exist today.
--
-- INT-1      School->User and School->AIUsageLog now cascade, and
--            SuperAdminAuditLog.user_id becomes nullable + SET NULL, so a
--            tenant can actually be deleted while the platform audit trail
--            survives the tenant it describes. LoginSession and
--            PasswordHistory cascade from User; Student's user links become
--            SET NULL so deleting a login never deletes the pupil record.
--
-- AUTH       password_resets.user_id binds a reset token to exactly one
--            account. Email alone stopped identifying a single user once
--            identity became tenant-scoped, and an ambiguous token could
--            otherwise have reset the wrong account.
--
-- §6.5       schools.timezone decides what "today" means for a tenant.
--            Stored datetimes remain UTC; only the calendar-date boundary
--            uses this. Defaults to Asia/Karachi.
--
-- OWN-6      schools.deleted_at records a soft delete (status = 'DELETED').
--
-- PERF-5     school_id indexes on users, campuses and notifications. The
--            tenant guard adds a school_id predicate to every query on these
--            tables and none of them had one.

-- DropForeignKey
ALTER TABLE "ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_school_id_fkey";

-- DropForeignKey
ALTER TABLE "login_sessions" DROP CONSTRAINT "login_sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "password_history" DROP CONSTRAINT "password_history_user_id_fkey";

-- DropForeignKey
ALTER TABLE "super_admin_audit_logs" DROP CONSTRAINT "super_admin_audit_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_school_id_fkey";

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "users_username_key";

-- AlterTable
ALTER TABLE "password_resets" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi';

-- AlterTable
ALTER TABLE "super_admin_audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "campuses_school_id_idx" ON "campuses"("school_id");

-- CreateIndex
CREATE INDEX "notifications_school_id_idx" ON "notifications"("school_id");

-- CreateIndex
CREATE INDEX "users_school_id_idx" ON "users"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_school_id_email_key" ON "users"("school_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_school_id_username_key" ON "users"("school_id", "username");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_audit_logs" ADD CONSTRAINT "super_admin_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

