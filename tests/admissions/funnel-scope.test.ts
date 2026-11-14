// SKAI-1260: the funnel reads only the caller's school and campus, and family roles are refused.
import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Row = Record<string, unknown>;
const at = new Date("2026-03-01T09:00:00Z");
const enquiries: Row[] = [
  { id: "qa", schoolId: "school-a", campusId: "a1", source: "WEBSITE", createdAt: at, convertedStudentId: null },
  { id: "qa2", schoolId: "school-a", campusId: "a2", source: "WEBSITE", createdAt: at, convertedStudentId: null },
  { id: "qb", schoolId: "school-b", campusId: "b1", source: "WEBSITE", createdAt: at, convertedStudentId: null },
  // SKAI-1969: a 2025 referral whose application came in 2026, and a 2026 conversion whose application is dated 2027.
  { id: "qold", schoolId: "school-a", campusId: "a1", source: "REFERRAL", createdAt: new Date("2025-11-01T09:00:00Z"), convertedStudentId: null },
  { id: "qconv", schoolId: "school-a", campusId: "a1", source: "PHONE", createdAt: new Date("2026-12-30T09:00:00Z"), convertedStudentId: "s-conv" },
];
const applications: Row[] = [
  { id: "aa", schoolId: "school-a", campusId: "a1", status: "ENROLLED", createdAt: at, enquiryId: "qa", events: [] },
  { id: "aa2", schoolId: "school-a", campusId: "a2", status: "ENROLLED", createdAt: at, enquiryId: "qa2", events: [] },
  { id: "ab", schoolId: "school-b", campusId: "b1", status: "ENROLLED", createdAt: at, enquiryId: "qb", events: [] },
  { id: "aold", schoolId: "school-a", campusId: "a1", status: "SUBMITTED", createdAt: new Date("2026-01-10T09:00:00Z"), enquiryId: "qold", events: [] },
  { id: "aconv", schoolId: "school-a", campusId: "a1", status: "SUBMITTED", createdAt: new Date("2027-01-02T09:00:00Z"), enquiryId: "qconv", events: [] },
];
const inRange = (value: unknown, range: unknown) => {
  if (!range || typeof range !== "object") return true;
  const { gte, lt } = range as { gte?: Date; lt?: Date };
  const at = value as Date;
  return (!gte || at >= gte) && (!lt || at < lt);
};
const matches = (row: Row, where: Row) => Object.entries(where).every(([key, condition]) => {
  if (key === "createdAt") return inRange(row.createdAt, condition);
  if (condition && typeof condition === "object" && "in" in condition) return (condition.in as unknown[]).includes(row[key]);
  if (condition && typeof condition === "object" && "not" in condition) return row[key] !== condition.not;
  return row[key] === condition;
});
const calls: Row[] = [];
const scoped = (rows: Row[]) => ({ findMany: async ({ where }: { where: Row }) => { calls.push(where); return rows.filter(row => matches(row, where)); } });
const years = (strings: TemplateStringsArray | { values?: unknown[] }) => {
  const [school, campus] = ((strings as { values?: unknown[] }).values ?? []) as string[];
  return [...enquiries, ...applications].filter(row => row.schoolId === school && row.campusId === campus && row.status !== "DRAFT").map(row => ({ year: (row.createdAt as Date).getUTCFullYear() }));
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: { admissionQuery: scoped(enquiries), admissionApplication: scoped(applications), $queryRaw: async (sql: never) => years(sql) } } });
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
    const expected = school === "school-a" && campus === "a1" ? { enquiries: 2, applications: 2, offers: 1, enrolled: 1 } : { enquiries: 1, applications: 1, offers: 1, enrolled: 1 };
    assert.deepEqual(funnel.total, expected, `${school}/${campus}`);
  }
  const crossSchool = await admissionsFunnel(user("school-b", "b1"), "a1", 2026);
  assert.equal(crossSchool.total.enquiries, 0, "another school's campus id returns nothing");
});

test("family roles are refused", async () => {
  const { admissionsFunnel } = await import("@/lib/admissions/funnel");
  await assert.rejects(admissionsFunnel(user("school-a", "a1", "PARENT"), "a1", 2026), /denied/);
});

test("one year's reads keep cross-year sources and links, and every read stays in school and campus", async () => {
  const { admissionsFunnel } = await import("@/lib/admissions/funnel");
  calls.length = 0;
  const funnel = await admissionsFunnel(user("school-a", "a1"), "a1", 2026);
  assert.deepEqual(funnel.bySource.find(row => row.source === "REFERRAL"), { source: "REFERRAL", enquiries: 0, applications: 1, offers: 0, enrolled: 0 }, "2026 application keeps its 2025 enquiry's source");
  assert.deepEqual(funnel.bySource.find(row => row.source === "PHONE"), { source: "PHONE", enquiries: 1, applications: 0, offers: 0, enrolled: 0 }, "2026 conversion with a 2027 application is not enrolled directly");
  assert.deepEqual(funnel.years, [2027, 2026, 2025]);
  assert.ok(calls.length >= 3);
  for (const where of calls) assert.deepEqual([where.schoolId, where.campusId], ["school-a", "a1"]);
});
