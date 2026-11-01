import assert from "node:assert/strict";
import { mock, test } from "node:test";

type App = { id: string; schoolId: string; campusId: string; reference: string; status: string; convertedStudentId: string | null; identityKeys: string[]; answers: Record<string, string>; childName: string; intakeClassId: string | null; enquiryId: string | null; version: number; resumeKeyHash: string; duplicateDecision: unknown; formVersion: { definition: unknown }; convertedAt?: Date | null; convertedById?: string | null };
type Student = { id: string; schoolId: string; campusId: string; fullName: string; rollNo: string; admissionNo: string | null; dateOfBirth: Date | null; archivedAt: null; status: string; consolidatedIntoId: null; class: { name: string; section: string | null } };

let apps: App[] = [];
let students: Student[] = [];
let idSeq = 0;

const definition = {
  identityKeys: ["nameAndDob"],
  fields: [{ key: "child", identity: "childName" }, { key: "dob", identity: "dateOfBirth" }],
};

// Per-resource mutex, held until the owning transaction ends, as FOR UPDATE does in Postgres.
const locks = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>((r) => (release = r))));
  await previous;
  return release;
}

function fakeTx(held: Array<() => void>) {
  const pick = <T extends { schoolId: string; campusId?: string }>(rows: T[], where: { schoolId?: string; campusId?: string }) =>
    rows.filter((r) => (where.schoolId === undefined || r.schoolId === where.schoolId) && (where.campusId === undefined || r.campusId === where.campusId));
  return {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("FOR UPDATE")) held.push(await acquire(sql.includes("admission_applications") ? `app:${values[0]}` : `campus:${values[0]}`));
      if (sql.includes("FROM students")) return [];
      return sql.includes("FOR UPDATE") ? [{ id: String(values[0]) }] : [];
    },
    admissionApplication: {
      findUnique: async ({ where }: { where: { id: string } }) => apps.find((a) => a.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { convertedStudentId: string } }) => apps.find((a) => a.convertedStudentId === where.convertedStudentId) ?? null,
      findMany: async ({ where }: { where: { schoolId: string; id: { not: string }; identityKeys: { hasSome: string[] } } }) =>
        apps.filter((a) => a.schoolId === where.schoolId && a.id !== where.id.not && a.identityKeys.some((k) => where.identityKeys.hasSome.includes(k))).map((a) => ({ id: a.id, reference: a.reference, status: a.status, convertedStudentId: a.convertedStudentId, childName: a.childName, identityKeys: a.identityKeys, campusId: a.campusId, schoolId: a.schoolId })),
      update: async ({ where, data }: { where: { id: string }; data: Partial<App> & { version?: { increment: number } } }) => {
        const a = apps.find((x) => x.id === where.id)!;
        const { version, ...rest } = data;
        Object.assign(a, rest, version ? { version: a.version + version.increment } : {});
        return { ...a };
      },
    },
    student: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => students.find((s) => s.id === where.id)!,
      findMany: async ({ where }: { where: { schoolId: string; campusId: string } }) => pick(students, where),
      count: async () => 0,
      create: async ({ data }: { data: Partial<Student> & { schoolId: string; campusId: string } }) => {
        const s = { id: `stu-${++idSeq}`, class: { name: "Class 1", section: null }, archivedAt: null, status: "active", consolidatedIntoId: null, dateOfBirth: data.dateOfBirth ?? null, admissionNo: data.admissionNo ?? null, fullName: data.fullName!, rollNo: data.rollNo!, ...data } as Student;
        students.push(s);
        return s;
      },
    },
    class: { findFirst: async () => ({ id: "class-1", name: "Class 1", section: null, capacity: null }) },
    studentTimelineEvent: { create: async () => ({}) },
    admissionApplicationEvent: { create: async () => ({}) },
    admissionQuery: { updateMany: async () => ({}) },
  };
}

