ALTER TABLE "users" ADD COLUMN "mfa_secret" TEXT, ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "mfa_last_step" INTEGER NOT NULL DEFAULT -1, ADD COLUMN "recovery_code_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "mfa_pending_secret" TEXT, ADD COLUMN "mfa_pending_ticket" TEXT, ADD COLUMN "mfa_pending_expires_at" TIMESTAMP(3), ADD COLUMN "mfa_pending_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "staff_invitations" ADD COLUMN "delivery_status" TEXT NOT NULL DEFAULT 'unknown', ADD COLUMN "last_delivery_at" TIMESTAMP(3);
CREATE TABLE "auth_attempts" ("key" TEXT NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 1, "expires_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "auth_attempts_expires_at_idx" ON "auth_attempts"("expires_at");
