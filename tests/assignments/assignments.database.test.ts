import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import {
  assertSubmissionUploadTarget, closeAssignment, confirmDraftFile, createAssignment, getAssignment, grantExtension, listAssignments, prepareDraftFile, previewRelease,
  recordPaperSubmission, releaseAssignment, reopenSubmission, resolveSubmissionFile, returnFeedback, saveDraft, saveFeedback, submitWork, updateAssignment,
} from "../../src/lib/assignments/service";
import { sha256 } from "../../src/lib/assignments/rules";

// SKO-409 rules against the isolated database: receipts, access, deadlines, rubric versions and feedback.
const local = "postgresql://angular_dev_15@127.0.0.1:55450/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only isolated PG55450.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });

// Synthetic clock: work is released on the 19th; the class deadline is 23:00 Riyadh on the 20th (20:00Z).
const at = (iso: string) => new Date(iso);
const RELEASE = at("2026-10-19T08:00:00Z"), BEFORE = at("2026-10-20T19:00:00Z"), AFTER = at("2026-10-20T20:30:00Z");
const key = () => `k-${randomUUID()}`;
const rubric = [{ id: "claim", title: "Claim", description: "States a testable claim.", maxPoints: 4 }, { id: "evidence", title: "Evidence", description: "Uses data from the experiment.", maxPoints: 6 }];
const scores = (claim: number, evidence: number) => [{ criterionId: "claim", points: claim, comment: "Clear claim." }, { criterionId: "evidence", points: evidence, comment: "Add evidence for your claim." }];
const bytes = Buffer.from("%PDF-1.4 synthetic lab report");
const stored = async () => new ReadableStream<Uint8Array>({ start: c => { c.enqueue(new Uint8Array(bytes)); c.close(); } });
const missing = async (): Promise<ReadableStream<Uint8Array>> => { throw new Error("NoSuchKey"); };

