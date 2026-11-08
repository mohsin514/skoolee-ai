-- SKO-403: published timetable versions bound to a draft revision, with effective dates.
-- AlterTable
ALTER TABLE "timetables" ADD COLUMN     "draft_revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "timetable_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "timetable_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "draft_revision" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "slots" JSONB NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "published_by_id" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "timetable_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_versions_timetable_id_effective_from_idx" ON "timetable_versions"("timetable_id", "effective_from");

-- CreateIndex
CREATE INDEX "timetable_versions_school_id_idx" ON "timetable_versions"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_versions_timetable_id_version_key" ON "timetable_versions"("timetable_id", "version");

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_timetable_id_fkey" FOREIGN KEY ("timetable_id") REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A published version is a record: only its notification marker may change afterwards.
CREATE FUNCTION timetable_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'notified_at') IS DISTINCT FROM (to_jsonb(OLD) - 'notified_at') THEN
    RAISE EXCEPTION 'Published timetable versions are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER timetable_version_immutable BEFORE UPDATE ON "timetable_versions" FOR EACH ROW EXECUTE FUNCTION timetable_version_immutable();

-- Timetables published before versions existed become version 1, in force from their publication date.
INSERT INTO "timetable_versions" ("id", "school_id", "campus_id", "timetable_id", "version", "draft_revision", "effective_from", "slots", "changes", "note", "published_at")
SELECT 'legacy-' || t.id, t.school_id, t.campus_id, t.id, 1, t.draft_revision, COALESCE(t.published_at, t.updated_at)::date,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'dayOfWeek', s.day_of_week, 'periodNumber', s.period_number, 'startTime', s.start_time, 'endTime', s.end_time,
      'slotType', s.slot_type, 'subjectId', s.subject_id, 'subjectName', sub.name, 'teacherId', s.teacher_id, 'teacherName', u.full_name,
      'roomId', s.room_id, 'roomNumber', COALESCE(r.room_number, s.room_number)) ORDER BY s.day_of_week, s.period_number)
    FROM "timetable_slots" s LEFT JOIN "subjects" sub ON sub.id = s.subject_id LEFT JOIN "users" u ON u.id = s.teacher_id LEFT JOIN "class_rooms" r ON r.id = s.room_id
    WHERE s.timetable_id = t.id), '[]'::jsonb),
  '[]'::jsonb, 'Published before timetable versions were recorded', COALESCE(t.published_at, t.updated_at)
FROM "timetables" t WHERE t.status = 'PUBLISHED';
