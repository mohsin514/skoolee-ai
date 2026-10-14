import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma, type TxClient } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, findWorkspaceCreateByKey, getApprovedWorkspaceRevision, getWorkspaceRecord, listWorkspaceRecords, listWorkspaceRevisions, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { getWorkspaceCapabilities } from "../../src/lib/school-ai/access";
import type { CurriculumData, PaperData } from "../../src/lib/school-ai/assessment";
import { executeSchoolAiTool, previewSchoolAiExecution, listSchoolAiExecutions } from "../../src/lib/school-ai/execution";
import { consumeAICreditAndLog } from "../../src/lib/ai/openai";
import { getPlanLimits } from "../../src/config/plans";
import { beginSchoolAiRequest, completeSchoolAiRequest, failSchoolAiRequest } from "../../src/lib/school-ai/requests";
import type { AcademicSetupProposal } from "../../src/lib/school-ai/academic-setup";

// Fail before any connection: these tests must never use the application's configured school database.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only the isolated school AI PostgreSQL fixture on 127.0.0.1:55438/postgres.");
const raw = new PrismaClient();
const schoolId = `ai-workspace-${randomUUID()}`;
const foreignSchoolId = `ai-workspace-foreign-${randomUUID()}`;
const campusId = randomUUID(), otherCampusId = randomUUID(), foreignCampusId = randomUUID();
const classId = randomUUID(), subjectId = randomUUID(), anotherSubjectId = randomUUID();
const actor = (role: AuthUser["role"], campus: string | null = campusId, school = schoolId): AuthUser => ({ userId: randomUUID(), schoolId: school, campusId: campus, email: `${randomUUID()}@example.invalid`, role });
const admin = actor("CAMPUS_ADMIN"), teacher = actor("TEACHER"), otherTeacher = actor("TEACHER"), accountant = actor("ACCOUNTANT"), principal = actor("PRINCIPAL"), group = actor("SUPER_ADMIN", null), foreignAdmin = actor("CAMPUS_ADMIN", foreignCampusId, foreignSchoolId);
const context = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, fn);
const source = (extra: Record<string, unknown> = {}) => ({ extractedText: "Integers: compare positive and negative values.", documentKind: "syllabus", fileName: "Synthetic syllabus.txt", mimeType: "text/plain", subjectId, classId, origin: "manual", ...extra });
const createSource = (user: AuthUser = admin, extra: Record<string, unknown> = {}) => createWorkspaceRecord(user, { kind: "SOURCE", title: "Synthetic syllabus", campusId, data: source(extra), idempotencyKey: randomUUID() });
const curriculum = (): CurriculumData => ({ subjectId, classId, academicYear: "2026", board: "Synthetic curriculum", sources: [{ id: "source-1", title: "Synthetic syllabus", kind: "SYLLABUS", reference: "Synthetic document, page 1", excerpt: "Integers: compare positive and negative values.", approved: true }], outcomes: [{ id: "outcome-1", title: "Compare integers", sourceId: "source-1", sourcePage: "1", taught: true, included: true }] });

