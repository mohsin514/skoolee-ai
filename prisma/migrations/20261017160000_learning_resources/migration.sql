-- CreateTable
CREATE TABLE "learning_resources" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "language" TEXT NOT NULL DEFAULT 'en',
    "source_rights" TEXT NOT NULL DEFAULT '',
    "objectives" JSONB,
    "owner_id" TEXT NOT NULL,
    "published_version" INTEGER,
    "latest_version" INTEGER NOT NULL DEFAULT 0,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_resource_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storage_key" TEXT,
    "link_url" TEXT,
    "file_name" TEXT,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "description" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_resource_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_resources_school_id_class_id_status_idx" ON "learning_resources"("school_id", "class_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "learning_resource_versions_resource_id_version_key" ON "learning_resource_versions"("resource_id", "version");

-- AddForeignKey
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_resource_versions" ADD CONSTRAINT "learning_resource_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-400 invariants.
ALTER TABLE "learning_resource_versions" ADD CONSTRAINT "learning_resource_versions_resource_fkey" FOREIGN KEY ("resource_id") REFERENCES "learning_resources"("id") ON DELETE CASCADE;
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resource_kind" CHECK ("kind" IN ('HANDOUT', 'NOTES', 'ROUTINE', 'WORKSHEET', 'ANSWER_KEY', 'OTHER'));
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resource_audience" CHECK ("audience" IN ('CLASS', 'CLASS_AND_GUARDIANS', 'STAFF'));
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resource_status" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'RETIRED'));
-- An answer key can never be addressed to learners or families.
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resource_answer_key_staff_only" CHECK ("kind" <> 'ANSWER_KEY' OR "audience" = 'STAFF');
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resource_published_version" CHECK ("status" <> 'PUBLISHED' OR "published_version" IS NOT NULL);
ALTER TABLE "learning_resource_versions" ADD CONSTRAINT "learning_resource_version_content" CHECK (("storage_key" IS NOT NULL) <> ("link_url" IS NOT NULL));

-- Versions are immutable once their content is uploaded; pinned references must stay reproducible.
CREATE FUNCTION learning_resource_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM learning_resources WHERE id = OLD.resource_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Resource versions are kept; retire the resource instead';
  END IF;
  IF OLD.uploaded_at IS NOT NULL OR (to_jsonb(NEW) - 'uploaded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'uploaded_at') THEN
    RAISE EXCEPTION 'A resource version cannot be changed; add a new version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER learning_resource_version_immutable BEFORE UPDATE OR DELETE ON "learning_resource_versions"
  FOR EACH ROW EXECUTE FUNCTION learning_resource_version_immutable();
