-- AlterTable
ALTER TABLE "school_ai_exam_assignments" ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "rehearsal_id" TEXT,
ADD COLUMN     "results_released_at" TIMESTAMP(3),
ADD COLUMN     "results_released_by_id" TEXT;

-- CreateTable
CREATE TABLE "school_ai_rehearsals" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "paper_version" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "blocking" INTEGER NOT NULL DEFAULT 0,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_rehearsals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_rehearsals_school_id_record_id_paper_version_idx" ON "school_ai_rehearsals"("school_id", "record_id", "paper_version");

-- AddForeignKey
ALTER TABLE "school_ai_rehearsals" ADD CONSTRAINT "school_ai_rehearsals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-408 invariants.
ALTER TABLE "school_ai_rehearsals" ADD CONSTRAINT "school_ai_rehearsal_blocking" CHECK ("blocking" >= 0 AND "paper_version" > 0);
ALTER TABLE "school_ai_exam_assignments" ADD CONSTRAINT "school_ai_exam_content_hash" CHECK ("content_hash" IS NULL OR "content_hash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "school_ai_exam_assignments" ADD CONSTRAINT "school_ai_exam_results_release" CHECK (("results_released_at" IS NULL) = ("results_released_by_id" IS NULL));

-- Rehearsals are evidence: never edited, removed only with their school.
CREATE FUNCTION school_ai_rehearsal_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Rehearsal results are kept as evidence';
END $$;
CREATE TRIGGER school_ai_rehearsal_append_only BEFORE UPDATE OR DELETE ON "school_ai_rehearsals" FOR EACH ROW EXECUTE FUNCTION school_ai_rehearsal_append_only();

-- The sealed content hash and rehearsal of a released exam never change; results are released once.
CREATE FUNCTION school_ai_exam_seal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.content_hash IS NOT NULL AND (NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.rehearsal_id IS DISTINCT FROM OLD.rehearsal_id) THEN
    RAISE EXCEPTION 'A sealed exam release cannot be changed';
  END IF;
  IF OLD.results_released_at IS NOT NULL AND (NEW.results_released_at IS DISTINCT FROM OLD.results_released_at OR NEW.results_released_by_id IS DISTINCT FROM OLD.results_released_by_id) THEN
    RAISE EXCEPTION 'A result release cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER school_ai_exam_seal_immutable BEFORE UPDATE ON "school_ai_exam_assignments" FOR EACH ROW EXECUTE FUNCTION school_ai_exam_seal_immutable();
