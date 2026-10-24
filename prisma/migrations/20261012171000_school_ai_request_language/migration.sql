ALTER TABLE "school_ai_requests" ADD COLUMN "request_language" TEXT;
ALTER TABLE "school_ai_requests" ADD CONSTRAINT "school_ai_requests_language_check"
  CHECK ("request_language" IS NULL OR "request_language" IN ('en','ar','ur'));
