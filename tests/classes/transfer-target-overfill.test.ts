import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Cls = { id: string; schoolId: string; campusId: string; name: string; section: string | null; academicYear: number; capacity: number | null; status: string; archivedAt: Date | null };
type Stu = { id: string; schoolId: string; campusId: string; classId: string; fullName: string; rollNo: string; archivedAt: null; status: string };
let classes: Cls[] = [];
let students: Stu[] = [];
const pause = () => new Promise((r) => setTimeout(r, 5));

// Per-class mutex held until the owning transaction ends, as FOR UPDATE does in Postgres.
const locks = new Map<string, Promise<void>>();
async function acquire(id: string): Promise<() => void> {
  const previous = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  locks.set(id, previous.then(() => new Promise<void>((r) => (release = r))));
  await previous;
  return release;
}

const occupancy = (classId: string) => students.filter((s) => s.classId === classId && s.status === "active").length;

function fakeTx(held: Array<() => void>) {
  return {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("?").includes("FOR UPDATE")) for (const id of values.map(String)) held.push(await acquire(id));
      return [];
    },
    class: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => classes.find((c) => c.id === where.id)!,
      // SKAI-1454 (#909): the route re-reads the section inside the transaction, scoped to the caller's school.
      findFirst: async ({ where }: { where: { id: string; schoolId?: string } }) => classes.find((c) => c.id === where.id && (!where.schoolId || c.schoolId === where.schoolId)) ?? null,
      findFirstOrThrow: async ({ where }: { where: { id: string; schoolId?: string } }) => {
        const found = classes.find((c) => c.id === where.id && (!where.schoolId || c.schoolId === where.schoolId));
        if (!found) throw new Error("No Class found");
        return found;
      },
      update: async () => ({}),
    },
    student: {
      findMany: async ({ where }: { where: { classId: string } }) => students.filter((s) => s.classId === where.classId && s.status === "active").map((s) => ({ id: s.id })),
    },
    auditLog: { create: async () => ({}) },
  };
}

const fakePrisma = {
  class: {
    findFirst: async ({ where }: { where: { id: string; campusId?: string } }) => {
      const c = classes.find((x) => x.id === where.id && (where.campusId === undefined || x.campusId === where.campusId));
      return c ? { ...c } : null;
    },
  },
  student: {
    findMany: async ({ where }: { where: { classId: string } }) => students.filter((s) => s.classId === where.classId && s.status === "active").map((s) => ({ id: s.id, fullName: s.fullName, rollNo: s.rollNo })),
    count: async ({ where }: { where: { classId: string } }) => occupancy(where.classId),
  },
  studentEnrollment: { findFirst: async ({ where }: { where: { studentId: string } }) => ({ id: `en-${where.studentId}` }) },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const held: Array<() => void> = [];
    try { return await fn(fakeTx(held)); } finally { held.forEach((release) => release()); }
  },
};

mock.module("@/lib/school-ai/transaction", { namedExports: { retryDatabaseTransaction: async (fn: () => Promise<unknown>) => fn() } });
mock.module("next/server", { namedExports: { NextRequest: class {}, } });
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    errorResponse: (e: { message: string; status?: number }) => Response.json({ error: e.message }, { status: e.status ?? 500 }),
    requireAuthUser: async () => currentUser,
  },
});
mock.module("@/lib/api/teacher-assignments", { namedExports: { authorizeAssignment: async () => {} } });
mock.module("@/lib/students/enrollment", {
  namedExports: {
    assertRegistrar: async () => {},
    dateOnly: (v: unknown) => new Date(String(v ?? "2026-11-01T00:00:00Z")),
    enrollmentImpact: async () => ({ preserved: { attendance: 0, reports: 0, invoices: 0 } }),
    classSeats: async (db: { class: { findUniqueOrThrow: (a: unknown) => Promise<Cls> } }, target: { id: string; capacity: number | null }) => {
      await pause();
      return { capacity: target.capacity, occupied: occupancy(target.id), free: (target.capacity ?? 0) - occupancy(target.id) };
    },
    applyEnrollment: async (_tx: unknown, input: { studentId: string; targetClassId: string }) => {
      await pause();
      students.find((s) => s.id === input.studentId)!.classId = input.targetClassId;
      return {};
    },
  },
});

let currentUser = { userId: "reg-1", role: "REGISTRAR", schoolId: "school-a", campusId: "campus-a" } as never;
const loadRoute = () => import("@/app/api/classes/transfer/route");

