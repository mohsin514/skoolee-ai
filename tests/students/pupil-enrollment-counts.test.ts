// SKAI-1967: readPupil counts each enrollment's sources per pupil (groupBy on enrollment ids) instead of a
// filtered relation _count, which Prisma evaluated over the whole campus's history.
import assert from "node:assert/strict";
import { mock, test } from "node:test";

type User = { userId: string; role: string; schoolId: string; campusId: string };
type Where = Record<string, unknown>;
const calls: { model: string; args: { by: string[]; where: Where } }[] = [];
let findArgs: { where: Where; select: Record<string, unknown> } | null = null;

// Two schools, two campuses; enr-x belongs to nobody we query.
const pupils = [
  { id: "stu-1", schoolId: "school-a", campusId: "campus-a", enrollments: [{ id: "enr-2" }, { id: "enr-1" }] },
  { id: "stu-2", schoolId: "school-a", campusId: "campus-b", enrollments: [{ id: "enr-3" }] },
  { id: "stu-3", schoolId: "school-b", campusId: "campus-c", enrollments: [{ id: "enr-4" }] },
];
const rows = {
  attendance: [{ enrollmentId: "enr-1" }, { enrollmentId: "enr-1" }, { enrollmentId: "enr-2" }, { enrollmentId: "enr-x" }],
  invoice: [{ enrollmentId: "enr-1" }],
  reportCard: [{ enrollmentId: "enr-2", published: true }, { enrollmentId: "enr-2", published: false }],
};

function groupBy(model: keyof typeof rows) {
  return async (args: { by: string[]; where: Where & { enrollmentId: { in: string[] } } }) => {
    calls.push({ model, args });
    const counts = new Map<string, number>();
    for (const r of rows[model] as { enrollmentId: string; published?: boolean }[]) {
      if (!args.where.enrollmentId.in.includes(r.enrollmentId)) continue;
      if (args.where.published === true && r.published !== true) continue;
      counts.set(r.enrollmentId, (counts.get(r.enrollmentId) ?? 0) + 1);
    }
    return [...counts].map(([enrollmentId, n]) => ({ enrollmentId, _count: { _all: n } }));
  };
}

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    assertPermission: async () => {}, canManageCampusOps: () => true,
  },
});
mock.module("@/lib/auth/policy", {
  namedExports: {
    isFamily: (u: User) => u.role === "PARENT",
    publishedReportsWhere: { published: true },
    studentScope: (u: User, field?: string) => ({ schoolId: u.schoolId, campusId: u.campusId, ...(field ? { field } : {}) }),
  },
});
mock.module("@/lib/auth/institution", { namedExports: { isInstitutionAuthority: () => false } });
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      student: {
        findFirst: async (args: { where: Where; select: Record<string, unknown> }) => {
          findArgs = args;
          const p = pupils.find((x) => x.id === args.where.id && x.schoolId === args.where.schoolId && x.campusId === args.where.campusId);
          return p ? { id: p.id, enrollments: p.enrollments.map((e) => ({ ...e })) } : null;
        },
      },
      attendance: { groupBy: groupBy("attendance") },
      invoice: { groupBy: groupBy("invoice") },
      reportCard: { groupBy: groupBy("reportCard") },
    },
  },
});

const load = () => import("@/lib/students/enrollment");
const staff: User = { userId: "u1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
const parent: User = { userId: "u2", role: "PARENT", schoolId: "school-a", campusId: "campus-a" };

test("staff counts every source per enrollment, with zero for missing groups", async () => {
  calls.length = 0;
  const { readPupil } = await load();
  const pupil = await readPupil(staff as never, "stu-1");
  assert.deepEqual(pupil.enrollments.map((e) => [e.id, e._count]), [
    ["enr-2", { attendance: 1, invoices: 0, reports: 2 }],
    ["enr-1", { attendance: 2, invoices: 1, reports: 0 }],
  ]);
  // No filtered relation _count left on the pupil query.
  assert.doesNotMatch(JSON.stringify(findArgs?.select), /_count/);
  assert.equal(calls.length, 3);
  for (const c of calls) {
    assert.deepEqual(c.args.by, ["enrollmentId"]);
    assert.deepEqual((c.args.where.enrollmentId as { in: string[] }).in, ["enr-2", "enr-1"]);
  }
  // Field-specific scope is kept on each count.
  assert.deepEqual(calls.find((c) => c.model === "attendance")?.args.where.student, { schoolId: "school-a", campusId: "campus-a", field: "attendance" });
  assert.deepEqual(calls.find((c) => c.model === "invoice")?.args.where.student, { schoolId: "school-a", campusId: "campus-a", field: "finances" });
  assert.deepEqual(calls.find((c) => c.model === "reportCard")?.args.where.student, { schoolId: "school-a", campusId: "campus-a", field: "learningRecords" });
});

test("family viewers count only published reports", async () => {
  calls.length = 0;
  const { readPupil } = await load();
  const pupil = await readPupil(parent as never, "stu-1");
  assert.equal(pupil.enrollments[0]._count.reports, 1);
  assert.equal(calls.find((c) => c.model === "reportCard")?.args.where.published, true);
  assert.equal(calls.find((c) => c.model === "attendance")?.args.where.published, undefined);
});

test("a pupil in another campus or school is 404 before any count runs", async () => {
  const { readPupil } = await load();
  for (const id of ["stu-2", "stu-3"]) {
    calls.length = 0;
    await assert.rejects(readPupil(staff as never, id), (e: Error & { status?: number }) => e.status === 404);
    assert.equal(calls.length, 0);
  }
});
