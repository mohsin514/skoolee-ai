import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1713: activity notices resolve guardians through the shared communication policy.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

type Rel = { schoolId: string; studentId: string; guardianUserId: string; communication: boolean };
type Consent = { schoolId: string; studentId: string; guardianUserId: string; familyMessages: boolean; createdAt: Date };
const state = { deliveries: [] as { event: string; recipientIds: string[] }[], relationships: [] as Rel[], consents: [] as Consent[], audits: [] as { schoolId: string; campusId: string | null; tableName: string; recordId: string; userId: string; newValue: Record<string, unknown> }[] };

const prismaMock = {
  student: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string } }) =>
      state.relationships.some(r => r.studentId === where.id && r.schoolId === where.schoolId) ? { id: where.id, campusId: `campus-${where.schoolId}` } : null,
  },
  guardianRelationship: {
    findMany: async ({ where }: { where: { schoolId: string; studentId: string | { in: string[] } } }) =>
      state.relationships.filter(r => r.schoolId === where.schoolId && (typeof where.studentId === "string" ? r.studentId === where.studentId : where.studentId.in.includes(r.studentId)))
        .map(r => ({ studentId: r.studentId, email: null, phone: null, fullName: "QA-01 Guardian", guardianUserId: r.guardianUserId, accessVersions: [{ permissions: { communication: r.communication } }] })),
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
  auditLog: {
    create: async ({ data }: { data: { schoolId: string; campusId: string | null; tableName: string; recordId: string; userId: string; newValue: Record<string, unknown> } }) => {
      state.audits.push(data);
      return data;
    },
  },
};
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: prismaMock } });
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { deliverNotification: async (event: string, payload: { recipientIds: string[] }) => { state.deliveries.push({ event, recipientIds: payload.recipientIds }); } } });

const guardiansOf = async (schoolId: string, studentIds: string[]) => (await import("../../src/lib/activities/service")).guardiansOf(schoolId, studentIds);
const noticeFor = async (schoolId: string, studentIds: string[]) => (await import("../../src/lib/activities/service")).guardianNoticeRecipients(schoolId, studentIds);
const sendNotice = async (schoolId: string, campusId: string, userId: string, studentIds: string[], recordId: string) => {
  const { sendActivityNotice } = await import("../../src/lib/activities/offer-notice");
  return sendActivityNotice({ schoolId, campusId, userId, role: "ADMIN" } as never, "ACTIVITY_CANCELLED", studentIds, recordId, studentIds.length);
};

beforeEach(() => {
  state.consents = [];
  state.audits = [];
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

test("a withheld guardian is counted, not named, and the suppression is audited", async () => {
  assert.deepEqual(await noticeFor("qa-01-a", ["pupil-a"]), { recipients: ["guardian-a-ok"], withheld: 1 });
});

test("a missing or withdrawn consent is counted as withheld", async () => {
  state.consents.push({ schoolId: "qa-01-a", studentId: "pupil-a", guardianUserId: "guardian-a-ok", familyMessages: false, createdAt: new Date(1) });
  assert.deepEqual(await noticeFor("qa-01-a", ["pupil-a"]), { recipients: [], withheld: 2 });
});

test("the notice helper writes a counts-only audit row in the sending school and campus", async () => {
  const result = await sendNotice("qa-01-a", "campus-qa-01-a", "coordinator-a", ["pupil-a"], "activity-1");
  assert.deepEqual(result, { notified: 1, withheld: 1 });
  assert.deepEqual(state.deliveries, [{ event: "ACTIVITY_CANCELLED", recipientIds: ["guardian-a-ok"] }]);
  assert.equal(state.audits.length, 1);
  assert.deepEqual(state.audits[0], {
    schoolId: "qa-01-a", campusId: "campus-qa-01-a", tableName: "activity_notices", recordId: "activity-1", userId: "coordinator-a",
    newValue: { event: "ACTIVITY_CANCELLED", scope: 1, notified: 1, withheld: 1, reason: "communication_permission" },
  });
});

test("a notice with nothing withheld writes no suppression audit", async () => {
  state.relationships[1].communication = true;
  await sendNotice("qa-01-a", "campus-qa-01-a", "coordinator-a", ["pupil-a"], "activity-2");
  assert.equal(state.audits.length, 0);
});

test("a withheld count in school B does not appear in school A", async () => {
  await sendNotice("qa-01-b", "campus-qa-01-b", "coordinator-b", ["pupil-b"], "activity-3");
  assert.deepEqual(await noticeFor("qa-01-a", ["pupil-b"]), { recipients: [], withheld: 0 });
  assert.equal(state.audits.every(a => a.schoolId === "qa-01-b"), true);
});
