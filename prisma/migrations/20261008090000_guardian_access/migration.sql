CREATE TABLE "guardian_relationships" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "guardian_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "relationship" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "invitation_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guardian_relationships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guardian_access_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "relationship_id" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guardian_access_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guardian_access_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "relationship_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guardian_access_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guardian_review_queue" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "legacy_relationship" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guardian_review_queue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guardian_relationships_id_school_id_key" ON "guardian_relationships"("id", "school_id");
CREATE INDEX "guardian_relationships_school_id_campus_id_student_id_status_idx" ON "guardian_relationships"("school_id", "campus_id", "student_id", "status");
CREATE INDEX "guardian_relationships_school_id_guardian_user_id_status_idx" ON "guardian_relationships"("school_id", "guardian_user_id", "status");
CREATE INDEX "guardian_access_versions_school_id_relationship_id_effective_from_effective_until_idx" ON "guardian_access_versions"("school_id", "relationship_id", "effective_from", "effective_until");
CREATE INDEX "guardian_access_events_school_id_relationship_id_created_at_idx" ON "guardian_access_events"("school_id", "relationship_id", "created_at");
CREATE UNIQUE INDEX "guardian_review_queue_student_id_reason_key" ON "guardian_review_queue"("student_id", "reason");
CREATE INDEX "guardian_review_queue_school_id_campus_id_status_created_at_idx" ON "guardian_review_queue"("school_id", "campus_id", "status", "created_at");

ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_guardian_user_id_fkey" FOREIGN KEY ("guardian_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardian_access_versions" ADD CONSTRAINT "guardian_access_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_access_versions" ADD CONSTRAINT "guardian_access_versions_relationship_id_school_id_fkey" FOREIGN KEY ("relationship_id", "school_id") REFERENCES "guardian_relationships"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_access_events" ADD CONSTRAINT "guardian_access_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_access_events" ADD CONSTRAINT "guardian_access_events_relationship_id_school_id_fkey" FOREIGN KEY ("relationship_id", "school_id") REFERENCES "guardian_relationships"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_access_events" ADD CONSTRAINT "guardian_access_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardian_review_queue" ADD CONSTRAINT "guardian_review_queue_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_review_queue" ADD CONSTRAINT "guardian_review_queue_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_review_queue" ADD CONSTRAINT "guardian_review_queue_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_review_queue" ADD CONSTRAINT "guardian_review_queue_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An explicit account relationship is confirmed prior consent. Preserve only
-- the behavior that link already provided. Contact fields alone stay pending.
INSERT INTO "guardian_relationships" (
  "id", "school_id", "campus_id", "student_id", "guardian_user_id", "created_by_user_id",
  "full_name", "email", "phone", "relationship", "status", "valid_from", "verified_at", "created_at", "updated_at"
)
SELECT gen_random_uuid()::text, s."school_id", s."campus_id", s."id", u."id", u."id",
       u."full_name", u."email", u."phone", COALESCE(NULLIF(s."guardian_relationship", ''), 'other'),
       'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "students" s
JOIN "users" u ON u."id" = s."parent_user_id" AND u."school_id" = s."school_id"
  AND u."role" = 'PARENT' AND u."is_active" = TRUE;

INSERT INTO "guardian_access_versions" (
  "id", "school_id", "relationship_id", "permissions", "effective_from", "reason", "created_by_user_id"
)
SELECT gen_random_uuid()::text, r."school_id", r."id",
       '{"learningRecords":true,"attendance":true,"finances":true,"communication":true,"pickup":false,"consents":{"medicalTreatment":false,"fieldTrips":false,"mediaPublication":false,"offsiteTravel":false}}'::jsonb,
       CURRENT_TIMESTAMP, 'Preserve confirmed legacy parent account access; unrepresented permissions start denied.', r."created_by_user_id"
FROM "guardian_relationships" r
WHERE r."status" = 'ACTIVE';

INSERT INTO "guardian_access_events" (
  "id", "school_id", "relationship_id", "actor_user_id", "action", "reason", "after_state", "effective_at"
)
SELECT gen_random_uuid()::text, r."school_id", r."id", r."created_by_user_id", 'MIGRATED',
       'Confirmed legacy parent account relationship preserved with conservative permissions.',
       '{"status":"ACTIVE","source":"students.parent_user_id"}'::jsonb, CURRENT_TIMESTAMP
FROM "guardian_relationships" r
WHERE r."status" = 'ACTIVE';

INSERT INTO "guardian_review_queue" (
  "id", "school_id", "campus_id", "student_id", "contact_name", "email", "phone", "legacy_relationship", "reason"
)
SELECT gen_random_uuid()::text, s."school_id", s."campus_id", s."id", s."guardian_name", s."guardian_email",
       COALESCE(s."guardian_phone", s."guardian_whatsapp"), s."guardian_relationship", 'LEGACY_CONTACT_UNVERIFIED'
FROM "students" s
WHERE (s."guardian_name" IS NOT NULL OR s."guardian_email" IS NOT NULL OR s."guardian_phone" IS NOT NULL OR s."guardian_whatsapp" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "users" u
    WHERE u."id" = s."parent_user_id" AND u."school_id" = s."school_id"
      AND u."role" = 'PARENT' AND u."is_active" = TRUE
  );
