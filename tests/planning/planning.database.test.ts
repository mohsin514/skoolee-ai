import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import type { Result } from "../../src/lib/planning/engine";
import { decideHandoff, duplicateScenario, planningOverview, proposeHandoff, refreshScenario, saveScenario, takeBaseline } from "../../src/lib/planning/service";

// SKO-453: seats fit but lab periods do not; adding a room clears the lab conflict while adding a
// teacher clears staffing; a part-time teacher's lower availability is a warning; costs are estimates
// and unknown when not entered; a stale baseline must be refreshed explicitly; a handoff is approved
// by someone else only against current live resources, and nothing live ever changes.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `planning-${randomUUID()}`, campusId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const principal = actor("PRINCIPAL"), campusAdmin = actor("CAMPUS_ADMIN"), teacherUser = actor("TEACHER");
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, work);
const ids: Record<string, string> = {};
const live = async () => [await raw.class.count({ where: { campusId } }), await raw.classRoom.count({ where: { campusId } }), await raw.timetableSlot.count({ where: { timetable: { campusId } } }), await raw.student.count({ where: { campusId } })].join("/");
const lab = { classCap: 30, intake: [{ grade: "Grade 7", students: 30 }], subjectNeeds: [{ grade: "Grade 7", subject: "Science", periodsPerSection: 6, roomType: "LAB" }], addRooms: [], teacherChanges: [], costs: { currency: "SAR" } };
let before453 = "";

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic planning school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic", regId: campusId, city: "Synthetic" } });
  for (const user of [principal, campusAdmin, teacherUser]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true, isActive: true } });
  ids.science = randomUUID(); ids.math = randomUUID();
  await raw.user.create({ data: { id: ids.science, schoolId, campusId, role: "TEACHER", email: `${ids.science}@example.invalid`, fullName: "Synthetic Science", isActive: true, onboardingComplete: true } });
  await raw.staffProfile.create({ data: { schoolId, userId: ids.science, contractedPeriodsPerWeek: 12 } });
  await raw.user.create({ data: { id: ids.math, schoolId, campusId, role: "TEACHER", email: `${ids.math}@example.invalid`, fullName: "Synthetic Math", isActive: true, onboardingComplete: true } });
  for (let n = 1; n <= 4; n++) await raw.classRoom.create({ data: { schoolId, campusId, roomNumber: `R-${n}`, capacity: 30 } });
  ids.lab = (await raw.classRoom.create({ data: { schoolId, campusId, roomNumber: "LAB-1", capacity: 30, roomType: "LAB" } })).id;
  for (let p = 1; p <= 4; p++) await raw.periodDefinition.create({ data: { schoolId, campusId, periodNumber: p, startTime: `0${7 + p}:00`, endTime: `0${7 + p}:40` } });
  for (const [i, section] of ["A", "B"].entries()) {
    const cls = await raw.class.create({ data: { schoolId, campusId, name: "Grade 7", section, academicYear: 2027, capacity: 30 } });
    for (let s = 0; s < 28; s++) await raw.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: `Synthetic pupil ${section}${s}`, rollNo: `${section}${s}`, gender: "MALE" } });
    const science = await raw.subject.create({ data: { schoolId, campusId, classId: cls.id, name: "Science", teacherId: ids.science } });
    const math = await raw.subject.create({ data: { schoolId, campusId, classId: cls.id, name: "Math", teacherId: ids.math } });
    const tt = await raw.timetable.create({ data: { schoolId, campusId, classId: cls.id, academicYear: 2027 } });
    for (let d = 1; d <= 4; d++) await raw.timetableSlot.create({ data: { schoolId, timetableId: tt.id, dayOfWeek: d, periodNumber: i + 1, subjectId: science.id, teacherId: ids.science, roomId: ids.lab, startTime: "08:00", endTime: "08:40" } });
    for (const d of [1, 2]) await raw.timetableSlot.create({ data: { schoolId, timetableId: tt.id, dayOfWeek: d, periodNumber: 3, subjectId: math.id, teacherId: ids.math, startTime: "10:00", endTime: "10:40" } });
  }
  before453 = await live();
});
after(async () => {
  for (const m of [raw.planningHandoff, raw.planningScenario, raw.planningBaseline]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

const science = (r: Result) => r.findings.some((f) => f.code === "STAFF_PERIODS" && f.message.startsWith("Science"));
const hard = (r: Result) => r.findings.filter((f) => f.severity === "HARD").map((f) => f.code).sort();

test("seats fit but lab periods do not; a room fixes the lab and a teacher fixes staffing, with no live change", async () => {
  await assert.rejects(() => ctx(teacherUser, () => planningOverview(teacherUser)), { status: 403 });
  const baseline = await ctx(principal, () => takeBaseline(principal, {}));
  ids.baseline = baseline.id;
  const data = baseline.data as { teachingDays: number; periodsPerDay: number; subjects: { subject: string; periodsPerSection: number; roomType: string }[] };
  assert.deepEqual([data.teachingDays, data.periodsPerDay], [4, 4]);
  assert.deepEqual(data.subjects.find((s) => s.subject === "Science"), { grade: "Grade 7", subject: "Science", periodsPerSection: 4, roomType: "LAB" });

  const base = await ctx(principal, () => saveScenario(principal, { baselineId: baseline.id, name: "Intake +30", assumptions: lab }));
  const r = base.result as unknown as Result;
  assert.deepEqual([r.metrics.students, r.metrics.sections, r.metrics.sectionsAdded], [86, 3, 1]);
  assert.ok(!hard(r).includes("SEATS") && !hard(r).includes("HOME_ROOMS"), "seats and home rooms fit");
  const labConflict = r.findings.find((f) => f.code === "ROOM_TYPE_PERIODS")!;
  assert.deepEqual([labConflict.needed, labConflict.available, labConflict.unit], [18, 16, "periods per week"]);
  assert.match(labConflict.message, /^2 lab periods are missing/u);
  assert.ok(labConflict.links.some((l) => l.kind === "room" && l.id === ids.lab), "the bottleneck links to the lab");
  assert.ok(labConflict.links.some((l) => l.kind === "subject" && /Science · 6\/section/u.test(l.label)), "and to the subject requirement");
  const staff = r.findings.find((f) => f.code === "STAFF_PERIODS" && f.message.startsWith("Science"))!;
  assert.deepEqual([staff.needed, staff.available], [18, 12]);
  assert.ok(staff.links.some((l) => l.id === ids.science));
  assert.equal(r.provisional, true, "the math teacher has no contracted periods");
  assert.ok(r.missing.some((m) => m.code === "STAFF_AVAILABILITY"));
  assert.ok(r.findings.filter((f) => f.severity === "UNMODELED").length >= 3, "unmodeled factors stay listed");

  const room = await ctx(principal, () => saveScenario(principal, { baselineId: baseline.id, name: "Add a lab", assumptions: { ...lab, addRooms: [{ type: "LAB", count: 1, seats: 30 }], costs: { currency: "SAR", roomAnnual: { low: 40000, high: 60000 } } } }));
  assert.ok(!hard(room.result as unknown as Result).includes("ROOM_TYPE_PERIODS"), "a lab clears the lab conflict");
  assert.ok(science(room.result as unknown as Result), "but not the science staffing");
  const teacher = await ctx(principal, () => saveScenario(principal, { baselineId: baseline.id, name: "Add a teacher", assumptions: { ...lab, teacherChanges: [{ subject: "Science", periodsPerWeek: 10 }], costs: { currency: "SAR", teacherAnnual: { low: 90000, high: 110000 } } } }));
  const t = teacher.result as unknown as Result;
  assert.ok(hard(t).includes("ROOM_TYPE_PERIODS"), "a teacher does not create lab periods");
  assert.ok(!science(t), "but clears the science staffing");
  assert.deepEqual(t.costs.teachers, { low: 90000, high: 110000 });
  const noCost = await ctx(principal, () => saveScenario(principal, { baselineId: baseline.id, name: "Add a teacher, no cost", assumptions: { ...lab, teacherChanges: [{ subject: "Science", periodsPerWeek: 10 }] } }));
  assert.equal((noCost.result as unknown as Result).costs.teachers, null, "a missing cost is unknown, never zero");
  assert.ok((noCost.result as unknown as Result).costs.unknown.includes("Teacher cost not entered"));
  assert.equal(await live(), before453, "no live record changed");
});

test("a part-time teacher's reduced availability shows its workload effect; edits are version-checked", async () => {
  const s = await ctx(principal, () => saveScenario(principal, { baselineId: ids.baseline, name: "Part-time science", assumptions: { classCap: 30, intake: [], subjectNeeds: [], addRooms: [], teacherChanges: [{ userId: ids.science, periodsPerWeek: 6 }], costs: {} } }));
  const r = s.result as unknown as Result;
  assert.ok(r.findings.some((f) => f.code === "AVAILABILITY_BELOW_LOAD" && f.needed === 8 && f.available === 6));
  assert.ok(r.findings.some((f) => f.code === "STAFF_PERIODS" && f.needed === 8 && f.available === 6));
  const changed = await ctx(principal, () => saveScenario(principal, { baselineId: ids.baseline, name: "Part-time science", assumptions: { classCap: 30, intake: [], subjectNeeds: [], addRooms: [], teacherChanges: [{ userId: ids.science, periodsPerWeek: 8 }], costs: {} } }, s.id, 1));
  assert.equal(changed.version, 2);
  assert.ok(!(changed.result as unknown as Result).findings.some((f) => f.code === "AVAILABILITY_BELOW_LOAD"), "changing an assumption recomputes the result");
  await assert.rejects(() => ctx(principal, () => saveScenario(principal, { baselineId: ids.baseline, name: "x1", assumptions: { classCap: 30 } }, s.id, 1)), /changed since you opened it/);
  const copy = await ctx(principal, () => duplicateScenario(principal, s.id));
  assert.equal(copy.copiedFromId, s.id);
});

test("a stale baseline is refreshed explicitly; a handoff is approved by someone else against current live resources", async () => {
  const scenario = await raw.planningScenario.findFirstOrThrow({ where: { campusId, name: "Add a lab" } });
  const handoff = await ctx(principal, () => proposeHandoff(principal, scenario.id, { ownerId: campusAdmin.userId, note: "Review the lab build and science staffing for next year." }));
  assert.ok((handoff.items as { kind: string }[]).some((i) => i.kind === "UNRESOLVED"), "unresolved conflicts travel with the plan");
  await assert.rejects(() => ctx(principal, () => decideHandoff(principal, handoff.id, { decision: "APPROVE" })), /other than the proposer/);

  await raw.classRoom.create({ data: { schoolId, campusId, roomNumber: "R-9", capacity: 30 } });
  assert.equal((await ctx(principal, () => planningOverview(principal))).latestIsCurrent, false, "the baseline is shown as stale");
  await assert.rejects(() => ctx(campusAdmin, () => decideHandoff(campusAdmin, handoff.id, { decision: "APPROVE" })), /changed since this scenario's baseline/);

  await assert.rejects(() => ctx(principal, () => refreshScenario(principal, scenario.id)), /Take a new baseline first/);
  const v2 = await ctx(principal, () => takeBaseline(principal, {}));
  const refreshed = await ctx(principal, () => refreshScenario(principal, scenario.id));
  assert.equal(refreshed.baselineId, v2.id);
  assert.equal((await raw.planningScenario.findUniqueOrThrow({ where: { id: scenario.id } })).baselineId, ids.baseline, "the original scenario is preserved");
  const plan = await ctx(principal, () => proposeHandoff(principal, refreshed.id, { ownerId: campusAdmin.userId, note: "Refreshed after the new room was added." }));
  const approved = await ctx(campusAdmin, () => decideHandoff(campusAdmin, plan.id, { decision: "APPROVE", note: "Proceed to recruitment and works review." }));
  assert.equal(approved.status, "APPROVED");
  assert.equal(await raw.classRoom.count({ where: { campusId } }), 6, "approval changes no live record");
});
