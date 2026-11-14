import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1870: the campus-wide monthly summary is counted in Postgres (groupBy) instead of loading every row
// of the month. These tests check the output matches the old row-by-row arithmetic, and that the scope holds.

type Row = { schoolId: string; campusId: string; classId: string | null; studentId: string; status: string; date: Date };
const day = (d: number) => new Date(Date.UTC(2026, 10, d));
const rule = { version: 1, attended: ["PRESENT", "LATE", "LEAVE"], excluded: ["EXCUSED"] };
const students = new Map([["p1", "c1"], ["p2", "c1"], ["p3", "c2"], ["p4", "c2"], ["legacy", "c2"], ["moved", "c3"], ["b1", "cb"]]);
const statuses = ["PRESENT", "ABSENT", "LEAVE", "LATE", "EXCUSED", "ABSENT"];
const rows: Row[] = [];
for (let d = 2; d <= 27; d++) {
  ["p1", "p2", "p3", "p4"].forEach((s, i) => rows.push({ schoolId: "school-a", campusId: "campus-a", classId: students.get(s)!, studentId: s, status: statuses[(d + i * (i + 1)) % statuses.length], date: day(d) }));
  // A legacy row with no stored class falls back to the pupil's current class (c2).
  rows.push({ schoolId: "school-a", campusId: "campus-a", classId: null, studentId: "legacy", status: d % 3 ? "ABSENT" : "PRESENT", date: day(d) });
  // A pupil who moved to c3 keeps the c1 rows taken there.
  rows.push({ schoolId: "school-a", campusId: "campus-a", classId: "c1", studentId: "moved", status: "PRESENT", date: day(d) });
  // Another campus of the same school, another school, and a day outside the month must not count.
  rows.push({ schoolId: "school-a", campusId: "campus-a2", classId: "c1", studentId: "p1", status: "ABSENT", date: day(d) });
  rows.push({ schoolId: "school-b", campusId: "campus-a", classId: "c1", studentId: "b1", status: "ABSENT", date: day(d) });
}
rows.push({ schoolId: "school-a", campusId: "campus-a", classId: "c1", studentId: "p1", status: "ABSENT", date: new Date(Date.UTC(2026, 11, 1)) });

const calls: Array<{ op: string; args: any }> = [];
const inScope = (r: Row, where: any) => r.schoolId === where.schoolId && r.campusId === where.campusId && r.date >= where.date.gte && r.date <= where.date.lte;
let role = "ADMIN";
let allowed = true;

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      class: {
        findMany: async (args: any) => { calls.push({ op: "class.findMany", args }); return ["c1", "c2", "c3"].map((id) => ({ id, name: id, section: null, _count: { students: 2 } })); },
      },
      student: {
        findMany: async (args: any) => { calls.push({ op: "student.findMany", args }); return args.where.id.in.map((id: string) => ({ id, classId: students.get(id) ?? null })); },
      },
      attendance: {
        findMany: async (args: any) => { calls.push({ op: "attendance.findMany", args }); throw new Error("the campus summary must not load attendance rows"); },
        groupBy: async (args: any) => {
          calls.push({ op: "attendance.groupBy", args });
          const groups = new Map<string, any>();
          for (const r of rows.filter((row) => inScope(row, args.where))) {
            const key = args.by.map((k: keyof Row) => String(r[k])).join("|");
            const g = groups.get(key) ?? Object.fromEntries([...args.by.map((k: keyof Row) => [k, r[k]]), ["_count", 0]]);
            g._count++;
            groups.set(key, g);
          }
          return [...groups.values()];
        },
      },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ValidationError: class extends Error {},
    ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
    canMarkAttendance: () => allowed,
    errorResponse: (error: any) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    requireAuthUser: async () => ({ userId: "staff", schoolId: "school-a", campusId: "campus-a", role }),
    resolveCampusId: async () => "campus-a",
  },
});
mock.module("@/lib/attendance/rule", { namedExports: { attendanceRuleFor: async () => rule } });

/** The pre-SKAI-1870 arithmetic over loaded rows, kept here as the reference. */
function reference() {
  const all = rows.filter((r) => inScope(r, { schoolId: "school-a", campusId: "campus-a", date: { gte: day(1), lte: day(30) } }));
  const rate = (rs: Row[]) => {
    const counted = rs.filter((r) => !rule.excluded.includes(r.status));
    const attended = counted.filter((r) => rule.attended.includes(r.status)).length;
    return counted.length ? Math.round((attended / counted.length) * 1000) / 10 : 0;
  };
  const n = (rs: Row[], s: string) => rs.filter((r) => r.status === s).length;
  const classes = ["c1", "c2", "c3"].map((id) => {
    const rs = all.filter((r) => (r.classId ?? students.get(r.studentId)) === id);
    return { classId: id, className: id, studentCount: 2, present: n(rs, "PRESENT"), absent: n(rs, "ABSENT"), leave: n(rs, "LEAVE"), total: rs.length, percentage: rate(rs) };
  });
  const per = new Map<string, { present: number; total: number }>();
  for (const r of all) {
    const e = per.get(r.studentId) || { present: 0, total: 0 };
    if (rule.excluded.includes(r.status)) continue;
    e.total++;
    if (rule.attended.includes(r.status)) e.present++;
    per.set(r.studentId, e);
  }
  return {
    type: "campus", month: "2026-11", overallPercentage: rate(all),
    totalPresent: n(all, "PRESENT"), totalAbsent: n(all, "ABSENT"), totalLeave: n(all, "LEAVE"),
    totalRecords: all.length,
    atRiskCount: [...per.values()].filter((s) => s.total > 0 && (s.present / s.total) * 100 < 75).length,
    classes,
  };
}

const get = async () => {
  const { GET } = await import("../../src/app/api/attendance/monthly/route");
  return GET({ url: "http://x/api/attendance/monthly?month=2026-11" } as never);
};

test("the campus summary matches the row-by-row arithmetic without loading the rows", async () => {
  calls.length = 0;
  const body = await (await get()).json();
  assert.deepEqual(body.data, reference());
  assert.ok(body.data.atRiskCount > 0 && body.data.classes[1].total > 0, "the fixture exercises at-risk pupils and the legacy fallback");
  assert.equal(calls.filter((c) => c.op === "attendance.findMany").length, 0);
  const groupBy = calls.find((c) => c.op === "attendance.groupBy")!;
  assert.deepEqual(groupBy.args.where, { schoolId: "school-a", campusId: "campus-a", date: { gte: day(1), lte: day(30) } });
  // Only pupils with legacy rows are looked up, and that lookup stays inside the school.
  const lookup = calls.find((c) => c.op === "student.findMany")!;
  assert.deepEqual(lookup.args.where, { id: { in: ["legacy"] }, campus: { schoolId: "school-a" } });
});

test("SKAI-1926: each class counts its on-roll pupils only, inside the school and campus", async () => {
  calls.length = 0;
  await get();
  const { rosterStatusWhere } = await import("../../src/lib/students/roster-status");
  const classes = calls.find((c) => c.op === "class.findMany")!;
  assert.deepEqual(classes.args.where, { campusId: "campus-a", campus: { schoolId: "school-a" } });
  assert.deepEqual(classes.args.select._count, { select: { students: { where: rosterStatusWhere(false) } } });
});

test("a teacher without a class and a role that cannot mark attendance are refused", async () => {
  role = "TEACHER";
  assert.equal((await get()).status, 400);
  role = "ADMIN";
  allowed = false;
  assert.equal((await get()).status, 403);
  allowed = true;
});