before(async () => {
  for (const id of [schoolId, foreignSchoolId]) await raw.school.create({ data: { id, name: "Synthetic AI school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", timezone: "Asia/Karachi" } });
  for (const [id, school] of [[campusId, schoolId], [otherCampusId, schoolId], [foreignCampusId, foreignSchoolId]]) await raw.campus.create({ data: { id, schoolId: school, name: "Synthetic campus", regId: id, city: "Synthetic" } });
  for (const user of [admin, teacher, otherTeacher, accountant, principal, group, foreignAdmin]) await raw.user.create({ data: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId } });
  await raw.subject.create({ data: { id: anotherSubjectId, schoolId, campusId, classId, name: "Science", teacherId: otherTeacher.userId } });
  await raw.rolePermission.create({ data: { schoolId, role: "ACCOUNTANT", module: "ai", canView: true, canAdd: true, canEdit: false, canDelete: false } });
  await raw.rolePermission.create({ data: { schoolId, role: "ACCOUNTANT", module: "fees", canView: false, canAdd: false, canEdit: false, canDelete: false } });
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "Synthetic 2026", academicYear: 2026, status: "ACTIVE", startDate: new Date("2026-08-01"), endDate: new Date("2027-06-30") } });
});
after(async () => {
  await raw.schoolAiExecution.deleteMany({ where: { schoolId: { in: [schoolId, foreignSchoolId] } } });
  await raw.school.deleteMany({ where: { id: { in: [schoolId, foreignSchoolId] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("durable save creates one scoped revision and an audit without document content", async () => {
  const record = await createSource();
  assert.equal(record.version, 1);
  assert.equal(record.status, "DRAFT");
  assert.equal((await getWorkspaceRecord(admin, record.id)).data.extractedText, source().extractedText);
  const revisions = await listWorkspaceRevisions(admin, record.id);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].action, "CREATE");
  const audit = await context(admin, () => prisma.auditLog.findFirstOrThrow({ where: { recordId: record.id } }));
  assert.equal(JSON.stringify(audit.newValue).includes(source().extractedText), false);
});

test("same actor and request are idempotent, changed payload conflicts, and concurrent retries create only once", async () => {
  const input = { kind: "SOURCE" as const, title: "Idempotent source", campusId, data: source(), idempotencyKey: randomUUID() };
  const [a, b] = await Promise.all([createWorkspaceRecord(admin, input), createWorkspaceRecord(admin, input)]);
  assert.equal(a.id, b.id);
  assert.equal((await listWorkspaceRevisions(admin, a.id)).length, 1);
  assert.equal((await findWorkspaceCreateByKey(admin, input.idempotencyKey))?.id, a.id);
  assert.equal(await findWorkspaceCreateByKey(principal, input.idempotencyKey), null);
  await assert.rejects(() => createWorkspaceRecord(admin, { ...input, title: "Changed request" }), { status: 409 });
});

test("concurrent independent creates across tenants commit their own record, revision and audit", async () => {
  const writes = Array.from({ length: 6 }, (_, index) => {
    const user = index % 2 ? foreignAdmin : admin;
    return { user, input: { kind: "SOURCE" as const, title: `Independent source ${index}`, campusId: user.campusId, idempotencyKey: randomUUID(), data: { extractedText: `Synthetic evidence ${index}.`, documentKind: "other", fileName: "synthetic.txt", mimeType: "text/plain", origin: "manual" } } };
  });
  const records = await Promise.all(writes.map(({ user, input }) => createWorkspaceRecord(user, input)));
  assert.equal(new Set(records.map(record => record.id)).size, writes.length);
  for (const [index, record] of records.entries()) {
    const { user, input } = writes[index];
    assert.equal(record.title, input.title);
    assert.equal(record.campusId, user.campusId);
    assert.equal((await listWorkspaceRevisions(user, record.id)).length, 1);
    assert.equal(await raw.auditLog.count({ where: { schoolId: user.schoolId, recordId: record.id } }), 1);
    await assert.rejects(() => getWorkspaceRecord(user.schoolId === schoolId ? foreignAdmin : admin, record.id), { status: 404 });
  }
});

test("campus spoofing, school crossover, family reads and hidden-source cursors fail closed", async () => {
  const record = await createSource();
  await assert.rejects(() => createWorkspaceRecord(admin, { kind: "SOURCE", title: "Other campus", campusId: otherCampusId, data: source(), idempotencyKey: randomUUID() }), { status: 403 });
  await assert.rejects(() => getWorkspaceRecord(foreignAdmin, record.id), { status: 404 });
  await assert.rejects(() => listWorkspaceRecords(foreignAdmin, { cursor: record.id }), { status: 404 });
  for (const role of ["PARENT", "STUDENT", "APP_OWNER"] as const) await assert.rejects(() => getWorkspaceRecord({ ...admin, role }, record.id), { status: 403 });
  const broad = await createWorkspaceRecord(group, { kind: "POLICY", title: "Group policy", data: { mode: "draft_only", instructions: "Save drafts for review.", scope: "school", requiresApproval: true }, idempotencyKey: randomUUID() });
  assert.equal(broad.campusId, null);
  await assert.rejects(() => getWorkspaceRecord(admin, broad.id), { status: 404 });
});

test("teacher ownership and subject assignments constrain create, list, get and edit", async () => {
  const own = await createSource(teacher);
  await assert.rejects(() => createSource(teacher, { subjectId: anotherSubjectId }), { status: 403 });
  await assert.rejects(() => getWorkspaceRecord(otherTeacher, own.id), { status: 404 });
  await assert.rejects(() => updateWorkspaceRecord(otherTeacher, own.id, { version: own.version, title: "Take over" }), { status: 404 });
  assert((await listWorkspaceRecords(teacher)).records.some((item) => item.id === own.id));
  assert(!(await listWorkspaceRecords(otherTeacher)).records.some((item) => item.id === own.id));
  const updated = await updateWorkspaceRecord(teacher, own.id, { version: own.version, title: "Teacher revised draft" });
  assert.equal(updated.version, 2);
  await assert.rejects(() => updateWorkspaceRecord(teacher, own.id, { version: updated.version, action: "approve" }), { status: 403 });
  await assert.rejects(() => createWorkspaceRecord(teacher, { kind: "POLICY", title: "School rule", campusId, data: { mode: "draft_only", instructions: "Rule", scope: "school", requiresApproval: true }, idempotencyKey: randomUUID() }), { status: 403 });
});

test("shared approved evidence is readable but unpublished revision history and write access remain private", async () => {
  let record = await createSource(admin, { extractedText: "Unpublished staff notes" });
  record = await updateWorkspaceRecord(admin, record.id, { version: record.version, data: source() });
  record = await updateWorkspaceRecord(admin, record.id, { version: record.version, action: "approve" });
  assert.equal((await getWorkspaceRecord(teacher, record.id)).status, "APPROVED");
  const revisions = await listWorkspaceRevisions(teacher, record.id);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].status, "APPROVED");
  assert.equal(JSON.stringify(revisions).includes("Unpublished staff notes"), false);
  await assert.rejects(() => updateWorkspaceRecord(teacher, record.id, { version: record.version, title: "Overwrite school evidence" }), { status: 404 });
});

test("trusted intake metadata survives corrections and cannot be spoofed through ordinary creates", async () => {
  await assert.rejects(() => createSource(admin, { storageKey: "another-school/file.pdf" }), { status: 400 });
  const input = { kind: "SOURCE" as const, title: "Uploaded source", campusId, data: source(), idempotencyKey: randomUUID() };
  const record = await createWorkspaceRecord(admin, input, { trustedSourceMetadata: { storageKey: `${schoolId}/source-one.pdf`, sha256: "a".repeat(64), extractedAt: "2026-10-12T00:00:00Z" } });
  const retry = await createWorkspaceRecord(admin, input, { trustedSourceMetadata: { storageKey: `${schoolId}/source-two.pdf`, sha256: "a".repeat(64), extractedAt: "2026-10-12T00:01:00Z" } });
  assert.equal(record.id, retry.id);
  assert.equal(retry.data.storageKey, record.data.storageKey);
  const corrected = await updateWorkspaceRecord(admin, record.id, { version: record.version, data: source({ extractedText: "Corrected source text" }) });
  assert.equal(corrected.data.storageKey, record.data.storageKey);
  await assert.rejects(() => updateWorkspaceRecord(admin, record.id, { version: corrected.version, data: { ...corrected.data, storageKey: "spoof" } }), { status: 400 });
});

test("approval/save race commits one version only; editing an approved record preserves its old approved snapshot", async () => {
  const record = await createSource();
  const outcomes = await Promise.allSettled([
    updateWorkspaceRecord(admin, record.id, { version: record.version, action: "approve" }),
    updateWorkspaceRecord(admin, record.id, { version: record.version, title: "Concurrently changed" }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const rejection = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejection.reason.status, 409);
  let latest = await getWorkspaceRecord(admin, record.id);
  assert.equal(latest.version, 2);
  if (latest.status !== "APPROVED") latest = await updateWorkspaceRecord(admin, record.id, { version: latest.version, action: "approve" });
  const approvedVersion = latest.version;
  const modified = await updateWorkspaceRecord(admin, record.id, { version: latest.version, title: "New draft" });
  assert.equal(modified.status, "DRAFT");
  assert.equal((await getApprovedWorkspaceRevision(admin, record.id, approvedVersion)).title, latest.title);
  assert.equal((await listWorkspaceRevisions(admin, record.id)).length, modified.version);
});

test("incomplete evidence cannot enter review and archived records remain immutable", async () => {
  const blocked = await createSource(admin, { uncertainties: ["A page is missing"], extractionStatus: "needs_review" });
  await assert.rejects(() => updateWorkspaceRecord(admin, blocked.id, { version: 1, action: "review" }), { status: 422 });
  const archived = await updateWorkspaceRecord(admin, blocked.id, { version: 1, action: "archive" });
  await assert.rejects(() => updateWorkspaceRecord(admin, blocked.id, { version: archived.version, title: "Restore" }), { status: 409 });
});

test("paper approval is tied to the current approved curriculum and validated answer key", async () => {
  let approvedCurriculum = await createWorkspaceRecord(admin, { kind: "CURRICULUM", title: "Synthetic approved mathematics", campusId, data: curriculum(), idempotencyKey: randomUUID() });
  approvedCurriculum = await updateWorkspaceRecord(admin, approvedCurriculum.id, { version: 1, action: "approve" });
  const paper: PaperData = {
    curriculumId: approvedCurriculum.id, curriculumVersion: approvedCurriculum.version, subjectId, classId, language: "en",
    blueprint: { title: "Compare integers", durationMinutes: 10, totalMarks: 2, instructions: "Choose one answer.", sections: [{ id: "section-1", title: "Integers", questionCount: 1, answerCount: 1, marksPerQuestion: 2, type: "SINGLE_CHOICE", outcomeIds: ["outcome-1"] }] },
    questions: [{ id: "q1", sectionId: "section-1", type: "SINGLE_CHOICE", prompt: "Which is greater: -1 or 1?", marks: 2, options: [{ id: "a", text: "-1" }, { id: "b", text: "1" }], correctOptionId: "b", modelAnswer: "1 is greater than -1.", rubric: [{ id: "r1", criterion: "Select 1.", marks: 2 }], outcomeIds: ["outcome-1"], sourceRefs: [{ sourceId: "source-1", page: "1", excerpt: "compare positive and negative values" }], locked: false }],
    generation: { kind: "MANUAL", model: null, generatedAt: null },
  };
  const draft = await createWorkspaceRecord(teacher, { kind: "PAPER", title: "Synthetic paper", campusId, data: paper, idempotencyKey: randomUUID() });
  const submitted = await updateWorkspaceRecord(teacher, draft.id, { version: draft.version, action: "review" });
  assert.equal(submitted.status, "IN_REVIEW");
  const approved = await updateWorkspaceRecord(admin, submitted.id, { version: submitted.version, action: "approve" });
  assert.equal(approved.status, "APPROVED");
  const pending = await createWorkspaceRecord(teacher, { kind: "PAPER", title: "Stale paper", campusId, data: paper, idempotencyKey: randomUUID() });
  await updateWorkspaceRecord(admin, approvedCurriculum.id, { version: approvedCurriculum.version, title: "Changed curriculum" });
  await assert.rejects(() => updateWorkspaceRecord(admin, pending.id, { version: pending.version, action: "approve" }), { status: 422 });
});

test("finance source permissions remain enforced even when general AI authoring is granted", async () => {
  await assert.rejects(() => createWorkspaceRecord(accountant, { kind: "SOURCE", title: "Denied fee sheet", campusId, data: source({ documentKind: "fee_sheet" }), idempotencyKey: randomUUID() }), { status: 403 });
  const own = await createWorkspaceRecord(accountant, { kind: "SOURCE", title: "Own note", campusId, data: { extractedText: "Operational note", documentKind: "other", fileName: "Note", mimeType: "text/plain" }, idempotencyKey: randomUUID() });
  assert.equal((await getWorkspaceRecord(accountant, own.id)).id, own.id);
  const unrelated = await createSource();
  await assert.rejects(() => getWorkspaceRecord(accountant, unrelated.id), { status: 404 });
});

test("capabilities reuse real scope and facts without inventing migration defaults", async () => {
  const caps = await context(admin, () => getWorkspaceCapabilities(admin));
  assert.equal(caps.setupDefaults?.schoolName, "Synthetic AI school");
  assert.equal(caps.setupDefaults?.academicYear, "2026");
  assert.equal(caps.setupDefaults?.startDate, "2026-08-01");
  assert.equal(caps.campuses.length, 1);
  const teacherCaps = await context(teacher, () => getWorkspaceCapabilities(teacher));
  assert.equal(teacherCaps.canApprove, false);
  assert.deepEqual(teacherCaps.subjects.map((subject) => subject.id), [subjectId]);
  assert.equal("country" in (teacherCaps.setupDefaults ?? {}), false);
});

test("database rejects revision mutation independently of repository code", async () => {
  const record = await createSource();
  const revision = (await listWorkspaceRevisions(admin, record.id))[0];
  await assert.rejects(() => raw.schoolAiRevision.update({ where: { id: revision.id }, data: { title: "Silently rewrite approval history" } }), /immutable/);
});

async function approvedImportCurriculum(label: string, outcomeTitle = `Outcome ${randomUUID()}`) {
  const data = curriculum();
  data.outcomes[0].title = outcomeTitle;
  const draft = await createWorkspaceRecord(admin, { kind: "CURRICULUM", title: label, campusId, data, idempotencyKey: randomUUID() });
  return updateWorkspaceRecord(admin, draft.id, { version: draft.version, action: "approve" });
}

test("real curriculum tool imports missing syllabus topics and records one durable receipt and audit", async () => {
  const record = await approvedImportCurriculum("Import a real topic");
  const preview = await previewSchoolAiExecution(admin, record.id, "curriculum.import_topics", record.version);
  assert.equal(preview.willCreate.length, 1);
  const request = { operation: "curriculum.import_topics" as const, version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() };
  const result = await executeSchoolAiTool(admin, record.id, request);
  assert.equal(result.createdCount, 1);
  assert.equal(result.keptCount, 0);
  assert.equal(result.status, "COMPLETED");
  const topic = await raw.syllabusTopic.findUniqueOrThrow({ where: { id: result.topicIds[0] } });
  assert.equal(topic.subjectId, subjectId);
  assert.equal(topic.schoolId, schoolId);
  assert.equal(topic.status, "NOT_STARTED");
  assert(topic.description?.includes(`version ${record.version}`));
  assert.equal((await listSchoolAiExecutions(admin, record.id)).length, 1);
  assert.equal((await raw.auditLog.findMany({ where: { recordId: result.id } })).length, 1);
  const replay = await executeSchoolAiTool(admin, record.id, request);
  assert.equal(replay.id, result.id);
  const secondKey = await executeSchoolAiTool(admin, record.id, { ...request, idempotencyKey: randomUUID() });
  assert.equal(secondKey.id, result.id);
  assert.equal((await raw.syllabusTopic.count({ where: { id: { in: result.topicIds } } })), 1);
});

test("existing manually edited syllabus topic and progress are preserved", async () => {
  const title = `Preserved ${randomUUID()}`;
  const manual = await raw.syllabusTopic.create({ data: { schoolId, subjectId, title: `  ${title.toUpperCase()}  `, description: "Teacher's original explanation", order: 42, status: "COMPLETED", completedAt: new Date("2026-10-01") } });
  const record = await approvedImportCurriculum("Keep manual teaching records", title);
  const preview = await previewSchoolAiExecution(admin, record.id, "curriculum.import_topics", record.version);
  assert.equal(preview.willCreate.length, 0);
  assert.equal(preview.willKeep[0].topicId, manual.id);
  const result = await executeSchoolAiTool(admin, record.id, { operation: "curriculum.import_topics", version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() });
  assert.equal(result.createdCount, 0);
  assert.equal(result.keptCount, 1);
  assert.deepEqual(await raw.syllabusTopic.findUnique({ where: { id: manual.id } }), manual);
});

test("concurrent tool retries produce one set of real topics and the same durable execution", async () => {
  const record = await approvedImportCurriculum("Concurrent topic import");
  const preview = await previewSchoolAiExecution(admin, record.id, "curriculum.import_topics", record.version);
  const request = { operation: "curriculum.import_topics" as const, version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() };
  const [a, b] = await Promise.all([executeSchoolAiTool(admin, record.id, request), executeSchoolAiTool(admin, record.id, request)]);
  assert.equal(a.id, b.id);
  assert.equal(await raw.syllabusTopic.count({ where: { schoolId, subjectId, title: preview.willCreate[0].title } }), 1);
});

test("changed syllabus preview blocks execution without creating topics or receipts", async () => {
  const record = await approvedImportCurriculum("Detect changed existing syllabus");
  const preview = await previewSchoolAiExecution(admin, record.id, "curriculum.import_topics", record.version);
  await raw.syllabusTopic.create({ data: { schoolId, subjectId, title: `Concurrent manual topic ${randomUUID()}` } });
  await assert.rejects(() => executeSchoolAiTool(admin, record.id, { operation: "curriculum.import_topics", version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() }), { status: 409 });
  assert.equal(await raw.syllabusTopic.count({ where: { schoolId, title: preview.willCreate[0].title } }), 0);
  assert.equal(await raw.schoolAiExecution.count({ where: { schoolId, recordId: record.id } }), 0);
});

test("tool rejects draft or changed curriculum, unauthorized roles, and another campus", async () => {
  const record = await approvedImportCurriculum("Authorization for real imports");
  await assert.rejects(() => previewSchoolAiExecution(teacher, record.id, "curriculum.import_topics", record.version), { status: 403 });
  await assert.rejects(() => previewSchoolAiExecution(foreignAdmin, record.id, "curriculum.import_topics", record.version), { status: 404 });
  await assert.rejects(() => previewSchoolAiExecution({ ...admin, campusId: otherCampusId }, record.id, "curriculum.import_topics", record.version), { status: 404 });
  const preview = await previewSchoolAiExecution(admin, record.id, "curriculum.import_topics", record.version);
  await updateWorkspaceRecord(admin, record.id, { version: record.version, title: "Changed after approval" });
  await assert.rejects(() => executeSchoolAiTool(admin, record.id, { operation: "curriculum.import_topics", version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() }), { status: 409 });
});

test("execution key cannot be reused to apply a different approved artifact", async () => {
  const first = await approvedImportCurriculum("First effect");
  const firstPreview = await previewSchoolAiExecution(admin, first.id, "curriculum.import_topics", first.version);
  const key = randomUUID();
  await executeSchoolAiTool(admin, first.id, { operation: "curriculum.import_topics", version: first.version, previewHash: firstPreview.previewHash, idempotencyKey: key });
  const second = await approvedImportCurriculum("Second effect");
  const secondPreview = await previewSchoolAiExecution(admin, second.id, "curriculum.import_topics", second.version);
  await assert.rejects(() => executeSchoolAiTool(admin, second.id, { operation: "curriculum.import_topics", version: second.version, previewHash: secondPreview.previewHash, idempotencyKey: key }), { status: 409 });
  assert.equal(await raw.schoolAiExecution.count({ where: { schoolId, recordId: second.id } }), 0);
});

const usage = (feature: string) => ({ schoolId, campusId, userId: admin.userId, feature, action: "SYNTHETIC_TEST", model: "synthetic-no-provider-call", tokensUsed: 5 });
test("concurrent AI usage cannot spend the school's final credit twice", async () => {
  const limit = getPlanLimits("FREE").aiCredits;
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: limit - 1 } });
  const outcomes = await Promise.allSettled(Array.from({ length: 6 }, () => context(admin, () => consumeAICreditAndLog(usage("FINAL_CREDIT_RACE")))));
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  for (const outcome of outcomes) if (outcome.status === "rejected") assert.equal(outcome.reason.status, 402);
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, limit);
  assert.equal(await raw.aIUsageLog.count({ where: { schoolId, feature: "FINAL_CREDIT_RACE" } }), 1);
});

