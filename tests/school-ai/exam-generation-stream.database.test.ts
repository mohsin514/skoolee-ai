import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { GenerationCancelledError } from "../../src/lib/ai/openai";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { decodeFrames, encodeFrames, type GenerationFrame } from "../../src/lib/school-ai/generation-stream";
import { paperGenerationFrames } from "../../src/lib/school-ai/paper-generation-stream-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R5.1, R5.2, R5.9, R5.12 against the isolated database with a synthetic generator (no
// network): stage and count frames, one frame per item, a terminal frame always, and a cancellation
// that aborts the provider call, charges nothing and is recorded.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `gst408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER");
let curriculumId = "", curriculumVersion = 0;
const as = <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: author.userId, role: author.role }, fn);
const fixture = () => assessmentFixture(subjectId, classId);
const input = () => ({ idempotencyKey: randomUUID(), curriculumId, curriculumVersion, blueprint: fixture().paper.blueprint, language: "en" as const });
const good = async () => ({ text: JSON.stringify({ questions: fixture().paper.questions, generation: { kind: "AI", model: "synthetic", generatedAt: null } }), tokensUsed: 10, model: "synthetic-fixture", promptVersion: "test" });
const collect = async (frames: AsyncIterable<GenerationFrame>) => { const out: GenerationFrame[] = []; for await (const frame of decodeFrames(encodeFrames(frames))) out.push(frame); return out; };
const credits = async () => raw.school.findUniqueOrThrow({ where: { id: schoolId }, select: { aiCreditsUsed: true, aiCreditsReserved: true } });

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic stream school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 6", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture().curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  curriculumId = curriculum.id; curriculumVersion = curriculum.version;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("a generation streams its stages and counts, one frame per item, and ends on complete", async () => {
  const before = await credits();
  const frames = await as(() => collect(paperGenerationFrames(author, input(), { signal: new AbortController().signal, generate: good, assertProvider: () => undefined })));
  const requested = fixture().paper.blueprint.sections.reduce((sum, section) => sum + section.questionCount, 0);
  assert.deepEqual(frames.filter(frame => frame.type === "stage").map(frame => frame.type === "stage" && [frame.stage, frame.produced, frame.requested]), [["BLUEPRINT", 0, requested], ["ITEMS", 0, requested], ["KEYS", 3, requested], ["REVIEW", 3, requested]]);
  assert.equal(frames.filter(frame => frame.type === "item").length, 3, "each item is its own frame (R5.2)");
  assert.equal(frames.at(-1)!.type, "complete");
  assert.deepEqual(await credits(), { aiCreditsUsed: before.aiCreditsUsed + 1, aiCreditsReserved: 0 });
});

test("cancelling mid-generation aborts the provider call, charges nothing and is recorded (R5.12)", async () => {
  const before = await credits(), controller = new AbortController();
  let providerSawAbort = false;
  // A provider that honours the signal, as the OpenAI client and fetch do.
  const slow = ({ signal }: { signal?: AbortSignal }) => new Promise<never>((_, reject) => {
    signal!.addEventListener("abort", () => { providerSawAbort = true; reject(new GenerationCancelledError()); }, { once: true });
    // The ITEMS stage precedes database preparation. Abort only once dispatch
    // actually reaches the provider, irrespective of database or machine load.
    queueMicrotask(() => controller.abort());
  });
  const request = input();
  const stream = paperGenerationFrames(author, request, { signal: controller.signal, generate: slow as never, assertProvider: () => undefined });
  const frames = await as(() => collect(stream));
  assert.equal(providerSawAbort, true, "the provider request itself was aborted");
  assert.deepEqual([frames.at(-1)!.type, frames.filter(frame => frame.type === "item").length], ["cancelled", 0]);
  assert.deepEqual(await credits(), { aiCreditsUsed: before.aiCreditsUsed, aiCreditsReserved: 0 }, "nothing charged and the reservation is released");
  const receipt = await raw.schoolAiRequest.findFirstOrThrow({ where: { schoolId, idempotencyKey: request.idempotencyKey } });
  assert.equal(receipt.status, "FAILED");
  assert.match(receipt.reply ?? "", /AI_GENERATION_CANCELLED/);
  assert.ok(await raw.auditLog.findFirst({ where: { schoolId, recordId: receipt.id, newValue: { path: ["action"], equals: "paper_generation.cancelled" } } }), "the cancellation is recorded");
});

test("output that fails the paper checks ends on an error frame with a closed reason and no charge", async () => {
  const before = await credits();
  const broken = async () => ({ text: JSON.stringify({ questions: [], generation: { kind: "AI", model: "synthetic", generatedAt: null } }), tokensUsed: 1, model: "synthetic", promptVersion: "test" });
  const frames = await as(() => collect(paperGenerationFrames(author, input(), { signal: new AbortController().signal, generate: broken, assertProvider: () => undefined })));
  const last = frames.at(-1)!;
  assert.equal(last.type, "error");
  assert.ok(last.type === "error" && ["PAPER_CHECKS_FAILED", "PROVIDER_OUTPUT_REFUSED"].includes(last.reason));
  assert.equal(JSON.stringify(frames).includes("stack"), false, "no stack trace reaches the wire (R5.9)");
  assert.equal((await credits()).aiCreditsUsed, before.aiCreditsUsed);
});
