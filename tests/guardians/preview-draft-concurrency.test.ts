import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1686: concurrent or retried previews for a new guardian email leave one DRAFT relationship.
type Rel = { id: string; schoolId: string; studentId: string; email: string; status: string; createdByUserId: string; invitationExpiresAt: Date; fullName: string; accessVersions: never[] };
const rels: Rel[] = [];
const events: unknown[] = [];
const locks = new Map<string, Promise<void>>();
let current = { userId: "reg-1", schoolId: "school-a", campusId: "campus-a1", role: "CAMPUS_ADMIN" };
const queue: Array<typeof current> = [];
const students = [{ id: "kid-a", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Pupil A" }, { id: "kid-b", schoolId: "school-b", campusId: "campus-b1", fullName: "QA Pupil B" }];

const matches = (r: Rel, w: Record<string, unknown>) => r.schoolId === w.schoolId && r.studentId === w.studentId && r.email.toLowerCase() === String((w.email as { equals: string }).equals).toLowerCase()
  && (w.status === "DRAFT" ? r.status === "DRAFT" && r.createdByUserId === w.createdByUserId && r.invitationExpiresAt > (w.invitationExpiresAt as { gt: Date }).gt : r.status !== "REVOKED");
const relModel = {
  findFirst: async ({ where }: { where: Record<string, unknown> }) => rels.find((r) => matches(r, where)) ?? null,
  create: async ({ data }: { data: Omit<Rel, "accessVersions"> }) => { await new Promise((r) => setTimeout(r, 5)); const row = { ...data, accessVersions: [] as never[] }; rels.push(row); return row; },
};
const prisma = {
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => students.find((s) => s.id === where.id && s.schoolId === where.schoolId) ?? null },
  guardianRelationship: relModel,
  guardianAccessEvent: { create: async ({ data }: { data: { id: string } }) => { events.push(data); return { id: data.id }; } },
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
    let release = () => {};
    const tx = {
      guardianRelationship: relModel,
      $executeRaw: async (_s: TemplateStringsArray, key: string) => {
        while (locks.has(key)) await locks.get(key);
        locks.set(key, new Promise<void>((r) => { release = () => { locks.delete(key); r(); }; }));
      },
    };
    try { return await fn(tx); } finally { release(); }
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
    canManageAcademics: () => true,
    canManageCampusOps: (u: { role: string }) => ["CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN"].includes(u.role),
    errorResponse: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    requireAuthUser: async () => queue.shift() ?? current,
  },
});
mock.module("@/lib/auth/policy", { namedExports: { studentScope: (u: { schoolId: string }) => ({ schoolId: u.schoolId }) } });
mock.module("@/lib/permissions", { namedExports: { assertPermission: async () => {} } });
mock.module("@/lib/api/validate", { namedExports: { readJsonBody: async (r: { body: unknown }) => r.body } });

const perms = { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false, consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false } };
const body = { action: "preview", fullName: "QA Guardian One", email: "QA.Guardian@example.test", relationship: "mother", permissions: perms, reason: "Synthetic onboarding" };
const post = async (studentId = "kid-a") => {
  const { POST } = await import("../../src/app/api/students/[id]/guardians/route");
  const res = await POST({ body } as never, { params: Promise.resolve({ id: studentId }) });
  return { status: res.status, json: await res.json() as { relationshipId?: string } };
};
const reset = () => { rels.length = 0; events.length = 0; current = { userId: "reg-1", schoolId: "school-a", campusId: "campus-a1", role: "CAMPUS_ADMIN" }; };

test("an ordinary retry by the same registrar reuses the one draft", async () => {
  reset();
  const a = await post(), b = await post();
  assert.equal(a.status, 200);
  assert.equal(b.json.relationshipId, a.json.relationshipId);
  assert.equal(rels.length, 1);
});

test("two concurrent previews by the same registrar leave one draft", async () => {
  reset();
  const [a, b] = await Promise.all([post(), post()]);
  assert.equal(rels.length, 1);
  assert.equal(a.json.relationshipId, b.json.relationshipId);
});

test("two registrars previewing at once: one draft, the other gets 409", async () => {
  reset();
  queue.push(current, { ...current, userId: "reg-2" });
  const statuses = (await Promise.all([post(), post()])).map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal(rels.length, 1);
});

test("the same email in another school is its own draft", async () => {
  reset();
  await post();
  current = { userId: "reg-b", schoolId: "school-b", campusId: "campus-b1", role: "CAMPUS_ADMIN" };
  const b = await post("kid-b");
  assert.equal(b.status, 200);
  assert.equal(rels.length, 2);
  assert.equal(rels.filter((r) => r.schoolId === "school-b").length, 1);
});

test("a teacher is refused with 403", async () => {
  reset();
  current = { userId: "t1", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" };
  assert.equal((await post()).status, 403);
  assert.equal(rels.length, 0);
});