test("invalid and cross-tenant credit charges fail before mutating usage", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  for (const credits of [-1, 0, 0.5]) await assert.rejects(() => context(admin, () => consumeAICreditAndLog({ ...usage("INVALID_CREDIT"), credits })), { status: 400 });
  await assert.rejects(() => context(admin, () => consumeAICreditAndLog({ ...usage("INVALID_CREDIT"), schoolId: foreignSchoolId })), { status: 403 });
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 0);
  assert.equal(await raw.aIUsageLog.count({ where: { schoolId, feature: "INVALID_CREDIT" } }), 0);
});

test("workspace create, credit charge and usage log roll back together on persistence failure", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  const idempotencyKey = randomUUID();
  await assert.rejects(() => createWorkspaceRecord(admin, { kind: "SOURCE", title: "Must roll back", campusId, data: source(), idempotencyKey }, {
    onCreate: (tx) => consumeAICreditAndLog(usage("ATOMIC_ROLLBACK"), async () => { throw new Error("Synthetic downstream failure"); }, tx),
  }), /Synthetic downstream failure/);
  assert.equal(await findWorkspaceCreateByKey(admin, idempotencyKey), null);
  assert.equal(await raw.aIUsageLog.count({ where: { schoolId, feature: "ATOMIC_ROLLBACK" } }), 0);
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 0);
});