function seed() {
  classes = [
    { id: "T", schoolId: "school-a", campusId: "campus-a", name: "Grade 5", section: "T", academicYear: 2026, capacity: 30, status: "ACTIVE", archivedAt: null },
    { id: "A", schoolId: "school-a", campusId: "campus-a", name: "Grade 5", section: "A", academicYear: 2026, capacity: 30, status: "ACTIVE", archivedAt: null },
    { id: "B", schoolId: "school-a", campusId: "campus-a", name: "Grade 5", section: "B", academicYear: 2026, capacity: 30, status: "ACTIVE", archivedAt: null },
    { id: "CB", schoolId: "school-a", campusId: "campus-b", name: "Grade 5", section: "T", academicYear: 2026, capacity: 30, status: "ACTIVE", archivedAt: null },
    { id: "AB", schoolId: "school-a", campusId: "campus-b", name: "Grade 5", section: "A", academicYear: 2026, capacity: 30, status: "ACTIVE", archivedAt: null },
    { id: "XT", schoolId: "school-b", campusId: "campus-x", name: "Grade 5", section: "T", academicYear: 2026, capacity: 30, status: "ACTIVE", archivedAt: null },
    { id: "XA", schoolId: "school-b", campusId: "campus-x", name: "Grade 5", section: "A", academicYear: 2026, capacity: 30, status: "ACTIVE", archivedAt: null },
  ];
  students = [];
  const add = (cls: string, schoolId: string, campusId: string, n: number, prefix: string) => {
    for (let i = 0; i < n; i++) students.push({ id: `${prefix}-${i}`, schoolId, campusId, classId: cls, fullName: `${prefix} ${i}`, rollNo: `${prefix}${i}`, archivedAt: null, status: "active" });
  };
  add("T", "school-a", "campus-a", 20, "t");
  add("A", "school-a", "campus-a", 6, "a");
  add("B", "school-a", "campus-a", 6, "b");
  add("CB", "school-a", "campus-b", 20, "cb");
  add("AB", "school-a", "campus-b", 3, "ab");
  add("XT", "school-b", "campus-x", 20, "xt");
  add("XA", "school-b", "campus-x", 3, "xa");
  currentUser = { userId: "reg-1", role: "REGISTRAR", schoolId: "school-a", campusId: "campus-a" } as never;
}

function post(body: Record<string, unknown>) {
  return { json: async () => body } as never;
}

async function transfer(from: string, to: string, user?: unknown) {
  if (user) currentUser = user as never;
  const { POST } = await loadRoute();
  return POST(post({ fromClassId: from, toClassId: to, action: "apply", effectiveDate: "2026-11-01" }));
}

test("two source sections transferring into one target at the same time: exactly one succeeds and the target is never overfilled", async () => {
  seed();
  const [a, b] = await Promise.all([transfer("A", "T"), transfer("B", "T")]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409], "one transfer succeeds and the other gets a deterministic 409");
  assert.ok(occupancy("T") <= 30, `target occupancy ${occupancy("T")} must not exceed capacity 30`);
  const loser = a.status === 409 ? a : b;
  const body = await loser.json();
  assert.match(body.error, /free seat|Preview again|nobody was moved/i);
});

test("a second transfer after the target has filled is refused with 409", async () => {
  seed();
  const first = await transfer("A", "T");
  assert.equal(first.status, 200);
  const second = await transfer("B", "T");
  assert.equal(second.status, 409);
  assert.equal(occupancy("T"), 26);
});

test("a transfer into another campus's section is not limited by this campus's target, and a campus registrar cannot touch it", async () => {
  seed();
  const campusA = await transfer("A", "T");
  assert.equal(campusA.status, 200);
  const campusB = await transfer("AB", "CB", { userId: "reg-cb", role: "REGISTRAR", schoolId: "school-a", campusId: "campus-b" });
  assert.equal(campusB.status, 200);
  assert.equal(occupancy("CB"), 23);
  const crossCampus = await transfer("AB", "CB", { userId: "reg-1", role: "REGISTRAR", schoolId: "school-a", campusId: "campus-a" });
  assert.equal(crossCampus.status, 404);
});

test("another school's section is not limited by this school's target, and this school's registrar cannot reach it", async () => {
  seed();
  const ownSchool = await transfer("A", "T");
  assert.equal(ownSchool.status, 200);
  const otherSchool = await transfer("XA", "XT", { userId: "reg-b", role: "REGISTRAR", schoolId: "school-b", campusId: "campus-x" });
  assert.equal(otherSchool.status, 200);
  const crossSchool = await transfer("A", "XT", { userId: "reg-1", role: "REGISTRAR", schoolId: "school-a", campusId: "campus-a" });
  assert.equal(crossSchool.status, 404);
});
