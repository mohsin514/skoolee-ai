import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1747: a learning-transfer case kept the campus it was created on, so after a pupil moved campus the
// receiving campus's staff could open it but saw and could pick only the old campus's curricula, and later
// audits were attributed to the old campus. The case now follows the learner's current campus.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type Row = Record<string, unknown> & { id: string; schoolId: string; campusId: string; studentId: string; destinationRecordId: string | null };
let students: { id: string; schoolId: string; campusId: string; classId: string; fullName: string; archivedAt: null }[] = [];
let cases: Row[] = [];
let audits: { campusId: string; recordId: string }[] = [];
const curricula = [
  { id: "cur-a", schoolId: "s1", campusId: "A", kind: "CURRICULUM", status: "APPROVED", title: "Campus A curriculum", version: 1 },
  { id: "cur-b", schoolId: "s1", campusId: "B", kind: "CURRICULUM", status: "APPROVED", title: "Campus B curriculum", version: 1 },
  { id: "cur-x", schoolId: "s2", campusId: "B", kind: "CURRICULUM", status: "APPROVED", title: "Other school", version: 1 },
];
const match = (o: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => v === undefined || o[k] === v);
const tx = {
  student: { findFirst: async ({ where }: { where: Record<string, unknown> }) => students.find(s => match(s, where)) ?? null },
  subject: { findFirst: async () => null }, class: { findFirst: async () => null },
  learningTransferCase: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => cases.find(c => match(c, where)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(cases.find(c => c.id === where.id)!, data),
  },
  learningTransferMapping: { findMany: async () => [] },
  schoolAiRecord: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => curricula.find(c => match(c, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => curricula.filter(c => match(c, where)),
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: tx } });
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  canManageAcademics: (u: { role: string }) => ["PRINCIPAL", "CAMPUS_ADMIN"].includes(u.role),
  canManageCampusOps: (u: { role: string }) => u.role === "CAMPUS_ADMIN",
} });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async (_t: unknown, _u: unknown, e: { campusId: string; recordId: string }) => { audits.push(e); } } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } });
mock.module("@/lib/learning/actions", { namedExports: { saveLearningAction: async () => ({}) } });
mock.module("@/lib/parent/guardian-query", { namedExports: { liveGuardianRelationshipWhere: () => ({}) } });

const staff = (campusId: string, schoolId = "s1", role = "CAMPUS_ADMIN") => ({ userId: "u", role, schoolId, campusId }) as never;
function reset(pupilCampus: string) {
  students = [{ id: "p1", schoolId: "s1", campusId: pupilCampus, classId: "c1", fullName: "QA-01 Pupil", archivedAt: null }];
  cases = [{ id: "case-1", schoolId: "s1", campusId: "A", studentId: "p1", destinationRecordId: "cur-a", destinationVersion: 1, version: 1, status: "MAPPING", consentScope: ["objectives"], evidence: { objectives: [] }, downloads: [], consentGrantedAt: new Date(), consentRevokedAt: null, consentExpiresAt: null }];
  audits = [];
}
const load = async () => (await import("../../src/lib/learning/transfer")).getTransfer;

test("after a move to Campus B the case follows the pupil: only Campus B curricula, old destination cleared, audit on B", async () => {
  reset("B");
  const view = await (await load())(staff("B"), "case-1");
  assert.deepEqual(view.curricula.map((c: { id: string }) => c.id), ["cur-b"]);
  assert.equal(view.destination, null);
  assert.equal(cases[0].campusId, "B");
  assert.deepEqual(audits.map(a => a.campusId), ["B"]);
});

test("a pupil who has not moved keeps the case, its destination and writes no audit", async () => {
  reset("A");
  const view = await (await load())(staff("A"), "case-1");
  assert.deepEqual(view.curricula.map((c: { id: string }) => c.id), ["cur-a"]);
  assert.equal(view.destination?.id, "cur-a");
  assert.equal(audits.length, 0);
});

test("old-campus staff and another school cannot open the moved case; nothing changes", async () => {
  reset("B");
  const getTransfer = await load();
  await assert.rejects(getTransfer(staff("A"), "case-1"), (e: ApiError) => e.status === 404);
  await assert.rejects(getTransfer(staff("B", "s2"), "case-1"), (e: ApiError) => e.status === 404);
  assert.equal(cases[0].campusId, "A");
  assert.equal(audits.length, 0);
});

test("a role without transfer access is denied before the case moves", async () => {
  reset("B");
  await assert.rejects((await load())(staff("B", "s1", "ACCOUNTANT"), "case-1"), (e: ApiError) => e.status === 403);
  assert.equal(cases[0].campusId, "A");
});
