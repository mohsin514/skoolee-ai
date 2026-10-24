import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated School AI database.");
const db = new PrismaClient(), schoolId = `resource-qa-${randomUUID()}`, origin = "http://localhost:3106";
let campusId: string, actorId: string, teacherId: string, classId: string, roomId: string, periodId: string, scheduleId: string;
const date = "2026-11-11";
test.beforeAll(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic resource QA", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.invalid`, status: "ACTIVE", plan: "PRO" } }); });
test.afterAll(async () => { await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); });
test.beforeEach(async ({ context }) => {
  campusId = randomUUID(); actorId = randomUUID(); teacherId = randomUUID(); classId = randomUUID(); roomId = randomUUID(); periodId = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Resource campus", city: "Test", regId: campusId } });
  for (const [id, role] of [[actorId, "ADMIN"], [teacherId, "TEACHER"]] as const) await db.user.create({ data: { id, schoolId, campusId, role, fullName: "Synthetic staff", email: `${id}@example.invalid`, isActive: true, onboardingComplete: true, mfaEnabled: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", academicYear: 2026 } });
  const subject = await db.subject.create({ data: { schoolId, campusId, classId, name: "Mathematics", teacherId } });
  await db.classRoom.create({ data: { id: roomId, schoolId, campusId, roomNumber: "A1", rows: 2, benchesPerRow: 2, seatsPerBench: 2, examSeatsPerBench: 1, capacity: 8 } });
  await db.periodDefinition.create({ data: { id: periodId, schoolId, campusId, timeType: "EXAM", periodNumber: 1, startTime: "09:00", endTime: "10:00" } });
  const exam = await db.exam.create({ data: { schoolId, campusId, classId, title: "Resource test", academicYear: 2026, term: "TERM_1", status: "DRAFT" } });
  const schedule = await db.examSchedule.create({ data: { schoolId, campusId, examId: exam.id, subjectId: subject.id, date: new Date(date), roomId, periodDefinitionId: periodId } }); scheduleId = schedule.id;
  const room = await db.examRoom.create({ data: { schoolId, campusId, examScheduleId: scheduleId, roomId, isPrimary: true } });
  await db.examInvigilation.create({ data: { schoolId, campusId, examRoomId: room.id, teacherId, createdById: actorId } });
  const student = await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic pupil", rollNo: "1", gender: "MALE", enrollmentDate: new Date("2026-01-01") } });
  await db.examSeat.create({ data: { schoolId, campusId, examScheduleId: scheduleId, examRoomId: room.id, studentId: student.id, seatNumber: 1, rowNo: 1, benchNo: 1, seatOnBench: 1 } });
  const token = await new SignJWT({ userId: actorId, schoolId, campusId, role: "ADMIN", email: `${actorId}@example.invalid`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: actorId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
});

test("assigned seating blocks room geometry and deletion while allowing a room label correction", async ({ context }) => {
  const api = context.request;
  expect((await api.patch("/api/academic/rooms", { data: { id: roomId, rows: 1 } })).status()).toBe(409);
  expect((await api.delete(`/api/academic/rooms?id=${roomId}`)).status()).toBe(409);
  const renamed = await api.patch("/api/academic/rooms", { data: { id: roomId, roomNumber: "A-01 corrected" } });
  expect(renamed.ok(), await renamed.text()).toBeTruthy();
  const room = await db.classRoom.findUniqueOrThrow({ where: { id: roomId } });
  expect(room.rows).toBe(2); expect(room.roomNumber).toBe("A-01 corrected");
  expect(await db.examSeat.count({ where: { examScheduleId: scheduleId } })).toBe(1);
});
test("exam period deletion and a shift onto a published class are rejected atomically", async ({ context }) => {
  expect((await context.request.delete(`/api/academic/periods?id=${periodId}`)).status()).toBe(409);
  const subject = await db.subject.findFirstOrThrow({ where: { classId } });
  await db.timetable.create({ data: { schoolId, campusId, classId, academicYear: 2026, term: "TERM_1", status: "PUBLISHED", slots: { create: { schoolId, dayOfWeek: 3, periodNumber: 1, startTime: "11:00", endTime: "12:00", teacherId, roomId, subjectId: subject.id, slotType: "CLASS" } } } });
  const moved = await context.request.patch("/api/academic/periods", { data: { id: periodId, startTime: "11:00", endTime: "12:00" } });
  expect(moved.status(), await moved.text()).toBe(409);
  expect((await db.periodDefinition.findUniqueOrThrow({ where: { id: periodId } })).startTime).toBe("09:00");
  const valid = await context.request.patch("/api/academic/periods", { data: { id: periodId, startTime: "08:00", endTime: "09:00" } });
  expect(valid.ok(), await valid.text()).toBeTruthy();
});
test("new holidays and weekend days cannot strand an exam, and impossible dates are rejected", async ({ context }) => {
  const api = context.request;
  expect((await api.post("/api/academic/calendar", { data: { name: "Closure", fromDate: date, toDate: date } })).status()).toBe(409);
  expect((await api.patch("/api/academic/calendar", { data: { days: [3, 7] } })).status()).toBe(409);
  expect((await api.post("/api/academic/calendar", { data: { name: "Invalid", fromDate: "2026-02-31", toDate: "2026-02-31" } })).status()).toBe(400);
  expect(await db.holiday.count({ where: { campusId } })).toBe(0);
  expect(await db.weekend.count({ where: { campusId } })).toBe(0);
  const added = await api.post("/api/academic/calendar", { data: { name: "Safe closure", fromDate: "2026-11-12", toDate: "2026-11-12" } });
  expect(added.status(), await added.text()).toBe(201);
});
test("an invigilator's leave is held until the duty is cleared", async ({ context }) => {
  const leaveType = await db.leaveType.create({ data: { schoolId, campusId, name: "Casual" } });
  const leave = await db.leaveRequest.create({ data: { schoolId, campusId, userId: teacherId, leaveTypeId: leaveType.id, fromDate: new Date(date), toDate: new Date(date), status: "PENDING" } });
  const data = { id: leave.id, status: "APPROVED", override: true };
  expect((await context.request.patch("/api/leave/review", { data })).status()).toBe(409);
  expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: leave.id } })).status).toBe("PENDING");
  await db.examInvigilation.deleteMany({ where: { campusId } });
  const approved = await context.request.patch("/api/leave/review", { data });
  expect(approved.ok(), await approved.text()).toBeTruthy();
  expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: leave.id } })).status).toBe("APPROVED");
});
test("resource IDs from another campus never authorize changes", async ({ context }) => {
  const other = await db.campus.create({ data: { schoolId, name: "Other", regId: randomUUID(), city: "Test" } });
  const room = await db.classRoom.create({ data: { schoolId, campusId: other.id, roomNumber: "Foreign" } });
  expect((await context.request.patch("/api/academic/rooms", { data: { id: room.id, roomNumber: "Leaked" } })).status()).toBe(404);
  expect((await context.request.delete(`/api/academic/rooms?id=${room.id}`)).status()).toBe(404);
  expect((await context.request.post("/api/academic/calendar", { data: { campusId: other.id, name: "Foreign", fromDate: date, toDate: date } })).status()).toBe(403);
  expect((await db.classRoom.findUniqueOrThrow({ where: { id: room.id } })).roomNumber).toBe("Foreign");
});
test("closed exam periods preserve their recorded timing with an actionable rejection", async ({ context }) => {
  const schedule = await db.examSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
  await db.exam.update({ where: { id: schedule.examId }, data: { status: "CANCELLED" } });
  const response = await context.request.patch("/api/academic/periods", { data: { id: periodId, startTime: "08:00", endTime: "09:00" } });
  expect(response.status()).toBe(409); expect(await response.text()).toContain("Create a new exam period");
  expect((await db.periodDefinition.findUniqueOrThrow({ where: { id: periodId } })).startTime).toBe("09:00");
});
test("cancelled leave cannot be approved and racing cancellation cannot overwrite approval", async ({ context }) => {
  const leaveType = await db.leaveType.create({ data: { schoolId, campusId, name: "Casual" } });
  const leave = await db.leaveRequest.create({ data: { schoolId, campusId, userId: actorId, leaveTypeId: leaveType.id, fromDate: new Date(date), toDate: new Date(date), status: "CANCELLED" } });
  const data = { id: leave.id, status: "APPROVED", override: true };
  expect((await context.request.patch("/api/leave/review", { data })).status()).toBe(409);
  await db.leaveRequest.update({ where: { id: leave.id }, data: { status: "PENDING" } });
  const results = await Promise.all([context.request.patch("/api/leave/review", { data }), context.request.patch("/api/leave", { data: { id: leave.id } })]);
  expect(results.map(result => result.status()).sort()).toEqual([200, 409]);
  const status = (await db.leaveRequest.findUniqueOrThrow({ where: { id: leave.id } })).status;
  expect(["APPROVED", "CANCELLED"]).toContain(status);
});
