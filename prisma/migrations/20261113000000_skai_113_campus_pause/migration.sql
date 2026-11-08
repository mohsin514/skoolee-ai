-- SKAI-113: a campus can be paused (kept in lists, closed to new staff invitations) and resumed.
-- Additive and nullable, so older builds keep reading campuses unchanged.
ALTER TABLE "campuses" ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMP(3);
ALTER TABLE "campuses" ADD COLUMN IF NOT EXISTS "pause_reason" TEXT;
