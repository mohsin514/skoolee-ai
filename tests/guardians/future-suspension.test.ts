import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1498: a suspension/revocation cannot be scheduled for later; a future date is refused, not applied early.
type Rel = { id: string; schoolId: string; studentId: string; email: string; status: string; createdByUserId: string; invitationExpiresAt: Date; fullName: string; accessVersions: never[] };
const rels: Rel[] = [];
const events: unknown[] = [];
const locks = new Map<string, Promise<void>>();
const current = { userId: "reg-1", schoolId: "school-a", campusId: "campus-a1", role: "CAMPUS_ADMIN" };
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
const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const post = async (status: string, effectiveFrom: string) => {
  const { POST } = await import("../../src/app/api/students/[id]/guardians/route");
  const body = { action: "preview", relationshipId: "rel-1", fullName: "QA Guardian One", email: "qa.guardian@example.test", relationship: "mother", permissions: perms, status, effectiveFrom, reason: "Synthetic schedule probe" };
  const res = await POST({ body } as never, { params: Promise.resolve({ id: "kid-a" }) });
  return { status: res.status, json: await res.json() as { error?: string } };
};

for (const status of ["SUSPENDED", "REVOKED"]) {
  test(`a future-dated ${status} is refused before anything is written`, async () => {
    rels.length = 0; events.length = 0;
    const res = await post(status, future);
    assert.equal(res.status, 400);
    assert.match(res.json.error ?? "", /immediately/);
    assert.equal(events.length, 0);
  });
}
