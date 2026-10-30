-- Every reader must observe at most one permission version at an instant.
-- Overlapping legacy grants stop this migration for explicit operator repair;
-- no permission history is silently deleted or rewritten.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "guardian_access_versions"
  ADD CONSTRAINT "guardian_access_versions_effective_interval_valid"
  CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from");

ALTER TABLE "guardian_access_versions"
  ADD CONSTRAINT "guardian_access_versions_no_overlap"
  EXCLUDE USING gist (
    "relationship_id" WITH =,
    tsrange("effective_from", "effective_until", '[)') WITH &&
  );
