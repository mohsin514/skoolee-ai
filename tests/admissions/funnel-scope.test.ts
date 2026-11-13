// SKAI-1260: the funnel reads only the caller's school and campus, and family roles are refused.
import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Row = Record<string, unknown>;
const at = new Date("2026-03-01T09:00:00Z");
const enquiries: Row[] = [
  { id: "qa", schoolId: "school-a", campusId: "a1", source: "WEBSITE", createdAt: at, convertedStudentId: null },
  { id: "qa2", schoolId: "school-a", campusId: "a2", source: "WEBSITE", createdAt: at, convertedStudentId: null },
  { id: "qb", schoolId: "school-b", campusId: "b1", source: "WEBSITE", createdAt: at, convertedStudentId: null },
];
const applications: Row[] = [
  { id: "aa", schoolId: "school-a", campusId: "a1", status: "ENROLLED", createdAt: at, enquiryId: "qa", events: [] },
  { id: "aa2", schoolId: "school-a", campusId: "a2", status: "ENROLLED", createdAt: at, enquiryId: "qa2", events: [] },
  { id: "ab", schoolId: "school-b", campusId: "b1", status: "ENROLLED", createdAt: at, enquiryId: "qb", events: [] },
];
const scoped = (rows: Row[]) => ({ findMany: async ({ where }: { where: Row }) => rows.filter(row => row.schoolId === where.schoolId && row.campusId === where.campusId) });
mock.module("@/lib/db/prisma", { namedExports: { prisma: { admissionQuery: scoped(enquiries), admissionApplication: scoped(applications) } } });
class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  assertStaffRole: (user: Row) => { if (user.role === "PARENT" || user.role === "STUDENT") throw new ApiError("denied", 403); },
  assertModuleRead: async (user: Row) => { if (user.role === "PARENT" || user.role === "STUDENT") throw new ApiError("denied", 403); },
} });

const user = (schoolId: string, campusId: string, role = "CAMPUS_ADMIN") => ({ userId: `u-${schoolId}-${campusId}`, schoolId, campusId, role }) as never;

test("each school and campus sees only its own funnel", async () => {
  const { admissionsFunnel } = await import("@/lib/admissions/funnel");
  for (const [school, campus] of [["school-a", "a1"], ["school-a", "a2"], ["school-b", "b1"]]) {
    const funnel = await admissionsFunnel(user(school, campus), campus, 2026);
    assert.deepEqual(funnel.total, { enquiries: 1, applications: 1, offers: 1, enrolled: 1 }, `${school}/${campus}`);
  }
  const crossSchool = await admissionsFunnel(user("school-b", "b1"), "a1", 2026);
  assert.equal(crossSchool.total.enquiries, 0, "another school's campus id returns nothing");
});

test("family roles are refused", async () => {
  const { admissionsFunnel } = await import("@/lib/admissions/funnel");
  await assert.rejects(admissionsFunnel(user("school-a", "a1", "PARENT"), "a1", 2026), /denied/);
});