test("insufficient credits cannot leave an uncharged saved AI draft", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: getPlanLimits("FREE").aiCredits } });
  const idempotencyKey = randomUUID();
  await assert.rejects(() => createWorkspaceRecord(admin, { kind: "SOURCE", title: "No credit", campusId, data: source(), idempotencyKey }, { onCreate: (tx) => consumeAICreditAndLog(usage("NO_CREDIT_DRAFT"), undefined, tx) }), { status: 402 });
  assert.equal(await findWorkspaceCreateByKey(admin, idempotencyKey), null);
  assert.equal(await raw.aIUsageLog.count({ where: { schoolId, feature: "NO_CREDIT_DRAFT" } }), 0);
});

test("idempotent AI draft replay never charges twice and preflight rejects changed content", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  const input = { kind: "SOURCE" as const, title: "Exactly one charge", campusId, data: source(), idempotencyKey: randomUUID() };
  const idempotencyFingerprint = "synthetic-original-request";
  const options = { idempotencyFingerprint, onCreate: (tx: TxClient) => consumeAICreditAndLog(usage("IDEMPOTENT_CHARGE"), undefined, tx) };
  const [a, b] = await Promise.all([createWorkspaceRecord(admin, input, options), createWorkspaceRecord(admin, input, options)]);
  assert.equal(a.id, b.id);
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 1);
  assert.equal(await raw.aIUsageLog.count({ where: { schoolId, feature: "IDEMPOTENT_CHARGE" } }), 1);
  assert.equal((await findWorkspaceCreateByKey(admin, input.idempotencyKey, { kind: "SOURCE", campusId, idempotencyFingerprint }))?.id, a.id);
  await assert.rejects(() => findWorkspaceCreateByKey(admin, input.idempotencyKey, { kind: "SOURCE", campusId, idempotencyFingerprint: "different-request" }), { status: 409 });
});

