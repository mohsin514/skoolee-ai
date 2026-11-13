import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1471: two concurrent applies for one preview serialise under a relationship lock. The loser gets a clear 409
// (fresh preview required), never the overlap constraint's generic 500, and each school's relationships stay separate.
type Version = { id: string; permissions: unknown; effectiveFrom: Date; effectiveUntil: Date | null; relationshipId: string; reason: string };
type Rel = { id: string; schoolId: string; studentId: string; status: string; fullName: string; verifiedAt: Date | null; accessVersions: Version[] };
const perms = { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false, consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false } };
const origin = new Date("2026-01-01T00:00:00Z");
const rels: Rel[] = [];
const events: Array<{ id: string; action: string; relationshipId: string; schoolId: string; actorUserId: string; beforeState: unknown; afterState: unknown; reason: string; createdAt: Date }> = [];
const locks = new Map<string, Promise<void>>();
const students = [{ id: "kid-a", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Pupil A" }, { id: "kid-b", schoolId: "school-b", campusId: "campus-b1", fullName: "QA Pupil B" }];
let current = { userId: "adm-a", schoolId: "school-a", campusId: "campus-a1", role: "CAMPUS_ADMIN" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const versionOf = (relationshipId: string, rel: Rel) => rel.accessVersions.find((v) => v.relationshipId === relationshipId && !v.effectiveUntil) ?? null;
const stateOf = (rel: Rel) => {
  const cur = rel.accessVersions.find((v) => v.effectiveFrom <= new Date() && (!v.effectiveUntil || v.effectiveUntil > new Date())) ?? null;
  return { status: rel.status, currentVersionId: cur?.id ?? null, permissions: cur ? cur.permissions : null };
};

const relModel = {
  findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => {
    await sleep(5); // a real read yields; this is where the pre-fix race let both applies pass the stale check
    const rel = rels.find((r) => r.id === where.id && r.schoolId === where.schoolId);
    return rel ? { ...rel, accessVersions: [...rel.accessVersions].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()) } : null;
  },
  update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
    const rel = rels.find((r) => r.id === where.id)!;
    rel.status = data.status;
    return rel;
  },
};
const versionModel = {
  update: async ({ where, data }: { where: { id: string }; data: { effectiveUntil: Date } }) => {
    await sleep(5);
    for (const rel of rels) for (const v of rel.accessVersions) if (v.id === where.id) v.effectiveUntil = data.effectiveUntil;
    return {};
  },
  create: async ({ data }: { data: Version & { schoolId: string } }) => {
    await sleep(5);
    // The database exclusion constraint: an overlapping interval for the same relationship is rejected.
    const rel = rels.find((r) => r.id === data.relationshipId)!;
    const overlaps = rel.accessVersions.some((v) => (!v.effectiveUntil || v.effectiveUntil > data.effectiveFrom) && (!data.effectiveUntil || data.effectiveUntil > v.effectiveFrom));
    if (overlaps) throw new Error('Invalid `prisma.guardianAccessVersion.create()` invocation: exclusion constraint "guardian_access_versions_no_overlap" violated');
    rel.accessVersions.push({ ...data });
    return data;
  },
};
const eventModel = {
  findFirst: async ({ where }: { where: { id: string; relationshipId: string } }) => (await sleep(5), events.find((e) => e.id === where.id && e.relationshipId === where.relationshipId) ?? null),
  create: async ({ data }: { data: (typeof events)[number] }) => { events.push({ ...data, createdAt: new Date() }); return { id: data.id }; },
};
const txClient = {
  guardianRelationship: relModel,
  guardianAccessVersion: versionModel,
  guardianAccessEvent: eventModel,
};
const prisma = {
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => students.find((s) => s.id === where.id && s.schoolId === where.schoolId) ?? null },
  guardianRelationship: relModel,
  guardianAccessEvent: eventModel,
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
    let release = () => {};
    const tx = { ...txClient, $executeRaw: async (_s: TemplateStringsArray, key: string) => {
      while (locks.has(key)) await locks.get(key);
      locks.set(key, new Promise<void>((r) => { release = () => { locks.delete(key); r(); }; }));
    } };
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
    requireAuthUser: async () => current,
  },
});
mock.module("@/lib/auth/policy", { namedExports: { studentScope: (u: { schoolId: string }) => ({ schoolId: u.schoolId }) } });
mock.module("@/lib/permissions", { namedExports: { assertPermission: async () => {} } });
mock.module("@/lib/api/validate", { namedExports: { readJsonBody: async (r: { body: unknown }) => r.body } });

