import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { auditHistoryScope, exportAuditHistory, listAuditHistory } from "../../src/lib/audit-history";
import { assertPermission } from "../../src/lib/permissions";
import { purgeExpiredExamIntegrity } from "../../src/lib/school-ai/exam-integrity-service";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only isolated PG55438.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });
const DAY = 86_400_000;

async function school() {
  const schoolId = `audit476-${randomUUID()}`, campuses = [randomUUID(), randomUUID(), randomUUID()];
  schoolIds.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic audit school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  for (const id of campuses) await db.campus.create({ data: { id, schoolId, name: `Campus ${id.slice(0, 4)}`, regId: id, city: "Synthetic" } });
  const person = async (role: AuthUser["role"], campusId: string | null): Promise<AuthUser> => {
    const userId = randomUUID(), email = `${userId}@example.invalid`;
    await db.user.create({ data: { id: userId, email, password: "x", fullName: `Synthetic ${role}`, role, schoolId, campusId, isActive: true, onboardingComplete: true } });
    return { userId, email, role, schoolId, campusId, accessVersion: 0 };
  };
  return { schoolId, campuses, owner: await person("SUPER_ADMIN", null), campusAdmin: await person("CAMPUS_ADMIN", campuses[0]), principal: await person("PRINCIPAL", campuses[1]), teacher: await person("TEACHER", campuses[0]) };
}
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, work);
const event = (schoolId: string, userId: string, campusId: string | null, extra: Record<string, unknown> = {}) =>
  db.auditLog.create({ data: { schoolId, campusId, userId, tableName: "students", recordId: randomUUID(), newValue: { status: "ACTIVE" }, ...extra } });

test("audit events written without a campus are stamped with the acting campus; school-wide actors stay school-wide", async () => {
  const s = await school();
  const stamped = await ctx(s.campusAdmin, () => prisma.auditLog.create({ data: { schoolId: s.schoolId, tableName: "classes", recordId: randomUUID(), userId: s.campusAdmin.userId, newValue: { status: "ACTIVE" } } }));
  assert.equal(stamped.campusId, s.campuses[0]);
  const explicit = await ctx(s.owner, () => prisma.auditLog.create({ data: { schoolId: s.schoolId, campusId: s.campuses[2], tableName: "classes", recordId: randomUUID(), userId: s.owner.userId } }));
  assert.equal(explicit.campusId, s.campuses[2], "a writer that knows the record's campus keeps it");
  const schoolWide = await ctx(s.owner, () => prisma.auditLog.create({ data: { schoolId: s.schoolId, tableName: "schools", recordId: s.schoolId, userId: s.owner.userId } }));
  assert.equal(schoolWide.campusId, null);
});

test("history is limited to the principal's current school and campus; forged scope and cursors are refused", async () => {
  const a = await school(), b = await school();
  const rows = { c0: await event(a.schoolId, a.owner.userId, a.campuses[0]), c1: await event(a.schoolId, a.owner.userId, a.campuses[1]), c2: await event(a.schoolId, a.owner.userId, a.campuses[2]), wide: await event(a.schoolId, a.owner.userId, null), other: await event(b.schoolId, b.owner.userId, b.campuses[0]) };
  const ids = async (user: AuthUser, filters: Record<string, unknown> = {}) => (await ctx(user, () => listAuditHistory(user, { limit: 100, ...filters }))).data.map(row => row.id).sort();
  assert.deepEqual(await ids(a.owner), [rows.c0.id, rows.c1.id, rows.c2.id, rows.wide.id].sort());
  assert.deepEqual(await ids(a.owner, { campusId: a.campuses[1] }), [rows.c1.id]);
  assert.deepEqual(await ids(a.campusAdmin), [rows.c0.id]);
  assert.deepEqual(await ids(a.principal), [rows.c1.id]);
  await assert.rejects(() => ctx(a.campusAdmin, () => listAuditHistory(a.campusAdmin, { campusId: a.campuses[1] })), { status: 403 });
  await assert.rejects(() => ctx(a.owner, () => listAuditHistory(a.owner, { campusId: b.campuses[0] })), { status: 403 });
  await assert.rejects(() => ctx(a.teacher, () => listAuditHistory(a.teacher, {})), { status: 403 });
  await assert.rejects(() => ctx(a.campusAdmin, () => listAuditHistory(a.campusAdmin, { cursor: rows.c1.id })), { status: 409 }, "another campus's row is not a usable cursor");
  await assert.rejects(() => ctx(a.campusAdmin, () => listAuditHistory(a.campusAdmin, { cursor: rows.other.id })), { status: 409 });
  // An old session after reassignment: scope follows the current principal, not stale filters.
  assert.deepEqual(await ids({ ...a.campusAdmin, campusId: a.campuses[2] }), [rows.c2.id]);
});

