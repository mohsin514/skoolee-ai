import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/attendance/school-summary/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;
type Rec = { date: Date; classId: string | null; studentId: string; status: string };
const oneClass: Array<{ id: string; name: string; section: string | null; _count: { students: number } }> = [{ id: "class-a", name: "Year 1", section: "A", _count: { students: 1 } }];
function fixture(given?: Rec[], classes = oneClass) {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const previous = new Date(now); previous.setDate(now.getDate() - 2);
  const records = given ?? [now, previous].map((date) => ({ date, classId: "class-a", studentId: "pupil-a", status: "PRESENT" }));
  const db = {
    student: { count: async () => 1 },
    attendance: { findMany: async ({ where }: any) => records.filter((record) => record.date >= where.date.gte && record.date <= where.date.lte) },
    class: { findMany: async () => classes },
  };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/api/scope") return {
      requireAuthUser: async () => ({ role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" }),
      canManageOperations: () => true, resolveCampusId: async () => "campus-a",
      ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
      errorResponse: (error: any) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    };
    if (id === "@/lib/attendance") return { ruleRate: (rows: unknown[]) => rows.length ? 100 : 0 };
    if (id === "@/lib/attendance/rule") return { attendanceRuleFor: async () => ({}) };
    if (id === "@/lib/api/envelope") return require("../../src/lib/api/envelope");
    return require(id);
  });
  return (period: string) => mod.exports.GET(new Request(`http://qa.test/api/attendance/school-summary?period=${period}`));
}

test("class counts follow Today versus Week and use the attendance's historical class", async () => {
  const get = fixture();
  const today = await (await get("today")).json();
  const week = await (await get("week")).json();
  assert.equal(today.data.classBreakdown[0].present, 1);
  assert.equal(week.data.classBreakdown[0].present, 2);
  assert.equal(week.data.classBreakdown[0].percentage, 100);
  // SKAI-1537: unmarked counts pupil-days over the week's expected school days, so it depends on the
  // weekday the suite runs; one pupil, two marked days. Of those two days, count the ones that are school days.
  const markedSchoolDays = week.data.daysTracked;
  assert.equal(week.data.classBreakdown[0].unmarked, Math.max(0, week.data.schoolDays - markedSchoolDays));
  assert.equal(week.data.present, week.data.classBreakdown[0].present);
});

test("invalid attendance periods are rejected", async () => {
  assert.equal((await fixture()("unknown")).status, 400);
});

test("each class gets only its own rows; rows without a class count campus-wide only (SKAI-1870)", async () => {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const rec = (classId: string | null, studentId: string, status: string) => ({ date: now, classId, studentId, status });
  const records = [rec("class-a", "a1", "PRESENT"), rec("class-b", "b1", "ABSENT"), rec("class-b", "b2", "PRESENT"), rec(null, "x", "LEAVE")];
  const classes = ["class-a", "class-b", "class-c"].map((id) => ({ id, name: id, section: null, _count: { students: 2 } }));
  const body = await (await fixture(records, classes)("today")).json();
  assert.deepEqual(body.data.classBreakdown.map((c: any) => [c.classId, c.present, c.absent, c.leave, c.marked]), [
    ["class-a", 1, 0, 0, 1], ["class-b", 1, 1, 0, 2], ["class-c", 0, 0, 0, 0],
  ]);
  assert.equal(body.data.totalRecords, 4);
  assert.equal(body.data.leave, 1);
});
