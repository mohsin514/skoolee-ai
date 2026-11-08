import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-857: guardian relationship and per-child consent are re-checked whenever recipients are resolved.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

type Rel = { schoolId: string; studentId: string; guardianUserId: string; email: string; ended: boolean };
type Consent = { schoolId: string; studentId: string; guardianUserId: string; choices: Record<string, boolean>; createdAt: Date };
const state = { relationships: [] as Rel[], consents: [] as Consent[] };

class AccessDenied extends Error { status = 403; constructor(resource: string, action: string) { super(`${resource}:${action}`); } }
mock.module(src("lib/auth/policy.ts"), { namedExports: { AccessDenied } });
const prismaMock = {
  student: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string } }) =>
      state.relationships.some(r => r.studentId === where.id && r.schoolId === where.schoolId) ? { id: where.id, campusId: `campus-${where.schoolId}` } : null,
  },
  guardianRelationship: {
    findMany: async ({ where }: { where: { schoolId: string; studentId: string; guardianUserId: unknown } }) =>
      state.relationships.filter(r => r.schoolId === where.schoolId && r.studentId === where.studentId && !r.ended
        && (typeof where.guardianUserId !== "string" || r.guardianUserId === where.guardianUserId))
        .map(r => ({ email: r.email, phone: null, fullName: "QA-01 Guardian", guardianUserId: r.guardianUserId, accessVersions: [{ permissions: { communication: true, learningRecords: true } }] })),
  },
  guardianConsent: {
    findMany: async ({ where }: { where: { schoolId: string; studentId: string; guardianUserId: { in: string[] } } }) => {
      const latest = new Map<string, Consent>();
      for (const row of [...state.consents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()))
        if (row.schoolId === where.schoolId && row.studentId === where.studentId && where.guardianUserId.in.includes(row.guardianUserId) && !latest.has(row.guardianUserId)) latest.set(row.guardianUserId, row);
      return [...latest.values()];
    },
  },
  guardianChannelPreference: { findMany: async () => [] },
  user: { findFirst: async () => null },
};
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: prismaMock } });

const policy = () => import("../../src/lib/auth/communication-policy");
const canDeliverToGuardian = async (...args: Parameters<Awaited<ReturnType<typeof policy>>["canDeliverToGuardian"]>) => (await policy()).canDeliverToGuardian(...args);
const assertCommunicationTarget = async (...args: Parameters<Awaited<ReturnType<typeof policy>>["assertCommunicationTarget"]>) => (await policy()).assertCommunicationTarget(...args);

const consent = (schoolId: string, familyMessages: boolean, at: number) =>
  state.consents.push({ schoolId, studentId: `pupil-${schoolId}`, guardianUserId: `guardian-${schoolId}`, choices: { familyMessages, schoolRecords: true }, createdAt: new Date(at) });

beforeEach(() => {
  state.consents = [];
  state.relationships = ["school-a", "school-b"].map(schoolId => ({ schoolId, studentId: `pupil-${schoolId}`, guardianUserId: `guardian-${schoolId}`, email: `${schoolId}@example.invalid`, ended: false }));
});

test("consent present: the guardian is sent to", async () => {
  consent("school-a", true, 1);
  assert.equal(await canDeliverToGuardian("school-a", "pupil-school-a", "guardian-school-a", "EMAIL"), true);
});

test("consent withdrawn: the latest answer wins and nothing is sent", async () => {
  consent("school-a", true, 1); consent("school-a", false, 2);
  assert.equal(await canDeliverToGuardian("school-a", "pupil-school-a", "guardian-school-a", "EMAIL"), false);
  await assert.rejects(assertCommunicationTarget({ schoolId: "school-a", studentId: "pupil-school-a", parentUserId: "guardian-school-a" }, "EMAIL"), { status: 403 });
});

test("relationship ended: nothing is sent even with consent", async () => {
  consent("school-a", true, 1);
  state.relationships[0].ended = true;
  assert.equal(await canDeliverToGuardian("school-a", "pupil-school-a", "guardian-school-a", "EMAIL"), false);
});

test("two schools are isolated: a withdrawal in one school does not affect the other, and ids never cross", async () => {
  consent("school-a", false, 1); consent("school-b", true, 1);
  assert.equal(await canDeliverToGuardian("school-a", "pupil-school-a", "guardian-school-a", "EMAIL"), false);
  assert.equal(await canDeliverToGuardian("school-b", "pupil-school-b", "guardian-school-b", "EMAIL"), true);
  assert.equal(await canDeliverToGuardian("school-a", "pupil-school-b", "guardian-school-b", "EMAIL"), false);
});

test("delayed job: allowed when queued, refused at send time after consent is withdrawn", async () => {
  const target = { schoolId: "school-a", studentId: "pupil-school-a", parentUserId: "guardian-school-a" };
  consent("school-a", true, 1);
  await assertCommunicationTarget(target, "EMAIL"); // queue time
  consent("school-a", false, 2);
  await assert.rejects(assertCommunicationTarget(target, "EMAIL"), { status: 403 }); // worker, before the provider call
});
