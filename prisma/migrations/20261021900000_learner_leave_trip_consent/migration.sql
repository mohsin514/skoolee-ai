-- SKO-421: learner leave requests and versioned trip consent.
-- CreateTable
CREATE TABLE "learner_leave_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "trip_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "depart_at" TIMESTAMP(3) NOT NULL,
    "return_at" TIMESTAMP(3) NOT NULL,
    "cost_amount" INTEGER NOT NULL DEFAULT 0,
    "cost_currency" TEXT NOT NULL DEFAULT 'PKR',
    "contact" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "consent_kind" TEXT NOT NULL,
    "signatory_rule" TEXT NOT NULL,
    "respond_by" TIMESTAMP(3) NOT NULL,
    "material" BOOLEAN NOT NULL DEFAULT true,
    "change_note" TEXT,
    "published_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_invitees" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "trip_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,

    CONSTRAINT "trip_invitees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_consents" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "trip_id" TEXT NOT NULL,
    "trip_version_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "guardian_user_id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "signatory_rule" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "receipt_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learner_leave_requests_school_id_student_id_from_date_idx" ON "learner_leave_requests"("school_id", "student_id", "from_date");

-- CreateIndex
CREATE INDEX "learner_leave_requests_campus_id_status_idx" ON "learner_leave_requests"("campus_id", "status");

-- CreateIndex
CREATE INDEX "trips_campus_id_status_idx" ON "trips"("campus_id", "status");

-- CreateIndex
CREATE INDEX "trips_school_id_idx" ON "trips"("school_id");

-- CreateIndex
CREATE INDEX "trip_versions_school_id_idx" ON "trip_versions"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_versions_trip_id_version_key" ON "trip_versions"("trip_id", "version");

-- CreateIndex
CREATE INDEX "trip_invitees_school_id_idx" ON "trip_invitees"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_invitees_trip_id_student_id_key" ON "trip_invitees"("trip_id", "student_id");

-- CreateIndex
CREATE INDEX "trip_consents_trip_id_student_id_idx" ON "trip_consents"("trip_id", "student_id");

-- CreateIndex
CREATE INDEX "trip_consents_school_id_idx" ON "trip_consents"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_consents_trip_version_id_guardian_user_id_idempotency__key" ON "trip_consents"("trip_version_id", "guardian_user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "trip_consents_school_id_receipt_code_key" ON "trip_consents"("school_id", "receipt_code");

-- AddForeignKey
ALTER TABLE "learner_leave_requests" ADD CONSTRAINT "learner_leave_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_versions" ADD CONSTRAINT "trip_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_versions" ADD CONSTRAINT "trip_versions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_invitees" ADD CONSTRAINT "trip_invitees_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_invitees" ADD CONSTRAINT "trip_invitees_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_consents" ADD CONSTRAINT "trip_consents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_consents" ADD CONSTRAINT "trip_consents_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_consents" ADD CONSTRAINT "trip_consents_trip_version_id_fkey" FOREIGN KEY ("trip_version_id") REFERENCES "trip_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "learner_leave_requests" ADD CONSTRAINT "learner_leave_status_check" CHECK (status IN ('PENDING', 'CLARIFICATION', 'APPROVED', 'DECLINED', 'CANCELLED') AND to_date >= from_date AND length(btrim(reason)) > 0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_status_check" CHECK (status IN ('OPEN', 'CANCELLED'));
ALTER TABLE "trip_versions" ADD CONSTRAINT "trip_versions_terms_check" CHECK (return_at > depart_at AND respond_by <= depart_at AND consent_kind IN ('fieldTrips', 'offsiteTravel') AND signatory_rule IN ('ANY_GUARDIAN', 'ALL_GUARDIANS') AND cost_amount >= 0 AND version > 0);
ALTER TABLE "trip_consents" ADD CONSTRAINT "trip_consents_choice_check" CHECK (choice IN ('GRANTED', 'DECLINED', 'WITHDRAWN'));
-- Published terms and recorded answers are records: they are never edited or deleted on their own.
CREATE FUNCTION trip_record_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% rows are immutable; publish a new version or record a new answer', TG_TABLE_NAME;
END $$;
CREATE TRIGGER trip_versions_immutable BEFORE UPDATE OR DELETE ON "trip_versions" FOR EACH ROW EXECUTE FUNCTION trip_record_immutable();
CREATE TRIGGER trip_consents_immutable BEFORE UPDATE OR DELETE ON "trip_consents" FOR EACH ROW EXECUTE FUNCTION trip_record_immutable();