const fakePrisma = {
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const held: Array<() => void> = [];
    try { return await fn(fakeTx(held)); } finally { held.forEach((release) => release()); }
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400, public extra?: unknown) { super(m); Object.assign(this, { extra }); } }, assertModuleRead: async () => {}, assertPermission: async () => {}, assertStaffRole: () => {} } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: () => true } });
mock.module("@/lib/db/tenant-context", { namedExports: { runUnscoped: async (_l: string, fn: () => unknown) => fn() } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (tx: unknown) => Promise<unknown>) => fakePrisma.$transaction(fn) } });
mock.module("@/lib/billing/entitlements", { namedExports: { assertPlanCapacity: async () => {} } });
mock.module("@/lib/notifications/actions", { namedExports: { resolveSourceActions: async () => {} } });
mock.module("@/lib/notifications/in-app", { namedExports: { deliverNotification: async () => {} } });

const loadService = () => import("@/lib/admissions/service");
const user = (schoolId = "school-a") => ({ userId: "staff-1", role: "PRINCIPAL", schoolId, campusId: "campus-a" }) as never;
const isStatus = (code: number) => (e: { status?: number }) => e.status === code;

function seedApp(id: string, over: Partial<App> = {}): App {
  const app: App = { id, schoolId: "school-a", campusId: "campus-a", reference: `REF-${id}`, status: "ACCEPTED", convertedStudentId: null, identityKeys: ["nameAndDob:ayesha|2015-03-04"], answers: { child: "Ayesha Khan", dob: "2015-03-04" }, childName: "Ayesha Khan", intakeClassId: "class-1", enquiryId: null, version: 1, resumeKeyHash: "k", duplicateDecision: null, formVersion: { definition }, ...over };
  apps.push(app);
  return app;
}

function reset() {
  apps = []; students = []; locks.clear();
  seedApp("app-1");
  seedApp("app-2");
}

test("two simultaneous conversions of the same child create one pupil", async () => {
  reset();
  const { convertApplication } = await loadService();
  const results = await Promise.allSettled([
    convertApplication(user(), "campus-a", { id: "app-1", rollNo: "10", classId: "class-1" }),
    convertApplication(user(), "campus-a", { id: "app-2", rollNo: "11", classId: "class-1" }),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  assert.equal(students.length, 1, "exactly one Student row");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(isStatus(409)(rejected[0].reason), "the competing request gets a 409 asking it to link the existing pupil");
  assert.ok(!(rejected[0].reason as Error).message.includes("P2002"));
});

test("the competing request cannot link a pupil already linked to the first application, and creates nothing", async () => {
  reset();
  const { convertApplication } = await loadService();
  const first = await convertApplication(user(), "campus-a", { id: "app-1", rollNo: "10", classId: "class-1" });
  // converted_student_id is unique, so the pupil can serve one application only. The existing guard says so and tells staff to withdraw.
  await assert.rejects(
    () => convertApplication(user(), "campus-a", { id: "app-2", duplicate: { choice: "existing", studentId: first.student.id, reason: "Same child, same date of birth" } }),
    (e: { status?: number; message?: string }) => e.status === 409 && /already linked to application REF-app-1/.test(e.message ?? ""),
  );
  assert.equal(students.length, 1);
});

test("repeating a conversion replays the same pupil and creates nothing", async () => {
  reset();
  const { convertApplication } = await loadService();
  const first = await convertApplication(user(), "campus-a", { id: "app-1", rollNo: "10", classId: "class-1" });
  const again = await convertApplication(user(), "campus-a", { id: "app-1", rollNo: "10", classId: "class-1" });
  assert.equal(again.replayed, true);
  assert.equal(again.student.id, first.student.id);
  assert.equal(students.length, 1);
});

test("another school's accepted application for the same child does not match", async () => {
  reset();
  seedApp("app-b", { schoolId: "school-b", campusId: "campus-x" });
  const { convertApplication } = await loadService();
  const result = await convertApplication(user(), "campus-a", { id: "app-1", rollNo: "10", classId: "class-1" });
  assert.equal(result.replayed, false);
  assert.equal(students.length, 1);
});

test("a different campus has its own lock and can convert concurrently", async () => {
  reset();
  seedApp("app-c", { campusId: "campus-b" });
  const { convertApplication } = await loadService();
  const [a, c] = await Promise.all([
    convertApplication(user(), "campus-a", { id: "app-1", rollNo: "10", classId: "class-1" }),
    convertApplication({ ...(user() as object), campusId: "campus-b" } as never, "campus-b", { id: "app-c", rollNo: "10", classId: "class-1" }),
  ]);
  assert.equal(a.replayed, false);
  assert.equal(c.replayed, false);
  assert.equal(students.length, 2);
});
