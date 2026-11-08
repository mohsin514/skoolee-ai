import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1714: a guardian's pickup authorizations page past the newest 20 with a cursor; every page keeps
// school, child and guardian scope, and an older used authorization keeps its release time.
type Row = { id: string; schoolId: string; campusId: string; studentId: string; issuedById: string; recipientName: string; recipientRelation: string; idMethod: string; status: string; validFrom: Date; validUntil: Date };
const rows: Row[] = [];
const add = (school: string, campus: string, student: string, guardian: string, n: number) => {
  for (let i = 0; i < n; i++) rows.push({ id: `${student}-${guardian}-${String(i).padStart(2, "0")}`, schoolId: school, campusId: campus, studentId: student, issuedById: guardian, recipientName: `Collector ${i}`, recipientRelation: "Aunt", idMethod: "PHOTO_ID", status: i === 0 ? "USED" : "REVOKED", validFrom: new Date(Date.UTC(2026, 0, 1 + i, 14)), validUntil: new Date(Date.UTC(2026, 0, 1 + i, 16)) });
};
add("school-a", "campus-a1", "s-a", "g-s-a", 23); // one page of 20, then 3 older (oldest is USED)
add("school-a", "campus-a1", "s-a", "g2-s-a", 2); // other guardian of the same child
add("school-a", "campus-a2", "s-a2", "g-s-a2", 2); // same school, other campus and child
add("school-b", "campus-b1", "s-b", "g-s-b", 5); // other school

type Find = { where: { schoolId: string; studentId: string; issuedById: string }; take: number; skip?: number; cursor?: { id: string } };
const prisma = {
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => rows.some(r => r.studentId === where.id && r.schoolId === where.schoolId) ? { id: where.id, campusId: "c", fullName: "Synthetic Pupil" } : null },
  pickupAuthorization: {
    findMany: async ({ where, take, skip = 0, cursor }: Find) => {
      const scoped = rows.filter(r => r.schoolId === where.schoolId && r.studentId === where.studentId && r.issuedById === where.issuedById).sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime() || b.id.localeCompare(a.id));
      const start = cursor ? scoped.findIndex(r => r.id === cursor.id) : 0;
      if (start < 0) return [];
      return scoped.slice(start + skip, start + skip + take);
    },
  },
  pickupEvent: { findMany: async ({ where }: { where: { authorizationId: { in: string[] } } }) => where.authorizationId.in.filter(id => id.endsWith("-00")).map(id => ({ authorizationId: id, createdAt: new Date(Date.UTC(2026, 0, 1, 15)) })) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw new Error("unused"); } } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ timezone: "UTC" }) } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async ({ studentId, guardianUserId }: { studentId: string; guardianUserId: string }) => guardianUserId === `g-${studentId}` || guardianUserId === `g2-${studentId}` ? { id: "rel" } : null } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageCampusOps: () => false } });

const guardian = (school: string, id: string, role = "PARENT") => ({ userId: id, schoolId: school, campusId: null, role }) as never;

test("the first page holds the newest 20 and a cursor reaches every older authorization with its release", async () => {
  const { guardianPickups } = await import("../../src/lib/pickup/service");
  const first = await guardianPickups(guardian("school-a", "g-s-a"), "s-a");
  assert.equal(first.items.length, 20);
  assert.equal(first.items[0].id, "s-a-g-s-a-22");
  assert.ok(first.nextCursor);
  const older = await guardianPickups(guardian("school-a", "g-s-a"), "s-a", first.nextCursor);
  assert.deepEqual(older.items.map(i => i.id), ["s-a-g-s-a-02", "s-a-g-s-a-01", "s-a-g-s-a-00"]);
  assert.equal(older.nextCursor, null);
  assert.equal(older.items[2].status, "USED");
  assert.ok(older.items[2].releasedAt);
  assert.equal(new Set([...first.items, ...older.items].map(i => i.id)).size, 23);
});

test("pages never cross guardian, child or school, and other roles or unlinked guardians are denied", async () => {
  const { guardianPickups } = await import("../../src/lib/pickup/service");
  const other = await guardianPickups(guardian("school-a", "g2-s-a"), "s-a");
  assert.deepEqual(other.items.map(i => i.id), ["s-a-g2-s-a-01", "s-a-g2-s-a-00"]);
  assert.equal(other.nextCursor, null);
  // Another guardian's cursor gives nothing of theirs.
  assert.deepEqual((await guardianPickups(guardian("school-a", "g2-s-a"), "s-a", "s-a-g-s-a-05")).items, []);
  const campus2 = await guardianPickups(guardian("school-a", "g-s-a2"), "s-a2");
  assert.ok(campus2.items.every(i => i.id.startsWith("s-a2-")));
  await assert.rejects(guardianPickups(guardian("school-b", "g-s-a"), "s-a"), /not authorized/);
  await assert.rejects(guardianPickups(guardian("school-a", "g-s-b"), "s-a"), /not authorized/);
  await assert.rejects(guardianPickups(guardian("school-a", "g-s-a", "TEACHER"), "s-a"), /Only a guardian/);
});
