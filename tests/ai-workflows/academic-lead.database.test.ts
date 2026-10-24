import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { runGates } from "../../src/lib/ai-workflows/registry/gates";
import { examStudioViolation } from "../../src/lib/ai-workflows/registry/exam-studio";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import { createAcademicModelDraft } from "../../src/lib/academic/model-draft-command";
import { ACADEMIC_LEAD_ENTRIES } from "../../src/lib/ai-workflows/registry/domains/academic/lead";
import type { CapabilityContext, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * The academic lead's entries (PRINCIPAL, or a campus operator while no principal is in post), exercised
 * directly (resolve → preview → execute, or resolve → prepare) until the lead wires them into the registry.
 */
const entry = <T extends ExecEntry<any> | HandoffEntry<any>>(key: string) => ACADEMIC_LEAD_ENTRIES.find(item => item.key === key) as T;
const exec = (key: string) => entry<ExecEntry<any>>(key);
const handoff = (key: string) => entry<HandoffEntry<any>>(key);
const KEY = () => `wf-test-${randomUUID()}`;

async function fixture(role: "PRINCIPAL" | "ADMIN" | "CAMPUS_ADMIN" = "PRINCIPAL") {
  const schoolId = `lead-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic academic school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, regId: otherCampusId, name: "Other campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic lead", role, isActive: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026-27", status: "ACTIVE" } });
  const teacher = (fullName: string, campus = campusId) => db.user.create({ data: { schoolId, campusId: campus, email: `${randomUUID()}@example.invalid`, fullName, role: "TEACHER", isActive: true } });
  const sana = await teacher("Sana Malik"), bilal = await teacher("Bilal Ahmed"), foreignTeacher = await teacher("Sana Qureshi", otherCampusId);
  const klass = await db.class.create({ data: { schoolId, campusId, name: "7", section: "B", academicYear: 2026, status: "ACTIVE", teachingMode: "SUBJECT" } });
  const sibling = await db.class.create({ data: { schoolId, campusId, name: "7", section: "C", academicYear: 2026, status: "ACTIVE", teachingMode: "SUBJECT" } });
  const maths = await db.subject.create({ data: { schoolId, campusId, classId: klass.id, name: "Mathematics", totalMarks: 100 } });
  await db.subject.create({ data: { schoolId, campusId, classId: sibling.id, name: "Mathematics", totalMarks: 100 } });
  const foreignClass = await db.class.create({ data: { schoolId, campusId: otherCampusId, name: "7", section: "B", academicYear: 2026, status: "ACTIVE" } });
  const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, fullName: "Synthetic lead", accessVersion: 0 };
  return { user, schoolId, campusId, otherCampusId, sana, bilal, foreignTeacher, klass, sibling, maths, foreignClass };
}
const ctxFor = (user: AuthUser, campusId: string | null) => capabilityContext(user, campusId, "en");
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? `${error.code}${error.params.reason ? `:${error.params.reason}` : ""}` : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : `THROWN:${(error as Error).message}`; } };

async function bind(ctx: CapabilityContext, key: string, input: unknown) {
  const item = entry<ExecEntry<any> | HandoffEntry<any>>(key);
  const parsed = item.input.parse(input);
  return item.input.parse(item.resolve ? await item.resolve(ctx, parsed) : parsed);
}
async function confirmRun(ctx: CapabilityContext, key: string, input: unknown) {
  const item = exec(key);
  const bound = await bind(ctx, key, input);
  const preview = await item.preview!(ctx, bound);
  const receipt = await item.execute(ctx, bound, { idempotencyKey: KEY() });
  return { bound, preview, receipt };
}
async function prepare(ctx: CapabilityContext, key: string, input: unknown) {
  return handoff(key).handoff.prepare(ctx, await bind(ctx, key, input), { idempotencyKey: KEY() });
}

test("entries keep their static classes; Exam Studio keys are class C deep links only", () => {
  assert.deepEqual(ACADEMIC_LEAD_ENTRIES.map(item => [item.key, item.class]), [
    ["academic.class.assign_teacher", "B"], ["academic.subject.create", "B"], ["academic.subject.assign_teacher", "B"], ["staff.set_workload_capacity", "B"],
    ["timetable.create", "B"], ["exams.session.create", "B"], ["exams.invigilation.assign", "B"], ["academic.model.create_draft", "B"],
    ["improvement.create_framework", "B"], ["staff.propose_cover", "B"], ["learning_actions.save_draft", "B"],
    ["corrections.decide_mark", "C"], ["learning_actions.activate", "C"], ["academic.model.activate", "C"], ["reports.approve_versions", "C"],
    ["exams.datesheet.publish", "C"], ["exams.principal_review", "C"], ["academic.request_operator_setup", "C"],
  ]);
  for (const item of ACADEMIC_LEAD_ENTRIES) assert.equal(examStudioViolation(item), null, item.key);
  for (const key of ["exams.datesheet.publish", "exams.principal_review"]) {
    assert.equal(handoff(key).handoff.kind, "DEEP_LINK");
    assert.equal("execute" in handoff(key) && handoff(key).execute !== undefined, false);
  }
  assert.equal(handoff("corrections.decide_mark").handoff.kind, "DOMAIN_SCREEN");
  assert.equal(handoff("reports.approve_versions").handoff.kind, "DEEP_LINK");
  assert.equal(handoff("academic.request_operator_setup").handoff.kind, "ROLE_TASK");
  assert.deepEqual(handoff("academic.request_operator_setup").roles, ["PRINCIPAL"]);
});

test("class teacher: assigned once by name, a replay reconciles; a foreign class or teacher is out of scope", async () => {
  const { user, schoolId, campusId, otherCampusId, klass, sana, foreignClass } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    assert.deepEqual(await runGates(ctx, exec("academic.class.assign_teacher").gates), { ok: true });
    const { bound, preview, receipt } = await confirmRun(ctx, "academic.class.assign_teacher", { classId: klass.id, teacher: "Ms Sana Malik" });
    assert.equal(bound.teacherId, sana.id);
    assert.equal(preview.counts.changes, 1);
    assert.equal(receipt.counts.changes, 1);
    assert.equal(receipt.link, "/principal?view=classes");
    assert.equal((await db.class.findUniqueOrThrow({ where: { id: klass.id } })).classTeacherId, sana.id);
    assert.equal(await db.teachingAssignment.count({ where: { schoolId, classId: klass.id, role: "CLASS_TEACHER" } }), 1);

    const replay = await exec("academic.class.assign_teacher").execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(replay.detail?.reconciled, true);
    assert.equal(replay.counts.changes, 0);
    assert.equal(await db.teachingAssignment.count({ where: { schoolId, classId: klass.id, role: "CLASS_TEACHER" } }), 1, "a replay never records the assignment twice");

    assert.equal(await code(bind(ctx, "academic.class.assign_teacher", { classId: foreignClass.id, teacher: "Sana Malik" })), "SCOPE_DENIED");
    assert.equal(await code(bind(ctx, "academic.class.assign_teacher", { classId: klass.id, teacher: "Sana Qureshi" })), "INPUT:/teacher", "a teacher of another campus is never matched");
    assert.equal(await code(exec("academic.class.assign_teacher").execute(ctx, { classId: foreignClass.id, teacher: "x", teacherId: sana.id }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    assert.equal((await db.class.findUniqueOrThrow({ where: { id: foreignClass.id } })).classTeacherId, null);

    const foreignCtx = await ctxFor(user, otherCampusId);
    assert.deepEqual(await runGates(foreignCtx, exec("academic.class.assign_teacher").gates), { ok: false, code: "SCOPE" });
    assert.equal(await code(bind(foreignCtx, "academic.class.assign_teacher", { classId: foreignClass.id, teacher: "Sana Qureshi" })), "SCOPE_DENIED");
    assert.equal(await db.teachingAssignment.count({ where: { schoolId, classId: foreignClass.id } }), 0);
  });
});

test("seat change mid-plan: an operator's step stops with SEAT once a principal is active", async () => {
  const { user, schoolId, campusId, klass, bilal } = await fixture("CAMPUS_ADMIN");
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const item = exec("academic.class.assign_teacher");
    assert.deepEqual(await runGates(ctx, item.gates), { ok: true }, "with the principal seat vacant the operator is the academic lead");
    const bound = await bind(ctx, "academic.class.assign_teacher", { classId: klass.id, teacher: "Bilal" });
    const preview = await item.preview!(ctx, bound);
    assert.equal(preview.counts.changes, 1);

    await db.user.create({ data: { schoolId, campusId, email: `${randomUUID()}@example.invalid`, fullName: "New Principal", role: "PRINCIPAL", isActive: true } });
    const fresh = await ctxFor(user, campusId);
    assert.deepEqual(await runGates(fresh, item.gates), { ok: false, code: "SEAT", whoCan: ["PRINCIPAL"] });
    // Even with the plan's (now stale) context, execute re-reads the seat and stops.
    assert.equal(await code(item.execute(ctx, bound, { idempotencyKey: KEY() })), "SEAT_HELD");
    assert.equal(await code(handoff("reports.approve_versions").handoff.prepare(ctx, {}, { idempotencyKey: KEY() })), "SEAT_HELD");
    assert.equal((await db.class.findUniqueOrThrow({ where: { id: klass.id } })).classTeacherId, null, "nothing was written");
    assert.notEqual(bilal.id, null);
  });
});

test("subjects, subject teacher, weekly cap and a draft timetable: created once, replays reconcile", async () => {
  const { user, schoolId, campusId, klass, sibling, maths, sana, bilal } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const subjects = { classId: klass.id, allSections: true, subjects: [{ name: "Computer Science", totalMarks: 75 }, { name: "mathematics" }] };
    const { preview, receipt } = await confirmRun(ctx, "academic.subject.create", subjects);
    assert.deepEqual(preview.counts, { subjects: 2, kept: 1 });
    assert.equal(receipt.counts.subjects, 2);
    assert.equal(await db.subject.count({ where: { schoolId, name: "Computer Science", classId: { in: [klass.id, sibling.id] }, totalMarks: 75 } }), 2);
    const again = await confirmRun(ctx, "academic.subject.create", subjects);
    assert.equal(again.receipt.counts.subjects, 0);
    assert.equal(again.receipt.detail?.reconciled, true);
    assert.equal(await db.subject.count({ where: { schoolId } }), 4, "a replay never adds a subject twice");

    const assigned = await confirmRun(ctx, "academic.subject.assign_teacher", { subjectId: maths.id, teacher: "Bilal Ahmed" });
    assert.equal(assigned.receipt.counts.changes, 1);
    assert.equal((await db.subject.findUniqueOrThrow({ where: { id: maths.id } })).teacherId, bilal.id);
    assert.equal((await confirmRun(ctx, "academic.subject.assign_teacher", { subjectId: maths.id, teacher: "Bilal Ahmed" })).receipt.detail?.reconciled, true);

    const cap = await confirmRun(ctx, "staff.set_workload_capacity", { periodsPerWeek: 30 });
    assert.deepEqual(cap.bound.teacherIds.sort(), [sana.id, bilal.id].sort());
    assert.equal(cap.receipt.counts.changes, 2);
    assert.equal(await db.staffProfile.count({ where: { userId: { in: [sana.id, bilal.id] }, contractedPeriodsPerWeek: 30 } }), 2);
    assert.equal((await confirmRun(ctx, "staff.set_workload_capacity", { periodsPerWeek: 30 })).receipt.counts.changes, 0);

    await db.periodDefinition.createMany({ data: [1, 2, 3].map(n => ({ schoolId, campusId, timeType: "CLASS", periodNumber: n, startTime: `${String(7 + n).padStart(2, "0")}:00`, endTime: `${String(7 + n).padStart(2, "0")}:40` })) });
    const board = await confirmRun(ctx, "timetable.create", { classId: klass.id, term: "TERM_2" });
    assert.equal(board.receipt.kind, "draft");
    const timetable = await db.timetable.findFirstOrThrow({ where: { schoolId, classId: klass.id }, include: { slots: true } });
    assert.equal(timetable.status, "DRAFT");
    assert.equal(timetable.term, "TERM_2");
    assert.equal(new Set(timetable.slots.map(slot => slot.periodNumber)).size, 3, "the campus bell times seed the board");
    const replay = await confirmRun(ctx, "timetable.create", { classId: klass.id, term: "TERM_2" });
    assert.equal(replay.receipt.detail?.reconciled, true);
    assert.equal(await db.timetable.count({ where: { schoolId } }), 1);
  });
});

test("exam session and request-only entries: session created once in PLANNING; Exam Studio deep links write nothing", async () => {
  const { user, schoolId, campusId, klass, sibling, maths } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    assert.equal(await code(bind(ctx, "exams.session.create", { title: "Mid-terms", examType: "MID_TERM", classIds: [klass.id], startDate: "2026-12-20", endDate: "2026-12-10" })), "INPUT:/endDate");
    const input = { title: "Mid-terms", examType: "MID_TERM", term: "term 1", classIds: [klass.id, sibling.id], startDate: "2026-12-10", endDate: "2026-12-20" };
    const { bound, preview, receipt } = await confirmRun(ctx, "exams.session.create", input);
    assert.equal(bound.term, "Term 1");
    assert.equal(bound.academicYear, 2026);
    assert.deepEqual(preview.counts, { sessions: 1, exams: 2 });
    assert.equal(receipt.counts.exams, 2);
    const session = await db.examSession.findFirstOrThrow({ where: { schoolId } });
    assert.equal(session.status, "PLANNING");
    assert.equal(await db.exam.count({ where: { schoolId, sessionId: session.id } }), 2);
    const replay = await confirmRun(ctx, "exams.session.create", input);
    assert.equal(replay.receipt.detail?.reconciled, true);
    assert.equal(await db.examSession.count({ where: { schoolId } }), 1);

    const counts = async () => Promise.all([db.examSession.count({ where: { schoolId } }), db.exam.count({ where: { schoolId } }), db.examSchedule.count({ where: { schoolId } }), db.auditLog.count({ where: { schoolId } }), db.exam.count({ where: { schoolId, status: { in: ["PRINCIPAL_REVIEWED", "PUBLISHED"] } } })]);
    const before = await counts();
    for (const key of ["exams.datesheet.publish", "exams.principal_review"]) {
      const prepared = await prepare(ctx, key, { classId: klass.id, subjectId: maths.id, session: "Mid-terms" });
      assert.equal(prepared.kind, "DEEP_LINK");
      assert.ok(prepared.link.startsWith("/ai/studio?"), prepared.link);
      assert.equal(prepared.detail?.owner, "EXAM_STUDIO");
    }
    assert.deepEqual(await counts(), before, "Exam Studio hand-offs write nothing");

    const task = await prepare(ctx, "academic.request_operator_setup", { needs: ["ROOMS", "HOLIDAYS"], note: "Exam rooms for 60 and the winter break" });
    assert.equal(task.kind, "ROLE_TASK");
    assert.deepEqual(task.targetRoles, ["ADMIN", "CAMPUS_ADMIN"]);
    assert.equal(task.link, "/admin?view=settings&tab=rooms");
    assert.equal(await db.classRoom.count({ where: { schoolId } }), 0, "the principal never sets rooms");

    const framework = await confirmRun(ctx, "improvement.create_framework", { name: "Board standards", criteria: [{ code: "1", title: "Leadership" }, { code: "2", title: "Teaching quality" }] });
    assert.equal(framework.receipt.counts.frameworks, 1);
    assert.equal((await confirmRun(ctx, "improvement.create_framework", { name: "Board standards", criteria: [{ code: "1", title: "Leadership" }] })).receipt.detail?.reconciled, true);
    assert.equal(await db.evidenceFramework.count({ where: { schoolId } }), 1);
  });
});

test("model draft: the adapter writes what POST /api/academic-models writes; activation is refused while GRADING is locked", async () => {
  const { user, schoolId, campusId, klass, sibling, maths } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const input = { classIds: [klass.id, sibling.id], weights: { quiz: 10, classTest: 20, midTerm: 30, final: 40 }, passPercent: 40 };
    const { receipt } = await confirmRun(ctx, "academic.model.create_draft", input);
    assert.equal(receipt.kind, "draft");
    assert.equal(receipt.detail?.version, 1);
    const draft = await db.academicModelVersion.findFirstOrThrow({ where: { schoolId, version: 1 } });
    assert.equal(draft.status, "DRAFT");
    assert.equal(draft.cohortLabel, "7");
    const config = draft.configuration as { classIds: string[]; grading: { passingPercentage: number; finalWeight: number }; subjectMappings: Array<{ label: string; subjectIds: string[] }> };
    assert.deepEqual(config.classIds.sort(), [klass.id, sibling.id].sort());
    assert.equal(config.grading.passingPercentage, 40);
    assert.equal(config.grading.finalWeight, 40);
    assert.equal(config.subjectMappings[0].label, "Mathematics");
    assert.ok(config.subjectMappings[0].subjectIds.includes(maths.id));

    // Golden: the route's command, given the body the screen would send, writes the same row (next version).
    const routeBody = { campusId, academicYear: 2026, configuration: draft.configuration, effectiveFrom: "2026-01-01" };
    const viaRoute = await createAcademicModelDraft(user, routeBody);
    assert.equal(viaRoute.ok, true);
    if (!viaRoute.ok) return;
    const pick = (row: typeof draft) => ({ campusId: row.campusId, academicYear: row.academicYear, cohortKey: row.cohortKey, cohortLabel: row.cohortLabel, title: row.title, status: row.status, effectiveFrom: row.effectiveFrom.toISOString(), configuration: row.configuration, isSharedTemplate: row.isSharedTemplate, createdBy: row.createdBy });
    assert.deepEqual(pick(viaRoute.model), pick(draft));
    assert.equal(viaRoute.model.version, 2);
    const invalid = await createAcademicModelDraft(user, { campusId, academicYear: 2026, configuration: { classIds: [] } });
    assert.equal(invalid.ok, false, "an invalid configuration is the route's 400 with field errors, not a throw");
    if (!invalid.ok) assert.ok(Object.keys(invalid.fieldErrors).includes("grading"));

    const replay = await exec("academic.model.create_draft").execute(ctx, await bind(ctx, "academic.model.create_draft", input), { idempotencyKey: KEY() });
    assert.equal(replay.detail?.reconciled, true);
    assert.equal(await db.academicModelVersion.count({ where: { schoolId } }), 2, "a replay never saves the draft twice");

    const open = await prepare(ctx, "academic.model.activate", { classId: klass.id });
    assert.equal(open.kind, "DOMAIN_SCREEN");
    assert.equal(open.prefill.version, 2);

    const template = await db.policyTemplate.create({ data: { schoolId, domain: "GRADING", title: "Group grading", campusIds: [campusId], createdById: user.userId } });
    await db.policyTemplateVersion.create({ data: { schoolId, templateId: template.id, version: 1, status: "ACTIVE", values: { passingPercentage: 50 }, lockedKeys: ["passingPercentage"], effectiveFrom: new Date("2026-01-01T00:00:00Z"), submittedById: user.userId, reviewerId: randomUUID(), reviewedAt: new Date("2025-12-20T00:00:00Z"), createdById: user.userId } });
    assert.equal(await code(prepare(ctx, "academic.model.activate", { classId: klass.id })), "DOMAIN_REFUSED:GRADING_LOCKED");
    assert.equal(await db.academicModelVersion.count({ where: { schoolId, status: "ACTIVE" } }), 0);
    assert.equal(await db.gradeWeightConfig.count({ where: { schoolId } }), 0);
  });
});

test("learning actions: drafts for learners below a score with their mark as evidence; activation is a hand-off", async () => {
  const { user, schoolId, campusId, klass, maths, sana } = await fixture();
  const pupil = (fullName: string, rollNo: string) => db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName, rollNo, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } });
  const ayesha = await pupil("Ayesha Khan", "1"), hina = await pupil("Hina Raza", "2");
  const exam = await db.exam.create({ data: { schoolId, campusId, classId: klass.id, title: "Mid-term", term: "Term 1", academicYear: 2026, examType: "MID_TERM", totalMarks: 100, status: "LOCKED", activatedAt: new Date("2026-10-01Z") } });
  const low = await db.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId: ayesha.id, subjectId: maths.id, marksObtained: 32 } });
  await db.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId: hina.id, subjectId: maths.id, marksObtained: 81 } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const input = { classId: klass.id, subjectId: maths.id, belowPercent: 40, title: "Maths support", concern: "Scored below 40% in the mid-term", owner: "Sana" };
    const { bound, preview, receipt } = await confirmRun(ctx, "learning_actions.save_draft", input);
    assert.deepEqual(bound.learners.map((row: { studentId: string }) => row.studentId), [ayesha.id]);
    assert.equal(bound.ownerId, sana.id);
    assert.deepEqual(preview.counts, { drafts: 1, kept: 0 });
    assert.equal(receipt.kind, "draft");
    const plan = await db.interventionPlan.findFirstOrThrow({ where: { schoolId } });
    assert.equal(plan.status, "DRAFT");
    assert.equal(plan.evidenceState, "CONFIRMED");
    assert.deepEqual((plan.evidenceRefs as Array<{ refId: string }>).map(ref => ref.refId), [low.id]);
    assert.equal((await confirmRun(ctx, "learning_actions.save_draft", input)).receipt.detail?.reconciled, true);
    assert.equal(await db.interventionPlan.count({ where: { schoolId } }), 1);

    const opened = await prepare(ctx, "learning_actions.activate", { student: "Ayesha" });
    assert.equal(opened.kind, "DOMAIN_SCREEN");
    assert.equal(opened.prefill.recordId, plan.id);
    assert.equal(opened.detail?.ownDraft, true);
    assert.equal((await db.interventionPlan.findUniqueOrThrow({ where: { id: plan.id } })).status, "DRAFT", "the hand-off never activates");
  });
});

test("invigilation is bound to one duty and its hash; cover goes to review as a proposal; a mark correction opens its screen", async () => {
  const { user, schoolId, campusId, klass, maths, sana, bilal } = await fixture();
  const session = await db.examSession.create({ data: { schoolId, campusId, title: "Mid-terms", term: "Term 1", academicYear: 2026, examType: "MID_TERM", createdBy: user.userId } });
  const exam = await db.exam.create({ data: { schoolId, campusId, classId: klass.id, sessionId: session.id, title: "Mid-terms", term: "Term 1", academicYear: 2026, examType: "MID_TERM", totalMarks: 100, status: "ACTIVE" } });
  const schedule = await db.examSchedule.create({ data: { schoolId, campusId, examId: exam.id, subjectId: maths.id, date: new Date("2026-12-12T00:00:00Z") } });
  const room = await db.classRoom.create({ data: { schoolId, campusId, roomNumber: "101" } });
  const examRoom = await db.examRoom.create({ data: { schoolId, campusId, examScheduleId: schedule.id, roomId: room.id } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const item = exec("exams.invigilation.assign");
    const input = { session: "mid-terms", subject: "maths", room: "101", teacher: "Bilal" };
    const bound = await bind(ctx, "exams.invigilation.assign", input);
    assert.equal(bound.examRoomId, examRoom.id);
    assert.equal(bound.teacherId, bilal.id);
    assert.match(bound.expectedHash, /^[a-f0-9]{64}$/);
    // The duty changes after the preview (someone else books Sana): the bound hash no longer matches.
    await db.examInvigilation.create({ data: { schoolId, campusId, examRoomId: examRoom.id, teacherId: sana.id, createdById: user.userId } });
    assert.equal(await code(item.execute(ctx, bound, { idempotencyKey: KEY() })), "THROWN:The duty or datesheet changed. Reload before saving.");
    assert.equal((await db.examInvigilation.findFirstOrThrow({ where: { examRoomId: examRoom.id } })).teacherId, sana.id, "a stale preview writes nothing");
    const fresh = await bind(ctx, "exams.invigilation.assign", input);
    assert.notEqual(fresh.expectedHash, bound.expectedHash);
    const receipt = await item.execute(ctx, fresh, { idempotencyKey: KEY() });
    assert.equal(receipt.counts.duties, 1);
    assert.equal((await db.examInvigilation.findFirstOrThrow({ where: { examRoomId: examRoom.id } })).teacherId, bilal.id);
    assert.equal((await item.execute(ctx, fresh, { idempotencyKey: KEY() })).detail?.reconciled, true, "a replay reconciles instead of failing on the old hash");
    assert.equal(await code(bind(ctx, "exams.invigilation.assign", { session: "finals", teacher: "Bilal" })), "INPUT:/session");
  });

  // Cover: Sana is on approved leave on a Monday and teaches period 2 in a published timetable.
  const leaveType = await db.leaveType.create({ data: { schoolId, campusId, name: "Casual Leave" } });
  await db.leaveRequest.create({ data: { schoolId, campusId, userId: sana.id, leaveTypeId: leaveType.id, fromDate: new Date("2026-11-02T00:00:00Z"), toDate: new Date("2026-11-02T00:00:00Z"), status: "APPROVED", reason: "Family" } });
  const timetable = await db.timetable.create({ data: { schoolId, campusId, classId: klass.id, academicYear: 2026, status: "PUBLISHED" } });
  const lesson = await db.timetableSlot.create({ data: { schoolId, timetableId: timetable.id, dayOfWeek: 1, periodNumber: 2, startTime: "08:40", endTime: "09:20", slotType: "CLASS", subjectId: maths.id, teacherId: sana.id } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    assert.equal(await code(bind(ctx, "staff.propose_cover", { teacher: "Bilal", date: "2026-11-02" })), "DOMAIN_REFUSED:NO_UNCOVERED_LESSONS", "cover is only for a teacher on approved leave");
    const { bound, preview, receipt } = await confirmRun(ctx, "staff.propose_cover", { teacher: "Ms Sana", date: "2026-11-02", periods: [2, 3, 4] });
    assert.deepEqual(bound.duties, [{ slotId: lesson.id, teacherId: bilal.id }]);
    assert.equal(preview.counts.lessons, 1);
    assert.equal(receipt.kind, "draft");
    const record = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: receipt.entities[0].id } });
    assert.equal((record.data as { proposal: { operation: string } }).proposal.operation, "timetable.assign_substitutes");
    assert.equal(await db.schoolAiSubstituteDuty.count({ where: { schoolId } }), 0, "nothing is assigned until the proposal is reviewed");
  });

  // A pending mark correction opens on Mark corrections; the hand-off decides nothing.
  const pupil = await db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName: "Hamza Ali", rollNo: "7", gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } });
  const mark = await db.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId: pupil.id, subjectId: maths.id, marksObtained: 41 } });
  const correction = await db.correction.create({ data: { schoolId, campusId, studentId: pupil.id, kind: "MARK", sourceId: mark.id, sourceVersion: "v1", before: { marksObtained: 41 }, after: { marksObtained: 46 }, previewHash: "h", reason: "Totalling error", publicExplanation: "Marks were added up wrongly", requesterId: sana.id, requesterName: "Sana Malik", separateApprover: false } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const opened = await prepare(ctx, "corrections.decide_mark", { student: "Hamza", subject: "math", decision: "APPROVE" });
    assert.equal(opened.kind, "DOMAIN_SCREEN");
    assert.equal(opened.prefill.recordId, correction.id);
    assert.equal(opened.prefill.decision, "APPLIED");
    assert.equal((await db.correction.findUniqueOrThrow({ where: { id: correction.id } })).status, "PENDING");
    assert.equal(await code(prepare(ctx, "corrections.decide_mark", { student: "Nobody Here" })), "INPUT:/student");
  });
});
