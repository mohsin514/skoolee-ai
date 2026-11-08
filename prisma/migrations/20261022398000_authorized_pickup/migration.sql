-- CreateTable
CREATE TABLE "pickup_authorizations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "issued_by_id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_relation" TEXT NOT NULL,
    "id_method" TEXT NOT NULL,
    "id_last4" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "used_at" TIMESTAMP(3),
    "used_by_check_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_restrictions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "reason" TEXT,
    "lead_user_id" TEXT,
    "ends_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "lifted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_checks" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "authorization_id" TEXT,
    "student_id" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "block_reason" TEXT,
    "identity_method" TEXT,
    "identity_at" TIMESTAMP(3),
    "exception_status" TEXT,
    "exception_note" TEXT,
    "exception_by_id" TEXT,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "student_id" TEXT NOT NULL,
    "authorization_id" TEXT,
    "check_id" TEXT,
    "kind" TEXT NOT NULL,
    "actor_id" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pickup_authorizations_token_hash_key" ON "pickup_authorizations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_authorizations_used_by_check_id_key" ON "pickup_authorizations"("used_by_check_id");

-- CreateIndex
CREATE INDEX "pickup_authorizations_school_id_student_id_idx" ON "pickup_authorizations"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "pickup_restrictions_school_id_student_id_idx" ON "pickup_restrictions"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "pickup_checks_school_id_student_id_idx" ON "pickup_checks"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "pickup_checks_school_id_campus_id_status_idx" ON "pickup_checks"("school_id", "campus_id", "status");

-- CreateIndex
CREATE INDEX "pickup_events_school_id_student_id_created_at_idx" ON "pickup_events"("school_id", "student_id", "created_at");

-- AddForeignKey
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_restrictions" ADD CONSTRAINT "pickup_restrictions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_checks" ADD CONSTRAINT "pickup_checks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_checks" ADD CONSTRAINT "pickup_checks_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "pickup_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_events" ADD CONSTRAINT "pickup_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-438: closed sets; a used authorization names its check; a window is short and ordered; a release
-- has a time and an identity confirmation.
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_state_check" CHECK ("status" IN ('ACTIVE','USED','REVOKED') AND "id_method" IN ('PHOTO_ID','SCHOOL_PICKUP_CARD','KNOWN_TO_STAFF') AND "valid_until" > "valid_from" AND "valid_until" - "valid_from" <= interval '12 hours' AND ("status" <> 'USED' OR ("used_at" IS NOT NULL AND "used_by_check_id" IS NOT NULL)) AND ("status" <> 'REVOKED' OR "revoked_at" IS NOT NULL) AND ("id_last4" IS NULL OR "id_last4" ~ '^[0-9A-Za-z]{4}$'));
ALTER TABLE "pickup_restrictions" ADD CONSTRAINT "pickup_restrictions_kind_check" CHECK ("kind" IN ('CUSTODY_ORDER','DO_NOT_RELEASE','LEAD_APPROVAL') AND length(btrim("instruction")) > 0);
ALTER TABLE "pickup_checks" ADD CONSTRAINT "pickup_checks_state_check" CHECK ("status" IN ('OPEN','RELEASED','BLOCKED','ESCALATED','CANCELLED') AND ("exception_status" IS NULL OR "exception_status" IN ('REQUESTED','APPROVED','DENIED')) AND ("status" <> 'RELEASED' OR ("released_at" IS NOT NULL AND "identity_at" IS NOT NULL)));
