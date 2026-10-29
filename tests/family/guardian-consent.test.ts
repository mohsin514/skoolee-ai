import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1157: guardian consent records — who, when, which purposes and the language shown; tenant-scoped,
// audit-logged, only a verified guardian answers for themselves, only campus operators read the roster.
const root = join(__dirname, "..", "..");
const src = (path: string) => pathToFileURL(join(root, "src", path)).href;

type Row = Record<string, unknown> & { schoolId: string; studentId: string; guardianUserId: string; campusId: string; createdAt: Date };
const h = {
  links: [] as { id: string; schoolId: string; studentId: string; guardianUserId: string; fullName: string; campusId: string }[],
  consents: [] as Row[], audits: [] as Record<string, unknown>[], campuses: [] as { id: string; schoolId: string }[],
  students: [] as { id: string; schoolId: string; campusId: string; fullName: string; rollNo: string; class: { name: string; section: string | null } }[],
  wheres: [] as Record<string, unknown>[],
};
const matches = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => {
  if (!(k in row)) return true; // relation filters (guardian, student, status windows) are covered by guardian-query tests
  if (v && typeof v === "object" && "in" in (v as object)) return ((v as { in: unknown[] }).in).includes(row[k]);
  return typeof v === "object" ? true : row[k] === v;
});
const consentTable = {
  findMany: async ({ where }: { where: Record<string, unknown> }) => { h.wheres.push(where); return h.consents.filter(r => matches(r, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); },
  create: async ({ data }: { data: Row }) => { const row = { ...data, id: `c${h.consents.length + 1}`, createdAt: new Date(Date.now() + h.consents.length) }; h.consents.push(row); return row; },
};
const prisma = {
  guardianRelationship: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => h.links.find(l => matches(l, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => h.links.filter(l => matches(l, where)),
  },
  guardianConsent: consentTable,
  student: { findMany: async ({ where }: { where: Record<string, unknown> }) => { h.wheres.push(where); return h.students.filter(s => matches(s, where)); } },
  campus: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => h.campuses.find(c => c.id === where.id && c.schoolId === where.schoolId) ?? null },
};
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_u: unknown, work: (tx: unknown) => unknown) => work({ guardianConsent: consentTable, auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { h.audits.push(data); } } }) } });

const svc = () => import("../../src/lib/family/guardian-consent");
const user = (role: string, schoolId = "school-a", userId = "parent-1", campusId: string | null = "campus-a") => ({ userId, role, schoolId, campusId, email: "x@example.test" }) as never;
const allYes = { schoolRecords: true, familyMessages: true, photosMedia: false, aiAssistance: true, crossBorderHosting: false };

beforeEach(() => {
  h.consents = []; h.audits = []; h.wheres = [];
  h.campuses = [{ id: "campus-a", schoolId: "school-a" }, { id: "campus-b", schoolId: "school-a" }, { id: "campus-z", schoolId: "school-b" }];
  h.links = [
    { id: "rel-1", schoolId: "school-a", studentId: "stu-1", guardianUserId: "parent-1", fullName: "Guardian One", campusId: "campus-a" },
    { id: "rel-2", schoolId: "school-a", studentId: "stu-1", guardianUserId: "parent-2", fullName: "Guardian Two", campusId: "campus-a" },
    { id: "rel-9", schoolId: "school-b", studentId: "stu-9", guardianUserId: "parent-9", fullName: "Other School", campusId: "campus-z" },
  ];
  h.students = [
    { id: "stu-1", schoolId: "school-a", campusId: "campus-a", fullName: "Pupil One", rollNo: "1", class: { name: "Grade 1", section: "A" } },
    { id: "stu-2", schoolId: "school-a", campusId: "campus-a", fullName: "Pupil Two", rollNo: "2", class: { name: "Grade 1", section: "A" } },
    { id: "stu-3", schoolId: "school-a", campusId: "campus-b", fullName: "Other Campus", rollNo: "3", class: { name: "Grade 2", section: null } },
    { id: "stu-9", schoolId: "school-b", campusId: "campus-z", fullName: "Other School", rollNo: "9", class: { name: "Grade 1", section: null } },
  ];
});

test("rejects a stale notice version, a missing purpose and an unknown language", async () => {
  const { parseConsentBody, CONSENT_NOTICE_VERSION } = await svc();
  assert.throws(() => parseConsentBody({ studentId: "stu-1", choices: allYes, noticeVersion: "old", language: "en" }), (e: { status: number }) => e.status === 409);
  assert.throws(() => parseConsentBody({ studentId: "stu-1", choices: { ...allYes, aiAssistance: undefined }, noticeVersion: CONSENT_NOTICE_VERSION, language: "en" }), (e: { status: number }) => e.status === 400);
  assert.throws(() => parseConsentBody({ studentId: "stu-1", choices: allYes, noticeVersion: CONSENT_NOTICE_VERSION, language: "fr" }), (e: { status: number }) => e.status === 400);
});