test("concurrent assistant requests claim one provider attempt and reject changed content", async () => {
  const input = { key: randomUUID(), fingerprint: "synthetic-question", campusId };
  const outcomes = await Promise.allSettled(Array.from({ length: 6 }, () => beginSchoolAiRequest(admin, input)));
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  for (const result of outcomes) if (result.status === "rejected") assert.equal(result.reason.status, 409);
  await assert.rejects(() => beginSchoolAiRequest(admin, { ...input, fingerprint: "changed-question" }), { status: 409 });
  const row = await raw.schoolAiRequest.findFirstOrThrow({ where: { schoolId, actorId: admin.userId, idempotencyKey: input.key } });
  assert.equal(row.attempts, 1);
  assert.equal(JSON.stringify(row).includes(input.fingerprint), false, "Raw input is never persisted");
});

test("question-only assistant replies replay the exact answer without another credit", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  const input = { key: randomUUID(), fingerprint: "question-with-no-plan", campusId };
  const started = await beginSchoolAiRequest(admin, input);
  assert.equal(started.state, "CLAIMED");
  if (started.state !== "CLAIMED") return;
  await context(admin, () => consumeAICreditAndLog(usage("ASSISTANT_QUESTION_RECEIPT"), (tx) => completeSchoolAiRequest(admin, started.claim, { reply: "The exact reviewed answer." }, tx)));
  assert.deepEqual(await beginSchoolAiRequest(admin, input), { state: "COMPLETED", reply: "The exact reviewed answer." });
  await failSchoolAiRequest(admin, started.claim);
  assert.equal((await beginSchoolAiRequest(admin, input)).state, "COMPLETED");
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 1);
  assert.equal(await raw.aIUsageLog.count({ where: { schoolId, feature: "ASSISTANT_QUESTION_RECEIPT" } }), 1);
});

test("assistant draft, reply receipt, revision and credit commit atomically", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  const input = { key: randomUUID(), fingerprint: "prepare-workflow", campusId };
  const started = await beginSchoolAiRequest(admin, input);
  assert.equal(started.state, "CLAIMED");
  if (started.state !== "CLAIMED") return;
  const record = await createWorkspaceRecord(admin, { kind: "WORKFLOW", title: "Synthetic plan", campusId, idempotencyKey: input.key, data: { goal: "Prepare synthetic learning work", steps: [{ id: "step-1", title: "Review requirements", status: "proposed", module: "academics" }], sourceIds: [], missingInformation: [] } }, {
    idempotencyFingerprint: input.fingerprint,
    onCreate: (tx, draft) => consumeAICreditAndLog(usage("ASSISTANT_PLAN_RECEIPT"), () => completeSchoolAiRequest(admin, started.claim, { reply: "Your exact saved plan.", recordId: draft.id }, tx), tx),
  });
  const replay = await beginSchoolAiRequest(admin, input);
  assert.equal(replay.state, "COMPLETED");
  if (replay.state === "COMPLETED") { assert.equal(replay.record?.id, record.id); assert.equal(replay.reply, "Your exact saved plan."); }
  assert.equal((await listWorkspaceRevisions(admin, record.id)).length, 1);
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 1);
});

test("failed credit transaction leaves no completed answer receipt and permits explicit retry", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  const input = { key: randomUUID(), fingerprint: "retryable-failed-answer", campusId };
  const started = await beginSchoolAiRequest(admin, input);
  assert.equal(started.state, "CLAIMED");
  if (started.state !== "CLAIMED") return;
  await assert.rejects(() => context(admin, () => consumeAICreditAndLog(usage("ASSISTANT_RECEIPT_ROLLBACK"), async (tx) => {
    await completeSchoolAiRequest(admin, started.claim, { reply: "Must not become visible." }, tx);
    throw new Error("Synthetic transaction failure");
  })), /Synthetic transaction failure/);
  assert.equal((await raw.schoolAiRequest.findUniqueOrThrow({ where: { id: started.claim.id } })).status, "PENDING");
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 0);
  assert.equal(await raw.aIUsageLog.count({ where: { schoolId, feature: "ASSISTANT_RECEIPT_ROLLBACK" } }), 0);
  await failSchoolAiRequest(admin, started.claim);
  await assert.rejects(() => beginSchoolAiRequest(admin, input), { status: 409 });
  const retried = await beginSchoolAiRequest(admin, { ...input, retryFailed: true });
  assert.equal(retried.state, "CLAIMED");
  if (retried.state === "CLAIMED") assert.notEqual(retried.claim.token, started.claim.token);
  await assert.rejects(() => context(admin, () => consumeAICreditAndLog(usage("ASSISTANT_STALE_TOKEN"), (tx) => completeSchoolAiRequest(admin, started.claim, { reply: "Stale response." }, tx))), { status: 409 });
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 0);
});

