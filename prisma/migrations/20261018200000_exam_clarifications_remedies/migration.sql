-- CreateTable
CREATE TABLE "school_ai_exam_clarifications" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revises_id" TEXT,
    "question_id" TEXT,
    "text" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "issued_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_exam_clarifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_exam_clarification_acks" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "clarification_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_exam_clarification_acks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_exam_remedies" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "correction" JSONB,
    "preview" JSONB NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "proposed_by_id" TEXT NOT NULL,
    "authorized_by_id" TEXT,
    "applied_at" TIMESTAMP(3),
    "outcomes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_exam_remedies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_exam_clarifications_school_id_campus_id_assignmen_idx" ON "school_ai_exam_clarifications"("school_id", "campus_id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_clarifications_assignment_id_version_key" ON "school_ai_exam_clarifications"("assignment_id", "version");

-- CreateIndex
CREATE INDEX "school_ai_exam_clarification_acks_school_id_campus_id_attem_idx" ON "school_ai_exam_clarification_acks"("school_id", "campus_id", "attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_clarification_acks_clarification_id_attempt__key" ON "school_ai_exam_clarification_acks"("clarification_id", "attempt_id");

-- CreateIndex
CREATE INDEX "school_ai_exam_remedies_school_id_campus_id_assignment_id_idx" ON "school_ai_exam_remedies"("school_id", "campus_id", "assignment_id");

-- AddForeignKey
ALTER TABLE "school_ai_exam_clarifications" ADD CONSTRAINT "school_ai_exam_clarifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_clarification_acks" ADD CONSTRAINT "school_ai_exam_clarification_acks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_remedies" ADD CONSTRAINT "school_ai_exam_remedies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-408 invariants.
ALTER TABLE "school_ai_exam_clarifications" ADD CONSTRAINT "school_ai_exam_clarification_shape" CHECK ("version" > 0 AND length(btrim("text")) BETWEEN 1 AND 2000 AND "audience" ->> 'kind' IN ('SITTING', 'ATTEMPTS'));
ALTER TABLE "school_ai_exam_remedies" ADD CONSTRAINT "school_ai_exam_remedy_shape" CHECK (
  "type" IN ('KEY_CORRECTION', 'ITEM_NEUTRALIZATION') AND "status" IN ('PROPOSED', 'APPLIED', 'WITHDRAWN')
  AND (("status" = 'APPLIED') = ("applied_at" IS NOT NULL AND "authorized_by_id" IS NOT NULL AND "outcomes" IS NOT NULL)));

-- Notices and acknowledgements are evidence: never edited, removed only with their school.
CREATE FUNCTION school_ai_exam_notice_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Exam notices and their acknowledgements are kept as evidence';
END $$;
CREATE TRIGGER school_ai_exam_clarification_append_only BEFORE UPDATE OR DELETE ON "school_ai_exam_clarifications" FOR EACH ROW EXECUTE FUNCTION school_ai_exam_notice_append_only();
CREATE TRIGGER school_ai_exam_clarification_ack_append_only BEFORE UPDATE OR DELETE ON "school_ai_exam_clarification_acks" FOR EACH ROW EXECUTE FUNCTION school_ai_exam_notice_append_only();

-- A remedy's proposal is fixed once made; it changes once, from PROPOSED to APPLIED or WITHDRAWN.
CREATE FUNCTION school_ai_exam_remedy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Exam remedies are kept as evidence';
  END IF;
  IF OLD.status <> 'PROPOSED' THEN RAISE EXCEPTION 'An applied or withdrawn remedy cannot change'; END IF;
  IF NEW.type IS DISTINCT FROM OLD.type OR NEW.question_id IS DISTINCT FROM OLD.question_id OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.correction IS DISTINCT FROM OLD.correction OR NEW.preview IS DISTINCT FROM OLD.preview OR NEW.notify IS DISTINCT FROM OLD.notify
    OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id OR NEW.proposed_by_id IS DISTINCT FROM OLD.proposed_by_id THEN
    RAISE EXCEPTION 'A remedy proposal cannot be edited; propose a new one';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER school_ai_exam_remedy_guard BEFORE UPDATE OR DELETE ON "school_ai_exam_remedies" FOR EACH ROW EXECUTE FUNCTION school_ai_exam_remedy_guard();
