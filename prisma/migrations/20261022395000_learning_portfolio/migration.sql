-- CreateTable
CREATE TABLE "portfolio_entries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "goal" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "earlier_version_id" TEXT NOT NULL,
    "later_version_id" TEXT,
    "criterion_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reflection" TEXT NOT NULL DEFAULT '',
    "reflection_version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approved_reflection" TEXT,
    "approved_version" INTEGER,
    "teacher_comment" TEXT,
    "staff_note" TEXT,
    "family_visible" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_shares" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "student_id" TEXT NOT NULL,
    "guardian_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entry_ids" TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_entries_school_id_student_id_idx" ON "portfolio_entries"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_entries_student_id_idempotency_key_key" ON "portfolio_entries"("student_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "portfolio_shares_school_id_guardian_user_id_idx" ON "portfolio_shares"("school_id", "guardian_user_id");

-- CreateIndex
CREATE INDEX "portfolio_shares_school_id_student_id_idx" ON "portfolio_shares"("school_id", "student_id");

-- AddForeignKey
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_shares" ADD CONSTRAINT "portfolio_shares_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-427: closed states; an approved entry carries the reflection version it approved; family visibility
-- needs approval; a share has an expiry after its creation.
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_state_check" CHECK ("status" IN ('DRAFT','PROPOSED','APPROVED','CHANGES_REQUESTED') AND ("status" <> 'APPROVED' OR ("approved_version" IS NOT NULL AND "approved_reflection" IS NOT NULL AND "reviewed_by_id" IS NOT NULL)) AND (NOT "family_visible" OR "approved_version" IS NOT NULL) AND "earlier_version_id" <> coalesce("later_version_id", ''));
ALTER TABLE "portfolio_shares" ADD CONSTRAINT "portfolio_shares_window_check" CHECK ("expires_at" > "created_at" AND cardinality("entry_ids") > 0);
