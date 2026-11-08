-- CreateTable
CREATE TABLE "school_ai_language_proposals" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "form_set_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "record_version" INTEGER NOT NULL,
    "item_group_id" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "proposal" JSONB NOT NULL,
    "decision_outcome" TEXT,
    "decision_reason" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_language_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_language_proposals_school_id_form_set_id_record_i_idx" ON "school_ai_language_proposals"("school_id", "form_set_id", "record_id", "record_version");

-- AddForeignKey
ALTER TABLE "school_ai_language_proposals" ADD CONSTRAINT "school_ai_language_proposals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "school_ai_language_proposals"
  ADD CONSTRAINT "school_ai_language_proposals_finding_check" CHECK ("finding" IN ('CHANGED_MEANING', 'NEGATION_ADDED', 'NEGATION_REMOVED', 'CHANGED_UNIT', 'CHANGED_NOTATION')),
  ADD CONSTRAINT "school_ai_language_proposals_decision_check" CHECK (
    ("decision_outcome" IS NULL AND "decision_reason" IS NULL AND "decided_by_id" IS NULL AND "decided_at" IS NULL)
    OR ("decision_outcome" IN ('ACCEPTED', 'DISMISSED', 'CORRECTION_REQUESTED') AND char_length("decision_reason") BETWEEN 1 AND 500 AND "decided_by_id" IS NOT NULL AND "decided_at" IS NOT NULL)
  );

-- R9.6/R9.7: the observation never changes, and a decision is recorded once.
CREATE FUNCTION school_ai_language_proposal_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['decision_outcome', 'decision_reason', 'decided_by_id', 'decided_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['decision_outcome', 'decision_reason', 'decided_by_id', 'decided_at']) THEN
    RAISE EXCEPTION 'A language comparison proposal is immutable';
  END IF;
  IF OLD.decided_at IS NOT NULL THEN
    RAISE EXCEPTION 'A recorded language decision cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER school_ai_language_proposal_frozen BEFORE UPDATE ON "school_ai_language_proposals" FOR EACH ROW EXECUTE FUNCTION school_ai_language_proposal_frozen();
