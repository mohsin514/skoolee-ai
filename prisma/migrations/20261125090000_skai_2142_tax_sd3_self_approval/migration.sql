-- SKAI-2142: the SD3 sole-authority self sign-off (role-ux 2.5) could never reach SCHEDULED because the check required
-- approved_by_id <> prepared_by_id. Allow equality only when a typed reason (10+ characters) is recorded on the row.
ALTER TABLE "tax_activations" ADD COLUMN "self_approval_reason" TEXT;

ALTER TABLE "tax_activations" DROP CONSTRAINT "tax_activations_check";
ALTER TABLE "tax_activations" ADD CONSTRAINT "tax_activations_check" CHECK ("status" IN ('DRAFT','SCHEDULED','ACTIVE','SUPERSEDED','WITHDRAWN') AND ("status" NOT IN ('SCHEDULED','ACTIVE','SUPERSEDED') OR ("owner_id" IS NOT NULL AND "effective_from" IS NOT NULL AND "evidence_reviewed_at" IS NOT NULL AND length(btrim(coalesce("evidence_reference", ''))) > 0 AND "approved_by_id" IS NOT NULL AND ("approved_by_id" <> "prepared_by_id" OR length(btrim(coalesce("self_approval_reason", ''))) >= 10) AND cardinality("campus_ids") > 0)));
