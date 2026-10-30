import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { recordRehearsal } from "../../src/lib/school-ai/exam-release-service";
import { addLanguageVersion, assignFormSet, createFormSet, decideLanguageProposal, formSetReport, proposeLanguageComparison } from "../../src/lib/school-ai/form-set-service";
import { itemGroupIdFor } from "../../src/lib/school-ai/form-set";
import { paperDataSchema } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R9 against the isolated database: language versions joined by item group, side-by-side comparison, blocking mismatches, delivery in the candidate's language.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `lng408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), learners = [actor("STUDENT"), actor("STUDENT"), actor("STUDENT")];
const languages = ["ar", "en", "ur"];
const studentIds = learners.map(() => randomUUID());
let paperId = "", formSetId = "";
const arabic = async () => (await raw.schoolAiRecord.findMany({ where: { schoolId, kind: "PAPER" } })).find(row => paperDataSchema.parse(row.data).language === "ar")!;

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic language school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  for (const [index, user] of learners.entries()) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic learner ${index + 1}`, onboardingComplete: true, preferredLanguage: languages[index] } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 8", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  for (const [index, learner] of learners.entries()) await raw.student.create({ data: { id: studentIds[index], schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic learner ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  paperId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Synthetic mid term", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() })).id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("a language version shares the form's item groups and starts flagged as untranslated", async () => {
  formSetId = (await createFormSet(author, paperId, { forms: 1 })).id;
  await addLanguageVersion(author, formSetId, { label: "A", language: "ar" });
  await assert.rejects(() => addLanguageVersion(author, formSetId, { label: "A", language: "ar" }), { status: 409 });
  await assert.rejects(() => addLanguageVersion(author, formSetId, { label: "B", language: "ur" }), { status: 404 });
  const original = paperDataSchema.parse((await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } })).data), version = paperDataSchema.parse((await arabic()).data);
  assert.deepEqual(version.itemGroupIds, original.itemGroupIds, "joined item by item (R9.2)");
  assert.equal(version.formSet?.label, "A");
  const report = await formSetReport(author, formSetId);
  assert.equal(report.forms.length, 2);
  assert.equal(report.languages.length, 1);
  assert.deepEqual(report.languages[0].items.map(item => item.untranslated), [true, true, true]);
  assert.equal(report.languages[0].items[0].translated?.key, "4", "the key is shown beside the original (R9.3)");
  assert.equal(report.blockers.length, 0);
});

test("a marks or key-structure difference blocks the set until it is corrected (R9.4, R9.5, R9.8)", async () => {
  const row = await arabic();
  const data = paperDataSchema.parse(row.data);
  const translated = { ...data, questions: data.questions.map(question => ({ ...question, prompt: question.id === "q1" ? "ما ناتج 2 + 2؟" : question.id === "q2" ? "اختر ناتج جمع اثنين واثنين." : "اشرح كيف تجمع عددين." })) };
  const saved = await updateWorkspaceRecord(author, row.id, { version: row.version, data: translated as unknown as Record<string, unknown> });
  const wrong = { ...translated, questions: translated.questions.map(question => question.id === "q2" ? { ...question, options: [...question.options, { id: "a3", text: "6" }] } : question) };
  const broken = await updateWorkspaceRecord(author, row.id, { version: saved.version, data: wrong as unknown as Record<string, unknown> });
  const report = await formSetReport(author, formSetId);
  assert.deepEqual(report.languages[0].items.map(item => item.codes), [[], ["KEY_STRUCTURE_MISMATCH"], []]);
  assert.deepEqual(report.languages[0].items.map(item => item.untranslated), [false, false, false]);
  assert.ok(report.blockers.some(blocker => blocker.code === "KEY_STRUCTURE_MISMATCH"));
  await updateWorkspaceRecord(author, row.id, { version: broken.version, data: translated as unknown as Record<string, unknown> });
  assert.equal((await formSetReport(author, formSetId)).blockers.length, 0);
});

test("a model comparison proposes quoted findings that wait for one human decision and never edit an item (R9.6, R9.7)", async () => {
  await raw.school.update({ where: { id: schoolId }, data: { plan: "PRO" } });
  const row = await arabic(), original = paperDataSchema.parse((await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } })).data);
  const group = itemGroupIdFor(original, "q1");
  let calls = 0;
  const generator = async () => { calls++; return { text: JSON.stringify({ findings: [
    { itemGroupId: group, finding: "CHANGED_NOTATION", excerpts: { a: "2 + 2", b: "2 + 2" }, explanation: "Synthetic: the operator is written the same way; listed so a reviewer can confirm the notation.", confidence: 0.4 },
    { itemGroupId: group, finding: "NEGATION_ADDED", excerpts: { a: "not in the paper", b: "ليس في الورقة" }, explanation: "Synthetic invented quote.", confidence: 0.9 },
    { itemGroupId: "no-such-group", finding: "CHANGED_UNIT", excerpts: { a: "2", b: "2" }, explanation: "Synthetic unknown item.", confidence: 0.5 },
  ] }), tokensUsed: 10, model: "synthetic-fixture", promptVersion: "test" }; };
  const names = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "AI_PROVIDER"] as const, saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.OPENAI_API_KEY = "synthetic-never-network"; process.env.OPENAI_BASE_URL = "https://api.openai.com/v1"; process.env.AI_PROVIDER = "openai";
  try {
    const key = randomUUID();
    const scoped = <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: author.userId, role: author.role }, fn);
    const proposals = await scoped(() => proposeLanguageComparison(author, formSetId, { recordId: row.id, idempotencyKey: key }, generator));
    assert.deepEqual(proposals.map(entry => entry.finding), ["CHANGED_NOTATION"], "a finding that quotes text not in the items, or names an unknown item, is dropped");
    assert.deepEqual((await scoped(() => proposeLanguageComparison(author, formSetId, { recordId: row.id, idempotencyKey: key }, generator))).map(entry => entry.id), proposals.map(entry => entry.id), "a retry returns the same proposals");
    assert.equal(calls, 1);
  } finally { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } }
  assert.equal((await arabic()).version, row.version, "no item is edited by a model comparison (R9.7)");
  let report = await formSetReport(author, formSetId);
  assert.equal(report.languages[0].proposals.length, 1);
  assert.equal(report.languages[0].proposals[0].decision, null);
  assert.ok(report.advisories.some(entry => entry.code === "MODEL_COMPARISON_AWAITING_DECISION"), "it is shown to the approver as awaiting a decision");
  const proposalId = report.languages[0].proposals[0].id;
  await assert.rejects(() => decideLanguageProposal(author, formSetId, proposalId, { outcome: "DISMISSED", reason: "Same notation." }), { status: 403 }, "only an approver decides");
  await decideLanguageProposal(lead, formSetId, proposalId, { outcome: "DISMISSED", reason: "The notation is identical in both versions." });
  await assert.rejects(() => decideLanguageProposal(lead, formSetId, proposalId, { outcome: "ACCEPTED", reason: "Changed my mind." }), { status: 409 }, "a decision is recorded once");
  await assert.rejects(() => raw.schoolAiLanguageProposal.update({ where: { id: proposalId }, data: { finding: "CHANGED_MEANING" } }), /immutable/);
  report = await formSetReport(author, formSetId);
  assert.deepEqual([report.languages[0].proposals[0].decision?.outcome, report.advisories.length], ["DISMISSED", 0]);
});

test("each candidate sits the form in their own language when an approved version exists; each language is sealed separately", async () => {
  for (const id of [paperId, (await arabic()).id]) {
    const row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id } });
    const reviewed = await updateWorkspaceRecord(author, id, { version: row.version, action: "review" });
    const approved = await updateWorkspaceRecord(lead, id, { version: reviewed.version, action: "approve" });
    await recordRehearsal(author, id, { version: approved.version, findings: [] });
  }
  assert.equal((await formSetReport(author, formSetId)).assignable, true);
  const assigned = await runWithTenantContext({ schoolId, campusId, userId: author.userId, role: author.role }, () => assignFormSet(author, formSetId, { idempotencyKey: randomUUID(), title: "Mid term", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds }));
  assert.deepEqual(assigned.assignments.map(row => [row.language, row.candidates]).sort(), [["ar", 1], ["en", 2]], "Urdu has no version, so that candidate sits the original (R9.10)");
  const arabicExam = await raw.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: assigned.assignments.find(row => row.language === "ar")!.id } });
  assert.deepEqual(arabicExam.studentIds, [studentIds[0]]);
  assert.equal(paperDataSchema.parse(arabicExam.paperSnapshot).language, "ar");
  const releases = await raw.schoolAiExamFormRelease.findMany({ where: { formSetId }, orderBy: { language: "asc" } });
  assert.deepEqual(releases.map(row => row.language), ["ar", "en"]);
  assert.notEqual(releases[0].contentHash, releases[1].contentHash, "one content hash per language (R9.9)");
  assert.equal(await raw.schoolAiExposureEntry.count({ where: { formSetId } }), 3, "exposure is per item, not per translation");
  assert.equal(await raw.schoolAiExamFormAllocation.count({ where: { formSetId } }), 3);
});
