-- SKAI-1727: at most one active (unrevoked) reviewer grant per school, framework, reviewer, criteria and expiry.
-- Additive and backwards-compatible: dev had no active duplicates when this was written. Partial index, so it lives
-- here rather than in schema.prisma (same pattern as attendance_explanations_one_open).
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_reviewer_grants_one_active"
  ON "evidence_reviewer_grants" ("school_id", "framework_id", "user_id", "criterion_ids", "expires_at")
  WHERE "revoked_at" IS NULL;
