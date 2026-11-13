// SKAI-1262: link an applying child into an existing sibling family at enrolment.
import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Student = { id: string; schoolId: string; campusId: string; fullName: string; rollNo: string; guardianPhone: string | null; siblingGroupId: string | null; archivedAt: null; consolidatedIntoId: null; class: { name: string; section: string | null } };
let students: Student[] = [];
let app: Record<string, unknown>;
let seq = 0;
const definition = { identityKeys: [], fields: [{ key: "child", identity: "childName" }, { key: "phone", identity: "guardianPhone" }] };

function matches(s: Student, where: Record<string, unknown>) {
  if (where.schoolId && s.schoolId !== where.schoolId) return false;
  if (where.campusId && s.campusId !== where.campusId) return false;
  const phone = (where.guardianPhone as { contains?: string } | undefined)?.contains;
  if (phone && !s.guardianPhone?.includes(phone)) return false;
  return true;
}
const tx = {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => strings.join("?").includes("FOR UPDATE") ? [{ id: String(values[0]) }] : [],
  admissionApplication: {
    findUnique: async () => app,
    findMany: async () => [],
    findFirst: async () => null,
    update: async ({ data }: { data: Record<string, unknown> }) => ({ ...app, ...data }),
  },
  student: {
    findMany: async ({ where }: { where: Record<string, unknown> }) => students.filter(s => matches(s, where)),
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => students.find(s => s.id === where.id)!,
    updateMany: async ({ where, data }: { where: { id: string; siblingGroupId: null }; data: { siblingGroupId: string } }) => {
      const s = students.find(x => x.id === where.id && x.siblingGroupId === null);
      if (s) s.siblingGroupId = data.siblingGroupId;
      return { count: s ? 1 : 0 };
    },
    count: async () => 0,
    create: async ({ data }: { data: Partial<Student> }) => { const s = { id: `new-${++seq}`, class: { name: "1", section: null }, archivedAt: null, consolidatedIntoId: null, guardianPhone: null, siblingGroupId: null, ...data } as Student; students.push(s); return s; },
  },
  class: { findFirst: async () => ({ id: "class-1", name: "1", section: null, capacity: null }) },
  studentTimelineEvent: { create: async () => ({}) },
  admissionApplicationEvent: { create: async () => ({}) },
  admissionQuery: { updateMany: async () => ({}) },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: tx } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, assertModuleRead: async () => {}, assertPermission: async () => {}, assertStaffRole: () => {} } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: (u: { role: string }) => u.role !== "RECEPTIONIST" } });
mock.module("@/lib/db/tenant-context", { namedExports: { runUnscoped: async (_l: string, fn: () => unknown) => fn() } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx) } });
mock.module("@/lib/billing/entitlements", { namedExports: { assertPlanCapacity: async () => {} } });
mock.module("@/lib/notifications/actions", { namedExports: { resolveSourceActions: async () => {} } });
mock.module("@/lib/notifications/in-app", { namedExports: { deliverNotification: async () => {} } });

const user = { userId: "staff-1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" } as never;
const sib = (id: string, over: Partial<Student> = {}): Student => ({ id, schoolId: "school-a", campusId: "campus-a", fullName: "Bilal Khan", rollNo: "7", guardianPhone: "+923001234567", siblingGroupId: null, archivedAt: null, consolidatedIntoId: null, class: { name: "3", section: null }, ...over });
function reset() {
  seq = 0;
  app = { id: "app-1", schoolId: "school-a", campusId: "campus-a", reference: "REF-1", status: "ACCEPTED", convertedStudentId: null, identityKeys: [], answers: { child: "Ayesha Khan", phone: "03001234567" }, childName: "Ayesha Khan", intakeClassId: "class-1", enquiryId: null, version: 1, resumeKeyHash: "k", formVersion: { definition } };
  students = [
    sib("bilal"),
    sib("other-school", { schoolId: "school-b", campusId: "campus-x" }),
    sib("other-campus", { campusId: "campus-b" }),
  ];
}
const svc = () => import("@/lib/admissions/service");

test("enrolling with a listed sibling opens one family group for both children", async () => {
  reset();
  const { convertApplication } = await svc();
  const out = await convertApplication(user, "campus-a", { id: "app-1", rollNo: "10", siblingStudentId: "bilal" });
  const created = students.find(s => s.id === out.student.id)!;
  assert.ok(created.siblingGroupId);
  assert.equal(students.find(s => s.id === "bilal")!.siblingGroupId, created.siblingGroupId);
});

test("an existing family group is joined, not replaced", async () => {
  reset();
  students[0].siblingGroupId = "family-1";
  const { convertApplication } = await svc();
  const out = await convertApplication(user, "campus-a", { id: "app-1", rollNo: "10", siblingStudentId: "bilal" });
  assert.equal(students.find(s => s.id === out.student.id)!.siblingGroupId, "family-1");
});

test("a pupil from another school or campus cannot be linked as a sibling", async () => {
  for (const id of ["other-school", "other-campus"]) {
    reset();
    const { convertApplication } = await svc();
    await assert.rejects(() => convertApplication(user, "campus-a", { id: "app-1", rollNo: "10", siblingStudentId: id }), (e: { status?: number }) => e.status === 400);
    assert.equal(students.length, 3, "nothing created");
    assert.ok(students.every(s => s.siblingGroupId === null), "no group opened");
  }
});

test("without a sibling choice the new pupil stays ungrouped", async () => {
  reset();
  const { convertApplication } = await svc();
  const out = await convertApplication(user, "campus-a", { id: "app-1", rollNo: "10" });
  assert.equal(students.find(s => s.id === out.student.id)!.siblingGroupId ?? null, null);
  assert.equal(students[0].siblingGroupId, null);
});

test("a receptionist cannot enrol or link a sibling", async () => {
  reset();
  const { convertApplication } = await svc();
  const denied = { userId: "r-1", role: "RECEPTIONIST", schoolId: "school-a", campusId: "campus-a" } as never;
  await assert.rejects(() => convertApplication(denied, "campus-a", { id: "app-1", rollNo: "10", siblingStudentId: "bilal" }), (e: { status?: number }) => e.status === 403);
  assert.equal(students.length, 3);
  assert.equal(students[0].siblingGroupId, null);
});
