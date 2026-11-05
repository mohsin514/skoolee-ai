import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1250: saving consent is one read-committed transaction with a fixed, short query sequence; the
// guardian check runs inside it (no separate pool round trip) and nothing about versioning, audit or
// tenant scope changes.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, unknown> & { schoolId: string; studentId: string; guardianUserId: string; createdAt: Date };
const h = { calls: [] as string[], txOptions: [] as unknown[], consents: [] as Row[], audits: [] as Record<string, unknown>[] };
const links = [
  { id: "rel-a", schoolId: "school-a", studentId: "stu-a", guardianUserId: "parent-a", fullName: "QA Guardian A", campusId: "campus-a" },
  { id: "rel-b", schoolId: "school-b", studentId: "stu-b", guardianUserId: "parent-b", fullName: "QA Guardian B", campusId: "campus-b" },
];
const pick = (where: Record<string, unknown>) => links.find(l => l.schoolId === where.schoolId && l.studentId === where.studentId && l.guardianUserId === where.guardianUserId) ?? null;
const relationship = (label: string) => ({ findFirst: async ({ where }: { where: Record<string, unknown> }) => { h.calls.push(`${label}:guardianRelationship.findFirst`); return pick({ ...where, schoolId: where.schoolId ?? (where.AND as never)?.[0] }); } });
const tx = {
  $executeRaw: async () => { h.calls.push("tx:advisoryLock"); return 0; },
  guardianRelationship: relationship("tx"),
  guardianConsent: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => { h.calls.push("tx:guardianConsent.findFirst"); return h.consents.filter(r => r.schoolId === where.schoolId && r.studentId === where.studentId && r.guardianUserId === where.guardianUserId).at(-1) ?? null; },
    create: async ({ data }: { data: Row }) => { h.calls.push("tx:guardianConsent.create"); const row = { ...data, id: `c${h.consents.length + 1}`, createdAt: new Date() }; h.consents.push(row); return row; },
  },
  auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { h.calls.push("tx:auditLog.create"); h.audits.push(data); } },
};
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: { guardianRelationship: relationship("pool") } } });
mock.module(src("lib/parent/guardian-query.ts"), { namedExports: { guardianRelationshipAuthorityWhere: (userId: string, _at: Date, schoolId: string) => ({ guardianUserId: userId, schoolId }) } });
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_u: unknown, work: (t: unknown) => unknown, options?: unknown) => { h.calls.push("begin"); h.txOptions.push(options); return work(tx); } } });

const svc = () => import("../../src/lib/family/guardian-consent");
const user = (schoolId: string, userId: string, role = "PARENT") => ({ userId, role, schoolId, campusId: null, email: "qa@example.test" }) as never;
const choices = { schoolRecords: true, familyMessages: false, photosMedia: true, aiAssistance: false, crossBorderHosting: true };
beforeEach(() => { h.calls = []; h.txOptions = []; h.consents = []; h.audits = []; });

test("a save is one read-committed transaction with a pinned query sequence and no pool round trip", async () => {
  const { recordGuardianConsent, CONSENT_NOTICE_VERSION } = await svc();
  await recordGuardianConsent(user("school-a", "parent-a"), { studentId: "stu-a", choices, noticeVersion: CONSENT_NOTICE_VERSION, language: "en" });
  assert.deepEqual(h.calls, ["begin", "tx:guardianRelationship.findFirst", "tx:advisoryLock", "tx:guardianConsent.findFirst", "tx:guardianConsent.create", "tx:auditLog.create"]);
  assert.deepEqual(h.txOptions, [{ isolationLevel: "ReadCommitted" }]);
});

test("a replay returns the same receipt without a second row or audit; a stale notice is a 409 before any query", async () => {
  const { recordGuardianConsent, CONSENT_NOTICE_VERSION } = await svc();
  const body = { studentId: "stu-a", choices, noticeVersion: CONSENT_NOTICE_VERSION, language: "ar" };
  const first = await recordGuardianConsent(user("school-a", "parent-a"), body);
  const again = await recordGuardianConsent(user("school-a", "parent-a"), body);
  assert.equal(again.receiptCode, first.receiptCode); assert.equal(h.consents.length, 1); assert.equal(h.audits.length, 1);
  assert.equal((h.audits[0].newValue as Record<string, unknown>).noticeVersion, CONSENT_NOTICE_VERSION);
  h.calls = [];
  await assert.rejects(recordGuardianConsent(user("school-a", "parent-a"), { ...body, noticeVersion: "2025-01-v0" }), (e: { status: number }) => e.status === 409);
  assert.deepEqual(h.calls, []);
});

test("two schools stay isolated and staff never open a transaction", async () => {
  const { recordGuardianConsent, CONSENT_NOTICE_VERSION } = await svc();
  const body = (studentId: string) => ({ studentId, choices, noticeVersion: CONSENT_NOTICE_VERSION, language: "en" });
  await assert.rejects(recordGuardianConsent(user("school-b", "parent-b"), body("stu-a")), (e: { status: number }) => e.status === 404);
  await assert.rejects(recordGuardianConsent(user("school-a", "parent-a"), body("stu-b")), (e: { status: number }) => e.status === 404);
  assert.equal(h.consents.length, 0);
  await recordGuardianConsent(user("school-b", "parent-b"), body("stu-b"));
  assert.deepEqual(h.consents.map(r => r.schoolId), ["school-b"]); assert.equal(h.audits[0].schoolId, "school-b");
  h.calls = [];
  await assert.rejects(recordGuardianConsent(user("school-a", "parent-a", "CAMPUS_ADMIN"), body("stu-a")), (e: { status: number }) => e.status === 404);
  assert.deepEqual(h.calls, []);
});
