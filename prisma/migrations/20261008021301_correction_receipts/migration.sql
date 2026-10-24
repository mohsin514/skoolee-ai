-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "document_bytes" BYTEA,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_payment_id_key" ON "payment_receipts"("payment_id");

-- CreateIndex
CREATE INDEX "payment_receipts_school_id_campus_id_idx" ON "payment_receipts"("school_id", "campus_id");

ALTER TABLE payment_receipts ADD CONSTRAINT payment_receipt_payment_fk FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE;
CREATE FUNCTION payment_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM schools WHERE id=OLD.school_id) THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Issued receipt cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-'document_bytes') IS DISTINCT FROM (to_jsonb(OLD)-'document_bytes') OR OLD.document_bytes IS NOT NULL THEN RAISE EXCEPTION 'Issued receipt is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_receipt_immutable BEFORE UPDATE OR DELETE ON payment_receipts FOR EACH ROW EXECUTE FUNCTION payment_receipt_immutable();
