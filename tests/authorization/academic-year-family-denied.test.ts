import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

// SKAI-1768: GET /api/academic-year is a staff roster route; guardians and students get 403 and no class data.
type Row = { id: string; schoolId: string; campusId: string; name: string; academicYear: number; status: string; classTeacher: { fullName: string }; _count: { students: number } };
const rows: Row[] = [
  { id: "c-a", schoolId: "qa-01", campusId: "qa-01-main", name: "Grade 5", academicYear: 2026, status: "ACTIVE", classTeacher: { fullName: "Synthetic Teacher A" }, _count: { students: 24 } },
  { id: "c-b", schoolId: "qa-02", campusId: "qa-02-main", name: "Grade 6", academicYear: 2026, status: "ACTIVE", classTeacher: { fullName: "Synthetic Teacher B" }, _count: { students: 18 } },
];
let findManyCalls = 0;
let currentUser: { userId: string; schoolId: string; campusId: string; role: string };

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      class: {
        findMany: async ({ where }: { where: { campusId: string } }) => {
          findManyCalls++;
          return rows.filter((r) => r.campusId === where.campusId);
        },
      },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    // Mirrors src/lib/api/scope.ts assertStaffRole/isFamilyRole.
    assertStaffRole: (user: { role: string }) => {
      if (user.role === "STUDENT" || user.role === "PARENT") throw new ApiError("This data is not available to student or guardian accounts", 403);
    },
    canLeadAcademics: async () => false,
    canManageAcademics: () => false,
    canManageCampusOps: () => false,
    errorResponse: (error: unknown) => Response.json({ success: false, error: (error as Error).message }, { status: (error as ApiError).status ?? 500 }),
    requireAuthUser: async () => currentUser,
    resolveCampusId: async (user: { campusId: string }) => user.campusId,
  },
});
mock.module("@/lib/notifications/in-app", { namedExports: { notify: () => {} } });
mock.module("@/lib/academic/year-closure", { namedExports: { getYearClosureReport: async () => ({}) } });
mock.module("@/lib/students/admission-number", { namedExports: { admissionNumberAllocator: async () => () => "" } });
mock.module("@/lib/students/enrollment", { namedExports: { applyEnrollment: async () => {}, dateOnly: (s: string) => s } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async () => {} } });

const req = { nextUrl: new URL("http://localhost/api/academic-year") } as never;
const load = () => import("../../src/app/api/academic-year/route");

test("campus staff still list their campus classes", async () => {
  currentUser = { userId: "u-admin", schoolId: "qa-01", campusId: "qa-01-main", role: "ADMIN" };
  const res = await (await load()).GET(req);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.data[0].classes.map((c: Row) => c.id), ["c-a"]);
});

for (const role of ["PARENT", "STUDENT"]) {
  test(`${role} is denied with 403 and never sees classes, teachers or counts`, async () => {
    currentUser = { userId: `u-${role}`, schoolId: "qa-01", campusId: "qa-01-main", role };
    const before = findManyCalls;
    const res = await (await load()).GET(req);
    assert.equal(res.status, 403);
    const text = await res.text();
    assert.doesNotMatch(text, /Synthetic Teacher|Grade 5|"students"/);
    assert.equal(findManyCalls, before, "no class query runs for a family account");
  });
}

test("two schools stay isolated: school B staff never see school A classes", async () => {
  currentUser = { userId: "u-admin-b", schoolId: "qa-02", campusId: "qa-02-main", role: "ADMIN" };
  const text = await (await (await load()).GET(req)).text();
  assert.match(text, /Synthetic Teacher B/);
  assert.doesNotMatch(text, /Synthetic Teacher A|c-a/);
});

test("the route gates families before resolving campus or querying classes", () => {
  const src = readFileSync("src/app/api/academic-year/route.ts", "utf8");
  const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
  assert.ok(get.indexOf("assertStaffRole(user)") > 0 && get.indexOf("assertStaffRole(user)") < get.indexOf("resolveCampusId("));
});
