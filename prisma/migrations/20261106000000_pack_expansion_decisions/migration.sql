-- SKAI-1019/1020: append-only pack expansion decisions (platform-global, no tenant data).
CREATE TABLE "pack_expansion_decisions" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "record" JSONB NOT NULL,
    "bounded_ticket" TEXT,
    "decided_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pack_expansion_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pack_expansion_decisions_outcome_check" CHECK ("outcome" IN ('ADOPT', 'DEFER', 'REJECT'))
);

CREATE INDEX "pack_expansion_decisions_candidate_id_created_at_idx" ON "pack_expansion_decisions"("candidate_id", "created_at" DESC);
