-- AI Workflows Slice 5 (red team RT6): a payment or fee adjustment made from an AI-prepared hand-off
-- records that hand-off once. The unique index makes a second post from the same hand-off impossible,
-- from any device or retry; rows made by hand keep the column NULL.
ALTER TABLE "payments" ADD COLUMN "workflow_handoff_id" TEXT;
ALTER TABLE "financial_adjustments" ADD COLUMN "workflow_handoff_id" TEXT;

CREATE UNIQUE INDEX "payments_school_id_workflow_handoff_id_key" ON "payments"("school_id", "workflow_handoff_id");
CREATE UNIQUE INDEX "financial_adjustments_school_id_workflow_handoff_id_key" ON "financial_adjustments"("school_id", "workflow_handoff_id");
