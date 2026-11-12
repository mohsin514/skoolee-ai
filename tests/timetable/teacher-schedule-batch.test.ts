import assert from "node:assert/strict";
import test from "node:test";
import { campusTimetablesInForce, versionsFor } from "../../src/lib/timetable/versions";

// SKAI-1833: the teacher schedule reads every class's version in force in a fixed number of queries,
// whatever the timetable history, and only the newest academic year in force per class counts.
// Synthetic QA-01 style fixtures: two schools, two campuses in school A.
type Board = { id: string; schoolId: string; campusId: string; classId: string; academicYear: number; status: string };
type Version = { id: string; schoolId: string; timetableId: string; version: number; effectiveFrom: Date; slots: unknown };
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const lesson = (id: string) => [{ id, dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", slotType: "CLASS", subjectId: "s", subjectName: "Maths", teacherId: "t", teacherName: "T", roomId: null, roomNumber: null }];

const boards: Board[] = [];
const versions: Version[] = [];
const board = (id: string, schoolId: string, campusId: string, classId: string, academicYear: number, status = "PUBLISHED") => boards.push({ id, schoolId, campusId, classId, academicYear, status });
const version = (timetableId: string, n: number, from: string) => {
  const owner = boards.find(b => b.id === timetableId)!;
  versions.push({ id: `${timetableId}-v${n}`, schoolId: owner.schoolId, timetableId, version: n, effectiveFrom: d(from), slots: lesson(`${timetableId}-v${n}`) });
};

// School A, campus 1: class-1 has two past years, a current year with two terms, and a next year published early.
board("c1-2024", "school-a", "campus-1", "class-1", 2024); version("c1-2024", 1, "2024-04-01"); version("c1-2024", 2, "2024-09-01");
board("c1-2025", "school-a", "campus-1", "class-1", 2025); version("c1-2025", 1, "2025-04-01");
board("c1-2026-t1", "school-a", "campus-1", "class-1", 2026); version("c1-2026-t1", 1, "2026-04-01"); version("c1-2026-t1", 2, "2026-09-01"); version("c1-2026-t1", 3, "2026-12-01");
board("c1-2026-t2", "school-a", "campus-1", "class-1", 2026); version("c1-2026-t2", 1, "2026-10-01");
board("c1-2027", "school-a", "campus-1", "class-1", 2027); version("c1-2027", 1, "2027-04-01");
// class-2: only a draft this year, so last year's published board is still the one in force.
board("c2-2025", "school-a", "campus-1", "class-2", 2025); version("c2-2025", 1, "2025-04-01");
board("c2-2026", "school-a", "campus-1", "class-2", 2026, "DRAFT"); version("c2-2026", 1, "2026-04-01");
// class-3: published, but nothing in force yet.
board("c3-2026", "school-a", "campus-1", "class-3", 2026); version("c3-2026", 1, "2026-12-01");
// Another campus and another school, which must never appear.
board("c4-2026", "school-a", "campus-2", "class-4", 2026); version("c4-2026", 1, "2026-04-01");
board("b1-2026", "school-b", "campus-1", "class-1", 2026); version("b1-2026", 1, "2026-04-01");

type Where = Record<string, unknown> & { OR?: { timetableId: string; version: number }[] };
function makeDb(tenant: string) {
  const calls: string[] = [];
  // The tenant guard scopes every query to the request's school; a mismatched pin is denied.
  const guard = (where: Where) => { if (where.schoolId && where.schoolId !== tenant) throw new Error("tenant"); };
  const db = {
    timetable: {
      findMany: async ({ where }: { where: Where }) => {
        calls.push("timetable.findMany"); guard(where);
        return boards.filter(b => b.schoolId === tenant && b.campusId === where.campusId && b.status === where.status)
          .map(b => ({ id: b.id, academicYear: b.academicYear, class: { id: b.classId, name: b.classId, section: "A" } }));
      },
    },
    timetableVersion: {
      groupBy: async ({ where }: { where: Where & { timetableId: { in: string[] }; effectiveFrom: { lte: Date } } }) => {
        calls.push("timetableVersion.groupBy"); guard(where);
        const max = new Map<string, number>();
        for (const v of versions) if (v.schoolId === tenant && where.timetableId.in.includes(v.timetableId) && v.effectiveFrom <= where.effectiveFrom.lte) max.set(v.timetableId, Math.max(max.get(v.timetableId) ?? 0, v.version));
        return [...max].map(([timetableId, n]) => ({ timetableId, _max: { version: n } }));
      },
      findMany: async ({ where }: { where: Where & { timetableId?: string } }) => {
        calls.push("timetableVersion.findMany"); guard(where);
        if (where.timetableId) return versions.filter(v => v.schoolId === tenant && v.timetableId === where.timetableId).sort((a, b) => b.version - a.version);
        return versions.filter(v => v.schoolId === tenant && where.OR!.some(pair => pair.timetableId === v.timetableId && pair.version === v.version));
      },
    },
  };
  return { db, calls };
}

const pick = (rows: Awaited<ReturnType<typeof campusTimetablesInForce>>) => rows.map(row => `${row.board.id}@v${row.inForce.version}`).sort();

test("each class's newest year in force, every term of that year, at the version in force today", async () => {
  const { db, calls } = makeDb("school-a");
  const rows = await campusTimetablesInForce("school-a", "campus-1", "2026-11-13", db as never);
  assert.deepEqual(pick(rows), ["c1-2026-t1@v2", "c1-2026-t2@v1", "c2-2025@v1"]);
  assert.deepEqual(calls, ["timetable.findMany", "timetableVersion.groupBy", "timetableVersion.findMany"]);
  // The slots come from the in-force version only.
  assert.equal((rows.find(row => row.board.id === "c1-2026-t1")!.inForce.slots as { id: string }[])[0].id, "c1-2026-t1-v2");
});

test("the batched pick matches the per-board version in force for the boards it keeps", async () => {
  const { db } = makeDb("school-a");
  for (const row of await campusTimetablesInForce("school-a", "campus-1", "2026-11-13", db as never)) {
    const { inForce } = await versionsFor(row.board.id, "2026-11-13", db as never);
    assert.equal(row.inForce.version, inForce!.version);
  }
});

test("the query count does not grow with timetable history", async () => {
  for (let year = 2000; year < 2024; year++) { board(`old-${year}`, "school-a", "campus-1", "class-1", year); version(`old-${year}`, 1, `${year}-04-01`); }
  const { db, calls } = makeDb("school-a");
  const rows = await campusTimetablesInForce("school-a", "campus-1", "2026-11-13", db as never);
  assert.equal(calls.length, 3);
  assert.ok(rows.every(row => !row.board.id.startsWith("old-")));
});

test("once next year's version is in force, it replaces the current year", async () => {
  const { db } = makeDb("school-a");
  assert.deepEqual(pick(await campusTimetablesInForce("school-a", "campus-1", "2027-04-02", db as never)), ["c1-2027@v1", "c2-2025@v1", "c3-2026@v1"]);
});

test("other campuses and other schools never contribute", async () => {
  const a2 = makeDb("school-a");
  assert.deepEqual(pick(await campusTimetablesInForce("school-a", "campus-2", "2026-11-13", a2.db as never)), ["c4-2026@v1"]);
  const b = makeDb("school-b");
  assert.deepEqual(pick(await campusTimetablesInForce("school-b", "campus-1", "2026-11-13", b.db as never)), ["b1-2026@v1"]);
  // A request pinned to another school is denied by the guard rather than widened.
  await assert.rejects(campusTimetablesInForce("school-a", "campus-1", "2026-11-13", b.db as never), /tenant/);
});

test("a campus with nothing published or nothing in force reads no versions' slots", async () => {
  const { db, calls } = makeDb("school-a");
  assert.deepEqual(await campusTimetablesInForce("school-a", "campus-9", "2026-11-13", db as never), []);
  assert.deepEqual(calls, ["timetable.findMany"]);
  const early = makeDb("school-a");
  assert.deepEqual(await campusTimetablesInForce("school-a", "campus-1", "2000-01-01", early.db as never), []);
  assert.deepEqual(early.calls, ["timetable.findMany", "timetableVersion.groupBy"]);
});
