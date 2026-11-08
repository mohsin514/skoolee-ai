-- CreateTable
CREATE TABLE "curriculum_pack_versions" (
    "id" TEXT NOT NULL,
    "pack_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "board" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "school_grade" TEXT NOT NULL,
    "exam_year" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "unverified" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_pack_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_pack_activations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "pack_version_id" TEXT NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "geography" TEXT NOT NULL,
    "school_grade" TEXT NOT NULL,
    "local_budget_approver" TEXT,
    "source_evidence" JSONB NOT NULL DEFAULT '[]',
    "educator_approver_id" TEXT,
    "educator_approver" TEXT,
    "approved_on" DATE,
    "review_due_on" DATE,
    "requested_by_id" TEXT NOT NULL,
    "revoked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_pack_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_pack_activation_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "reason" TEXT,
    "content_sha256" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_pack_activation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curriculum_pack_versions_board_exam_year_idx" ON "curriculum_pack_versions"("board", "exam_year");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_pack_versions_pack_id_version_key" ON "curriculum_pack_versions"("pack_id", "version");

-- CreateIndex
CREATE INDEX "curriculum_pack_activations_school_id_campus_id_status_idx" ON "curriculum_pack_activations"("school_id", "campus_id", "status");

-- CreateIndex
CREATE INDEX "curriculum_pack_activations_school_id_pack_version_id_idx" ON "curriculum_pack_activations"("school_id", "pack_version_id");

-- CreateIndex
CREATE INDEX "curriculum_pack_activation_events_school_id_activation_id_a_idx" ON "curriculum_pack_activation_events"("school_id", "activation_id", "at");

-- AddForeignKey
ALTER TABLE "curriculum_pack_activations" ADD CONSTRAINT "curriculum_pack_activations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_pack_activations" ADD CONSTRAINT "curriculum_pack_activations_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_pack_activations" ADD CONSTRAINT "curriculum_pack_activations_pack_version_id_fkey" FOREIGN KEY ("pack_version_id") REFERENCES "curriculum_pack_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_pack_activation_events" ADD CONSTRAINT "curriculum_pack_activation_events_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "curriculum_pack_activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKAI-1008: the status history is append-only and a catalogue version's content is immutable.
-- Cascading deletes from a removed school are still allowed (no row-level DELETE trigger on versions).
CREATE OR REPLACE FUNCTION curriculum_pack_events_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'curriculum_pack_activation_events is append-only'; END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER curriculum_pack_events_no_update BEFORE UPDATE ON "curriculum_pack_activation_events" FOR EACH ROW EXECUTE FUNCTION curriculum_pack_events_append_only();

CREATE OR REPLACE FUNCTION curriculum_pack_version_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."content" IS DISTINCT FROM OLD."content" OR NEW."content_sha256" IS DISTINCT FROM OLD."content_sha256" OR NEW."pack_id" IS DISTINCT FROM OLD."pack_id" OR NEW."version" IS DISTINCT FROM OLD."version" THEN
    RAISE EXCEPTION 'curriculum_pack_versions content is immutable; publish a new version';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER curriculum_pack_version_no_rewrite BEFORE UPDATE ON "curriculum_pack_versions" FOR EACH ROW EXECUTE FUNCTION curriculum_pack_version_immutable();