test("expired assistant leases require explicit retry and late failures cannot cancel a new claim", async () => {
  const input = { key: randomUUID(), fingerprint: "expired-provider-attempt", campusId };
  const started = await beginSchoolAiRequest(admin, input);
  assert.equal(started.state, "CLAIMED");
  if (started.state !== "CLAIMED") return;
  await raw.schoolAiRequest.update({ where: { id: started.claim.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(() => beginSchoolAiRequest(admin, input), { status: 409 });
  const raced = await Promise.allSettled([beginSchoolAiRequest(admin, { ...input, retryFailed: true }), beginSchoolAiRequest(admin, { ...input, retryFailed: true })]);
  assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
  await failSchoolAiRequest(admin, started.claim);
  const current = await raw.schoolAiRequest.findUniqueOrThrow({ where: { id: started.claim.id } });
  assert.equal(current.status, "PENDING");
  assert.equal(current.attempts, 2);
  assert.notEqual(current.claimToken, started.claim.token);
});

test("assistant receipt ownership, campus scope and role changes cannot be spoofed", async () => {
  const input = { key: randomUUID(), fingerprint: "scoped-answer", campusId };
  const started = await beginSchoolAiRequest(admin, input);
  assert.equal(started.state, "CLAIMED");
  if (started.state !== "CLAIMED") return;
  await assert.rejects(() => failSchoolAiRequest(principal, started.claim), { status: 403 });
  await assert.rejects(() => failSchoolAiRequest(foreignAdmin, started.claim), { status: 403 });
  await assert.rejects(() => beginSchoolAiRequest(admin, { ...input, campusId: otherCampusId }), { status: 403 });
  await assert.rejects(() => beginSchoolAiRequest({ ...admin, campusId: otherCampusId }, { ...input, campusId: otherCampusId }), { status: 409 });
  await assert.rejects(() => beginSchoolAiRequest({ ...admin, role: "PRINCIPAL" }, input), { status: 409 });
  const other = await beginSchoolAiRequest(principal, input);
  assert.equal(other.state, "CLAIMED", "A different staff member never receives another actor's reply");
});

test("cached assistant answers recheck teacher subject assignment and current evidence access", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  const evidence = await createSource(teacher);
  const input = { key: randomUUID(), fingerprint: "teacher-scoped-question", campusId, subjectId, classId };
  const started = await beginSchoolAiRequest(teacher, input);
  assert.equal(started.state, "CLAIMED");
  if (started.state !== "CLAIMED") return;
  await context(teacher, () => consumeAICreditAndLog({ ...usage("TEACHER_CACHED_ANSWER"), userId: teacher.userId }, (tx) => completeSchoolAiRequest(teacher, started.claim, { reply: "Scoped evidence answer.", contextRecordIds: [evidence.id] }, tx)));
  assert.equal((await beginSchoolAiRequest(teacher, input)).state, "COMPLETED");
  await raw.subject.update({ where: { id: subjectId }, data: { teacherId: otherTeacher.userId } });
  try { await assert.rejects(() => beginSchoolAiRequest(teacher, input), { status: 403 }); }
  finally { await raw.subject.update({ where: { id: subjectId }, data: { teacherId: teacher.userId } }); }
  await raw.schoolAiRecord.update({ where: { id: evidence.id }, data: { createdById: otherTeacher.userId } });
  await assert.rejects(() => beginSchoolAiRequest(teacher, input), { status: 403 });
});

test("assistant request receipt bounds reject oversized replies without charging", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  const started = await beginSchoolAiRequest(admin, { key: randomUUID(), fingerprint: "bounded-answer", campusId });
  assert.equal(started.state, "CLAIMED");
  if (started.state !== "CLAIMED") return;
  await assert.rejects(() => context(admin, () => consumeAICreditAndLog(usage("OVERSIZED_ANSWER"), (tx) => completeSchoolAiRequest(admin, started.claim, { reply: "a".repeat(8001) }, tx))), { status: 400 });
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 0);
  assert.equal((await raw.schoolAiRequest.findUniqueOrThrow({ where: { id: started.claim.id } })).reply, null);
});

test("assistant completion rejects changed approved context inside the credit transaction", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  const draft = await createSource();
  const evidence = await updateWorkspaceRecord(admin, draft.id, { version: draft.version, action: "approve" });
  const started = await beginSchoolAiRequest(admin, { key: randomUUID(), fingerprint: "version-bound-answer", campusId });
  assert.equal(started.state, "CLAIMED");
  if (started.state !== "CLAIMED") return;
  await updateWorkspaceRecord(admin, evidence.id, { version: evidence.version, title: "A changed source" });
  await assert.rejects(() => context(admin, () => consumeAICreditAndLog(usage("STALE_ASSISTANT_EVIDENCE"), (tx) => completeSchoolAiRequest(admin, started.claim, { reply: "Stale context answer.", contextRecordIds: [evidence.id], contextVersions: { [evidence.id]: evidence.version } }, tx))), { status: 409 });
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 0);
  assert.equal((await raw.schoolAiRequest.findUniqueOrThrow({ where: { id: started.claim.id } })).status, "PENDING");
});

test("assistant completion enforces the refreshed permission snapshot after provider generation", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { aiCreditsUsed: 0 } });
  const started = await beginSchoolAiRequest(admin, { key: randomUUID(), fingerprint: "permission-revoked-during-generation", campusId });
  assert.equal(started.state, "CLAIMED");
  if (started.state !== "CLAIMED") return;
  const previous = await raw.rolePermission.findFirst({ where: { schoolId, role: admin.role, module: "ai" } });
  if (previous) await raw.rolePermission.update({ where: { id: previous.id }, data: { canView: false } });
  else await raw.rolePermission.create({ data: { schoolId, role: admin.role, module: "ai", canView: false, canAdd: true, canEdit: true, canDelete: true } });
  try {
    // The in-memory claim still permits access; completion must read the live
    // grant in the same transaction that saves and charges the response.
    await assert.rejects(() => context(admin, () => consumeAICreditAndLog(usage("REVOKED_ASSISTANT_PERMISSION"), (tx) => completeSchoolAiRequest(admin, started.claim, { reply: "An answer after access was removed." }, tx))), { status: 403 });
    assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, 0);
    assert.equal((await raw.schoolAiRequest.findUniqueOrThrow({ where: { id: started.claim.id } })).status, "PENDING");
  } finally {
    if (previous) await raw.rolePermission.update({ where: { id: previous.id }, data: { canView: previous.canView } });
    else await raw.rolePermission.deleteMany({ where: { schoolId, role: admin.role, module: "ai" } });
  }
});

