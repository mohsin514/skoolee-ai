-- SKO-466: visitor register lifecycle (on site / left / refused), namesake reference, actors, retry keys and contact redaction.
-- AlterTable
ALTER TABLE "visitor_logs" ADD COLUMN     "checked_in_by_id" TEXT,
ADD COLUMN     "checked_out_by_id" TEXT,
ADD COLUMN     "contact_redacted_at" TIMESTAMP(3),
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "refused_reason" TEXT,
ADD COLUMN     "request_hash" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ON_SITE',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "visitor_logs_campus_id_status_idx" ON "visitor_logs"("campus_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_logs_campus_id_idempotency_key_key" ON "visitor_logs"("campus_id", "idempotency_key");


-- Visits already checked out are LEFT; departures can never precede arrivals.
UPDATE "visitor_logs" SET status = 'LEFT' WHERE out_time IS NOT NULL;
UPDATE "visitor_logs" SET out_time = in_time WHERE out_time IS NOT NULL AND out_time < in_time;
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_status_check" CHECK (status IN ('ON_SITE','LEFT','REFUSED'));
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_times_check" CHECK (out_time IS NULL OR out_time >= in_time);
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_left_check" CHECK ((status = 'LEFT') = (out_time IS NOT NULL));
