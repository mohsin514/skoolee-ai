-- CreateTable
CREATE TABLE "practice_sessions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "practice_record_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "revisit_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expected_minutes" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "summary" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_responses" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "hints_used" INTEGER NOT NULL DEFAULT 0,
    "answer" TEXT,
    "correct" BOOLEAN,
    "assisted" BOOLEAN NOT NULL DEFAULT false,
    "confidence" INTEGER,
    "explanation" TEXT,
    "answered_at" TIMESTAMP(3),

    CONSTRAINT "practice_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_revisits" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "practice_record_id" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "original_due_on" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_revisits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_sessions_school_id_student_id_practice_record_id_idx" ON "practice_sessions"("school_id", "student_id", "practice_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_responses_session_id_item_key_key" ON "practice_responses"("session_id", "item_key");

-- CreateIndex
CREATE INDEX "practice_revisits_school_id_student_id_status_idx" ON "practice_revisits"("school_id", "student_id", "status");

-- AddForeignKey
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