async function setupFixture() {
  const setupCampusId = randomUUID();
  await raw.campus.create({ data: { id: setupCampusId, schoolId, name: "Synthetic setup campus", regId: setupCampusId, city: "Synthetic" } });
  const user = actor("CAMPUS_ADMIN", setupCampusId);
  await raw.user.create({ data: { id: user.userId, schoolId, campusId: setupCampusId, email: user.email, role: user.role, fullName: "Synthetic setup administrator" } });
  return { user, campusId: setupCampusId };
}
const setupProposal = (overrides: Partial<AcademicSetupProposal> = {}): AcademicSetupProposal => ({ operation: "academics.setup_year", academicYear: 2027, label: "Synthetic 2027", startDate: "2026-08-01", endDate: "2027-06-30", classes: [{ id: "grade-4-a", name: "Grade 4", section: "A", teachingMode: "SINGLE" }, { id: "grade-5", name: "Grade 5", section: null, teachingMode: "SUBJECT" }], ...overrides });
async function approvedSetup(user: AuthUser, proposal = setupProposal()) {
  const draft = await createWorkspaceRecord(user, { kind: "WORKFLOW", title: proposal.label, campusId: user.campusId, idempotencyKey: randomUUID(), data: { goal: "Prepare the reviewed academic year and classes", steps: [{ id: "setup", title: "Create the reviewed academic structure", status: "proposed", module: "academics" }], sourceIds: [], missingInformation: [], proposal } });
  return updateWorkspaceRecord(user, draft.id, { version: draft.version, action: "approve" });
}

test("reviewed academic setup creates a real draft cycle and classes with one receipt and scoped audits", async () => {
  const fixture = await setupFixture();
  const proposal = setupProposal({ classes: [{ id: "normal", name: "  Grade   4  ", section: " A ", teachingMode: "SINGLE" }, { id: "subject", name: "Grade 5", section: null, teachingMode: "SUBJECT" }] });
  const record = await approvedSetup(fixture.user, proposal);
  const preview = await previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version);
  assert.equal(preview.cycle.action, "CREATE");
  assert.equal(preview.cycle.status, "DRAFT");
  assert.equal(preview.willCreate[0].name, "Grade 4");
  const result = await executeSchoolAiTool(fixture.user, record.id, { operation: "academics.setup_year", version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() });
  assert.equal(result.createdCount, 2);
  assert.equal(result.cycleCreated, true);
  const cycle = await raw.academicCycle.findUniqueOrThrow({ where: { id: result.cycleId } });
  assert.equal(cycle.status, "DRAFT");
  assert.equal(cycle.startDate?.toISOString().slice(0, 10), proposal.startDate);
  assert.equal(cycle.endDate?.toISOString().slice(0, 10), proposal.endDate);
  const classes = await raw.class.findMany({ where: { campusId: fixture.campusId } });
  assert.equal(classes.length, 2);
  assert(classes.every(row => row.schoolId === schoolId && row.academicYear === 2027 && row.status === "ACTIVE" && row.classTeacherId === null));
  assert.equal(await raw.auditLog.count({ where: { schoolId, recordId: { in: [result.cycleId, ...result.classIds, result.id] } } }), 4);
  assert.equal(await raw.notification.count({ where: { schoolId, campusId: fixture.campusId } }), 0);
});

test("academic setup preserves an existing active cycle, class assignment and teaching mode", async () => {
  const fixture = await setupFixture();
  const proposal = setupProposal();
  const cycle = await raw.academicCycle.create({ data: { schoolId, campusId: fixture.campusId, academicYear: proposal.academicYear, label: proposal.label, startDate: new Date(proposal.startDate!), endDate: new Date(proposal.endDate!), status: "ACTIVE" } });
  const teacherId = randomUUID();
  await raw.user.create({ data: { id: teacherId, schoolId, campusId: fixture.campusId, email: `${teacherId}@example.invalid`, role: "TEACHER", fullName: "Synthetic existing teacher" } });
  const existing = await raw.class.create({ data: { schoolId, campusId: fixture.campusId, academicYear: proposal.academicYear, name: "Grade 4", section: "A", teachingMode: "SINGLE", classTeacherId: teacherId } });
  const record = await approvedSetup(fixture.user, proposal);
  const preview = await previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version);
  assert.equal(preview.cycle.action, "KEEP");
  assert.equal(preview.willKeep[0].classId, existing.id);
  const result = await executeSchoolAiTool(fixture.user, record.id, { operation: "academics.setup_year", version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() });
  assert.equal(result.cycleId, cycle.id);
  assert.equal(result.cycleCreated, false);
  assert.equal(result.createdCount, 1);
  assert.equal(result.keptCount, 1);
  assert.deepEqual(await raw.class.findUniqueOrThrow({ where: { id: existing.id } }), existing);
  assert.deepEqual(await raw.academicCycle.findUniqueOrThrow({ where: { id: cycle.id } }), cycle);
});

test("academic setup respects active and unclosed prior cycle guards without lifecycle changes", async () => {
  const fixture = await setupFixture();
  const prior = await raw.academicCycle.create({ data: { schoolId, campusId: fixture.campusId, academicYear: 2026, label: "Unfinished synthetic year", status: "ACTIVE" } });
  const record = await approvedSetup(fixture.user);
  await assert.rejects(() => previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version), { status: 409, code: "ACTIVE_CYCLE_CONFLICT" });
  await raw.academicCycle.update({ where: { id: prior.id }, data: { status: "PAUSED" } });
  await assert.rejects(() => previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version), { status: 409, code: "PRIOR_CYCLE_UNCLOSED" });
  assert.equal(await raw.class.count({ where: { campusId: fixture.campusId } }), 0);
  assert.equal((await raw.academicCycle.findUniqueOrThrow({ where: { id: prior.id } })).status, "PAUSED");
  await raw.academicCycle.update({ where: { id: prior.id }, data: { status: "ENDED" } });
  assert.equal((await previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version)).cycle.action, "CREATE");
});

test("academic setup rejects invalid dates, duplicate normalized class identities and spoofed operation fields", async () => {
  const fixture = await setupFixture();
  await assert.rejects(() => approvedSetup(fixture.user, setupProposal({ startDate: "2026-02-30" })), { status: 400 });
  await assert.rejects(() => approvedSetup(fixture.user, setupProposal({ startDate: "2028-06-30", endDate: "2027-06-30" })), { status: 400 });
  await assert.rejects(() => approvedSetup(fixture.user, setupProposal({ classes: [{ id: "one", name: "Grade 4", section: "A", teachingMode: "SINGLE" }, { id: "two", name: "grade  4", section: "a", teachingMode: "SINGLE" }] })), { status: 400 });
  await assert.rejects(() => approvedSetup(fixture.user, { ...setupProposal(), schoolId: foreignSchoolId } as AcademicSetupProposal), { status: 400 });
  assert.equal(await raw.academicCycle.count({ where: { campusId: fixture.campusId } }), 0);
});

