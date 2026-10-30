ALTER TABLE "schools" ADD COLUMN "ai_credits_reserved" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "school_ai_requests" ADD COLUMN "reserved_credits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "school_ai_requests" ADD COLUMN "dispatched_at" TIMESTAMP(3);
ALTER TABLE "schools" ADD CONSTRAINT "schools_ai_credits_reserved_nonnegative" CHECK ("ai_credits_reserved" >= 0);
ALTER TABLE "school_ai_requests" ADD CONSTRAINT "school_ai_request_reserved_credits_nonnegative" CHECK ("reserved_credits" >= 0);
