-- CreateTable
CREATE TABLE "admission_queries" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "class_interested_id" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assigned_to_id" TEXT,
    "next_follow_up" TIMESTAMP(3),
    "note" TEXT,
    "converted_student_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_query_follow_ups" (
    "id" TEXT NOT NULL,
    "query_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "next_date" TIMESTAMP(3),
    "actor_id" TEXT,

    CONSTRAINT "admission_query_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admission_queries_converted_student_id_key" ON "admission_queries"("converted_student_id");

-- CreateIndex
CREATE INDEX "admission_queries_campus_id_status_idx" ON "admission_queries"("campus_id", "status");

-- CreateIndex
CREATE INDEX "admission_query_follow_ups_query_id_idx" ON "admission_query_follow_ups"("query_id");

-- AddForeignKey
ALTER TABLE "admission_queries" ADD CONSTRAINT "admission_queries_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_queries" ADD CONSTRAINT "admission_queries_class_interested_id_fkey" FOREIGN KEY ("class_interested_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_queries" ADD CONSTRAINT "admission_queries_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_queries" ADD CONSTRAINT "admission_queries_converted_student_id_fkey" FOREIGN KEY ("converted_student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_query_follow_ups" ADD CONSTRAINT "admission_query_follow_ups_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "admission_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_query_follow_ups" ADD CONSTRAINT "admission_query_follow_ups_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
