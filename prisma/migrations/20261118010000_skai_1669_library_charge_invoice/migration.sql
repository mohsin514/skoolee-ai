-- SKAI-1669: a library charge handed to the fees office links to the one invoice finance posts for it.
ALTER TABLE "library_charges" ADD COLUMN IF NOT EXISTS "invoice_id" TEXT;
ALTER TABLE "library_charges" ADD COLUMN IF NOT EXISTS "finance_note" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "library_charges_invoice_id_key" ON "library_charges"("invoice_id");
