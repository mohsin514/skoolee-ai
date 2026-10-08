CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "target_scope" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'STAGED',
    "data" JSONB NOT NULL,
    "receipt" JSONB,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "committed_at" TIMESTAMP(3),
    "reversed_at" TIMESTAMP(3),
    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "import_batches_school_campus_kind_fingerprint_scope_key"
  ON "import_batches"("school_id", "campus_id", "kind", "fingerprint", "target_scope");
CREATE INDEX "import_batches_school_campus_created_idx"
  ON "import_batches"("school_id", "campus_id", "created_at");
CREATE INDEX "import_batches_school_expires_idx"
  ON "import_batches"("school_id", "expires_at");

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_campus_id_fkey"
  FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
