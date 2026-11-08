-- CreateTable
CREATE TABLE "question_networks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_school_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_network_members" (
    "id" TEXT NOT NULL,
    "network_id" TEXT NOT NULL,
    "member_school_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "invited_by_id" TEXT NOT NULL,
    "accepted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "question_network_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_network_items" (
    "id" TEXT NOT NULL,
    "share_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contributor_school_id" TEXT NOT NULL,
    "contributor_campus_id" TEXT NOT NULL,
    "contributed_by_id" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "audience" TEXT NOT NULL,
    "network_id" TEXT,
    "rights" JSONB NOT NULL,
    "tags" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "answer_key" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "embargo_until" TIMESTAMP(3),
    "authorized_by_id" TEXT,
    "correction_of_id" TEXT,
    "change_note" TEXT,
    "adjudication" JSONB,
    "published_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "withdraw_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_network_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_network_reviews" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "reviewer_school_id" TEXT NOT NULL,
    "expertise" JSONB NOT NULL,
    "conflict" BOOLEAN NOT NULL DEFAULT false,
    "conflict_note" TEXT,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "decision" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_network_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_network_adoptions" (
    "id" TEXT NOT NULL,
    "share_key" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "adopter_school_id" TEXT NOT NULL,
    "adopted_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_network_adoptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_network_stats" (
    "id" TEXT NOT NULL,
    "share_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reporter_school_id" TEXT NOT NULL,
    "reported_by_id" TEXT NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "mean_score" DOUBLE PRECISION NOT NULL,
    "context" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_network_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_networks_owner_school_id_idx" ON "question_networks"("owner_school_id");

-- CreateIndex
CREATE INDEX "question_network_members_member_school_id_idx" ON "question_network_members"("member_school_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_network_members_network_id_member_school_id_key" ON "question_network_members"("network_id", "member_school_id");

-- CreateIndex
CREATE INDEX "question_network_items_contributor_school_id_idx" ON "question_network_items"("contributor_school_id");

-- CreateIndex
CREATE INDEX "question_network_items_status_audience_idx" ON "question_network_items"("status", "audience");

-- CreateIndex
CREATE UNIQUE INDEX "question_network_items_share_key_version_key" ON "question_network_items"("share_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "question_network_reviews_item_id_reviewer_id_key" ON "question_network_reviews"("item_id", "reviewer_id");

-- CreateIndex
CREATE INDEX "question_network_adoptions_item_id_idx" ON "question_network_adoptions"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_network_adoptions_adopter_school_id_share_key_key" ON "question_network_adoptions"("adopter_school_id", "share_key");

-- CreateIndex
CREATE UNIQUE INDEX "question_network_stats_share_key_version_reporter_school_id_key" ON "question_network_stats"("share_key", "version", "reporter_school_id", "context");

