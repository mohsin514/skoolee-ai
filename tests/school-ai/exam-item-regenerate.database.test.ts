import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { acceptRegeneratedItem, regenerateItem } from "../../src/lib/school-ai/item-regeneration-service";
import type { Question } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R5.3–R5.7 against the isolated database with a synthetic generator (no network): one item
// regenerated beside the original, every other item preserved byte for byte, nothing written until
// accepted, a pinned item refused, a stale acceptance refused, and one credit per regeneration.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `rgn408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER");
let paperId = "";
const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
const noProvider = { assertProvider: () => undefined };
let calls = 0;
/** Returns the pinned items untouched plus one fresh item for the unpinned slot. */
const generate = async ({ prompt }: { prompt: string }) => {
  calls++;
  const request = JSON.parse(prompt) as { lockedQuestions: Question[]; blueprint: unknown };
  const fixture = assessmentFixture(subjectId, classId).paper;
  const missing = fixture.questions.find(question => !request.lockedQuestions.some(pinned => pinned.id === question.id))!;
  const fresh = { ...missing, id: `fresh-${calls}`, prompt: `${missing.prompt} Explain your method in one sentence.`, locked: false };
  return { text: JSON.stringify({ questions: [...request.lockedQuestions, fresh], generation: { kind: "AI", model: "synthetic", generatedAt: null } }), tokensUsed: 10, model: "synthetic-fixture", promptVersion: "test" };
};
const current = async () => raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } });
const questionsOf = (data: unknown) => (data as { questions: Question[] }).questions;

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic regeneration school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 7", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  paperId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Synthetic regeneration paper", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() })).id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("one item is regenerated beside the original; nothing changes until it is accepted", async () => {
  const before = await current(), creditsBefore = (await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed;
  const key = randomUUID();
  const result = await as(author, () => regenerateItem(author, paperId, "q2", { idempotencyKey: key, version: before.version }, { generate, ...noProvider }));
  assert.equal(result.status, 200);
  const body = result.body as { previous: Question; candidate: Question; differingFields: string[] };
  assert.equal(body.candidate.id, "q2", "the candidate takes the item's place");
  assert.equal(body.previous.prompt, questionsOf(before.data).find(question => question.id === "q2")!.prompt);
  assert.ok(body.differingFields.includes("prompt"), "the differing field is named (R5.5)");
  const unchanged = await current();
  assert.equal(unchanged.version, before.version);
  assert.deepEqual(unchanged.data, before.data, "regeneration writes nothing to the paper");
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, creditsBefore + 1, "one credit for one regeneration");

  const saved = await as(author, () => acceptRegeneratedItem(author, paperId, "q2", { idempotencyKey: key, version: before.version }));
  const afterQuestions = questionsOf(saved.data), beforeQuestions = questionsOf(before.data);
  assert.equal(afterQuestions.find(question => question.id === "q2")!.prompt, body.candidate.prompt);
  for (const original of beforeQuestions.filter(question => question.id !== "q2")) {
    assert.ok(isDeepStrictEqual(afterQuestions.find(question => question.id === original.id), original), `${original.id} is preserved byte for byte (R5.3)`);
  }
  assert.deepEqual(afterQuestions.map(question => question.id), beforeQuestions.map(question => question.id), "order and identities are kept");
  const previousRevision = await raw.schoolAiRevision.findFirstOrThrow({ where: { recordId: paperId, version: before.version } });
  assert.equal(questionsOf(previousRevision.data).find(question => question.id === "q2")!.prompt, body.previous.prompt, "the superseded item stays in the record history (R5.6)");
});

test("a pinned item is refused, a stale acceptance is refused, and without a provider nothing is charged", async () => {
  let paper = await current();
  const pinned = questionsOf(paper.data).map(question => question.id === "q3" ? { ...question, locked: true } : question);
  await updateWorkspaceRecord(author, paperId, { version: paper.version, data: { ...(paper.data as object), questions: pinned } as unknown as Record<string, unknown> });
  paper = await current();
  await assert.rejects(() => as(author, () => regenerateItem(author, paperId, "q3", { idempotencyKey: randomUUID(), version: paper.version }, { generate, ...noProvider })), { status: 409 }, "R5.4");

  const key = randomUUID();
  assert.equal((await as(author, () => regenerateItem(author, paperId, "q1", { idempotencyKey: key, version: paper.version }, { generate, ...noProvider }))).status, 200);
  const edited = questionsOf(paper.data).map(question => question.id === "q2" ? { ...question, marks: question.marks } : question.id === "q3" ? { ...question, prompt: `${question.prompt} (edited)` } : question);
  await updateWorkspaceRecord(author, paperId, { version: paper.version, data: { ...(paper.data as object), questions: edited } as unknown as Record<string, unknown> });
  const moved = await current();
  await assert.rejects(() => as(author, () => acceptRegeneratedItem(author, paperId, "q1", { idempotencyKey: key, version: moved.version })), { status: 409 }, "the other items changed after regeneration");

  const creditsBefore = (await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed;
  const previous = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try { await assert.rejects(() => as(author, () => regenerateItem(author, paperId, "q1", { idempotencyKey: randomUUID(), version: moved.version }))); }
  finally { if (previous !== undefined) process.env.OPENAI_API_KEY = previous; }
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, creditsBefore, "no provider, no charge, no change (R5.10)");
  assert.equal((await current()).version, moved.version);
});

test("invalid model output leaves a FAILED receipt with its reason, uncharged, and the paper unchanged", async () => {
  const paper = await current(), creditsBefore = (await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed;
  const key = randomUUID();
  const broken = async () => ({ text: "not a paper", tokensUsed: 1, model: "synthetic", promptVersion: "test" });
  const result = await as(author, () => regenerateItem(author, paperId, "q1", { idempotencyKey: key, version: paper.version }, { generate: broken, ...noProvider }));
  assert.equal(result.status, 422);
  const receipt = await raw.schoolAiRequest.findFirstOrThrow({ where: { schoolId, idempotencyKey: key } });
  assert.equal(receipt.status, "FAILED");
  assert.match(receipt.reply ?? "", /AI_GENERATION_INVALID_OUTPUT/, "the receipt explains the failure");
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: schoolId } })).aiCreditsUsed, creditsBefore);
  assert.equal((await current()).version, paper.version);
});
