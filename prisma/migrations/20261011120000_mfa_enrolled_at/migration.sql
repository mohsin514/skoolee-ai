ALTER TABLE "users" ADD COLUMN "mfa_enrolled_at" TIMESTAMP(3);
-- Best-effort backfill from the existing audit trail; NULL stays NULL ("date unknown").
UPDATE "users" u SET "mfa_enrolled_at" = a.enrolled_at
FROM (SELECT "user_id", MAX("created_at") AS enrolled_at FROM "audit_logs"
      WHERE "table_name" = 'account_security' AND "new_value"->>'action' = 'mfa.enrolled' GROUP BY "user_id") a
WHERE u."id" = a."user_id" AND u."mfa_enabled" = true;
