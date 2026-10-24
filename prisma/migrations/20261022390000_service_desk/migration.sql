-- CreateTable
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "department_id" TEXT,
    "default_owner_id" TEXT,
    "escalation_id" TEXT,
    "response_hours" INTEGER,
    "resolve_hours" INTEGER,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "safety" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "room_id" TEXT,
    "item_id" TEXT,
    "requester_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "watcher_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "blocked_reason" TEXT,
    "response_due_at" TIMESTAMP(3),
    "resolve_due_at" TIMESTAMP(3),
    "first_response_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "first_resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "reopened_count" INTEGER NOT NULL DEFAULT 0,
    "escalated_for_due" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_request_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "request_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "actor_id" TEXT,
    "body" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "attachment_key" TEXT,
    "attachment_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_categories_school_id_idx" ON "service_categories"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_campus_id_name_key" ON "service_categories"("campus_id", "name");

-- CreateIndex
CREATE INDEX "service_requests_school_id_campus_id_status_idx" ON "service_requests"("school_id", "campus_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_school_id_owner_id_status_idx" ON "service_requests"("school_id", "owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_school_id_reference_key" ON "service_requests"("school_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_requester_id_idempotency_key_key" ON "service_requests"("requester_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "service_request_events_school_id_request_id_idx" ON "service_request_events"("school_id", "request_id");

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_events" ADD CONSTRAINT "service_request_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_events" ADD CONSTRAINT "service_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-441: closed sets; a blocked request says why; a resolved or closed request has its resolution time;
-- targets are positive when set; safety categories always have an escalation contact.
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_shape_check" CHECK ("kind" IN ('REPAIR','ACCESS','SUPPLIES','INFORMATION') AND length("team") > 0 AND ("response_hours" IS NULL OR "response_hours" > 0) AND ("resolve_hours" IS NULL OR "resolve_hours" > 0) AND (NOT "safety" OR "escalation_id" IS NOT NULL));
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_state_check" CHECK ("priority" IN ('LOW','NORMAL','HIGH','URGENT') AND "status" IN ('OPEN','IN_PROGRESS','BLOCKED','RESOLVED','CLOSED') AND ("status" <> 'BLOCKED' OR length(coalesce("blocked_reason", '')) > 0) AND ("status" NOT IN ('RESOLVED','CLOSED') OR "resolved_at" IS NOT NULL) AND length("reference") > 0);
ALTER TABLE "service_request_events" ADD CONSTRAINT "service_request_events_shape_check" CHECK ("visibility" IN ('INTERNAL','REQUESTER'));
