-- SKAI-1159: data-subject requests (guardian access export, correction, deletion-by-archive).
-- Widening a CHECK is backwards-compatible: every existing row still satisfies it.
ALTER TABLE "data_lifecycle_requests" DROP CONSTRAINT "data_request_kind";
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_request_kind"
  CHECK ("kind" IN ('EXPORT', 'RETENTION_DELETION', 'MIGRATION', 'GUARDIAN_EXPORT', 'CORRECTION', 'SUBJECT_DELETION'));
