import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1873: /api/parent/data loads the PARENT permission matrix and the attendance rule together, then the
// capabilities, the student and the family fee totals together. The payload, school scope, module gating and the
// "Student not found" answer stay exactly as before; attendance now carries only the fields the summary reads.
let inFlight = 0, maxInFlight = 0;
const log: { name: string; schoolId?: string; args?: unknown }[] = [];
async function timed<T>(name: string, value: T, schoolId?: string, args?: unknown): Promise<T> {
  log.push({ name, schoolId, args }); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise(resolve => setTimeout(resolve, 15));
  inFlight--;
  return value;
}
const reset = () => { inFlight = 0; maxInFlight = 0; log.length = 0; };
const at = (d: string) => new Date(`${d}T00:00:00Z`);
const kid = {
  id: "kid-1", schoolId: "school-a", fullName: "Amal", rollNo: "7", gender: "F", profileImageUrl: null,
  class: { name: "5", section: "A", academicYear: 2026 },
  campus: { schoolId: "school-a", name: "North", city: "Lahore", phone: null, email: null, website: null, principalName: null, board: null, logoUrl: null, school: { name: "School A", logoUrl: null, phone: null, website: null, tagline: null, contactEmail: null, establishedYear: null } },
  reportCards: [{ id: "rc-1" }],
  attendance: [
    { date: at("2026-11-09"), status: "PRESENT", class: { academicYear: 2026 } },
    { date: at("2026-11-08"), status: "ABSENT", class: { academicYear: 2026 } },
    { date: at("2025-11-08"), status: "ABSENT", class: { academicYear: 2025 } },
  ],
  invoices: [],
};
let found: typeof kid | null = kid;
let matrixOn: Record<string, boolean> = { reports: true, attendance: true, fees: true, exams: true, timetable: true };
const relation = { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false };
let scopeSchool = "school-a";
const prisma = {
  student: {
    count: async () => 1,
    findUnique: (args: { where: { id: string } }) => timed("student", found, scopeSchool, args),
  },
  invoice: { groupBy: (args: { where: { schoolId: string } }) => timed("feeTotals", [{ currency: "PKR", _sum: { balanceDue: 500 }, _count: { _all: 1 } }], args.where.schoolId, args) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => null } });
mock.module("@/lib/api/scope", { namedExports: { errorResponse: (error: unknown) => Response.json({ error: String(error) }, { status: 500 }) } });
mock.module("@/lib/parent/resolve-child", { namedExports: { withParentScope: (_req: unknown, fn: (scope: unknown) => Promise<Response>) => fn({ studentId: "kid-1", children: [], permissions: relation, schoolId: scopeSchool }) } });
mock.module("@/lib/permissions", { namedExports: { loadPermissionMap: (schoolId: string, role: string) => timed("matrix", new Map(Object.entries(matrixOn).map(([k, v]) => [k, { canView: v }])), schoolId, role) } });
mock.module("@/lib/attendance/rule", { namedExports: { attendanceRuleFor: (schoolId: string) => timed("rule", { version: 2, attended: ["PRESENT", "LATE"], excluded: ["LEAVE"] }, schoolId) } });
mock.module("@/lib/navigation/capabilities", { namedExports: { capabilitiesFor: async () => ({}) } });
mock.module("@/lib/academic/report-versions", { namedExports: {
  publishedVersionsFor: (ids: string[], schoolId: string) => timed("versions", ids.map(id => ({ id })), schoolId),
  familyVersion: (v: { id: string }) => ({ id: v.id, versionId: `${v.id}-v1`, examId: "ex-1", examTitle: "Mid-term", term: "1", marks: [] }),
} });

const get = async () => {
  const { GET } = await import("@/app/api/parent/data/route");
  const req = { nextUrl: new URL("http://test/api/parent/data?token=link") } as never;
  const res = await GET(req);
  return { status: res.status, body: await res.json() };
};

test("SKAI-1873: the matrix and the attendance rule load together, then the student and fee totals together", async () => {
  reset(); scopeSchool = "school-a"; found = kid;
  const { status, body } = await get();
  assert.equal(status, 200);
  const started = (name: string) => log.findIndex(entry => entry.name === name);
  assert.ok(started("rule") < started("student") && started("matrix") < started("student"));
  assert.ok(maxInFlight >= 2);
  // Matrix + rule overlap, then student + fee totals overlap: four reads in two rounds, plus the report versions.
  assert.deepEqual(log.map(e => e.name), ["matrix", "rule", "feeTotals", "student", "versions"]);
  assert.ok(log.every(e => e.schoolId === "school-a"), "every read stays in the scope's school");
  const select = (log.find(e => e.name === "student")!.args as { include: { attendance: { select: unknown; take: number } } }).include.attendance;
  assert.deepEqual(select.select, { date: true, status: true, class: { select: { academicYear: true } } });
  assert.equal(select.take, 200);
  // The summary still uses this year only and the school's rule.
  assert.deepEqual([body.data.attendance.total, body.data.attendance.present, body.data.attendance.absent, body.data.attendance.rate], [2, 1, 1, 50]);
  assert.deepEqual(body.data.attendance.recent, [{ date: "2026-11-09", status: "PRESENT" }, { date: "2026-11-08", status: "ABSENT" }]);
  assert.deepEqual(body.data.feeTotals, [{ currency: "PKR", outstanding: 500, invoices: 1 }]);
  assert.equal(body.data.reportCards[0].versionId, "rc-1-v1");
});

test("SKAI-1873: another school's scope reads only that school, and a module turned off is neither read nor shown", async () => {
  reset(); scopeSchool = "school-b"; found = { ...kid, schoolId: "school-b" };
  matrixOn = { reports: false, attendance: false, fees: false, exams: false, timetable: false };
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.ok(log.every(e => e.schoolId === "school-b"));
  assert.deepEqual(log.map(e => e.name), ["matrix", "rule", "student"], "no fee totals or report versions when the modules are off");
  const include = (log.find(e => e.name === "student")!.args as { include: Record<string, unknown> }).include;
  assert.equal("attendance" in include || "invoices" in include || "reportCards" in include, false);
  assert.deepEqual([body.data.attendance.rate, body.data.feeTotals, body.data.reportCards], [null, [], []]);
  matrixOn = { reports: true, attendance: true, fees: true, exams: true, timetable: true };
});

test("SKAI-1873: a missing student is still 404, even with the fee totals already in flight", async () => {
  reset(); scopeSchool = "school-a"; found = null;
  const { status, body } = await get();
  assert.equal(status, 404);
  assert.equal(body.error, "Student not found");
  found = kid;
});
