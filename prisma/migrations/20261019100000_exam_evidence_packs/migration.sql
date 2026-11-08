-- CreateTable
CREATE TABLE "school_ai_evidence_packs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "scope_kind" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "files" JSONB NOT NULL,
    "included_keys" BOOLEAN NOT NULL DEFAULT false,
    "included_capture" BOOLEAN NOT NULL DEFAULT false,
    "capture_reason" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloaded_at" TIMESTAMP(3),

    CONSTRAINT "school_ai_evidence_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_evidence_packs_school_id_campus_id_assignment_id__idx" ON "school_ai_evidence_packs"("school_id", "campus_id", "assignment_id", "requested_at");

-- AddForeignKey
ALTER TABLE "school_ai_evidence_packs" ADD CONSTRAINT "school_ai_evidence_packs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-408 R19: a produced pack is frozen. Only the last-download time may change; its manifest,
-- files, scope and inclusions never do, so a manifest always describes the bytes it shipped with.
CREATE FUNCTION school_ai_evidence_pack_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'downloaded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'downloaded_at') THEN
    RAISE EXCEPTION 'An evidence pack is immutable once produced';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER school_ai_evidence_pack_frozen BEFORE UPDATE ON "school_ai_evidence_packs" FOR EACH ROW EXECUTE FUNCTION school_ai_evidence_pack_frozen();
