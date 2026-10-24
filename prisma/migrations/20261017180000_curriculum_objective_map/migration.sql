
-- CreateTable
CREATE TABLE "curriculum_objective_mappings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "from_record_id" TEXT NOT NULL,
    "from_version" INTEGER NOT NULL,
    "from_outcome_id" TEXT NOT NULL,
    "to_record_id" TEXT NOT NULL,
    "to_version" INTEGER NOT NULL,
    "to_outcome_id" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "decided_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_objective_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curriculum_objective_mappings_school_id_from_record_id_from_idx" ON "curriculum_objective_mappings"("school_id", "from_record_id", "from_version");

-- CreateIndex
CREATE INDEX "curriculum_objective_mappings_school_id_to_record_id_to_ver_idx" ON "curriculum_objective_mappings"("school_id", "to_record_id", "to_version");

-- AddForeignKey
ALTER TABLE "curriculum_objective_mappings" ADD CONSTRAINT "curriculum_objective_mappings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-406 invariants: explicit relations only, never a self-mapping, decisions are history.
ALTER TABLE "curriculum_objective_mappings" ADD CONSTRAINT "curriculum_objective_mapping_relation" CHECK ("relation" IN ('SAME', 'PARTIAL', 'NOT_EQUIVALENT'));
ALTER TABLE "curriculum_objective_mappings" ADD CONSTRAINT "curriculum_objective_mapping_distinct" CHECK (("from_record_id", "from_version") IS DISTINCT FROM ("to_record_id", "to_version"));

CREATE FUNCTION curriculum_objective_mapping_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Objective mapping decisions are kept; record a new decision instead';
END $$;
CREATE TRIGGER curriculum_objective_mapping_append_only BEFORE UPDATE OR DELETE ON "curriculum_objective_mappings"
  FOR EACH ROW EXECUTE FUNCTION curriculum_objective_mapping_append_only();
