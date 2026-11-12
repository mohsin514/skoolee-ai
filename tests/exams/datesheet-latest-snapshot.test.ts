import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1871: the family date sheet and exam timeline read one snapshot per session (the latest version), not one
// per republish, and the online sittings no longer load the whole paper snapshot to find a subject. Rows, order and
// school / campus / class scope are unchanged; a non-learner is still denied the learner's own timeline.

type Paper = { scheduleId: string; classId: string; subject: string };
type Version = { id: string; schoolId: string; sessionId: string; version: number; publishedAt: Date; snapshot: { papers: Paper[] } };
const paper = (scheduleId: string, classId: string, subject: string): Paper => ({ scheduleId, classId, subject });
const exams = [
  { schoolId: "school-a", classId: "class-a1", sessionId: "sess-a" },
  { schoolId: "school-a", classId: "class-a1", sessionId: "sess-a2" },
  { schoolId: "school-b", classId: "class-b1", sessionId: "sess-b" },
];
const versions: Version[] = [];
for (let v = 1; v <= 12; v++) versions.push({ id: `a-v${v}`, schoolId: "school-a", sessionId: "sess-a", version: v, publishedAt: new Date(Date.UTC(2026, 0, v)), snapshot: { papers: [paper(`sch-a-${v}`, "class-a1", `Maths v${v}`), paper("sch-a-other", "class-a9", "Other class")] } });
versions.push({ id: "a2-v1", schoolId: "school-a", sessionId: "sess-a2", version: 1, publishedAt: new Date(Date.UTC(2026, 1, 1)), snapshot: { papers: [paper("sch-a2", "class-a1", "Science")] } });
versions.push({ id: "b-v1", schoolId: "school-b", sessionId: "sess-b", version: 1, publishedAt: new Date(Date.UTC(2026, 1, 1)), snapshot: { papers: [paper("sch-b", "class-b1", "School B")] } });

type Sitting = { id: string; schoolId: string; campusId: string; classId: string; studentIds: string[]; title: string; startsAt: Date; subjectId: string };
const sittings: Sitting[] = [
  { id: "on-1", schoolId: "school-a", campusId: "campus-a1", classId: "class-a1", studentIds: ["s-a"], title: "Online maths", startsAt: new Date(Date.UTC(2026, 2, 2)), subjectId: "subj-maths" },
  { id: "on-2", schoolId: "school-a", campusId: "campus-a1", classId: "class-a1", studentIds: ["s-a"], title: "Online science", startsAt: new Date(Date.UTC(2026, 2, 1)), subjectId: "subj-sci" },
  { id: "on-x", schoolId: "school-a", campusId: "campus-a2", classId: "class-a1", studentIds: ["s-a"], title: "Other campus", startsAt: new Date(Date.UTC(2026, 2, 1)), subjectId: "subj-maths" },
  { id: "on-b", schoolId: "school-b", campusId: "campus-b1", classId: "class-b1", studentIds: ["s-b"], title: "School B", startsAt: new Date(Date.UTC(2026, 2, 1)), subjectId: "subj-b" },
];
const subjects = [{ id: "subj-maths", schoolId: "school-a", name: "Mathematics" }, { id: "subj-sci", schoolId: "school-a", name: "Science" }, { id: "subj-b", schoolId: "school-b", name: "B" }];

let snapshotRows = 0;
const versionQueries: { where: Record<string, unknown>; select: Record<string, boolean> }[] = [];
const sittingSelects: Record<string, boolean>[] = [];
const rawQueries: { sql: string; values: unknown[] }[] = [];
const pick = <T extends object>(row: T, select: Record<string, boolean>) => Object.fromEntries(Object.entries(row).filter(([key]) => select[key]));

const prisma = {
  exam: { findMany: async ({ where }: { where: { schoolId: string; classId: { in: string[] } } }) => exams.filter(e => e.schoolId === where.schoolId && where.classId.in.includes(e.classId)).map(e => ({ sessionId: e.sessionId })) },
  examDatesheetVersion: {
    findMany: async (args: { where: { schoolId: string; sessionId?: { in: string[] }; id?: { in: string[] } }; select: Record<string, boolean> }) => {
      versionQueries.push(args);
      const { where } = args;
      const rows = versions.filter(v => v.schoolId === where.schoolId && (!where.sessionId || where.sessionId.in.includes(v.sessionId)) && (!where.id || where.id.in.includes(v.id))).sort((a, b) => b.version - a.version);
      if (args.select.snapshot) snapshotRows += rows.length;
      return rows.map(row => pick(row, args.select));
    },
  },
  examSeat: { findMany: async () => [] },
  schoolAiExamAssignment: {
    findMany: async ({ where, select }: { where: { schoolId: string; campusId: string; classId: string; studentIds: { array_contains: string[] } }; select: Record<string, boolean> }) => {
      sittingSelects.push(select);
      return sittings.filter(r => r.schoolId === where.schoolId && r.campusId === where.campusId && r.classId === where.classId && where.studentIds.array_contains.every(id => r.studentIds.includes(id)))
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map(r => ({ id: r.id, title: r.title, startsAt: r.startsAt, endsAt: r.startsAt, mode: "ONLINE", resultsReleasedAt: null }));
    },
  },
  schoolAiExamAttempt: { findMany: async () => [] },
  subject: { findMany: async ({ where }: { where: { schoolId: string; id: { in: string[] } } }) => subjects.filter(s => s.schoolId === where.schoolId && where.id.in.includes(s.id)).map(s => ({ id: s.id, name: s.name })) },
  student: { findFirst: async () => null },
  // Mirrors the SQL: school_id = $1 AND campus_id = $2 AND id IN (...).
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    rawQueries.push({ sql: strings.join("?"), values });
    const [schoolId, campusId, ids] = values as [string, string, { values: string[] }];
    return sittings.filter(r => r.schoolId === schoolId && r.campusId === campusId && ids.values.includes(r.id)).map(r => ({ id: r.id, subject_id: r.subjectId }));
  },
};

