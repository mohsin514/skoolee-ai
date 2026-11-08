import { redis } from "../../src/lib/queue/connection";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { CLASS_A_ALLOWLIST } from "../../src/lib/ai-workflows/registry/floors";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import type { CapabilityEntry, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

// The private goal and the learner's own next step run at class A; until the lead adds them to
// CLASS_A_ALLOWLIST (floors.ts), allow them here before the entries are defined.
for (const key of ["pathways.save_goal_private", "pathways.add_action"]) (CLASS_A_ALLOWLIST as Record<string, string>)[key] ??= "test: pending floors.ts entry";
let STUDENT_ENTRIES: readonly CapabilityEntry[] = [];
before(async () => { ({ STUDENT_ENTRIES } = await import("../../src/lib/ai-workflows/registry/domains/family/student")); });
const entry = (key: string) => STUDENT_ENTRIES.find(row => row.key === key) as CapabilityEntry;
const exec = (key: string) => entry(key) as ExecEntry<Record<string, unknown>>;
const handoffEntry = (key: string) => entry(key) as HandoffEntry<Record<string, unknown>>;
const key = () => `wf-${randomUUID()}`;
const DAY = 86_400_000;
const code = (wanted: string) => (error: unknown) => error instanceof WorkflowError && error.code === wanted;
const refused = (reason: string) => (error: unknown) => error instanceof WorkflowError && error.code === "DOMAIN_REFUSED" && error.params.reason === reason;

/** Sara (6A, signed in) and Bilal (6B, another learner), their teachers and one designated counsellor. */
async function fixture() {
  const schoolId = `student-${randomUUID()}`, campusId = randomUUID(); schools.push(schoolId);
  const ids = { sara: randomUUID(), bilal: randomUUID(), teacher: randomUUID(), science: randomUUID(), otherTeacher: randomUUID(), counsellor: randomUUID(), principal: randomUUID() };
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic student school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  const role = { sara: "STUDENT", bilal: "STUDENT", teacher: "TEACHER", science: "TEACHER", otherTeacher: "TEACHER", counsellor: "TEACHER", principal: "PRINCIPAL" } as const;
  for (const [name, id] of Object.entries(ids)) await db.user.create({ data: { id, schoolId, campusId, email: `${id}@example.invalid`, fullName: `Synthetic ${name}`, role: role[name as keyof typeof role], isActive: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  const own = await db.class.create({ data: { schoolId, campusId, name: "6", section: "A", academicYear: 2026, status: "ACTIVE", classTeacherId: ids.teacher } });
  const other = await db.class.create({ data: { schoolId, campusId, name: "6", section: "B", academicYear: 2026, status: "ACTIVE", classTeacherId: ids.otherTeacher } });
  await db.subject.create({ data: { schoolId, campusId, classId: own.id, name: "Science", teacherId: ids.science } });
  const sara = await db.student.create({ data: { schoolId, campusId, classId: own.id, fullName: "Synthetic Sara", rollNo: "1", gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z"), studentUserId: ids.sara } as never });
  const bilal = await db.student.create({ data: { schoolId, campusId, classId: other.id, fullName: "Synthetic Bilal", rollNo: "2", gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z"), studentUserId: ids.bilal } as never });
  await db.pathwayCounsellor.create({ data: { schoolId, campusId, userId: ids.counsellor, grantedById: ids.principal } });
  const user: AuthUser = { schoolId, campusId, userId: ids.sara, role: "STUDENT", email: `${ids.sara}@example.invalid`, accessVersion: 0 };
  const ctx = await inTenant(user, () => capabilityContext(user, campusId, "en"));
  const as = <T>(work: () => Promise<T>) => inTenant(user, work);

  /** A released online assignment addressed to one learner (as the Homework screen's release would freeze it). */
  async function homework(title: string, classId: string, studentId: string, options: { submissionMode?: string; latePolicy?: string; dueInDays?: number } = {}) {
    const assignmentId = randomUUID(), dueAt = new Date(Date.now() + (options.dueInDays ?? 3) * DAY);
    await db.assignment.create({ data: { id: assignmentId, schoolId, campusId, classId, title, instructions: "Synthetic.", status: "RELEASED", ownerId: ids.teacher, currentVersion: 1 } });
    await db.assignmentRubricVersion.create({ data: { schoolId, assignmentId, version: 1, criteria: [{ id: "clarity", title: "Clarity", description: "", maxPoints: 10 }], totalPoints: 10, createdById: ids.teacher } });
    await db.assignmentVersion.create({ data: { schoolId, assignmentId, version: 1, title, instructions: "Synthetic.", rubricVersion: 1, audience: [studentId], submissionMode: options.submissionMode ?? "ONLINE", allowedTypes: [], timezone: "Asia/Karachi", opensAt: new Date(Date.now() - 2 * DAY), dueAt, dueLocal: dueAt.toISOString().slice(0, 16), latePolicy: options.latePolicy ?? "ACCEPT_FLAGGED", resubmission: "AFTER_RETURN", resourceIds: [], releasedById: ids.teacher } });
    return assignmentId;
  }
  /** A submitted attempt of `assignmentId` whose feedback was returned. */
  async function returned(assignmentId: string, studentId: string) {
    const submission = await db.assignmentSubmission.create({ data: { schoolId, assignmentId, studentId, status: "RETURNED", latestVersion: 1 } });
    const at = new Date(Date.now() - DAY);
    const version = await db.assignmentSubmissionVersion.create({ data: { schoolId, submissionId: submission.id, assignmentId, studentId, version: 1, assignmentVersion: 1, rubricVersion: 1, mode: "ONLINE", idempotencyKey: `idem-${randomUUID()}`, receiptCode: `R-${randomUUID().slice(0, 8)}`, text: "First attempt.", artifactSha256: createHash("sha256").update(randomUUID()).digest("hex"), receivedAt: at, submittedAt: at, effectiveDueAt: new Date(), late: false, recordedById: studentId } as never });
    await db.assignmentFeedback.create({ data: { schoolId, submissionVersionId: version.id, rubricVersion: 1, criteria: [], comment: "Check each step.", totalPoints: 6, status: "RETURNED", markerId: ids.teacher, returnedAt: new Date(Date.now() - DAY / 2) } });
    return version.id;
  }
  return { user, ctx, as, schoolId, campusId, ids, own, other, sara, bilal, homework, returned };
}

test("a goal stays private until the share is confirmed; a replay reconciles to the same goal", async () => {
  const { ctx, as, schoolId, sara } = await fixture();
  const save = exec("pathways.save_goal_private");
  assert.equal(save.class, "A");
  const input = await as(() => save.resolve!(ctx, save.input.parse({ title: "Raise Maths to 80%" })));
  const first = await as(() => save.execute(ctx, input, { idempotencyKey: key() }));
  const replay = await as(() => save.execute(ctx, input, { idempotencyKey: key() }));
  assert.equal(first.counts.created, 1);
  assert.equal(replay.counts.created, 0);
  assert.equal(replay.entities[0].id, first.entities[0].id);
  const goal = await db.pathwayGoal.findFirstOrThrow({ where: { schoolId } });
  assert.equal(goal.studentId, sara.id);
  assert.deepEqual(goal.audience, [], "private: no counsellor or guardian sees it");
  assert.equal(await db.pathwayGoal.count({ where: { schoolId } }), 1);

  const share = exec("pathways.share_goal");
  assert.equal(share.class, "B");
  const bound = await as(() => share.resolve!(ctx, share.input.parse({ goal: "maths", audience: ["COUNSELLOR"] })));
  assert.equal(bound.goalId, goal.id);
  const preview = await as(() => share.preview!(ctx, bound));
  assert.equal(preview.counts.goals, 1);
  assert.ok(preview.lines.some(line => line.value === "Only me"), "the preview says who sees it now");
  assert.deepEqual((await db.pathwayGoal.findUniqueOrThrow({ where: { id: goal.id } })).audience, [], "resolve and preview share nothing");
  const shared = await as(() => share.execute(ctx, bound, { idempotencyKey: key() }));
  assert.equal(shared.counts.updated, 1);
  const after = await db.pathwayGoal.findUniqueOrThrow({ where: { id: goal.id } });
  assert.deepEqual(after.audience, ["COUNSELLOR"]);
  assert.equal(after.title, goal.title, "the goal's other fields are kept");
  assert.equal((await as(() => share.execute(ctx, bound, { idempotencyKey: key() }))).counts.updated, 0, "sharing again is harmless");
});

test("a next step is added once to the learner's own goal, and an unnamed goal among several is asked", async () => {
  const { ctx, as, schoolId } = await fixture();
  const save = exec("pathways.save_goal_private");
  await as(() => save.execute(ctx, { title: "Raise Maths to 80%" }, { idempotencyKey: key() }));
  const add = exec("pathways.add_action");
  assert.equal(add.class, "A");
  const input = await as(() => add.resolve!(ctx, add.input.parse({ title: "Finish the fractions worksheet", dueOn: "2099-01-15" })));
  const first = await as(() => add.execute(ctx, input, { idempotencyKey: key() }));
  const replay = await as(() => add.execute(ctx, input, { idempotencyKey: key() }));
  assert.equal(first.counts.created, 1);
  assert.equal(replay.counts.created, 0);
  const rows = await db.pathwayAction.findMany({ where: { schoolId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner, "STUDENT");
  const past = await as(() => add.resolve!(ctx, add.input.parse({ title: "Old step", dueOn: "2020-01-01" }))).catch(error => error);
  assert.ok(past instanceof InputRequired && past.fields[0].promptKey === "DATE_IN_PAST");
  await as(() => save.execute(ctx, { title: "Read one book a month" }, { idempotencyKey: key() }));
  const asked = await as(() => add.resolve!(ctx, add.input.parse({ title: "Another step", dueOn: "2099-01-20" }))).catch(error => error);
  assert.ok(asked instanceof InputRequired);
  assert.equal(asked.fields[0].promptKey, "GOAL_REQUIRED");
  assert.equal(asked.fields[0].options?.length, 2);
});

test("another student's goal, homework or record is SCOPE_DENIED at resolve and execute, with zero rows", async () => {
  const { ctx, as, schoolId, bilal, other, homework, ids, sara } = await fixture();
  const theirs = await db.pathwayGoal.create({ data: { schoolId, campusId: bilal.campusId, studentId: bilal.id, title: "Bilal's goal", audience: [], createdById: ids.bilal } });
  const add = exec("pathways.add_action"), share = exec("pathways.share_goal");
  await as(() => exec("pathways.save_goal_private").execute(ctx, { title: "My own goal" }, { idempotencyKey: key() }));
  await assert.rejects(as(() => add.resolve!(ctx, { goal: theirs.id, title: "Sneaky step", dueOn: "2099-01-15" })), code("SCOPE_DENIED"));
  await assert.rejects(as(() => add.execute(ctx, { goalId: theirs.id, title: "Sneaky step", dueOn: "2099-01-15" }, { idempotencyKey: key() })), code("SCOPE_DENIED"));
  await assert.rejects(as(() => share.resolve!(ctx, { goal: theirs.id, audience: ["GUARDIAN"] })), code("SCOPE_DENIED"));
  await assert.rejects(as(() => share.execute(ctx, { goalId: theirs.id, audience: ["GUARDIAN"] }, { idempotencyKey: key() })), code("SCOPE_DENIED"));
  assert.equal(await db.pathwayAction.count({ where: { schoolId } }), 0);
  assert.deepEqual((await db.pathwayGoal.findUniqueOrThrow({ where: { id: theirs.id } })).audience, []);

  const bilalWork = await homework("Bilal science", other.id, bilal.id);
  const draft = exec("assignments.save_learner_draft"), submit = exec("assignments.submit");
  await assert.rejects(as(() => draft.resolve!(ctx, { assignment: bilalWork, text: "My words" })), code("SCOPE_DENIED"));
  await assert.rejects(as(() => draft.execute(ctx, { assignment: "x", assignmentId: bilalWork, text: "My words" }, { idempotencyKey: key() })), code("SCOPE_DENIED"));
  await assert.rejects(as(() => submit.resolve!(ctx, { assignment: bilalWork })), code("SCOPE_DENIED"));
  await assert.rejects(as(() => submit.execute(ctx, { assignment: "x", assignmentId: bilalWork }, { idempotencyKey: key() })), code("SCOPE_DENIED"));
  assert.equal(await db.assignmentSubmission.count({ where: { schoolId } }), 0);
  assert.equal(await db.assignmentSubmissionVersion.count({ where: { schoolId } }), 0);

  // Reads see only the learner's own work and days.
  await homework("Sara maths", sara.classId!, sara.id);
  const work = await as(() => exec("read.student.assignments").execute(ctx, { which: "ALL" }, { idempotencyKey: key() }));
  assert.deepEqual(work.detail?.assignments && (work.detail.assignments as Array<{ title: string }>).map(row => row.title), ["Sara maths"]);
  await db.attendance.create({ data: { schoolId, campusId: sara.campusId, classId: sara.classId, studentId: sara.id, date: new Date("2026-10-05Z"), status: "PRESENT" } });
  await db.attendance.create({ data: { schoolId, campusId: bilal.campusId, classId: other.id, studentId: bilal.id, date: new Date("2026-10-05Z"), status: "ABSENT" } });
  const attendance = await as(() => exec("read.student.attendance").execute(ctx, { month: "2026-10" }, { idempotencyKey: key() }));
  assert.equal(attendance.kind, "read");
  assert.equal(attendance.counts.days, 1);
  assert.equal(attendance.counts.absent, 0);
  assert.match(String(attendance.detail?.text), /attended 1 of 1/);
  const urdu = await as(async () => exec("read.student.attendance").execute({ ...ctx, locale: "ur" }, { month: "2026-10" }, { idempotencyKey: key() }));
  assert.match(String(urdu.detail?.text), /حاضر/);
});

test("the counsellor appointment is only ever 'requested', once, with a designated counsellor", async () => {
  const { ctx, as, schoolId } = await fixture();
  const request = exec("pathways.request_appointment");
  assert.equal(request.class, "B");
  const input = await as(() => request.resolve!(ctx, request.input.parse({ date: "2099-03-10", time: "11:00" })));
  assert.ok(input.counsellorId, "the campus's only counsellor is bound");
  const preview = await as(() => request.preview!(ctx, input));
  assert.ok(preview.lines.some(line => /Requested/.test(line.value)));
  const first = await as(() => request.execute(ctx, input, { idempotencyKey: key() }));
  const replay = await as(() => request.execute(ctx, input, { idempotencyKey: key() }));
  assert.equal(first.counts.created, 1);
  assert.equal(replay.counts.created, 0);
  const rows = await db.counsellingAppointment.findMany({ where: { schoolId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "REQUESTED");
  assert.equal(first.detail?.status, "REQUESTED");
  const unknown = await as(() => request.resolve!(ctx, { counsellor: "Nobody Atall", date: "2099-03-10", time: "11:00" })).catch(error => error);
  assert.ok(unknown instanceof InputRequired && unknown.fields[0].promptKey === "COUNSELLOR_NOT_FOUND");
  const past = await as(() => request.resolve!(ctx, { date: "2020-03-10", time: "11:00" })).catch(error => error);
  assert.ok(past instanceof InputRequired && past.fields[0].promptKey === "DATE_IN_PAST");
});

test("submit runs only where online submission is open, and a replay with the same key adds no version", async () => {
  const { ctx, as, schoolId, sara, homework } = await fixture();
  const classId = sara.classId!;
  const science = await homework("Science photosynthesis", classId, sara.id);
  const paper = await homework("Paper essay", classId, sara.id, { submissionMode: "PAPER" });
  const closed = await homework("Closed quiz", classId, sara.id, { latePolicy: "REFUSE", dueInDays: -1 });
  const submit = exec("assignments.submit"), draft = exec("assignments.save_learner_draft");
  assert.equal(submit.class, "B");
  assert.equal(draft.class, "B");
  await assert.rejects(as(() => submit.resolve!(ctx, { assignment: "science" })), refused("NO_DRAFT"));
  await assert.rejects(as(() => submit.resolve!(ctx, { assignment: paper })), refused("PAPER_ONLY"));
  await assert.rejects(as(() => submit.resolve!(ctx, { assignment: closed })), refused("LATE_NOT_ACCEPTED"));

  const words = "Plants make food in their leaves using sunlight.";
  const bound = await as(() => draft.resolve!(ctx, draft.input.parse({ assignment: "science", text: words })));
  assert.equal(bound.assignmentId, science);
  assert.equal((await as(() => draft.preview!(ctx, bound))).counts.drafts, 1);
  const saved = await as(() => draft.execute(ctx, bound, { idempotencyKey: key() }));
  assert.equal(saved.kind, "draft");
  assert.equal(saved.counts.saved, 1);
  assert.equal((await as(() => draft.execute(ctx, bound, { idempotencyKey: key() }))).counts.saved, 0, "the same draft is not saved twice");
  assert.equal(await db.assignmentSubmissionVersion.count({ where: { schoolId } }), 0, "a draft is never a submission");

  const ready = await as(() => submit.resolve!(ctx, submit.input.parse({ assignment: "science photosynthesis" })));
  const preview = await as(() => submit.preview!(ctx, ready));
  assert.ok(preview.lines.some(line => /teacher to reopen/.test(line.value)), "the preview says a resubmit needs the teacher");
  const idempotencyKey = key();
  const first = await as(() => submit.execute(ctx, ready, { idempotencyKey }));
  const replay = await as(() => submit.execute(ctx, ready, { idempotencyKey }));
  assert.equal(first.counts.submitted, 1);
  assert.equal(replay.replayed, true);
  assert.equal(replay.entities[0].id, first.entities[0].id);
  const versions = await db.assignmentSubmissionVersion.findMany({ where: { schoolId } });
  assert.equal(versions.length, 1);
  assert.equal(versions[0].text, words, "the learner's own words are what was submitted");
});

test("a mark correction becomes an office task with zero correction rows", async () => {
  const { ctx, as, schoolId, sara } = await fixture();
  const correction = handoffEntry("corrections.request_office");
  assert.equal(correction.class, "C");
  assert.equal(correction.handoff.kind, "ROLE_TASK");
  assert.equal((correction as { execute?: unknown }).execute, undefined, "class C has no execute");
  const input = await as(() => correction.resolve!(ctx, correction.input.parse({ request: "My English mark in the mid-term looks wrong", topic: "MARK" })));
  const prepared = await as(() => correction.handoff.prepare(ctx, input, { idempotencyKey: key() }));
  assert.equal(prepared.kind, "ROLE_TASK");
  assert.deepEqual([...prepared.targetRoles], ["CAMPUS_ADMIN", "ADMIN"]);
  assert.equal(prepared.prefill.studentId, sara.id);
  assert.equal(prepared.prefill.request, "My English mark in the mid-term looks wrong");
  assert.equal(await db.correction.count({ where: { schoolId } }), 0);
});

test("asking a teacher for help is a draft hand-off to Messages; nothing is sent or created", async () => {
  const { ctx, as, schoolId, ids } = await fixture();
  const help = handoffEntry("study.request_help");
  assert.equal(help.class, "C");
  assert.equal(help.risk, "COMMUNICATION");
  const message = "I still don't get fractions, can you help?";
  const classTeacher = await as(() => help.resolve!(ctx, help.input.parse({ message })));
  assert.equal(classTeacher.teacherId, ids.teacher, "the class teacher by default");
  const bySubject = await as(() => help.resolve!(ctx, help.input.parse({ message, subject: "science" })));
  assert.equal(bySubject.teacherId, ids.science);
  await assert.rejects(as(() => help.resolve!(ctx, { message, teacher: ids.otherTeacher })), code("SCOPE_DENIED"), "another class's teacher is out of reach");
  const prepared = await as(() => help.handoff.prepare(ctx, classTeacher, { idempotencyKey: key() }));
  assert.equal(prepared.kind, "DOMAIN_SCREEN");
  assert.equal(prepared.prefill.draft, message);
  assert.equal(prepared.prefill.recipientId, ids.teacher);
  assert.equal(prepared.link, "/messages");
  assert.equal(await db.chatMessage.count({ where: { schoolId } }), 0);
  assert.equal(await db.conversation.count({ where: { schoolId } }), 0);
});

test("a portfolio entry made by the learner is sent for teacher review, once", async () => {
  const { ctx, as, schoolId, sara, homework, returned } = await fixture();
  const assignmentId = await homework("Fractions homework", sara.classId!, sara.id);
  const versionId = await returned(assignmentId, sara.id);
  const portfolio = exec("portfolio.student_entry");
  assert.equal(portfolio.class, "B");
  const bound = await as(() => portfolio.resolve!(ctx, portfolio.input.parse({ assignment: "fractions", reflection: "I now check each step before moving on." })));
  assert.equal(bound.earlierVersionId, versionId);
  assert.equal((await as(() => portfolio.preview!(ctx, bound))).counts.entries, 1);
  const idempotencyKey = key();
  const first = await as(() => portfolio.execute(ctx, bound, { idempotencyKey }));
  const replay = await as(() => portfolio.execute(ctx, bound, { idempotencyKey }));
  const other = await as(() => portfolio.execute(ctx, bound, { idempotencyKey: key() }));
  assert.equal(first.counts.created, 1);
  assert.equal(replay.counts.created, 0);
  assert.equal(other.counts.created, 0);
  assert.equal(other.detail?.reconciled, true);
  const rows = await db.portfolioEntry.findMany({ where: { schoolId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentId, sara.id);
  assert.equal(rows[0].status, "PROPOSED", "sent for teacher review");
  assert.equal(rows[0].reflection, "I now check each step before moving on.");
  await assert.rejects(as(() => portfolio.resolve!(ctx, { assignment: randomUUID(), reflection: "Not my work at all here." })), (error: unknown) => error instanceof InputRequired, "an unknown id is a question, not a write");
});

test("homework read answers in the learner's language and lists only open work by default", async () => {
  const { ctx, as, sara, homework } = await fixture();
  await homework("Science photosynthesis", sara.classId!, sara.id, { dueInDays: 2 });
  await homework("Maths later", sara.classId!, sara.id, { dueInDays: 20 });
  const read = exec("read.student.assignments");
  const week = await as(() => read.execute(ctx, { which: "DUE_THIS_WEEK" }, { idempotencyKey: key() }));
  assert.equal(week.counts.assignments, 1);
  assert.match(String(week.detail?.text), /Science photosynthesis/);
  const open = await as(() => read.execute({ ...ctx, locale: "ar" }, {}, { idempotencyKey: key() }));
  assert.equal(open.counts.assignments, 2);
  assert.match(String(open.detail?.text), /الأعمال المفتوحة/);
});
