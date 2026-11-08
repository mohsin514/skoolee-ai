-- SKO-507: Pilot Ledger opt-in per school and computed snapshots.
-- CreateTable
CREATE TABLE "pilot_ledger_settings" (
    "school_id" TEXT NOT NULL,
    "opted_in" BOOLEAN NOT NULL DEFAULT false,
    "changed_by_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_ledger_settings_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "pilot_ledger_snapshots" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "pilot_ledger_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pilot_ledger_snapshots_school_id_computed_at_idx" ON "pilot_ledger_snapshots"("school_id", "computed_at");

