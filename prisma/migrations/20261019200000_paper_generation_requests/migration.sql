-- SKO-408: school_ai_requests was constrained for the assistant alone, so every paper-generation
-- receipt (feature PAPER_GENERATION) was refused: the feature itself, its DISPATCHED and UNKNOWN
-- states, a stored failure reply, and a full paper reply longer than 8000 characters. The
-- assistant's rules are kept exactly; paper generation gets its own, equally strict, lifecycle.

ALTER TABLE "school_ai_requests"
  DROP CONSTRAINT "school_ai_requests_feature_check",
  DROP CONSTRAINT "school_ai_requests_status_check",
  DROP CONSTRAINT "school_ai_requests_reply_check",
  DROP CONSTRAINT "school_ai_requests_state_check";

ALTER TABLE "school_ai_requests"
  ADD CONSTRAINT "school_ai_requests_feature_check" CHECK ("feature" IN ('ASSISTANT', 'PAPER_GENERATION')),
  ADD CONSTRAINT "school_ai_requests_status_check" CHECK (
    ("feature" = 'ASSISTANT' AND "status" IN ('PENDING', 'COMPLETED', 'FAILED'))
    OR ("feature" = 'PAPER_GENERATION' AND "status" IN ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'UNKNOWN'))
  ),
  ADD CONSTRAINT "school_ai_requests_reply_check" CHECK (
    "reply" IS NULL
    OR ("feature" = 'ASSISTANT' AND char_length("reply") BETWEEN 1 AND 8000)
    OR ("feature" = 'PAPER_GENERATION' AND char_length("reply") BETWEEN 1 AND 600000)
  ),
  ADD CONSTRAINT "school_ai_requests_state_check" CHECK (
    ("feature" = 'ASSISTANT' AND (
      ("status" = 'PENDING' AND "claim_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "reply" IS NULL AND "completed_at" IS NULL)
      OR ("status" = 'COMPLETED' AND "claim_token" IS NULL AND "lease_expires_at" IS NULL AND "reply" IS NOT NULL AND "completed_at" IS NOT NULL)
      OR ("status" = 'FAILED' AND "claim_token" IS NULL AND "lease_expires_at" IS NULL AND "reply" IS NULL AND "completed_at" IS NULL)
    ))
    OR ("feature" = 'PAPER_GENERATION' AND (
      -- In flight: a claim and a lease, nothing settled yet.
      ("status" IN ('PENDING', 'DISPATCHED') AND "claim_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "reply" IS NULL AND "completed_at" IS NULL)
      -- Settled: the claim is released and the receipt (paper, or the failure explained) is kept.
      OR ("status" IN ('COMPLETED', 'FAILED', 'UNKNOWN') AND "claim_token" IS NULL AND "lease_expires_at" IS NULL AND "reply" IS NOT NULL AND "completed_at" IS NOT NULL)
    ))
  );
