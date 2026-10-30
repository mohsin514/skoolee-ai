-- AlterTable
ALTER TABLE "marks" ADD COLUMN     "correction_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PKR',
ADD COLUMN     "reversal_of_id" TEXT;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "correction_separate_approver" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "corrections" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_version" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "preview_hash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "public_explanation" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "separate_approver" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approver_id" TEXT,
    "approver_name" TEXT,
    "decided_at" TIMESTAMP(3),
    "successor_id" TEXT,
    "report_version_ids" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_notes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "correction_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "correction_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "corrections_school_id_campus_id_student_id_idx" ON "corrections"("school_id", "campus_id", "student_id");

-- CreateIndex
CREATE INDEX "corrections_source_id_requested_at_idx" ON "corrections"("source_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "correction_notes_correction_id_key" ON "correction_notes"("correction_id");

-- CreateIndex
CREATE INDEX "correction_notes_school_id_idx" ON "correction_notes"("school_id");

-- CreateIndex
CREATE INDEX "payment_allocations_school_id_campus_id_idx" ON "payment_allocations"("school_id", "campus_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "payment_allocations"("payment_id", "invoice_id");


UPDATE payments p SET currency=i.currency FROM invoices i WHERE p.invoice_id=i.id;
-- Allocate historical receipts in their original recording order. Existing
-- inconsistencies are detected at preview and require reconciliation first.
INSERT INTO payment_allocations(id,school_id,campus_id,payment_id,invoice_id,amount,credit,currency,created_at)
SELECT 'legacy-'||p.id,p.school_id,p.campus_id,p.id,p.invoice_id,
 CASE WHEN p.amount>0 THEN LEAST(p.amount,GREATEST(0,i.total_amount-p.prior)) ELSE p.amount END,
 CASE WHEN p.amount>0 THEN p.amount-LEAST(p.amount,GREATEST(0,i.total_amount-p.prior)) ELSE 0 END,
 i.currency,p.created_at FROM (
 SELECT *,COALESCE(SUM(amount) OVER(PARTITION BY invoice_id ORDER BY created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)::integer prior FROM payments
) p JOIN invoices i ON i.id=p.invoice_id;
ALTER TABLE corrections ADD CONSTRAINT correction_reason_nonempty CHECK(length(trim(reason))>0 AND length(trim(public_explanation))>0);
ALTER TABLE corrections ADD CONSTRAINT correction_state CHECK(status IN ('PENDING','APPLIED','REJECTED'));
ALTER TABLE corrections ADD CONSTRAINT correction_separation CHECK(NOT separate_approver OR approver_id IS NULL OR approver_id<>requester_id);
ALTER TABLE corrections ADD CONSTRAINT correction_school_fk FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE corrections ADD CONSTRAINT correction_campus_fk FOREIGN KEY(campus_id) REFERENCES campuses(id);
ALTER TABLE corrections ADD CONSTRAINT correction_student_fk FOREIGN KEY(student_id) REFERENCES students(id);
ALTER TABLE correction_notes ADD CONSTRAINT correction_note_parent_fk FOREIGN KEY(correction_id) REFERENCES corrections(id) ON DELETE CASCADE;
ALTER TABLE payment_allocations ADD CONSTRAINT allocation_payment_fk FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE;
ALTER TABLE payment_allocations ADD CONSTRAINT allocation_invoice_fk FOREIGN KEY(invoice_id) REFERENCES invoices(id);
ALTER TABLE payments ADD CONSTRAINT payment_reversal_fk FOREIGN KEY(reversal_of_id) REFERENCES payments(id) ON DELETE CASCADE;
CREATE FUNCTION correction_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM schools WHERE id=OLD.school_id) THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Correction history is immutable'; END IF;
 IF OLD.status<>'PENDING' OR (to_jsonb(NEW)-ARRAY['status','approver_id','approver_name','decided_at','successor_id','report_version_ids']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','approver_id','approver_name','decided_at','successor_id','report_version_ids']) OR NEW.status NOT IN ('APPLIED','REJECTED') OR NEW.approver_id IS NULL OR NEW.decided_at IS NULL THEN RAISE EXCEPTION 'Correction evidence is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER correction_immutable BEFORE UPDATE OR DELETE ON corrections FOR EACH ROW EXECUTE FUNCTION correction_immutable();
CREATE FUNCTION correction_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM schools WHERE id=OLD.school_id) THEN RETURN OLD; END IF; RAISE EXCEPTION 'Original correction evidence is append-only'; END $$;
CREATE TRIGGER allocation_immutable BEFORE UPDATE OR DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION correction_append_only();
CREATE TRIGGER correction_note_immutable BEFORE UPDATE OR DELETE ON correction_notes FOR EACH ROW EXECUTE FUNCTION correction_append_only();
CREATE FUNCTION payment_original_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM schools WHERE id=OLD.school_id) THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Issued payments cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-'receipt_url_s3') IS DISTINCT FROM (to_jsonb(OLD)-'receipt_url_s3') THEN RAISE EXCEPTION 'Use a compensating payment correction'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_original_immutable BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION payment_original_immutable();
CREATE FUNCTION mark_correction_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.correction_version:=OLD.correction_version+1; RETURN NEW; END $$;
CREATE TRIGGER mark_correction_revision BEFORE UPDATE ON marks FOR EACH ROW EXECUTE FUNCTION mark_correction_revision();
