import { redis } from "../../src/lib/queue/connection";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

// resources.create runs at class A; until the lead adds it to CLASS_A_ALLOWLIST (floors.ts), allow it here
// before the entries are defined, so defineCapability's floor check passes exactly as it will once listed.
(CLASS_A_ALLOWLIST as Record<string, string>)["resources.create"] ??= "test: pending floors.ts entry";
let TEACHER_TEACHING_ENTRIES: readonly CapabilityEntry[] = [];
before(async () => { ({ TEACHER_TEACHING_ENTRIES } = await import("../../src/lib/ai-workflows/registry/domains/teacher/teaching")); });
const entry = (key: string) => TEACHER_TEACHING_ENTRIES.find(row => row.key === key) as CapabilityEntry;
const exec = (key: string) => entry(key) as ExecEntry<Record<string, unknown>>;
const handoffEntry = (key: string) => entry(key) as HandoffEntry<Record<string, unknown>>;

/** A teacher who leads 6A and teaches nothing in 6B (a colleague's class on the same campus). */
async function fixture() {
  const schoolId = `teaching-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(), colleagueId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic teaching school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  for (const id of [userId, colleagueId]) await db.user.create({ data: { id, schoolId, campusId, email: `${id}@example.invalid`, fullName: "Synthetic teacher", role: "TEACHER", isActive: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  const own = await db.class.create({ data: { schoolId, campusId, name: "6", section: "A", academicYear: 2026, status: "ACTIVE", classTeacherId: userId } });
  const foreign = await db.class.create({ data: { schoolId, campusId, name: "6", section: "B", academicYear: 2026, status: "ACTIVE", classTeacherId: colleagueId } });
  const subject = await db.subject.create({ data: { schoolId, campusId, classId: own.id, name: "Mathematics", teacherId: userId } });
  const user: AuthUser = { schoolId, campusId, userId, role: "TEACHER", email: `${userId}@example.invalid`, accessVersion: 0 };
  const ctx = await inTenant(user, () => capabilityContext(user, campusId, "en"));
  /** Runs one capability phase inside the actor's tenant, as the step runner does. */
  const as = <T>(work: () => Promise<T>) => inTenant(user, work);
  return { user, ctx, as, schoolId, campusId, own, foreign, subject };
}

const homework = (classId: string, subjectId?: string) => ({ classId, ...(subjectId ? { subjectId } : {}), title: "Fractions practice", instructions: "Exercise 4.2, questions 1 to 10.", dueDate: "2026-12-03" });

test("homework is drafted once: a replay reconciles to the same draft and nothing is released", async () => {
  const { ctx, as, schoolId, own, subject } = await fixture();
  const create = exec("assignments.create");
  assert.equal(create.class, "B");
  const input = create.input.parse(homework(own.id, subject.id));
  const resolved = await as(() => create.resolve!(ctx, input));
  const preview = await as(() => create.preview!(ctx, resolved));
  assert.equal(preview.counts.assignments, 1);
  const first = await as(() => create.execute(ctx, resolved, { idempotencyKey: `wf-${randomUUID()}` }));
  const replay = await as(() => create.execute(ctx, resolved, { idempotencyKey: `wf-${randomUUID()}` }));
  assert.equal(first.counts.created, 1);
  assert.equal(replay.counts.created, 0);
  assert.equal(replay.detail?.reconciled, true);
  assert.equal(replay.entities[0].id, first.entities[0].id);
  const rows = await db.assignment.findMany({ where: { schoolId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "DRAFT");
  assert.equal(rows[0].dueLocal, "2026-12-03T23:59");
  assert.equal(await db.assignmentVersion.count({ where: { schoolId } }), 0, "no release version is frozen");
  assert.equal((await as(() => create.preview!(ctx, resolved))).counts.assignments, 0, "the preview says the draft already exists");
});

test("a foreign class is SCOPE_DENIED at resolve and at execute, and writes nothing", async () => {
  const { ctx, as, schoolId, foreign, subject } = await fixture();
  const create = exec("assignments.create");
  const input = create.input.parse(homework(foreign.id));
  await assert.rejects(as(() => create.resolve!(ctx, input)), (error: unknown) => error instanceof WorkflowError && error.code === "SCOPE_DENIED");
  await assert.rejects(as(() => create.execute(ctx, input, { idempotencyKey: `wf-${randomUUID()}` })), (error: unknown) => error instanceof WorkflowError && error.code === "SCOPE_DENIED");
  // A subject of the teacher's own class cannot be attached to someone else's class either.
  await assert.rejects(as(() => create.resolve!(ctx, create.input.parse(homework(foreign.id, subject.id)))), (error: unknown) => error instanceof WorkflowError && error.code === "SCOPE_DENIED");
  const resource = exec("resources.create");
  await assert.rejects(as(() => resource.execute(ctx, resource.input.parse({ classId: foreign.id, title: "Video", url: "https://example.org/v" }), { idempotencyKey: `wf-${randomUUID()}` })), (error: unknown) => error instanceof WorkflowError && error.code === "SCOPE_DENIED");
  const chat = handoffEntry("chat.send_message");
  await assert.rejects(as(() => chat.handoff.prepare(ctx, { classId: foreign.id, message: "Hello" }, { idempotencyKey: `wf-${randomUUID()}` })), (error: unknown) => error instanceof WorkflowError && error.code === "SCOPE_DENIED");
  assert.equal(await db.assignment.count({ where: { schoolId } }), 0);
  assert.equal(await db.learningResource.count({ where: { schoolId } }), 0);
});

test("a link resource is a staff-only draft, saved once per class even under another title", async () => {
  const { ctx, as, schoolId, own } = await fixture();
  const resource = exec("resources.create");
  assert.equal(resource.class, "A");
  assert.throws(() => resource.input.parse({ classId: own.id, title: "Video", url: "http://example.org/fractions" }), "http links are refused");
  // No class named: the teacher's only class is bound.
  const resolved = await as(() => resource.resolve!(ctx, resource.input.parse({ title: "Fractions video", url: "https://example.org/fractions" })));
  assert.equal(resolved.classId, own.id);
  const first = await as(() => resource.execute(ctx, resolved, { idempotencyKey: `wf-${randomUUID()}` }));
  const again = await as(() => resource.execute(ctx, { ...resolved, title: "Same link, new name" }, { idempotencyKey: `wf-${randomUUID()}` }));
  assert.equal(first.counts.created, 1);
  assert.equal(again.counts.created, 0);
  assert.equal(again.detail?.duplicate, true);
  const rows = await db.learningResource.findMany({ where: { schoolId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "DRAFT");
  assert.equal(rows[0].audience, "STAFF");
  assert.equal((await db.learningResourceVersion.findFirstOrThrow({ where: { resourceId: rows[0].id } })).linkUrl, "https://example.org/fractions");
});

test("the release hand-off carries the assignment id, executes nothing, and asks when the title is ambiguous", async () => {
  const { ctx, as, schoolId, own } = await fixture();
  const create = exec("assignments.create");
  const made = await as(() => create.execute(ctx, create.input.parse(homework(own.id)), { idempotencyKey: `wf-${randomUUID()}` }));
  const release = handoffEntry("assignments.release");
  assert.equal(release.class, "C");
  assert.equal(release.handoff.kind, "DOMAIN_SCREEN");
  assert.equal((release as { execute?: unknown }).execute, undefined, "class C has no execute");
  const resolved = await as(() => release.resolve!(ctx, release.input.parse({ assignment: "fractions practice" })));
  assert.equal(resolved.assignmentId, made.entities[0].id);
  const prepared = await as(() => release.handoff.prepare(ctx, resolved, { idempotencyKey: `wf-${randomUUID()}` }));
  assert.equal(prepared.prefill.assignmentId, made.entities[0].id);
  assert.equal(prepared.prefill.expectedVersion, 0);
  assert.ok(prepared.link.startsWith("/teacher/assignments?assignment="));
  assert.deepEqual([...prepared.targetRoles], ["TEACHER"]);
  const row = await db.assignment.findFirstOrThrow({ where: { schoolId } });
  assert.equal(row.status, "DRAFT", "only the teacher releases, on the Homework screen");
  await as(() => create.execute(ctx, create.input.parse({ ...homework(own.id), title: "Fractions practice 2" }), { idempotencyKey: `wf-${randomUUID()}` }));
  const asked = await as(() => release.resolve!(ctx, { assignment: "fractions" })).catch(error => error);
  assert.ok(asked instanceof InputRequired);
  assert.equal(asked.fields[0].promptKey, "ASSIGNMENT_AMBIGUOUS");
  assert.equal(asked.fields[0].options?.length, 2);
});

test("the family message hand-off carries the draft and never creates a message or conversation", async () => {
  const { ctx, as, schoolId, own } = await fixture();
  const chat = handoffEntry("chat.send_message");
  assert.equal(chat.class, "C");
  assert.equal((chat as { execute?: unknown }).execute, undefined);
  const message = "Dear parents, the science project is due next Monday.";
  const input = await as(() => chat.resolve!(ctx, chat.input.parse({ classId: own.id, message })));
  const prepared = await as(() => chat.handoff.prepare(ctx, input, { idempotencyKey: `wf-${randomUUID()}` }));
  assert.equal(prepared.prefill.draft, message);
  assert.equal(prepared.prefill.classId, own.id);
  assert.equal(prepared.link, `/messages?class=${own.id}`);
  assert.equal(await db.chatMessage.count({ where: { schoolId } }), 0);
  assert.equal(await db.conversation.count({ where: { schoolId } }), 0);
});

test("Exam Studio opens prefilled with the teacher's class and subject; a foreign class is refused", async () => {
  const { ctx, as, own, foreign, subject } = await fixture();
  const studio = handoffEntry("exam_studio.open");
  assert.equal(studio.handoff.kind, "DEEP_LINK");
  const input = await as(() => studio.resolve!(ctx, studio.input.parse({ subjectId: subject.id })));
  const prepared = await as(() => studio.handoff.prepare(ctx, input, { idempotencyKey: `wf-${randomUUID()}` }));
  assert.equal(prepared.link, `/ai/studio?classId=${own.id}&subjectId=${subject.id}`);
  assert.deepEqual(prepared.prefill, { classId: own.id, subjectId: subject.id });
  await assert.rejects(as(() => studio.resolve!(ctx, { classId: foreign.id, subjectId: subject.id })), (error: unknown) => error instanceof WorkflowError && error.code === "SCOPE_DENIED");
});

test("activities: the desk gate mirrors activityStaff; a coordinator's activity is created once", async () => {
  const { ctx, as, schoolId, campusId, user, own } = await fixture();
  const activity = exec("activities.create");
  const gate = activity.gates.find(row => row.id === "duty:activityStaff")!;
  assert.equal((await as(() => gate.check(ctx))).ok, false, "no current activity: no Activities desk");
  await db.activity.create({ data: { schoolId, campusId, kind: "CLUB", title: "Existing club", description: "", location: "Hall", startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), capacity: 10, cancellationTerms: "Free", coordinatorId: user.userId } });
  assert.equal((await as(() => gate.check(ctx))).ok, true);
  const input = activity.input.parse({ kind: "CLUB", title: "Chess club", location: "Library", date: "2026-12-05", startTime: "14:00", endTime: "15:00", capacity: 20, classIds: [own.id], cancellationTerms: "Free; cancel any time." });
  const resolved = await as(() => activity.resolve!(ctx, input));
  const first = await as(() => activity.execute(ctx, resolved, { idempotencyKey: `wf-${randomUUID()}` }));
  const replay = await as(() => activity.execute(ctx, resolved, { idempotencyKey: `wf-${randomUUID()}` }));
  assert.equal(first.counts.created, 1);
  assert.equal(replay.detail?.reconciled, true);
  assert.equal(await db.activity.count({ where: { schoolId, title: "Chess club" } }), 1);
  assert.equal((await db.activity.findFirstOrThrow({ where: { schoolId, title: "Chess club" } })).costAmount, 0);
});

test("portfolio: an unknown learner becomes a question, not a guess", async () => {
  const { ctx, as, schoolId, campusId, own } = await fixture();
  await db.student.create({ data: { schoolId, campusId, classId: own.id, fullName: "Ali Raza", rollNo: "1", status: "active", gender: "MALE" } });
  const portfolio = exec("portfolio.create_entry");
  const asked = await as(() => portfolio.resolve!(ctx, portfolio.input.parse({ classId: own.id, student: "Zainab", assignment: "Fractions practice" }))).catch(error => error);
  assert.ok(asked instanceof InputRequired);
  assert.equal(asked.fields[0].promptKey, "PUPIL_NOT_FOUND");
  assert.equal(await db.portfolioEntry.count({ where: { schoolId } }), 0);
});
