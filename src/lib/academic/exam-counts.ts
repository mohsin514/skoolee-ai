import type { TxClient } from "@/lib/db/prisma";

/**
 * SKAI-1965: per-exam and per-subject row counts without Prisma's relation `_count`.
 *
 * Prisma 6 (no relationJoins) turns `_count: { select: { marks: true } }` into
 * `LEFT JOIN (SELECT exam_id, COUNT(*) FROM marks WHERE 1=1 GROUP BY exam_id)`: an aggregate over every
 * school's marks on every list read. These helpers run one `groupBy` per relation, filtered by the
 * caller's school and the listed ids, so each count reads only the rows it reports (all four relations
 * have an index that leads with the grouped id). The result keeps the `_count` shape callers read.
 */
export type CountDb = Pick<TxClient, "mark" | "reportCard" | "examSchedule" | "examSeat" | "examRoom">;
export type ExamCountKey = "marks" | "reportCards" | "schedules";
type CountRow = { _count: { _all: number } } & Record<string, unknown>;

const byExam: Record<ExamCountKey, (db: CountDb, where: { schoolId: string; examId: { in: string[] } }) => Promise<unknown>> = {
  marks: (db, where) => db.mark.groupBy({ by: ["examId"], where, _count: { _all: true } }),
  reportCards: (db, where) => db.reportCard.groupBy({ by: ["examId"], where, _count: { _all: true } }),
  schedules: (db, where) => db.examSchedule.groupBy({ by: ["examId"], where, _count: { _all: true } }),
};

function tally(rows: unknown, key: string) {
  return new Map((rows as CountRow[]).map((row) => [String(row[key]), row._count._all]));
}

const unique = (ids: string[]) => [...new Set(ids)];

/** Counts for each exam id, as `{ marks, reportCards, schedules }` restricted to `keys`; 0 when an exam has none. */
export async function examCounts<K extends ExamCountKey>(db: CountDb, schoolId: string, examIds: string[], keys: readonly K[]) {
  const ids = unique(examIds);
  const maps = ids.length
    ? await Promise.all(keys.map(async (key) => [key, tally(await byExam[key](db, { schoolId, examId: { in: ids } }), "examId")] as const))
    : keys.map((key) => [key, new Map<string, number>()] as const);
  return (examId: string) => Object.fromEntries(maps.map(([key, map]) => [key, map.get(examId) ?? 0])) as Record<K, number>;
}

/** Attaches `_count` from `examCounts` to each row, keeping the shape a relation `_count` returned. */
export async function withExamCounts<T extends { id: string }, K extends ExamCountKey>(db: CountDb, schoolId: string, rows: T[], keys: readonly K[]) {
  const countFor = await examCounts(db, schoolId, rows.map((row) => row.id), keys);
  return rows.map((row) => ({ ...row, _count: countFor(row.id) }));
}

/** Marks entered per subject id; 0 when a subject has none. */
export async function marksBySubject(db: CountDb, schoolId: string, subjectIds: string[]) {
  const ids = unique(subjectIds);
  const map = ids.length ? tally(await db.mark.groupBy({ by: ["subjectId"], where: { schoolId, subjectId: { in: ids } }, _count: { _all: true } }), "subjectId") : new Map<string, number>();
  return (subjectId: string) => map.get(subjectId) ?? 0;
}

/** Seats booked per exam schedule id; 0 when a schedule has none. */
export async function seatsBySchedule(db: CountDb, schoolId: string, scheduleIds: string[]) {
  const ids = unique(scheduleIds);
  const map = ids.length ? tally(await db.examSeat.groupBy({ by: ["examScheduleId"], where: { schoolId, examScheduleId: { in: ids } }, _count: { _all: true } }), "examScheduleId") : new Map<string, number>();
  return (scheduleId: string) => map.get(scheduleId) ?? 0;
}

/** Rooms assigned per exam schedule id; 0 when a schedule has none. */
export async function roomsBySchedule(db: CountDb, schoolId: string, scheduleIds: string[]) {
  const ids = unique(scheduleIds);
  const map = ids.length ? tally(await db.examRoom.groupBy({ by: ["examScheduleId"], where: { schoolId, examScheduleId: { in: ids } }, _count: { _all: true } }), "examScheduleId") : new Map<string, number>();
  return (scheduleId: string) => map.get(scheduleId) ?? 0;
}

/** Seats booked per exam room id (one room of a split paper); 0 when a room has none. */
export async function seatsByExamRoom(db: CountDb, schoolId: string, examRoomIds: string[]) {
  const ids = unique(examRoomIds);
  const map = ids.length ? tally(await db.examSeat.groupBy({ by: ["examRoomId"], where: { schoolId, examRoomId: { in: ids } }, _count: { _all: true } }), "examRoomId") : new Map<string, number>();
  return (examRoomId: string) => map.get(examRoomId) ?? 0;
}

/** Attaches `rooms[]._count.seats` and `exam._count.marks` to date-sheet rows, the shape the relation `_count` returned. */
export async function withScheduleCounts<R extends { id: string }, E extends { id: string }, T extends { rooms: R[]; exam: E }>(db: CountDb, schoolId: string, rows: T[]) {
  const [seatsFor, countFor] = await Promise.all([
    seatsByExamRoom(db, schoolId, rows.flatMap((row) => row.rooms.map((room) => room.id))),
    examCounts(db, schoolId, rows.map((row) => row.exam.id), ["marks"] as const),
  ]);
  return rows.map((row) => ({
    ...row,
    rooms: row.rooms.map((room) => ({ ...room, _count: { seats: seatsFor(room.id) } })),
    exam: { ...row.exam, _count: countFor(row.exam.id) },
  }));
}
