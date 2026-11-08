-- SKO-423: reviewed weekly family digests with deduplicated deliveries.
-- CreateTable
CREATE TABLE "family_digests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved_version" INTEGER,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_digest_entries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "digest_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,

    CONSTRAINT "family_digest_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_digest_deliveries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "digest_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "guardian_user_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "week_start" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "reason" TEXT,
    "seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_digest_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_digests_campus_id_status_idx" ON "family_digests"("campus_id", "status");

-- CreateIndex
CREATE INDEX "family_digests_school_id_idx" ON "family_digests"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_digests_class_id_week_start_key" ON "family_digests"("class_id", "week_start");

-- CreateIndex
CREATE INDEX "family_digest_entries_school_id_idx" ON "family_digest_entries"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_digest_entries_digest_id_student_id_key" ON "family_digest_entries"("digest_id", "student_id");

-- CreateIndex
CREATE INDEX "family_digest_deliveries_school_id_guardian_user_id_idx" ON "family_digest_deliveries"("school_id", "guardian_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_digest_deliveries_student_id_week_start_guardian_use_key" ON "family_digest_deliveries"("student_id", "week_start", "guardian_user_id", "channel");

-- AddForeignKey
ALTER TABLE "family_digests" ADD CONSTRAINT "family_digests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_digest_entries" ADD CONSTRAINT "family_digest_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_digest_entries" ADD CONSTRAINT "family_digest_entries_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "family_digests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_digest_deliveries" ADD CONSTRAINT "family_digest_deliveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_digest_deliveries" ADD CONSTRAINT "family_digest_deliveries_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "family_digests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_digest_deliveries" ADD CONSTRAINT "family_digest_deliveries_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "family_digest_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "family_digests" ADD CONSTRAINT "family_digests_status_check" CHECK (status IN ('DRAFT', 'APPROVED', 'SCHEDULED', 'SENT', 'CANCELLED') AND extract(isodow FROM week_start) = 1 AND (status IN ('DRAFT', 'CANCELLED') OR approved_version = version));
ALTER TABLE "family_digest_entries" ADD CONSTRAINT "family_digest_entries_status_check" CHECK (status IN ('PENDING', 'SENT', 'BLOCKED'));
ALTER TABLE "family_digest_deliveries" ADD CONSTRAINT "family_digest_deliveries_check" CHECK (status IN ('SENT', 'BLOCKED') AND channel IN ('IN_APP'));
