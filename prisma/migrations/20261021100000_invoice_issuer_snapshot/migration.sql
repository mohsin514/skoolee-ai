-- SKO-402: invoices keep the institution identity they were first issued with.
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "issuer_snapshot" JSONB;

