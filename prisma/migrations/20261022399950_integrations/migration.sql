-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "campus_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contract_version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "webhook_url" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signing_secret" TEXT,
    "previous_signing_secret" TEXT,
    "previous_secret_until" TIMESTAMP(3),
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
    "daily_quota" INTEGER NOT NULL DEFAULT 10000,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_deliveries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_status_code" INTEGER,
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "replay_count" INTEGER NOT NULL DEFAULT 0,
    "lease_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_delivery_attempts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "delivery_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "replay" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT NOT NULL,
    "resolved_address" TEXT,
    "status_code" INTEGER,
    "outcome" TEXT NOT NULL,
    "error" TEXT,
    "duration_ms" INTEGER,
    "signed_with" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_commands" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_request_logs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_external_refs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "connection_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_external_refs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_connections_school_id_status_idx" ON "integration_connections"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_key_id_key" ON "integration_credentials"("key_id");

-- CreateIndex
CREATE INDEX "integration_credentials_school_id_connection_id_idx" ON "integration_credentials"("school_id", "connection_id");

-- CreateIndex
CREATE INDEX "integration_events_school_id_topic_occurred_at_idx" ON "integration_events"("school_id", "topic", "occurred_at");

-- CreateIndex
CREATE INDEX "integration_deliveries_school_id_status_next_attempt_at_idx" ON "integration_deliveries"("school_id", "status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_deliveries_connection_id_event_id_key" ON "integration_deliveries"("connection_id", "event_id");

-- CreateIndex
CREATE INDEX "integration_delivery_attempts_school_id_delivery_id_idx" ON "integration_delivery_attempts"("school_id", "delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_commands_connection_id_idempotency_key_key" ON "integration_commands"("connection_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "integration_request_logs_school_id_connection_id_created_at_idx" ON "integration_request_logs"("school_id", "connection_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_external_refs_connection_id_student_id_system_key" ON "integration_external_refs"("connection_id", "student_id", "system");

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "integration_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_delivery_attempts" ADD CONSTRAINT "integration_delivery_attempts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_delivery_attempts" ADD CONSTRAINT "integration_delivery_attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "integration_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_commands" ADD CONSTRAINT "integration_commands_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_commands" ADD CONSTRAINT "integration_commands_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_request_logs" ADD CONSTRAINT "integration_request_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_external_refs" ADD CONSTRAINT "integration_external_refs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-445: closed states; a connection always has a campus scope; attempts are numbered from 1.
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_check" CHECK ("status" IN ('ACTIVE','PAUSED','REVOKED') AND cardinality("campus_ids") > 0 AND "rate_limit_per_minute" BETWEEN 1 AND 6000 AND "daily_quota" BETWEEN 1 AND 10000000);
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_status_check" CHECK ("status" IN ('ACTIVE','REVOKED'));
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_status_check" CHECK ("status" IN ('PENDING','DELIVERING','DELIVERED','FAILED','BLOCKED','PAUSED') AND "attempts" >= 0);
ALTER TABLE "integration_delivery_attempts" ADD CONSTRAINT "integration_delivery_attempts_check" CHECK ("attempt" >= 1 AND "outcome" IN ('DELIVERED','HTTP_ERROR','TIMEOUT','BLOCKED_DESTINATION','REDIRECT_REFUSED','NETWORK_ERROR','RATE_LIMITED'));
