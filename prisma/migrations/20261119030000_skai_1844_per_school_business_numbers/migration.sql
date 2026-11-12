-- SKAI-1844 (DB-01 Phase 1b): invoice numbers and guardian consent receipt codes are unique per school.
--
-- invoices.invoice_number was unique across every school, but its format is INV-{year}-{4 hex chars of the
-- campus id}-{per-campus sequence}. Two campuses in different schools whose ids share those 4 characters
-- produce identical numbers, so the second school's invoice generation failed on the global unique.
-- guardian_consents.receipt_code (GC- + 8 hex) collided across all schools in one shared space; assignment
-- receipts already use the per-school pattern.
--
-- No code looks either value up without its school, so the global unique is dropped in the same release.
-- The per-school unique is created first, so the table is never without a uniqueness guarantee.
-- Rollback: recreate the global unique indexes (fails if two schools already share a value).

CREATE UNIQUE INDEX "invoices_school_id_invoice_number_key" ON "invoices"("school_id", "invoice_number");
CREATE UNIQUE INDEX "guardian_consents_school_id_receipt_code_key" ON "guardian_consents"("school_id", "receipt_code");

DROP INDEX "invoices_invoice_number_key";
DROP INDEX "guardian_consents_receipt_code_key";