const reset = () => {
  rels.length = 0; events.length = 0; locks.clear();
  current = { userId: "adm-a", schoolId: "school-a", campusId: "campus-a1", role: "CAMPUS_ADMIN" };
  const v0: Version = { id: "ver-0", permissions: { ...perms, finances: false }, effectiveFrom: new Date(origin), effectiveUntil: null, relationshipId: "rel-a", reason: "seed" };
  rels.push({ id: "rel-a", schoolId: "school-a", studentId: "kid-a", status: "ACTIVE", fullName: "QA Guardian One", verifiedAt: origin, accessVersions: [v0] });
  rels.push({ id: "rel-b", schoolId: "school-b", studentId: "kid-b", status: "ACTIVE", fullName: "QA Guardian Two", verifiedAt: origin, accessVersions: [{ ...v0, id: "ver-b", relationshipId: "rel-b" }] });
};
const preview = (relationshipId: string, rel: Rel, id: string) => {
  events.push({ id, action: "CHANGE_PREVIEWED", relationshipId, schoolId: rel.schoolId, actorUserId: "adm-a", reason: "Synthetic permission change", createdAt: new Date(),
    beforeState: stateOf(rel),
    afterState: { status: "ACTIVE", permissions: { ...perms, finances: true }, effectiveFrom: new Date().toISOString(), validUntil: null } });
};
const apply = async (studentId: string, relationshipId: string, previewId: string) => {
  const { POST } = await import("../../src/app/api/students/[id]/guardians/route");
  const res = await POST({ body: { action: "apply", relationshipId, previewId } } as never, { params: Promise.resolve({ id: studentId }) });
  return { status: res.status, json: await res.json() as { success?: boolean; error?: string } };
};

test("two concurrent applies for one preview: one commits, the other gets a clear 409", async () => {
  reset();
  preview("rel-a", rels[0], "prev-1");
  const [first, second] = await Promise.all([apply("kid-a", "rel-a", "prev-1"), apply("kid-a", "rel-a", "prev-1")]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const loser = first.status === 409 ? first : second;
  assert.match(loser.json.error ?? "", /Access changed after the preview/);
  // Exactly one new permission version, and the intervals still do not overlap.
  const versions = rels[0].accessVersions;
  assert.equal(versions.length, 2);
  assert.equal(versions.filter((v) => !v.effectiveUntil).length, 1);
});

test("a repeated submit after success is a clear 409, not a second grant", async () => {
  reset();
  preview("rel-a", rels[0], "prev-2");
  assert.equal((await apply("kid-a", "rel-a", "prev-2")).status, 200);
  const again = await apply("kid-a", "rel-a", "prev-2");
  assert.equal(again.status, 409);
  assert.equal(rels[0].accessVersions.length, 2);
});

test("an overlap that slips past the lock is still mapped to 409, not 500", async () => {
  reset();
  preview("rel-a", rels[0], "prev-3");
  rels[0].accessVersions.push({ id: "ver-x", permissions: perms, effectiveFrom: new Date(origin.getTime() - 1), effectiveUntil: null, relationshipId: "rel-a", reason: "racing writer" });
  const result = await apply("kid-a", "rel-a", "prev-3");
  assert.equal(result.status, 409);
});

test("a campus admin of another school cannot apply against this child's relationship", async () => {
  reset();
  preview("rel-a", rels[0], "prev-4");
  current = { userId: "adm-b", schoolId: "school-b", campusId: "campus-b1", role: "CAMPUS_ADMIN" };
  const result = await apply("kid-a", "rel-a", "prev-4");
  assert.equal(result.status, 404);
  assert.equal(rels[0].accessVersions.length, 1);
});
