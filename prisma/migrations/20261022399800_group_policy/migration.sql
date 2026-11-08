-- CreateTable
CREATE TABLE "policy_templates" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "boards" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "campus_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_template_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "values" JSONB NOT NULL DEFAULT '{}',
    "locked_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "overridable_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "effective_from" TIMESTAMP(3),
    "preview_hash" TEXT,
    "submitted_by_id" TEXT,
    "reviewer_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_overrides" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requested_by_id" TEXT NOT NULL,
    "approver_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "template_id" TEXT,
    "version_id" TEXT,
    "campus_id" TEXT,
    "kind" TEXT NOT NULL,
    "actor_id" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_provenances" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "version_id" TEXT,
    "override_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "effective" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_provenances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policy_templates_school_id_domain_idx" ON "policy_templates"("school_id", "domain");

-- CreateIndex
CREATE INDEX "policy_template_versions_school_id_status_idx" ON "policy_template_versions"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "policy_template_versions_template_id_version_key" ON "policy_template_versions"("template_id", "version");

-- CreateIndex
CREATE INDEX "policy_overrides_school_id_campus_id_status_idx" ON "policy_overrides"("school_id", "campus_id", "status");

-- CreateIndex
CREATE INDEX "policy_events_school_id_template_id_created_at_idx" ON "policy_events"("school_id", "template_id", "created_at");

-- CreateIndex
CREATE INDEX "policy_provenances_school_id_record_type_record_id_idx" ON "policy_provenances"("school_id", "record_type", "record_id");

-- AddForeignKey
ALTER TABLE "policy_templates" ADD CONSTRAINT "policy_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_template_versions" ADD CONSTRAINT "policy_template_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_template_versions" ADD CONSTRAINT "policy_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "policy_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_overrides" ADD CONSTRAINT "policy_overrides_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_overrides" ADD CONSTRAINT "policy_overrides_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "policy_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_overrides" ADD CONSTRAINT "policy_overrides_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "policy_template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_events" ADD CONSTRAINT "policy_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_provenances" ADD CONSTRAINT "policy_provenances_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-443: closed sets; a reviewed version names a reviewer who is not its submitter; an override has a reason
-- and a bounded validity; only one live version per template.
ALTER TABLE "policy_templates" ADD CONSTRAINT "policy_templates_domain_check" CHECK ("domain" IN ('GRADING','CALENDAR'));
ALTER TABLE "policy_template_versions" ADD CONSTRAINT "policy_template_versions_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','SCHEDULED','ACTIVE','SUPERSEDED','WITHDRAWN') AND ("status" NOT IN ('SCHEDULED','ACTIVE','SUPERSEDED') OR ("effective_from" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "reviewer_id" IS NOT NULL AND "reviewer_id" <> "submitted_by_id")) AND NOT ("locked_keys" && "overridable_keys"));
ALTER TABLE "policy_overrides" ADD CONSTRAINT "policy_overrides_check" CHECK ("status" IN ('PENDING','APPROVED','DECLINED','EXPIRED','REVOKED') AND "valid_until" > "valid_from" AND length(btrim("reason")) > 0 AND ("status" NOT IN ('APPROVED','DECLINED') OR ("approver_id" IS NOT NULL AND "approver_id" <> "requested_by_id")));
CREATE UNIQUE INDEX "policy_template_versions_one_active_key" ON "policy_template_versions" ("template_id") WHERE "status" = 'ACTIVE';
