-- CreateTable
CREATE TABLE "identity_connections" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'OIDC',
    "issuer" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT,
    "discovery" JSONB,
    "verified_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pending_domains" JSONB NOT NULL DEFAULT '[]',
    "role_claim" TEXT NOT NULL DEFAULT 'groups',
    "role_map" JSONB NOT NULL DEFAULT '{}',
    "field_ownership" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "last_tested_at" TIMESTAMP(3),
    "last_test_result" TEXT,
    "emergency_admin_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_links" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "linked_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sign_in_at" TIMESTAMP(3),

    CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_link_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "reason" TEXT NOT NULL,
    "candidate_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT,
    "kind" TEXT NOT NULL,
    "actor_id" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_batches" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "external_batch_id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "preview" JSONB,
    "preview_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRY_RUN',
    "result" JSONB,
    "submitted_by_id" TEXT NOT NULL,
    "applied_by_id" TEXT,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_external_ids" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "local_id" TEXT NOT NULL,
    "synced" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_external_ids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_connections_school_id_status_idx" ON "identity_connections"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "identity_links_connection_id_subject_key" ON "identity_links"("connection_id", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "identity_links_connection_id_user_id_key" ON "identity_links"("connection_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_link_requests_connection_id_subject_key" ON "identity_link_requests"("connection_id", "subject");

-- CreateIndex
CREATE INDEX "identity_events_school_id_created_at_idx" ON "identity_events"("school_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "roster_batches_connection_id_external_batch_id_key" ON "roster_batches"("connection_id", "external_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "roster_external_ids_connection_id_kind_external_id_key" ON "roster_external_ids"("connection_id", "kind", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "roster_external_ids_connection_id_kind_local_id_key" ON "roster_external_ids"("connection_id", "kind", "local_id");

-- AddForeignKey
ALTER TABLE "identity_connections" ADD CONSTRAINT "identity_connections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "identity_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_link_requests" ADD CONSTRAINT "identity_link_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_link_requests" ADD CONSTRAINT "identity_link_requests_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "identity_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_events" ADD CONSTRAINT "identity_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_batches" ADD CONSTRAINT "roster_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_batches" ADD CONSTRAINT "roster_batches_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "identity_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_external_ids" ADD CONSTRAINT "roster_external_ids_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-446: closed states; an enabled connection was tested; link methods are explicit.
ALTER TABLE "identity_connections" ADD CONSTRAINT "identity_connections_check" CHECK ("protocol" = 'OIDC' AND "status" IN ('DRAFT','TESTED','ENABLED','DISABLED') AND ("status" <> 'ENABLED' OR "last_tested_at" IS NOT NULL));
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_method_check" CHECK ("method" IN ('VERIFIED_EMAIL','ADMIN_DECISION'));
ALTER TABLE "identity_link_requests" ADD CONSTRAINT "identity_link_requests_status_check" CHECK ("status" IN ('PENDING','LINKED','REJECTED'));
ALTER TABLE "roster_batches" ADD CONSTRAINT "roster_batches_status_check" CHECK ("status" IN ('DRY_RUN','APPLIED'));
ALTER TABLE "roster_external_ids" ADD CONSTRAINT "roster_external_ids_kind_check" CHECK ("kind" IN ('STUDENT','STAFF'));
