-- Module 12 — Academic Infrastructure (Rooms + Periods)

CREATE TABLE "class_rooms" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "room_number" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "class_rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "period_definitions" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "time_type" TEXT NOT NULL DEFAULT 'CLASS',
    "period_number" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "period_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_rooms_campus_id_room_number_key" ON "class_rooms"("campus_id", "room_number");
CREATE UNIQUE INDEX "period_definitions_campus_id_time_type_period_number_key" ON "period_definitions"("campus_id", "time_type", "period_number");

ALTER TABLE "class_rooms" ADD CONSTRAINT "class_rooms_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "period_definitions" ADD CONSTRAINT "period_definitions_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "timetable_slots" ADD COLUMN "room_id" TEXT;
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "class_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
