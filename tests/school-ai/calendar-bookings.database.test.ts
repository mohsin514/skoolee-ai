import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { TxClient } from "../../src/lib/db/prisma";
import { withExamCalendarChange, examsOnWeekend } from "../../src/lib/academic/calendar-bookings";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated School AI database.");
const db = new PrismaClient(), schoolId = `calendar-guard-${randomUUID()}`;
before(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic calendar QA", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.invalid` } }); });
after(async () => { await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); });
async function fixture() {
  const campus = await db.campus.create({ data: { schoolId, name: "Calendar campus", regId: randomUUID(), city: "Test" } });
  const cls = await db.class.create({ data: { schoolId, campusId: campus.id, name: "Grade 8", academicYear: 2026 } });
  const subject = await db.subject.create({ data: { schoolId, campusId: campus.id, classId: cls.id, name: "Math" } });
  const exam = await db.exam.create({ data: { schoolId, campusId: campus.id, classId: cls.id, title: "Calendar test", academicYear: 2026, term: "TERM_1", status: "DRAFT" } });
  const schedule = await db.examSchedule.create({ data: { schoolId, campusId: campus.id, examId: exam.id, subjectId: subject.id, date: new Date("2026-11-11") } });
  return { campusId: campus.id, scheduleId: schedule.id, examId: exam.id };
}
test("effective-dated school weekend changes roll back if they strand a campus paper", async () => {
  const f = await fixture(), effectiveAt = new Date("2026-11-01");
  await assert.rejects(() => db.$transaction(tx => withExamCalendarChange(tx as TxClient, schoolId, [f.campusId], effectiveAt, () => tx.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { weekend: [3] }, status: "ACTIVE", effectiveAt, createdBy: "fixture" } }))), /examWeekend/);
  assert.equal(await db.localePolicy.count({ where: { schoolId } }), 0);
  assert(await db.examSchedule.findUnique({ where: { id: f.scheduleId } }));
});
test("finance review remains inactive and activation rechecks the actual exam calendar", async () => {
  const f = await fixture(), effectiveAt = new Date("2026-11-01");
  const policy = await db.$transaction(tx => withExamCalendarChange(tx as TxClient, schoolId, [f.campusId], effectiveAt, () => tx.localePolicy.create({ data: { schoolId, campusId: f.campusId, scopeKey: f.campusId, settings: { weekend: [3], currency: "PKR" }, status: "FINANCE_REVIEW", effectiveAt, createdBy: "fixture" } })));
  await assert.rejects(() => db.$transaction(tx => withExamCalendarChange(tx as TxClient, schoolId, [f.campusId], effectiveAt, () => tx.localePolicy.update({ where: { id: policy.id }, data: { status: "ACTIVE" } }))), /examWeekend/);
  assert.equal((await db.localePolicy.findUniqueOrThrow({ where: { id: policy.id } })).status, "FINANCE_REVIEW");
  await db.exam.update({ where: { id: f.examId }, data: { status: "CANCELLED" } });
  await db.$transaction(tx => withExamCalendarChange(tx as TxClient, schoolId, [f.campusId], effectiveAt, () => tx.localePolicy.update({ where: { id: policy.id }, data: { status: "ACTIVE" } })));
});
test("campus inheritance and date boundaries are resolved per paper without cross-campus interference", async () => {
  const f = await fixture(), other = await fixture();
  await db.localePolicy.create({ data: { schoolId, campusId: f.campusId, scopeKey: f.campusId, settings: { weekend: [3] }, status: "ACTIVE", effectiveAt: new Date("2026-11-12"), createdBy: "fixture" } });
  assert.equal((await db.$transaction(tx => examsOnWeekend(tx as TxClient, schoolId, [f.campusId], new Date("2026-01-01")))).size, 0);
  await db.localePolicy.create({ data: { schoolId, campusId: other.campusId, scopeKey: other.campusId, settings: { weekend: [3] }, status: "ACTIVE", effectiveAt: new Date("2026-11-01"), createdBy: "fixture" } });
  const affected = await db.$transaction(tx => examsOnWeekend(tx as TxClient, schoolId, [f.campusId, other.campusId], new Date("2026-11-01")));
  assert.deepEqual([...affected], [other.scheduleId]);
});
test("effective-dated weekend changes cannot bypass the published-lesson guard", async () => {
  const f = await fixture();
  const schedule = await db.examSchedule.findUniqueOrThrow({ where: { id: f.scheduleId }, include: { exam: true } });
  await db.timetable.create({ data: { schoolId, campusId: f.campusId, classId: schedule.exam.classId, academicYear: 2026, status: "PUBLISHED", slots: { create: { schoolId, subjectId: schedule.subjectId, slotType: "CLASS", dayOfWeek: 2, periodNumber: 1, startTime: "08:00", endTime: "09:00" } } } });
  const effectiveAt = new Date("2026-11-01");
  await assert.rejects(() => db.$transaction(tx => withExamCalendarChange(tx as TxClient, schoolId, [f.campusId], effectiveAt, () => tx.localePolicy.create({ data: { schoolId, campusId: f.campusId, scopeKey: f.campusId, settings: { weekend: [2] }, status: "ACTIVE", effectiveAt, createdBy: "fixture" } }))), /examWeekend/);
  assert.equal(await db.localePolicy.count({ where: { schoolId, campusId: f.campusId } }), 0);
});
