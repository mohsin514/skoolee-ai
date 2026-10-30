-- AlterTable
ALTER TABLE "school_ai_exam_attempts" ADD COLUMN     "paused_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "school_ai_exam_pauses" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "started_by_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_by_id" TEXT,
    "ended_at" TIMESTAMP(3),
    "restored_ms" INTEGER,

    CONSTRAINT "school_ai_exam_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_exam_pauses_school_id_campus_id_assignment_id_idx" ON "school_ai_exam_pauses"("school_id", "campus_id", "assignment_id");

-- CreateIndex
CREATE INDEX "school_ai_exam_pauses_attempt_id_idx" ON "school_ai_exam_pauses"("attempt_id");

-- AddForeignKey
ALTER TABLE "school_ai_exam_pauses" ADD CONSTRAINT "school_ai_exam_pauses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-408 invariants: at most one open pause per attempt; a pause is closed once and never rewritten.
CREATE UNIQUE INDEX "school_ai_exam_pauses_one_open" ON "school_ai_exam_pauses"("attempt_id") WHERE "ended_at" IS NULL;
ALTER TABLE "school_ai_exam_pauses" ADD CONSTRAINT "school_ai_exam_pause_shape" CHECK (length(btrim("reason")) BETWEEN 3 AND 300 AND (("ended_at" IS NULL) = ("ended_by_id" IS NULL)) AND (("ended_at" IS NULL) = ("restored_ms" IS NULL)) AND ("restored_ms" IS NULL OR "restored_ms" >= 0));
CREATE FUNCTION school_ai_exam_pause_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Supervised pauses are kept as evidence';
  END IF;
  IF OLD.ended_at IS NOT NULL OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.started_by_id IS DISTINCT FROM OLD.started_by_id THEN
    RAISE EXCEPTION 'A supervised pause is only ever closed, once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER school_ai_exam_pause_guard BEFORE UPDATE OR DELETE ON "school_ai_exam_pauses" FOR EACH ROW EXECUTE FUNCTION school_ai_exam_pause_guard();