async function school() {
  const schoolId = `asg409-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), otherClassId = randomUUID();
  schoolIds.push(schoolId);
  // The school record says Karachi; the effective LocalePolicy says Riyadh. Deadlines must follow the policy.
  await db.school.create({ data: { id: schoolId, name: "Synthetic assignment school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Main", regId: campusId, city: "Synthetic" } });
  const person = async (role: AuthUser["role"]): Promise<AuthUser> => {
    const userId = randomUUID(), email = `${userId}@example.invalid`;
    await db.user.create({ data: { id: userId, email, password: "x", fullName: `Synthetic ${role}`, role, schoolId, campusId, isActive: true, onboardingComplete: true } });
    return { userId, email, role, schoolId, campusId, accessVersion: 0, isInstitutionOwner: false };
  };
  const admin = await person("ADMIN"), teacher = await person("TEACHER"), otherTeacher = await person("TEACHER");
  const learner = await person("STUDENT"), classmate = await person("STUDENT"), outsider = await person("STUDENT"), guardian = await person("PARENT");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Riyadh" }, effectiveAt: at("2026-01-01T00:00:00Z"), createdBy: admin.userId } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 6", section: "A", academicYear: 2026, classTeacherId: teacher.userId } });
  await db.class.create({ data: { id: otherClassId, schoolId, campusId, name: "Grade 7", academicYear: 2026, classTeacherId: otherTeacher.userId } });
  const student = async (user: AuthUser, klass: string, roll: string) => (await db.student.create({ data: { schoolId, campusId, classId: klass, studentUserId: user.userId, fullName: `Synthetic pupil ${roll}`, rollNo: roll, gender: "FEMALE", enrollmentDate: at("2026-09-01T00:00:00Z") } })).id;
  const learnerId = await student(learner, classId, "01"), classmateId = await student(classmate, classId, "02");
  await student(outsider, otherClassId, "03");
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId: learnerId, guardianUserId: guardian.userId, createdByUserId: admin.userId, fullName: "Synthetic guardian", email: guardian.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: admin.userId, reason: "Synthetic assignment fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  return { schoolId, campusId, classId, otherClassId, admin, teacher, otherTeacher, learner, classmate, outsider, guardian, learnerId, classmateId };
}
type School = Awaited<ReturnType<typeof school>>;
const draft = (s: School, extra: Record<string, unknown> = {}) => ({ classId: s.classId, title: "Plant growth lab report", instructions: "Write up your plant growth experiment with a claim and evidence.", dueLocal: "2026-10-20T23:00", allowedTypes: ["PDF", "TEXT"], rubric, ...extra });
async function released(s: School, extra: Record<string, unknown> = {}) {
  const assignment = await createAssignment(s.teacher, draft(s, extra));
  await releaseAssignment(s.teacher, assignment.id, { expectedVersion: 0 }, RELEASE);
  return assignment.id;
}
async function submitText(user: AuthUser, id: string, text: string, now: Date, idempotencyKey = key()) {
  await saveDraft(user, id, { text }, now);
  return submitWork(user, id, { idempotencyKey }, now);
}
const learnerView = async (user: AuthUser, id: string, now = BEFORE) => (await getAssignment(user, id, now)).assignment as Awaited<ReturnType<typeof getAssignment>>["assignment"] & { versions: { version: number; feedback: unknown; receiptCode: string }[]; state: string; canSubmit: boolean };

test("a repeated submit request returns the same receipt and adds one version", async () => {
  const s = await school();
  const id = await released(s);
  await saveDraft(s.learner, id, { text: "Plants in light grew 4 cm more." }, BEFORE);
  const idempotencyKey = key();
  const [first, second] = await Promise.all([submitWork(s.learner, id, { idempotencyKey }, BEFORE), submitWork(s.learner, id, { idempotencyKey }, BEFORE)]);
  const third = await submitWork(s.learner, id, { idempotencyKey }, AFTER);
  assert.equal(first.receiptCode, second.receiptCode);
  assert.equal(third.receiptCode, first.receiptCode, "a retry after the deadline still returns the original receipt");
  assert.equal(third.replayed, true);
  assert.equal(await db.assignmentSubmissionVersion.count({ where: { assignmentId: id } }), 1);
  assert.equal(first.assignmentVersion, 1);
  assert.equal(first.rubricVersion, 1);
  assert.equal(first.artifactSha256, sha256("Plants in light grew 4 cm more."));
  assert.equal(new Date(first.submittedAt).toISOString(), BEFORE.toISOString(), "the server timestamp, not a client value");
  assert.equal(first.late, false);
});

test("a file submission records the stored bytes' checksum; only the owner may upload or download it", async () => {
  const s = await school();
  const id = await released(s);
  await assert.rejects(() => prepareDraftFile(s.learner, id, { fileName: "photo.png", contentType: "image/png", sizeBytes: 10 }, BEFORE), { status: 400 }, "file types follow the release");
  const { uploadUrl } = await prepareDraftFile(s.learner, id, { fileName: "Lab report.pdf", contentType: "application/pdf", sizeBytes: bytes.length }, BEFORE);
  assert.match(uploadUrl, /^\/api\/uploads\/file\?intent=/);
  await assert.rejects(() => submitWork(s.learner, id, { idempotencyKey: key() }, BEFORE), { status: 409 }, "an unfinished upload is never submitted");
  await assert.rejects(() => confirmDraftFile(s.learner, id, missing, BEFORE), { status: 409 });
  const submission = await db.assignmentSubmission.findFirstOrThrow({ where: { assignmentId: id } });
  await assert.rejects(() => assertSubmissionUploadTarget(db as never, s.classmate, submission.id, submission.draftStorageKey!), { status: 403 }, "another pupil cannot write this key");
  await assertSubmissionUploadTarget(db as never, s.learner, submission.id, submission.draftStorageKey!);
  assert.equal((await confirmDraftFile(s.learner, id, stored, BEFORE)).sha256, sha256(bytes));
  const receipt = await submitWork(s.learner, id, { idempotencyKey: key() }, BEFORE);
  assert.equal(receipt.fileSha256, sha256(bytes));
  assert.equal(receipt.artifactSha256, sha256(bytes));
  assert.ok((await resolveSubmissionFile(s.learner, id, receipt.id)).storageKey.startsWith(`submissions/${s.campusId}/${id}/${s.learnerId}/`));
  assert.ok(await resolveSubmissionFile(s.teacher, id, receipt.id));
  for (const other of [s.classmate, s.outsider, s.guardian, s.otherTeacher]) await assert.rejects(() => resolveSubmissionFile(other, id, receipt.id), { status: 404, message: "Assignment not found." });
});

test("drafts, other classes and other pupils' work return one uniform 404", async () => {
  const s = await school();
  const draftOnly = await createAssignment(s.teacher, draft(s, { title: "Unreleased draft" }));
  const id = await released(s);
  await submitText(s.learner, id, "Learner answer", BEFORE);
  const missingId = randomUUID();
  for (const [user, target] of [[s.learner, draftOnly.id], [s.guardian, draftOnly.id], [s.outsider, id], [s.learner, missingId], [s.otherTeacher, id]] as const) {
    await assert.rejects(() => getAssignment(user, target, BEFORE), { status: 404, message: "Assignment not found." });
  }
  await assert.rejects(() => submitWork(s.outsider, id, { idempotencyKey: key() }, BEFORE), { status: 404 });
  const classmate = await learnerView(s.classmate, id);
  assert.deepEqual(classmate.versions, [], "a classmate never sees another pupil's work");
  assert.deepEqual((await listAssignments(s.learner, {}, BEFORE)).assignments.map(a => a.title), ["Plant growth lab report"]);
  assert.deepEqual((await listAssignments(s.outsider, {}, BEFORE)).assignments, []);
  const opensLater = await createAssignment(s.teacher, draft(s, { title: "Opens later", opensLocal: "2026-10-21T08:00", dueLocal: "2026-10-22T23:00" }));
  await releaseAssignment(s.teacher, opensLater.id, { expectedVersion: 0 }, RELEASE);
  await assert.rejects(() => getAssignment(s.learner, opensLater.id, BEFORE), { status: 404 }, "work is hidden until it opens");
});

test("late status follows the school timezone policy and approved extensions, including an offline draft uploaded later", async () => {
  const s = await school();
  const id = await released(s);
  const release = await db.assignmentVersion.findFirstOrThrow({ where: { assignmentId: id } });
  assert.equal(release.timezone, "Asia/Riyadh");
  assert.equal(release.dueAt.toISOString(), "2026-10-20T20:00:00.000Z", "23:00 in Riyadh, not Karachi");
  await saveDraft(s.learner, id, { text: "Saved before the deadline, submitted after." }, BEFORE);
  const late = await submitWork(s.learner, id, { idempotencyKey: key() }, AFTER);
  assert.equal(late.late, true, "a draft saved on time but received late is late");
  assert.equal((await db.assignmentSubmissionVersion.findUniqueOrThrow({ where: { id: late.id } })).draftSavedAt?.toISOString(), BEFORE.toISOString());
  await assert.rejects(() => grantExtension(s.teacher, id, { studentId: s.classmateId, dueLocal: "2026-10-20T22:00", reason: "Too early" }, BEFORE), { status: 400 });
  await grantExtension(s.teacher, id, { studentId: s.classmateId, dueLocal: "2026-10-21T23:00", reason: "Medical appointment" }, BEFORE);
  const extended = await submitText(s.classmate, id, "Submitted within my extension.", AFTER);
  assert.equal(extended.late, false);
  assert.equal(new Date(extended.effectiveDueAt).toISOString(), "2026-10-21T20:00:00.000Z");
  const refusing = await released(s, { title: "Strict deadline", latePolicy: "REFUSE" });
  await saveDraft(s.learner, refusing, { text: "Too late" }, BEFORE);
  await assert.rejects(() => submitWork(s.learner, refusing, { idempotencyKey: key() }, AFTER), { status: 409 });
  const queue = (await getAssignment(s.teacher, id, AFTER)) as { queue: { studentId: string; versions: { late: boolean }[]; extension: unknown }[] };
  assert.equal(queue.queue.find(q => q.studentId === s.learnerId)?.versions[0].late, true, "late work is labelled, never hidden");
  assert.ok(queue.queue.find(q => q.studentId === s.classmateId)?.extension);
});

test("a teacher records paper work; a retry does not duplicate it", async () => {
  const s = await school();
  const id = await released(s, { submissionMode: "BOTH" });
  const idempotencyKey = key();
  const paper = await recordPaperSubmission(s.teacher, id, { studentId: s.learnerId, note: "Three handwritten pages", receivedLocal: "2026-10-20T23:30", idempotencyKey }, AFTER);
  assert.equal(paper.mode, "PAPER");
  assert.equal(paper.late, true, "received 23:30 local is after the 23:00 deadline");
  assert.equal((await recordPaperSubmission(s.teacher, id, { studentId: s.learnerId, note: "Three handwritten pages", idempotencyKey }, AFTER)).receiptCode, paper.receiptCode);
  await assert.rejects(() => recordPaperSubmission(s.teacher, id, { studentId: randomUUID(), note: "Not a recipient", idempotencyKey: key() }, AFTER), { status: 400 });
  await assert.rejects(() => recordPaperSubmission(s.otherTeacher, id, { studentId: s.learnerId, note: "Not my class", idempotencyKey: key() }, AFTER), { status: 404 });
  const online = await released(s, { title: "Online only" });
  await assert.rejects(() => recordPaperSubmission(s.teacher, online, { studentId: s.learnerId, note: "Paper", idempotencyKey: key() }, AFTER), { status: 409 });
});

test("an invalid rubric blocks release; a rubric change never alters existing submissions", async () => {
  const s = await school();
  const empty = await createAssignment(s.teacher, draft(s, { rubric: [] }));
  await assert.rejects(() => releaseAssignment(s.teacher, empty.id, { expectedVersion: 0 }, RELEASE), { status: 400, message: /at least one rubric criterion/ });
  await assert.rejects(() => createAssignment(s.teacher, draft(s, { rubric: [{ ...rubric[0], maxPoints: 0 }] })), /too_small|>=1/i);
  const id = await released(s);
  const v1 = await submitText(s.learner, id, "First answer", BEFORE);
  const current = await db.assignment.findUniqueOrThrow({ where: { id } });
  const changed = [...rubric.map(c => c.id === "evidence" ? { ...c, maxPoints: 8 } : c), { id: "method", title: "Method", description: "", maxPoints: 2 }];
  const { classId: _classId, ...edit } = draft(s, { rubric: changed });
  await updateAssignment(s.teacher, id, { ...edit, expectedUpdatedAt: current.updatedAt.toISOString() });
  const preview = await previewRelease(s.teacher, id, BEFORE);
  assert.deepEqual(preview.impact, { earlierSubmissions: 1, keepsRubricVersion: 1 }, "the teacher sees the effect before releasing");
  assert.equal(preview.rubricVersion, 2);
  await assert.rejects(() => releaseAssignment(s.teacher, id, { expectedVersion: 0 }, BEFORE), { status: 409 }, "a stale release is refused");
  await releaseAssignment(s.teacher, id, { expectedVersion: 1 }, BEFORE);
  const kept = await db.assignmentSubmissionVersion.findUniqueOrThrow({ where: { id: v1.id } });
  assert.equal(kept.rubricVersion, 1);
  assert.equal(kept.assignmentVersion, 1);
  await assert.rejects(() => saveFeedback(s.teacher, id, { submissionVersionId: v1.id, scores: [{ criterionId: "method", points: 1, comment: "" }] }), { status: 400 }, "marking uses the submission's own rubric");
  await assert.rejects(() => saveFeedback(s.teacher, id, { submissionVersionId: v1.id, scores: scores(4, 8) }), { status: 400 }, "evidence is still out of 6 for this submission");
  await assert.rejects(() => db.assignmentRubricVersion.updateMany({ where: { assignmentId: id, version: 1 }, data: { totalPoints: 99 } }), /immutable/);
  await assert.rejects(() => db.assignmentVersion.updateMany({ where: { assignmentId: id, version: 1 }, data: { instructions: "changed" } }), /immutable/);
  const v2 = await submitText(s.classmate, id, "Answer under the new rubric", BEFORE);
  assert.equal(v2.rubricVersion, 2);
});

test("returning feedback keeps earlier versions and comments; another version needs a reopen", async () => {
  const s = await school();
  const id = await released(s);
  const first = await submitText(s.learner, id, "First attempt", BEFORE);
  await returnFeedback(s.teacher, id, { submissionVersionId: first.id, scores: scores(3, 4), comment: "Good start." }, BEFORE);
  assert.equal((await learnerView(s.learner, id)).state, "RETURNED");
  await saveDraft(s.learner, id, { text: "Edited after return" }, BEFORE).then(() => assert.fail("drafting is closed after return"), error => assert.equal(error.status, 409));
  await reopenSubmission(s.teacher, id, { studentId: s.learnerId });
  const second = await submitText(s.learner, id, "Second attempt with evidence", BEFORE);
  assert.equal(second.version, 2);
  await returnFeedback(s.teacher, id, { submissionVersionId: second.id, scores: scores(4, 6), comment: "Much stronger.", allowRevision: true }, BEFORE);
  const view = await learnerView(s.learner, id);
  assert.deepEqual(view.versions.map(v => v.version), [2, 1]);
  assert.equal((view.versions[1].feedback as { comment: string }).comment, "Good start.", "earlier comments remain");
  assert.equal(view.state, "REOPENED");
  await assert.rejects(() => db.assignmentFeedback.updateMany({ where: { submissionVersionId: first.id }, data: { comment: "rewritten" } }), /cannot be changed/);
  await assert.rejects(() => returnFeedback(s.teacher, id, { submissionVersionId: first.id, scores: scores(4, 6) }, BEFORE), { status: 409 });
  const never = await released(s, { title: "No resubmission", resubmission: "NEVER" });
  const once = await submitText(s.learner, never, "Only attempt", BEFORE);
  await assert.rejects(() => returnFeedback(s.teacher, never, { submissionVersionId: once.id, scores: scores(2, 2), allowRevision: true }, BEFORE), { status: 409 });
});

test("unreturned feedback and gradebook requests never reach learners or families", async () => {
  const s = await school();
  const id = await released(s);
  const receipt = await submitText(s.learner, id, "My answer", BEFORE);
  await saveFeedback(s.teacher, id, { submissionVersionId: receipt.id, scores: scores(1, 1), comment: "Private marking note", requestGradebookTransfer: true });
  assert.equal((await learnerView(s.learner, id)).versions[0].feedback, null);
  const family = (await listAssignments(s.guardian, {}, BEFORE)).assignments as unknown as { versions: { feedback: unknown; text: string }[] }[];
  assert.equal(family.length, 1);
  assert.equal(family[0].versions[0].feedback, null);
  assert.equal(family[0].versions[0].text, "", "families see status, not the work itself");
  assert.doesNotMatch(JSON.stringify(await listAssignments(s.guardian, {}, BEFORE)), /Private marking note|gradebook/i);
  await returnFeedback(s.teacher, id, { submissionVersionId: receipt.id, scores: scores(3, 5), comment: "Returned comment", requestGradebookTransfer: true }, BEFORE);
  const returned = JSON.stringify(await listAssignments(s.guardian, {}, BEFORE));
  assert.match(returned, /Returned comment/);
  assert.doesNotMatch(returned, /gradebook|REQUESTED/i, "a transfer request stays with staff");
  assert.equal((await db.assignmentFeedback.findFirstOrThrow({ where: { submissionVersionId: receipt.id } })).gradebookTransfer, "REQUESTED");
  await assert.rejects(() => db.$executeRawUnsafe(`UPDATE assignment_feedback SET gradebook_transfer = 'APPLIED' WHERE submission_version_id = '${receipt.id}'`), /cannot be changed|gradebook_unapplied/);
});

test("leaving the class keeps historical access but stops new submissions", async () => {
  const s = await school();
  const id = await released(s);
  await submitText(s.learner, id, "Before moving class", BEFORE);
  await db.student.update({ where: { id: s.learnerId }, data: { archivedAt: new Date(), archiveReason: "Synthetic transfer out" } });
  const view = await learnerView(s.learner, id);
  assert.equal(view.versions.length, 1, "their own work stays readable");
  assert.equal(view.canSubmit, false);
  await assert.rejects(() => submitWork(s.learner, id, { idempotencyKey: key() }, BEFORE), { status: 409 });
  await closeAssignment(s.teacher, id);
  await assert.rejects(() => submitText(s.classmate, id, "After close", BEFORE), { status: 409 });
});

test("receipts are immutable and rows are deleted only with their school", async () => {
  const s = await school();
  const id = await released(s);
  const receipt = await submitText(s.learner, id, "Immutable", BEFORE);
  await assert.rejects(() => db.assignmentSubmissionVersion.updateMany({ where: { id: receipt.id }, data: { late: true } }), /immutable/);
  await assert.rejects(() => db.assignmentSubmissionVersion.deleteMany({ where: { id: receipt.id } }), /kept/);
  await assert.rejects(() => db.assignment.deleteMany({ where: { id } }), /kept/);
  await assert.rejects(() => db.$executeRawUnsafe(`UPDATE assignments SET external_ref = 'not namespaced' WHERE id = '${id}'`), /namespaced/);
  assert.ok(await db.auditLog.count({ where: { schoolId: s.schoolId, tableName: "assignments", recordId: id } }) >= 3, "create, release and submit are audited");
  await db.school.delete({ where: { id: s.schoolId } });
  assert.equal(await db.assignmentSubmissionVersion.count({ where: { id: receipt.id } }), 0);
});
