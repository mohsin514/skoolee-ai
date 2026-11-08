-- AlterTable
ALTER TABLE "school_ai_exam_assignments" ADD COLUMN     "secure_profile_id" TEXT,
ADD COLUMN     "secure_profile_version" INTEGER;

-- CreateTable
CREATE TABLE "secure_browser_profiles" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "profile_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "min_client_version" TEXT NOT NULL,
    "config_keys" TEXT[],
    "browser_exam_keys" TEXT[],
    "allowed_resources" TEXT[],
    "tested_devices" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secure_browser_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secure_browser_exceptions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secure_browser_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "secure_browser_profiles_school_id_campus_id_status_idx" ON "secure_browser_profiles"("school_id", "campus_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "secure_browser_profiles_school_id_profile_key_version_key" ON "secure_browser_profiles"("school_id", "profile_key", "version");

-- CreateIndex
CREATE INDEX "secure_browser_exceptions_school_id_assignment_id_idx" ON "secure_browser_exceptions"("school_id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "secure_browser_exceptions_assignment_id_student_id_key" ON "secure_browser_exceptions"("assignment_id", "student_id");

-- AddForeignKey
ALTER TABLE "secure_browser_profiles" ADD CONSTRAINT "secure_browser_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_browser_exceptions" ADD CONSTRAINT "secure_browser_exceptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-449 invariants.
ALTER TABLE "secure_browser_profiles" ADD CONSTRAINT "secure_browser_profile_status" CHECK ("status" IN ('DRAFT', 'APPROVED', 'RETIRED'));
-- An approved profile names at least one key to verify and records tested devices.
ALTER TABLE "secure_browser_profiles" ADD CONSTRAINT "secure_browser_profile_approved_keys" CHECK ("status" = 'DRAFT' OR (cardinality("config_keys") + cardinality("browser_exam_keys") > 0 AND "approved_by_id" IS NOT NULL));
-- A secure exam always pins a profile version; other modes never do.
ALTER TABLE "school_ai_exam_assignments" ADD CONSTRAINT "school_ai_exam_secure_profile_pinned" CHECK (("mode" = 'SECURE_BROWSER') = ("secure_profile_id" IS NOT NULL AND "secure_profile_version" IS NOT NULL));

-- Profile revisions are immutable except DRAFT -> APPROVED -> RETIRED status transitions.
CREATE FUNCTION secure_browser_profile_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Secure browser profiles are kept; retire instead';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'approved_by_id', 'approved_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'approved_by_id', 'approved_at'])
     OR OLD.status = 'RETIRED' OR (OLD.status = 'APPROVED' AND NEW.status <> 'RETIRED') THEN
    RAISE EXCEPTION 'A secure browser profile revision cannot be changed; create a new version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER secure_browser_profile_immutable BEFORE UPDATE OR DELETE ON "secure_browser_profiles" FOR EACH ROW EXECUTE FUNCTION secure_browser_profile_immutable();

CREATE FUNCTION secure_browser_exception_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Supervised alternatives are kept as history';
END $$;
CREATE TRIGGER secure_browser_exception_append_only BEFORE UPDATE OR DELETE ON "secure_browser_exceptions" FOR EACH ROW EXECUTE FUNCTION secure_browser_exception_append_only();
