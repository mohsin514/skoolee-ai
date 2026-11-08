-- Module 13 — Exam routine (date sheet) + weekends & holidays

CREATE TABLE "exam_schedules" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "period_definition_id" TEXT,
    "room_id" TEXT,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campus_weekends" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,

    CONSTRAINT "campus_weekends_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exam_schedules_exam_id_subject_id_key" ON "exam_schedules"("exam_id", "subject_id");
CREATE INDEX "exam_schedules_campus_id_date_idx" ON "exam_schedules"("campus_id", "date");
CREATE UNIQUE INDEX "campus_weekends_campus_id_day_of_week_key" ON "campus_weekends"("campus_id", "day_of_week");
CREATE INDEX "holidays_campus_id_from_date_to_date_idx" ON "holidays"("campus_id", "from_date", "to_date");

ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_period_definition_id_fkey" FOREIGN KEY ("period_definition_id") REFERENCES "period_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "class_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campus_weekends" ADD CONSTRAINT "campus_weekends_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