test("a linked guardian's answer records who, every purpose, the language, and an audit event", async () => {
  const { recordGuardianConsent, CONSENT_NOTICE_VERSION } = await svc();
  const saved = await recordGuardianConsent(user("PARENT"), { studentId: "stu-1", choices: allYes, noticeVersion: CONSENT_NOTICE_VERSION, language: "ar" });
  assert.match(saved.receiptCode, /^GC-[0-9A-F]{8}$/);
  const [row] = h.consents;
  assert.equal(row.schoolId, "school-a"); assert.equal(row.campusId, "campus-a"); assert.equal(row.guardianUserId, "parent-1");
  assert.equal(row.relationshipId, "rel-1"); assert.equal(row.language, "ar"); assert.deepEqual(row.choices, allYes);
  const [audit] = h.audits as { tableName: string; recordId: string; schoolId: string; newValue: Record<string, unknown> }[];
  assert.equal(audit.tableName, "guardian_consents"); assert.equal(audit.recordId, row.id); assert.equal(audit.schoolId, "school-a");
  assert.equal(audit.newValue.action, "GRANT"); assert.equal(audit.newValue.language, "ar"); assert.equal(audit.newValue.photosMedia, false);
});

test("a guardian of another school, an unlinked guardian and staff roles cannot answer", async () => {
  const { recordGuardianConsent, CONSENT_NOTICE_VERSION } = await svc();
  const body = { studentId: "stu-1", choices: allYes, noticeVersion: CONSENT_NOTICE_VERSION, language: "en" };
  await assert.rejects(recordGuardianConsent(user("PARENT", "school-b", "parent-9"), body), (e: { status: number }) => e.status === 404);
  await assert.rejects(recordGuardianConsent(user("PARENT", "school-a", "parent-3"), body), (e: { status: number }) => e.status === 404);
  await assert.rejects(recordGuardianConsent(user("CAMPUS_ADMIN", "school-a", "parent-1"), body), (e: { status: number }) => e.status === 404);
  assert.equal(h.consents.length, 0); assert.equal(h.audits.length, 0);
});

test("the guardian view shows only their own answers and marks an older notice as out of date", async () => {
  const { guardianConsentView, recordGuardianConsent, CONSENT_NOTICE_VERSION } = await svc();
  assert.equal((await guardianConsentView(user("PARENT"), "stu-1")).state, "MISSING");
  await recordGuardianConsent(user("PARENT", "school-a", "parent-2"), { studentId: "stu-1", choices: allYes, noticeVersion: CONSENT_NOTICE_VERSION, language: "ur" });
  assert.equal((await guardianConsentView(user("PARENT"), "stu-1")).history.length, 0);
  h.consents.push({ id: "old", schoolId: "school-a", campusId: "campus-a", studentId: "stu-1", guardianUserId: "parent-1", guardianName: "Guardian One", choices: allYes, noticeVersion: "2025-01-v0", language: "en", receiptCode: "GC-OLD", createdAt: new Date(0) });
  const view = await guardianConsentView(user("PARENT"), "stu-1");
  assert.equal(view.state, "OUTDATED"); assert.equal(view.history.length, 1);
  assert.ok(h.wheres.every(w => w.schoolId === "school-a"));
});

test("campus status lists only this campus's pupils with each guardian's latest answer", async () => {
  const { campusConsentStatus, recordGuardianConsent, CONSENT_NOTICE_VERSION } = await svc();
  await recordGuardianConsent(user("PARENT"), { studentId: "stu-1", choices: allYes, noticeVersion: CONSENT_NOTICE_VERSION, language: "en" });
  const rows = await campusConsentStatus(user("CAMPUS_ADMIN", "school-a", "admin-1"), {});
  assert.deepEqual(rows.map(r => r.studentId), ["stu-1", "stu-2"]);
  assert.equal(rows[0].state, "PARTIAL");
  assert.deepEqual(rows[0].guardians.map(g => g.state), ["CURRENT", "MISSING"]);
  assert.equal(rows[0].guardians[0].consent?.language, "en");
  assert.equal(rows[1].state, "MISSING");
  assert.ok(h.wheres.every(w => w.schoolId === "school-a" && w.campusId === "campus-a"));
});

test("teachers, principals and parents cannot read the roster; a campus admin cannot pick another campus", async () => {
  const { campusConsentStatus } = await svc();
  for (const role of ["TEACHER", "PRINCIPAL", "PARENT"]) await assert.rejects(campusConsentStatus(user(role, "school-a", "u"), {}), (e: { status: number }) => e.status === 403);
  await assert.rejects(campusConsentStatus(user("CAMPUS_ADMIN", "school-a", "admin-1"), { campusId: "campus-b" }), (e: { status: number }) => e.status === 403);
  await assert.rejects(campusConsentStatus(user("SUPER_ADMIN", "school-a", "sa", null), { campusId: "campus-z" }), (e: { status: number }) => e.status === 403);
});