test("audit events are append-only; only retention-expired rows without an active hold may leave", async () => {
  const s = await school();
  const live = await event(s.schoolId, s.owner.userId, s.campuses[0], { retentionUntil: new Date(Date.now() + DAY) });
  const expired = await event(s.schoolId, s.owner.userId, s.campuses[0], { retentionUntil: new Date(Date.now() - DAY) });
  const held = await event(s.schoolId, s.owner.userId, s.campuses[0], { retentionUntil: new Date(Date.now() - DAY) });
  const lapsedHold = await event(s.schoolId, s.owner.userId, s.campuses[0], { retentionUntil: new Date(Date.now() - DAY) });
  await assert.rejects(() => db.auditLog.update({ where: { id: live.id }, data: { newValue: { status: "INACTIVE" } } }), /append-only/);
  await assert.rejects(() => db.auditLog.delete({ where: { id: live.id } }), /until their retention ends/);
  await assert.rejects(() => db.dataLegalHold.create({ data: { schoolId: s.schoolId, category: "AUDIT_LOG", recordId: held.id, reason: "No expiry", placedBy: s.owner.userId } }), /data_hold_audit_expiry/);
  await db.dataLegalHold.create({ data: { schoolId: s.schoolId, category: "AUDIT_LOG", recordId: held.id, reason: "Appeal pending", placedBy: s.owner.userId, expiresAt: new Date(Date.now() + 30 * DAY) } });
  await db.dataLegalHold.create({ data: { schoolId: s.schoolId, category: "AUDIT_LOG", recordId: lapsedHold.id, reason: "Closed appeal", placedBy: s.owner.userId, expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(() => db.auditLog.delete({ where: { id: held.id } }), /legal hold/);
  await db.auditLog.delete({ where: { id: expired.id } });
  await db.auditLog.delete({ where: { id: lapsedHold.id } });
  assert.equal(await db.auditLog.count({ where: { id: { in: [live.id, held.id] } } }), 2);
});

test("the integrity purge skips held audit copies instead of failing", async () => {
  const s = await school();
  const copy = (id: string) => db.auditLog.create({ data: { id, schoolId: s.schoolId, campusId: s.campuses[0], userId: s.owner.userId, tableName: "school_ai_exam_integrity_events", recordId: randomUUID(), retentionUntil: new Date(Date.now() - DAY), newValue: { decision: "NOTED" } } });
  const [keep, drop] = [randomUUID(), randomUUID()];
  await copy(keep); await copy(drop);
  await db.dataLegalHold.create({ data: { schoolId: s.schoolId, category: "AUDIT_LOG", recordId: keep, reason: "Appeal pending", placedBy: s.owner.userId, expiresAt: new Date(Date.now() + DAY) } });
  const result = await purgeExpiredExamIntegrity(s.schoolId, 50);
  assert.equal(result.deletedAuditCopies, 1);
  assert.deepEqual((await db.auditLog.findMany({ where: { schoolId: s.schoolId, tableName: "school_ai_exam_integrity_events" }, select: { id: true } })).map(row => row.id), [keep]);
});

test("export is scoped, minimized, formula-safe, recorded once per request key and revocable per role", async () => {
  const s = await school();
  await db.auditLog.create({ data: { schoolId: s.schoolId, campusId: s.campuses[0], userId: s.owner.userId, tableName: "students", recordId: "=HYPERLINK(\"http://x\")", newValue: { status: "ACTIVE", note: "private note" } } });
  await event(s.schoolId, s.owner.userId, s.campuses[1]);
  const exportFor = (user: AuthUser, requestKey: string) => ctx(user, () => exportAuditHistory(user, { requestKey }, actor => assertPermission(actor, "reports", "view")));
  const key = randomUUID();
  const first = await exportFor(s.campusAdmin, key);
  assert.equal(first.rows, 1, "only the admin's campus");
  assert.match(first.csv, /'=HYPERLINK/, "formula cells are neutralized");
  assert.equal(first.csv.includes("private note"), false);
  assert.match(first.filename, /^activity-history-\d{4}-\d{2}-\d{2}\.csv$/);
  await exportFor(s.campusAdmin, key);
  assert.equal(await db.auditLog.count({ where: { schoolId: s.schoolId, tableName: "audit_log_exports", recordId: key } }), 1, "a retried export leaves one receipt");
  assert.equal((await db.auditLog.findFirstOrThrow({ where: { tableName: "audit_log_exports", recordId: key } })).campusId, s.campuses[0]);
  await db.rolePermission.create({ data: { schoolId: s.schoolId, role: "CAMPUS_ADMIN", module: "reports", canView: false, canAdd: false, canEdit: false, canDelete: false } });
  await assert.rejects(() => exportFor(s.campusAdmin, randomUUID()), { status: 403 });
  assert.equal((await exportFor(s.owner, randomUUID())).rows >= 2, true, "the school-wide owner exports every campus");
  assert.throws(() => auditHistoryScope(s.teacher), { status: 403 });
});
