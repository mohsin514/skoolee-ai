import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1713: activity notices resolve guardians through the shared communication policy.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

type Rel = { schoolId: string; studentId: string; guardianUserId: string; communication: boolean };
type Consent = { schoolId: string; studentId: string; guardianUserId: string; familyMessages: boolean; createdAt: Date };
const state = { relationships: [] as Rel[], consents: [] as Consent[] };

const prismaMock = {
  student: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string } }) =>
      state.relationships.some(r => r.studentId === where.id && r.schoolId === where.schoolId) ? { id: where.id, campusId: `campus-${where.schoolId}` } : null,
  },
  guardianRelationship: {
    findMany: async ({ where }: { where: { schoolId: string; studentId: string } }) =>
      state.relationships.filter(r => r.schoolId === where.schoolId && r.studentId === where.studentId)
        .map(r => ({ email: null, phone: null, fullName: "QA-01 Guardian", guardianUserId: r.guardianUserId, accessVersions: [{ permissions: { communication: r.communication } }] })),
  },
  guardianConsent: {
    findMany: async ({ where }: { where: { schoolId: string; studentId: string; guardianUserId: { in: string[] } } }) => {
      const latest = new Map<string, { guardianUserId: string; choices: Record<string, boolean> }>();
      for (const row of [...state.consents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()))
        if (row.schoolId === where.schoolId && row.studentId === where.studentId && where.guardianUserId.in.includes(row.guardianUserId) && !latest.has(row.guardianUserId))
          latest.set(row.guardianUserId, { guardianUserId: row.guardianUserId, choices: { familyMessages: row.familyMessages } });
      return [...latest.values()];
    },
  },
  guardianChannelPreference: { findMany: async () => [] },
};
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: prismaMock } });

const guardiansOf = async (schoolId: string, studentIds: string[]) => (await import("../../src/lib/activities/service")).guardiansOf(schoolId, studentIds);

beforeEach(() => {
  state.consents = [];
  state.relationships = [
    { schoolId: "qa-01-a", studentId: "pupil-a", guardianUserId: "guardian-a-ok", communication: true },
    { schoolId: "qa-01-a", studentId: "pupil-a", guardianUserId: "guardian-a-denied", communication: false },
    { schoolId: "qa-01-b", studentId: "pupil-b", guardianUserId: "guardian-b-ok", communication: true },
  ];
});

test("a permitted guardian receives the activity notice; one without communication permission does not", async () => {
  assert.deepEqual(await guardiansOf("qa-01-a", ["pupil-a", "pupil-a"]), ["guardian-a-ok"]);
});

test("a guardian who withdrew familyMessages consent receives nothing", async () => {
  state.consents.push({ schoolId: "qa-01-a", studentId: "pupil-a", guardianUserId: "guardian-a-ok", familyMessages: false, createdAt: new Date(1) });
  assert.deepEqual(await guardiansOf("qa-01-a", ["pupil-a"]), []);
});

test("two schools stay isolated", async () => {
  assert.deepEqual(await guardiansOf("qa-01-a", ["pupil-b"]), []);
  assert.deepEqual(await guardiansOf("qa-01-b", ["pupil-a", "pupil-b"]), ["guardian-b-ok"]);
});

test("a delayed or retried notice re-checks permission at resolution time", async () => {
  assert.deepEqual(await guardiansOf("qa-01-b", ["pupil-b"]), ["guardian-b-ok"]);
  state.relationships[2].communication = false;
  assert.deepEqual(await guardiansOf("qa-01-b", ["pupil-b"]), []);
});