let timelineInput: { papers: { scheduleId: string; versionId: string }[]; online: { id: string; subject: string | null }[] } | null = null;
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageOperations: () => false } });
mock.module("@/lib/academic/exam-bookings", { namedExports: { validateStoredExamSchedules: async () => undefined } });
mock.module("@/lib/academic/room-capacity", { namedExports: { examSeats: () => 0 } });
mock.module("@/lib/parent/guardian-query", { namedExports: { liveGuardianRelationshipWhere: () => ({}) } });
mock.module("@/lib/notifications/in-app", { namedExports: { notify: () => undefined } });
mock.module("@/lib/datetime", { namedExports: { getSchoolTimeZone: async () => "UTC" } });
mock.module("../../src/lib/school-ai/exam.ts", { namedExports: { DELIVERED_EXAM_MODES: ["ONLINE"] } });
mock.module("../../src/lib/school-ai/exam-timeline.ts", { namedExports: { buildExamTimeline: (input: typeof timelineInput) => { timelineInput = input; return []; } } });

test("the family date sheet loads one snapshot per session however often it was republished", async () => {
  const { publishedPapersForClasses } = await import("../../src/lib/academic/datesheet-publication");
  snapshotRows = 0;
  versionQueries.length = 0;
  const papers = await publishedPapersForClasses("school-a", ["class-a1"]);
  assert.deepEqual(papers.map(p => [p.scheduleId, p.versionId, p.version]), [["sch-a-12", "a-v12", 12], ["sch-a2", "a2-v1", 1]]);
  assert.equal(snapshotRows, 2, "only the latest snapshot of each of the two sessions is read");
  assert.ok(!versionQueries[0].select.snapshot, "the first pass selects no snapshot");
  for (const query of versionQueries) assert.equal(query.where.schoolId, "school-a");
  // Another school never sees school A's sessions, and school A never sees school B's.
  assert.deepEqual((await publishedPapersForClasses("school-b", ["class-b1"])).map(p => p.scheduleId), ["sch-b"]);
  assert.deepEqual(await publishedPapersForClasses("school-b", ["class-a1"]), []);
  assert.deepEqual(await publishedPapersForClasses("school-a", ["class-b1"]), []);
});

test("the learner timeline reads subjects without loading paper snapshots, inside school and campus", async () => {
  const { examTimelineFor } = await import("../../src/lib/school-ai/exam-timeline-service");
  rawQueries.length = 0;
  sittingSelects.length = 0;
  await examTimelineFor("school-a", { id: "s-a", classId: "class-a1", campusId: "campus-a1" });
  assert.ok(!sittingSelects[0].paperSnapshot, "the sittings query no longer selects the paper snapshot");
  assert.deepEqual(timelineInput?.online.map(row => [row.id, row.subject]), [["on-2", "Science"], ["on-1", "Mathematics"]]);
  assert.deepEqual(timelineInput?.papers.map(row => row.versionId), ["a-v12", "a2-v1"]);
  assert.equal(rawQueries.length, 1);
  assert.match(rawQueries[0].sql, /school_id = \? AND campus_id = \?/);
  assert.deepEqual(rawQueries[0].values.slice(0, 2), ["school-a", "campus-a1"]);

  // The same learner id on another campus or in another school reaches neither school A campus 1 rows nor subjects.
  await examTimelineFor("school-a", { id: "s-a", classId: "class-a1", campusId: "campus-a2" });
  assert.deepEqual(timelineInput?.online.map(row => [row.id, row.subject]), [["on-x", "Mathematics"]]);
  await examTimelineFor("school-b", { id: "s-a", classId: "class-a1", campusId: "campus-a1" });
  assert.deepEqual(timelineInput?.online, []);
  assert.deepEqual(timelineInput?.papers, []);
});

test("a role other than a learner is still denied the learner's own timeline", async () => {
  const { myExamTimeline } = await import("../../src/lib/school-ai/exam-timeline-service");
  await assert.rejects(myExamTimeline({ role: "PARENT", schoolId: "school-a", userId: "u-parent" } as never), (error: { status?: number }) => error.status === 403);
});
