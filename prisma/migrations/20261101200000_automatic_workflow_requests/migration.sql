-- Automatic workflow jobs (AUTOMATIC_SETUP_V1) and their per-step receipts (AUTOMATIC_ACTION_V1)
-- reuse the scoped request table (src/lib/automation/service.ts, role-action-service.ts, platform.ts).
-- 954b7285 shipped the engine without admitting these features, so every job insert failed against
-- the migrated schema. Existing feature rules are restated unchanged; the automatic rules are their own:
--   SETUP job: the job JSON is always stored in reply; a claim and its lease come and go together;
--     only COMPLETED carries completed_at; FAILED (worker access check) releases the claim.
--   ACTION receipt: written once, COMPLETED, never claimed.
-- No operational record is changed. Slice 1d (SKO-550) moves jobs to dedicated tables.
ALTER TABLE "school_ai_requests"
  DROP CONSTRAINT "school_ai_requests_feature_check",
  DROP CONSTRAINT "school_ai_requests_status_check",
  DROP CONSTRAINT "school_ai_requests_reply_check",
  DROP CONSTRAINT "school_ai_requests_state_check";

ALTER TABLE "school_ai_requests"
  ADD CONSTRAINT "school_ai_requests_feature_check" CHECK ("feature" IN ('ASSISTANT', 'PAPER_GENERATION', 'SETUP_GENERATION_V1', 'AUTOMATIC_SETUP_V1', 'AUTOMATIC_ACTION_V1')),
  ADD CONSTRAINT "school_ai_requests_status_check" CHECK (
    ("feature" IN ('ASSISTANT', 'SETUP_GENERATION_V1', 'AUTOMATIC_SETUP_V1') AND "status" IN ('PENDING', 'COMPLETED', 'FAILED'))
    OR ("feature" = 'PAPER_GENERATION' AND "status" IN ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'UNKNOWN'))
    OR ("feature" = 'AUTOMATIC_ACTION_V1' AND "status" = 'COMPLETED')
  ),
  ADD CONSTRAINT "school_ai_requests_reply_check" CHECK (
    "reply" IS NULL
    OR ("feature" IN ('ASSISTANT', 'SETUP_GENERATION_V1') AND char_length("reply") BETWEEN 1 AND 8000)
    OR ("feature" IN ('PAPER_GENERATION', 'AUTOMATIC_SETUP_V1', 'AUTOMATIC_ACTION_V1') AND char_length("reply") BETWEEN 1 AND 600000)
  ),
  ADD CONSTRAINT "school_ai_requests_state_check" CHECK (
    ("feature" IN ('ASSISTANT', 'SETUP_GENERATION_V1') AND (
      ("status" = 'PENDING' AND "claim_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "reply" IS NULL AND "completed_at" IS NULL)
      OR ("status" = 'COMPLETED' AND "claim_token" IS NULL AND "lease_expires_at" IS NULL AND "reply" IS NOT NULL AND "completed_at" IS NOT NULL)
      OR ("status" = 'FAILED' AND "claim_token" IS NULL AND "lease_expires_at" IS NULL AND "reply" IS NULL AND "completed_at" IS NULL)
    ))
    OR ("feature" = 'PAPER_GENERATION' AND (
      ("status" IN ('PENDING', 'DISPATCHED') AND "claim_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "reply" IS NULL AND "completed_at" IS NULL)
      OR ("status" IN ('COMPLETED', 'FAILED', 'UNKNOWN') AND "claim_token" IS NULL AND "lease_expires_at" IS NULL AND "reply" IS NOT NULL AND "completed_at" IS NOT NULL)
    ))
    OR ("feature" = 'AUTOMATIC_SETUP_V1' AND "reply" IS NOT NULL AND ("claim_token" IS NULL) = ("lease_expires_at" IS NULL) AND (
      ("status" = 'PENDING' AND "completed_at" IS NULL)
      OR ("status" = 'COMPLETED' AND "claim_token" IS NULL AND "completed_at" IS NOT NULL)
      OR ("status" = 'FAILED' AND "claim_token" IS NULL AND "completed_at" IS NULL)
    ))
    OR ("feature" = 'AUTOMATIC_ACTION_V1' AND "status" = 'COMPLETED' AND "claim_token" IS NULL AND "lease_expires_at" IS NULL AND "reply" IS NOT NULL AND "completed_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "school_ai_requests_automatic_scope_check" CHECK (
    "feature" NOT IN ('AUTOMATIC_SETUP_V1', 'AUTOMATIC_ACTION_V1')
    OR ("conversation_id" IS NULL AND "conversation_version" IS NULL AND "user_message" IS NULL AND "subject_id" IS NULL AND "class_id" IS NULL AND "reserved_credits" = 0 AND "dispatched_at" IS NULL)
  );
