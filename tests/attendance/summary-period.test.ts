import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/attendance/school-summary/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;
function fixture() {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const previous = new Date(now); previous.setDate(now.getDate() - 2);
  const records = [now, previous].map((date) => ({ date, classId: "class-a", studentId: "pupil-a", status: "PRESENT" }));
  const db = {
    student: { count: async () => 1 },
    attendance: { findMany: async ({ where }: any) => records.filter((record) => record.date >= where.date.gte && record.date <= where.date.lte) },
    class: { findMany: async () => [{ id: "class-a", name: "Year 1", section: "A", _count: { students: 1 } }] },
  };
  const module = { exports: {} as any };
  new Function("module", "exports", "require", code)(module, module.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/api/scope") return {
      requireAuthUser: async () => ({ role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" }),
      canManageOperations: () => true, resolveCampusId: async () => "campus-a",
      ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
      errorResponse: (error: any) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    };
    if (id === "@/lib/attendance") return { ruleRate: (rows: unknown[]) => rows.length ? 100 : 0 };
    if (id === "@/lib/attendance/rule") return { attendanceRuleFor: async () => ({}) };
    return require(id);
  });
  return (period: string) => module.exports.GET(new Request(`http://qa.test/api/attendance/school-summary?period=${period}`));
}

test("class counts follow Today versus Week and use the attendance's historical class", async () => {
  const get = fixture();
  const today = await (await get("today")).json();
  const week = await (await get("week")).json();
  assert.equal(today.classBreakdown[0].present, 1);
  assert.equal(week.classBreakdown[0].present, 2);
  assert.equal(week.classBreakdown[0].percentage, 100);
  assert.equal(week.classBreakdown[0].unmarked, 0);
  assert.equal(week.present, week.classBreakdown[0].present);
});

test("invalid attendance periods are rejected", async () => {
  assert.equal((await fixture()("unknown")).status, 400);
});
