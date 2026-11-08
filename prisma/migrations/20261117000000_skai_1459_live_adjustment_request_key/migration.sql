-- SKAI-1459: idempotency key for live exam adjustments. Nullable, so existing rows and older clients are unaffected.
ALTER TABLE "accommodation_live_adjustments" ADD COLUMN "request_key" TEXT;
CREATE UNIQUE INDEX "accommodation_live_adjustments_request_key_key" ON "accommodation_live_adjustments"("school_id", "assignment_id", "student_id", "request_key");
