-- SKO-457: distinguish "waiting for email verification" from "deactivated", and keep
-- password-reset tokens only as hashes.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);

-- Every existing account counts as verified except a self-registered owner who never activated
-- and never signed in: only that account can still be activated by a verification link.
UPDATE "users" SET "email_verified_at" = COALESCE("last_login", "created_at")
WHERE NOT ("is_active" = false AND "last_login" IS NULL AND "is_institution_owner" = true);

-- Outstanding reset links were stored in clear; they expire within the hour and are dropped so
-- that every stored token is a SHA-256 digest from now on.
DELETE FROM "password_resets";
