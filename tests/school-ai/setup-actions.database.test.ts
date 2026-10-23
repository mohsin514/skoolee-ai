import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { prepareSetupActions as prepare } from "../../src/lib/school-ai/setup-actions-service";
import { getSetupJourney } from "../../src/lib/school-ai/setup-journey-service";
import { previewSchoolAiExecution, executeSchoolAiTool } from "../../src/lib/school-ai/execution";
import type { generateAIDraft } from "../../src/lib/ai/openai";
const prepareSetupActions: typeof prepare = (user, raw, generate) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, () => prepare(user, raw, generate));
const url = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url) throw new Error("Isolated PG55438 only.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
 const schoolId = `setup-actions-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(), classId = randomUUID(); schoolIds.push(schoolId);
 await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic action school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
 await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
 await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic reviewer", role: "CAMPUS_ADMIN", isActive: true } });
 await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
 await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 1", section: "A", academicYear: 2026, status: "ACTIVE" } });
 const user: AuthUser = { userId, schoolId, campusId, email: `${userId}@example.invalid`, role: "CAMPUS_ADMIN", accessVersion: 0 };
 const record = await createWorkspaceRecord(user, { kind: "ONBOARDING", title: "Synthetic questionnaire", campusId, idempotencyKey: randomUUID(), data: { path: "new", step: "review", confirmedKeys: ["curriculum", "resources", "firstOutcome"], answers: { firstOutcome: "complete", curriculum: "Grade 1 A Mathematics total marks 100", resources: "Period 1 is 08:00-08:40" } } });
 return { user, record, classId, schoolId, campusId };
}
const generated: typeof generateAIDraft = async ({ prompt }) => {
 const context = JSON.parse(prompt) as { answers: { curriculum: string }; classes: { id: string }[] };
 return { text: JSON.stringify({ plans: [{ action: "SUBJECTS", rows: [{ answer: "curriculum", quote: context.answers.curriculum, value: { classId: context.classes[0].id, subjectName: "Mathematics", totalMarks: 100 } }] }], questions: [] }), model: "synthetic:test", tokensUsed: 20, promptVersion: "test" };
};
test("questionnaire becomes a reviewed real subject action with replay and operational progress", async () => {
 const f = await fixture(), input = { recordId: f.record.id, version: f.record.version, language: "en" };
 const first = await prepareSetupActions(f.user, input, generated);
 assert.equal(first.records.length, 1); assert.equal(first.records[0].status, "DRAFT");
 assert.equal(await db.subject.count({ where: { schoolId: f.schoolId } }), 0);
 const replay = await prepareSetupActions(f.user, input, async () => { throw new Error("Replay must not call the provider"); });
 assert.equal(replay.records[0].id, first.records[0].id);
 const approved = await updateWorkspaceRecord(f.user, first.records[0].id, { version: first.records[0].version, action: "approve" });
 const preview = await previewSchoolAiExecution(f.user, approved.id, "setup.apply_changes", approved.version);
 const operation = { operation: "setup.apply_changes" as const, version: approved.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() };
 await executeSchoolAiTool(f.user, approved.id, operation); await executeSchoolAiTool(f.user, approved.id, operation);
 assert.equal(await db.subject.count({ where: { schoolId: f.schoolId } }), 1);
 const progress = await getSetupJourney(f.user, f.record.id);
 assert.equal(progress.steps.find(step => step.key === "academics")?.complete, true);
 assert.equal(progress.steps.find(step => step.key === "subjects")?.complete, false, "subject without an active assigned teacher is incomplete");
 assert.equal(progress.steps.find(step => step.key === "timetable")?.complete, false);
});
test("group owner, wrong campus and stale questionnaire cannot generate campus actions", async () => {
 const f = await fixture(), input = { recordId: f.record.id, version: f.record.version, language: "en" };
 await assert.rejects(() => prepareSetupActions({ ...f.user, role: "SUPER_ADMIN" }, input, generated), { status: 403 });
 await assert.rejects(() => prepareSetupActions(f.user, { ...input, version: input.version + 1 }, generated), { status: 409 });
 await assert.rejects(() => prepareSetupActions({ ...f.user, campusId: randomUUID() }, input, generated), { status: 403 });
 await assert.rejects(() => getSetupJourney({ ...f.user, role: "PRINCIPAL" }, f.record.id), { status: 403 });
});

test("answers changed during AI processing cannot create actions or consume credits", async () => {
 const f = await fixture(), before = (await db.school.findUniqueOrThrow({ where: { id: f.schoolId } })).aiCreditsUsed;
 await assert.rejects(() => prepareSetupActions(f.user, { recordId: f.record.id, version: f.record.version, language: "en" }, async args => {
  const response = await generated(args);
  await updateWorkspaceRecord(f.user, f.record.id, { version: f.record.version, title: "Revised setup", action: "save" });
  return response;
 }), { status: 409 });
 assert.equal(await db.schoolAiRecord.count({ where: { schoolId: f.schoolId, kind: "WORKFLOW" } }), 0);
 assert.equal((await db.school.findUniqueOrThrow({ where: { id: f.schoolId } })).aiCreditsUsed, before);
});

test("class creation reuses a saved active cycle with an open-ended date without altering it", async () => {
 const f = await fixture();
 const cycle = await db.academicCycle.findFirstOrThrow({ where: { schoolId: f.schoolId, campusId: f.campusId } });
 await db.academicCycle.update({ where: { id: cycle.id }, data: { startDate: new Date("2026-10-22T00:00:00Z"), endDate: null } });
 const draft = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", title: "Add class to existing cycle", campusId: f.campusId, idempotencyKey: randomUUID(), data: { goal: "Add Grade 2", sourceIds: [], missingInformation: [], steps: [{ id: "add-class", title: "Add Grade 2", status: "ready", module: "academics" }], proposal: { operation: "academics.setup_year", existingCycleId: cycle.id, academicYear: 2026, label: "2026", startDate: "2026-10-22", endDate: null, classes: [{ id: "grade2", name: "Grade 2", section: "A", teachingMode: "SUBJECT" }] } } });
 const approved = await updateWorkspaceRecord(f.user, draft.id, { version: draft.version, action: "approve" });
 const preview = await previewSchoolAiExecution(f.user, approved.id, "academics.setup_year", approved.version);
 await executeSchoolAiTool(f.user, approved.id, { operation: "academics.setup_year", version: approved.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() });
 const current = await db.academicCycle.findUniqueOrThrow({ where: { id: cycle.id } });
 assert.equal(current.endDate, null); assert.equal(current.status, "ACTIVE");
 assert.equal(current.startDate?.toISOString(), "2026-10-22T00:00:00.000Z");
 assert.equal(await db.class.count({ where: { schoolId: f.schoolId } }), 2);
});