test("academic setup refuses conflicting cycle details, ambiguous classes and archived or changed modes", async () => {
  const fixture = await setupFixture();
  const record = await approvedSetup(fixture.user);
  const cycle = await raw.academicCycle.create({ data: { schoolId, campusId: fixture.campusId, academicYear: 2027, label: "Different existing label", status: "DRAFT" } });
  await assert.rejects(() => previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version), { code: "CYCLE_DETAILS_CONFLICT" });
  await raw.academicCycle.delete({ where: { id: cycle.id } });
  const existing = await raw.class.create({ data: { schoolId, campusId: fixture.campusId, academicYear: 2027, name: "Grade 4", section: "A", teachingMode: "SUBJECT" } });
  await assert.rejects(() => previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version), { code: "CLASS_DETAILS_CONFLICT" });
  await raw.class.update({ where: { id: existing.id }, data: { teachingMode: "SINGLE", archivedAt: new Date() } });
  await assert.rejects(() => previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version), { code: "CLASS_DETAILS_CONFLICT" });
  await raw.class.update({ where: { id: existing.id }, data: { archivedAt: null } });
  await raw.class.create({ data: { schoolId, campusId: fixture.campusId, academicYear: 2027, name: "grade 4", section: "a" } });
  await assert.rejects(() => previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version), { code: "CLASS_DUPLICATE_CONFLICT" });
});

test("a changed class assignment or workspace version invalidates an academic setup preview", async () => {
  const fixture = await setupFixture();
  const existing = await raw.class.create({ data: { schoolId, campusId: fixture.campusId, academicYear: 2027, name: "Grade 4", section: "A" } });
  const record = await approvedSetup(fixture.user);
  const preview = await previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version);
  const assigned = randomUUID();
  await raw.user.create({ data: { id: assigned, schoolId, campusId: fixture.campusId, email: `${assigned}@example.invalid`, role: "TEACHER", fullName: "Synthetic new teacher" } });
  await raw.class.update({ where: { id: existing.id }, data: { classTeacherId: assigned } });
  const input = { operation: "academics.setup_year" as const, version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() };
  await assert.rejects(() => executeSchoolAiTool(fixture.user, record.id, input), { status: 409, code: "STALE_EXECUTION_PREVIEW" });
  assert.equal(await raw.academicCycle.count({ where: { campusId: fixture.campusId } }), 0);
  assert.equal(await raw.class.count({ where: { campusId: fixture.campusId } }), 1);
  await updateWorkspaceRecord(fixture.user, record.id, { version: record.version, title: "Revised draft" });
  await assert.rejects(() => executeSchoolAiTool(fixture.user, record.id, input), { status: 409, code: "STALE_WORKSPACE_VERSION" });
});

test("concurrent academic setup retries produce one cycle, one class set and one receipt", async () => {
  const fixture = await setupFixture();
  const record = await approvedSetup(fixture.user);
  const preview = await previewSchoolAiExecution(fixture.user, record.id, "academics.setup_year", record.version);
  const input = { operation: "academics.setup_year" as const, version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() };
  const otherInput = { ...input, idempotencyKey: randomUUID() };
  const [first, second] = await Promise.all([executeSchoolAiTool(fixture.user, record.id, input), executeSchoolAiTool(fixture.user, record.id, otherInput)]);
  assert.equal(first.id, second.id);
  assert.equal(await raw.academicCycle.count({ where: { campusId: fixture.campusId } }), 1);
  assert.equal(await raw.class.count({ where: { campusId: fixture.campusId } }), 2);
  assert.equal((await listSchoolAiExecutions(fixture.user, record.id)).length, 1);
  // Promise ordering does not determine which request persisted its key.
  const persisted = await raw.schoolAiExecution.findUniqueOrThrow({ where: { id: first.id } });
  assert(persisted.idempotencyKey === input.idempotencyKey || persisted.idempotencyKey === otherInput.idempotencyKey);
  assert.equal(persisted.previewHash, preview.previewHash);
  const winner = { ...input, idempotencyKey: persisted.idempotencyKey };
  const losingKey = persisted.idempotencyKey === input.idempotencyKey ? otherInput.idempotencyKey : input.idempotencyKey;
  assert.equal(await raw.schoolAiExecution.count({ where: { schoolId, requestedById: fixture.user.userId, idempotencyKey: losingKey } }), 0);
  for (const retry of [input, otherInput]) assert.deepEqual(await executeSchoolAiTool(fixture.user, record.id, retry), first);
  await assert.rejects(() => executeSchoolAiTool(fixture.user, record.id, { ...winner, previewHash: "f".repeat(64) }), { status: 409, code: "EXECUTION_KEY_CONFLICT" });
  await assert.rejects(() => executeSchoolAiTool(fixture.user, record.id, { ...winner, version: winner.version + 1 }), { status: 409, code: "EXECUTION_KEY_CONFLICT" });
  await assert.rejects(() => executeSchoolAiTool(fixture.user, record.id, { ...winner, operation: "curriculum.import_topics" }), { status: 409, code: "EXECUTION_KEY_CONFLICT" });
  await assert.rejects(() => executeSchoolAiTool(fixture.user, randomUUID(), winner), { status: 409, code: "EXECUTION_KEY_CONFLICT" });
  assert.equal(await raw.schoolAiExecution.count({ where: { schoolId, recordId: record.id } }), 1);
});

test("academic setup denies another campus, teachers and missing domain permission", async () => {
  const fixture = await setupFixture();
  const record = await approvedSetup(fixture.user);
  await assert.rejects(() => previewSchoolAiExecution(admin, record.id, "academics.setup_year", record.version), { status: 404 });
  await assert.rejects(() => previewSchoolAiExecution(foreignAdmin, record.id, "academics.setup_year", record.version), { status: 404 });
  await assert.rejects(() => previewSchoolAiExecution({ ...fixture.user, role: "TEACHER" }, record.id, "academics.setup_year", record.version), { status: 403 });
  const override = await raw.rolePermission.create({ data: { schoolId, role: "PRINCIPAL", module: "students", canView: true, canAdd: false, canEdit: false, canDelete: false } });
  try {
    const restricted = { ...fixture.user, role: "PRINCIPAL" as const };
    await assert.rejects(() => previewSchoolAiExecution(restricted, record.id, "academics.setup_year", record.version), { status: 403 });
    const capabilities = await context(restricted, () => getWorkspaceCapabilities(restricted));
    assert.equal(capabilities.canImportRoster, false);
    assert(!capabilities.tools?.some(tool => tool.operation === "academics.setup_year"));
  } finally { await raw.rolePermission.delete({ where: { id: override.id } }); }
});
