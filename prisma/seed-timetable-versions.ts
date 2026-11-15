import type { PrismaClient } from "@prisma/client";

// SKAI-2078: teachers, learners and families read the published version in force (SKO-403), never the
// timetable row, so a seed that writes a PUBLISHED board without a version leaves it invisible to them
// while leaders still see "Published". This freezes every versionless PUBLISHED board of one campus as
// version 1, the same shape the SKO-403 migration backfill writes. Idempotent: boards with a version are
// skipped. Effective from the publication date, at most yesterday, so it is in force in every timezone.
export async function recordSeedTimetableVersions(db: Pick<PrismaClient, "$executeRaw">, campusId: string) {
  return db.$executeRaw`
    INSERT INTO timetable_versions (id, school_id, campus_id, timetable_id, version, draft_revision, effective_from, slots, changes, note, published_at)
    SELECT 'seed-v1-' || t.id, t.school_id, t.campus_id, t.id, 1, t.draft_revision,
      LEAST(COALESCE(t.published_at, t.updated_at)::date, CURRENT_DATE - 1),
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'dayOfWeek', s.day_of_week, 'periodNumber', s.period_number, 'startTime', s.start_time, 'endTime', s.end_time,
          'slotType', s.slot_type, 'subjectId', s.subject_id, 'subjectName', sub.name, 'teacherId', s.teacher_id, 'teacherName', u.full_name,
          'roomId', s.room_id, 'roomNumber', COALESCE(r.room_number, s.room_number)) ORDER BY s.day_of_week, s.period_number)
        FROM timetable_slots s LEFT JOIN subjects sub ON sub.id = s.subject_id LEFT JOIN users u ON u.id = s.teacher_id LEFT JOIN class_rooms r ON r.id = s.room_id
        WHERE s.timetable_id = t.id), '[]'::jsonb),
      '[]'::jsonb, 'Seeded published timetable', COALESCE(t.published_at, t.updated_at)
    FROM timetables t
    WHERE t.campus_id = ${campusId} AND t.status = 'PUBLISHED'
      AND NOT EXISTS (SELECT 1 FROM timetable_versions v WHERE v.timetable_id = t.id)`;
}
