-- SKAI-143: a sole group admin may approve their own policy version (SD3 §2.5). The service only allows it while the
-- author is the only active group admin and records a typed reason (policy event + audit log), but the original
-- check required reviewer_id <> submitted_by_id, so the approval failed with a 500. Relax only that clause: a scheduled,
-- active or superseded version still needs an effective date, a review time and a named reviewer.
-- Backwards-compatible: every row valid under the old constraint is valid under the new one.
ALTER TABLE "policy_template_versions" DROP CONSTRAINT IF EXISTS "policy_template_versions_check";
ALTER TABLE "policy_template_versions" ADD CONSTRAINT "policy_template_versions_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','SCHEDULED','ACTIVE','SUPERSEDED','WITHDRAWN') AND ("status" NOT IN ('SCHEDULED','ACTIVE','SUPERSEDED') OR ("effective_from" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "reviewer_id" IS NOT NULL)) AND NOT ("locked_keys" && "overridable_keys"));
