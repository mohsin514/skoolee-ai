import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { redis } from "../../src/lib/queue/connection";
import type { AuthUser } from "../../src/lib/auth";
import { saveKnowledge, publishKnowledge, searchKnowledge, readKnowledge, withdrawKnowledge } from "../../src/lib/rag/service";
import { answerKnowledge } from "../../src/lib/rag/answer";
import { startJob, savePlan, getJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
const lexical = async () => null;
async function fixture(role: AuthUser["role"] = "APP_OWNER") {
  const schoolId = `rag-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "QA knowledge school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "QA campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, role, isActive: true, email: `${userId}@example.invalid`, fullName: "QA Operator" } });
  return { userId, schoolId, campusId, role, email: `${userId}@example.invalid`, fullName: "QA Operator", accessVersion: 0 } satisfies AuthUser;
}
const input = (roles = ["APP_OWNER"]) => ({ title: "Refund rules", content: "A cancellation refund must be requested within 17 days of registration. Requests require the receipt.", roles, campusId: null, expiresAt: null });
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

test("drafts are excluded; publication has exact citations; edits invalidate old versions and chunks", async () => {
  const user = await fixture();
  const draft = await saveKnowledge(user, input());
  assert.equal((await searchKnowledge(user, "refund", lexical)).sources.length, 0);
  const published = await publishKnowledge(user, draft.id, draft.version, lexical);
  assert.equal(published.indexMode, "KEYWORD");
  const result = await answerKnowledge(user, "refund", "en", { embed: lexical, extractive: true });
  assert.equal(result.citations.length, 1); assert.match(result.text, /17 days/);
  assert.equal((await readKnowledge(user, draft.id, published.version)).content, input().content);
  await saveKnowledge(user, { ...input(), content: input().content.replace("17", "21") }, { id: draft.id, version: published.version });
  assert.equal((await searchKnowledge(user, "refund", lexical)).sources.length, 0);
  await assert.rejects(readKnowledge(user, draft.id, published.version));
  assert.equal(await db.ragChunk.count({ where: { documentId: draft.id } }), 0);
});

test("school, role, campus and expiry filters apply before content reaches the embedding provider", async () => {
  const user = await fixture(), other = await fixture();
  for (const [actor, data] of [[other, input()], [user, input(["STUDENT"])]] as const) {
    const d = await saveKnowledge(actor, data); await publishKnowledge(actor, d.id, d.version, lexical);
  }
  let calls = 0;
  assert.equal((await searchKnowledge(user, "refund", async () => { calls++; return null; })).sources.length, 0);
  assert.equal(calls, 0);
  const campus = await db.campus.create({ data: { schoolId: user.schoolId, regId: randomUUID(), name: "Other campus", city: "Test" } });
  const d = await saveKnowledge(user, { ...input(), campusId: campus.id }); await publishKnowledge(user, d.id, d.version, lexical);
  assert.equal((await searchKnowledge(user, "refund", lexical)).sources.length, 0);
  const expired = await saveKnowledge(user, input()); const p = await publishKnowledge(user, expired.id, expired.version, lexical);
  await db.ragDocument.update({ where: { id: p.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await searchKnowledge(user, "refund", lexical)).sources.length, 0);
});

test("students cannot publish; stale saves and races are refused; archive and delete remove embeddings", async () => {
  const student = await fixture("STUDENT"); await assert.rejects(saveKnowledge(student, input()));
  const user = await fixture(), draft = await saveKnowledge(user, input());
  await assert.rejects(publishKnowledge(user, draft.id, draft.version, async () => { await saveKnowledge(user, input(), { id: draft.id, version: draft.version }); return null; }));
  const edited = await readKnowledge(user, draft.id), pub = await publishKnowledge(user, draft.id, edited.version, lexical);
  await withdrawKnowledge(user, draft.id, pub.version);
  assert.equal((await searchKnowledge(user, "refund", lexical)).sources.length, 0);
  await withdrawKnowledge(user, draft.id, pub.version + 1, true);
  assert.equal((await db.ragDocument.findUniqueOrThrow({ where: { id: draft.id } })).content, "");
  assert.equal(await db.ragChunk.count({ where: { documentId: draft.id } }), 0);
});

test("provider failures return exact excerpts; invalid citations never become generated claims; changed sources are suppressed", async () => {
  const user = await fixture(), d = await saveKnowledge(user, input()), p = await publishKnowledge(user, d.id, d.version, lexical);
  const invalid = await answerKnowledge(user, "refund", "en", { embed: lexical, generate: async () => ({ text: JSON.stringify({ claims: [{ text: "Refunds take 90 days", source: 9, quote: "imaginary quote" }] }), model: "synthetic:test", tokensUsed: 1, promptVersion: "test" }) });
  assert.equal(invalid.generation, "EXTRACTIVE"); assert.ok(!invalid.text.includes("90 days"));
  const stale = await answerKnowledge(user, "refund", "en", { embed: lexical, generate: async () => { await withdrawKnowledge(user, d.id, p.version); throw new Error("unavailable"); } });
  assert.equal(stale.generation, "STALE"); assert.equal(stale.citations.length, 0); assert.ok(!stale.text.includes("17 days"));
});

test("knowledge follow-ups use only the actor's completed knowledge job and historical citations are withdrawn", async () => {
  const user = await fixture(), other = await fixture();
  const draft = await saveKnowledge(user, input()), published = await publishKnowledge(user, draft.id, draft.version, lexical);
  const parent = await startJob(user, { message: "Explain the refund policy", language: "en", idempotencyKey: randomUUID() });
  await savePlan(user, parent.id, [{ stepKey: "s1", capabilityKey: "assistant.app_knowledge", input: { query: "Explain the refund policy" } }]);
  await db.aiWorkflowStep.updateMany({ where: { jobId: parent.id }, data: { status: "SUCCEEDED", receipt: { detail: { text: "17 days", citations: [{ documentId: draft.id, version: published.version }] } } } });
  await db.aiWorkflowJob.update({ where: { id: parent.id }, data: { status: "COMPLETED" } });
  const ask = (actor: AuthUser, message: string) => startJob(actor, { message, parentJobId: parent.id, language: "en", idempotencyKey: randomUUID() });
  assert.match(JSON.stringify((await ask(user, "What about its deadline?")).budget), /refund policy/);
  assert.doesNotMatch(JSON.stringify((await ask(other, "What about its deadline?")).budget), /knowledgeQuery/);
  assert.doesNotMatch(JSON.stringify((await ask(user, "Create a new school")).budget), /knowledgeQuery/);
  assert.match(JSON.stringify((await getJob(user, parent.id)).steps[0].receipt), /17 days/);
  await withdrawKnowledge(user, draft.id, published.version);
  assert.doesNotMatch(JSON.stringify((await getJob(user, parent.id)).steps[0].receipt), /17 days/);
});
