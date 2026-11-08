-- Guided setup packages reuse the scoped request receipt without relaxing the
-- assistant or paper-generation state machines. No operational action is run.
ALTER TABLE "school_ai_requests"
  DROP CONSTRAINT "school_ai_requests_feature_check",
  DROP CONSTRAINT "school_ai_requests_status_check",
  DROP CONSTRAINT "school_ai_requests_reply_check",
  DROP CONSTRAINT "school_ai_requests_state_check";

ALTER TABLE "school_ai_requests"
  ADD CONSTRAINT "school_ai_requests_feature_check" CHECK ("feature" IN ('ASSISTANT', 'PAPER_GENERATION', 'SETUP_GENERATION_V1')),
  ADD CONSTRAINT "school_ai_requests_status_check" CHECK (
    ("feature" IN ('ASSISTANT', 'SETUP_GENERATION_V1') AND "status" IN ('PENDING', 'COMPLETED', 'FAILED'))
    OR ("feature" = 'PAPER_GENERATION' AND "status" IN ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'UNKNOWN'))
  ),
  ADD CONSTRAINT "school_ai_requests_reply_check" CHECK (
    "reply" IS NULL
    OR ("feature" IN ('ASSISTANT', 'SETUP_GENERATION_V1') AND char_length("reply") BETWEEN 1 AND 8000)
    OR ("feature" = 'PAPER_GENERATION' AND char_length("reply") BETWEEN 1 AND 600000)
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
  ),
  ADD CONSTRAINT "school_ai_requests_setup_scope_check" CHECK (
    "feature" <> 'SETUP_GENERATION_V1'
    OR ("conversation_id" IS NULL AND "conversation_version" IS NULL AND "user_message" IS NULL AND "subject_id" IS NULL AND "class_id" IS NULL AND "reserved_credits" = 0 AND "dispatched_at" IS NULL)
  );
