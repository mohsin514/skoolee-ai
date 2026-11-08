-- SKAI-1394: optional idempotency key for recording a medication dose. Additive and nullable:
-- existing rows stay NULL, and NULLs never conflict in the unique index.
ALTER TABLE "medication_doses" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "medication_doses_school_id_idempotency_key_key" ON "medication_doses"("school_id", "idempotency_key");
