// SKAI-1008..1012 enforcement against a disposable loopback database with a synthetic generator (no
// network): AI paper generation and paper approval refuse a catalogue pack that is not ACTIVE for the
// campus, nothing is charged, and a generated paper is pinned to the approved version's content hash.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { generatePaperWithReceipt, preflightPaperGeneration } from "../../src/lib/school-ai/paper-generation-service";
import { recordPackEvidence, requestCurriculumPack, transitionCurriculumPack } from "../../src/lib/school-ai/curriculum-pack-service";
import { catalogueRow } from "../../src/lib/school-ai/curriculum-pack-registry";
import type { CurriculumContract } from "../../src/lib/school-ai/curriculum-contract";
import { assessmentFixture } from "./assessment-fixture";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const raw = new PrismaClient();
const schoolId = `packgate-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, fullName: `Synthetic ${role}`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), principal = actor("PRINCIPAL");
const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
const packId = `synthetic-gate-${randomUUID().slice(0, 8)}`;
// Synthetic contract: fixture values, not curriculum facts.
const contract: CurriculumContract = {
  packId, version: 1, status: "DRAFT", board: "BISE_LAHORE", qualification: "Synthetic SSC", examSession: "First Annual",
  examYear: "2027", teachingYear: "2026-27", gradeMapping: { boardLevel: "SSC-I", schoolGrade: "9" }, term: "Annual", subject: "Mathematics", tier: "Core", language: "en",
  outcomes: [{ code: "SYN-1", statement: "Synthetic outcome", assessed: true }],
  paper: { totalMarks: 60, durationMinutes: 120, sections: [{ id: "A", format: "MCQ", marks: 60, questionCount: 60, attempt: 60 }], calculator: "NOT_ALLOWED", rules: ["Synthetic rule"] },
  sources: [{ id: "s1", kind: "SYLLABUS", authority: "Synthetic Board", reference: "SYN/1", edition: "2027", url: "https://example.test/syllabus.pdf", retrievedOn: "2026-10-29", checksumSha256: "a".repeat(64), applicability: "QA schools" }],
  register: { reviewTrigger: "New board notice" }, unverified: [],
};
const row = catalogueRow(contract);
let curriculumId = "", curriculumVersion = 0, activationId = "";
const fixture = () => assessmentFixture(subjectId, classId);
const input = () => ({ idempotencyKey: randomUUID(), curriculumId, curriculumVersion, blueprint: fixture().paper.blueprint, language: "en" as const });
const good = async () => ({ text: JSON.stringify({ questions: fixture().paper.questions, generation: { kind: "AI", model: "synthetic", generatedAt: null } }), tokensUsed: 10, model: "synthetic-fixture", promptVersion: "test" });
const credits = () => raw.school.findUniqueOrThrow({ where: { id: schoolId }, select: { aiCreditsUsed: true, aiCreditsReserved: true } });

before(async () => {
  await raw.curriculumPackVersion.create({ data: { packId, version: 1, board: row.board, subject: row.subject, schoolGrade: row.schoolGrade, examYear: row.examYear, language: row.language, status: row.status, content: row.content as unknown as Prisma.InputJsonValue, contentSha256: row.contentSha256, unverified: [] } });
  await raw.school.create({ data: { id: schoolId, name: "Synthetic pack-gate school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author, principal]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: user.fullName!, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 9", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  const data = { ...fixture().curriculum, pack: { packId, version: 1, authority: "Synthetic Board", edition: "2027", language: "en" as const, rights: "MANUAL" as const } };
  let curriculum = await as(lead, () => createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic pack curriculum", data, idempotencyKey: randomUUID() }));
  curriculum = await as(lead, () => updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" }));
  curriculumId = curriculum.id; curriculumVersion = curriculum.version;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.curriculumPackVersion.deleteMany({ where: { packId } }); await raw.$disconnect(); await prisma.$disconnect(); });

const blocked = (error: unknown) => (error as { code?: string }).code === "CURRICULUM_PACK_NOT_ACTIVE" && Array.isArray((error as { details?: unknown }).details);

test("generation is refused before dispatch while the pack is not ACTIVE, and nothing is charged", async () => {
  const before = await credits();
  await assert.rejects(as(author, () => preflightPaperGeneration(author, input())), blocked);
  await assert.rejects(as(author, () => generatePaperWithReceipt(author, input(), { generate: async () => { throw new Error("provider must not be called"); }, assertProvider: () => undefined })), blocked);
  assert.deepEqual(await credits(), before);
});

test("once ACTIVE the paper is generated and pinned to the approved hash; after revoke generation and approval are refused", async () => {
  const packVersionId = (await raw.curriculumPackVersion.findFirstOrThrow({ where: { packId } })).id;
  activationId = (await as(lead, () => requestCurriculumPack(lead, { packVersionId, campusId, geography: "PAKISTAN_LAHORE", schoolGrade: "9" }))).id;
  await assert.rejects(as(author, () => preflightPaperGeneration(author, input())), blocked, "a DRAFT request is not enough");
  await as(lead, () => recordPackEvidence(lead, activationId, { sourceId: "s1", rightsScope: "Reference only", permissionEvidence: "Synthetic letter" }));
  await as(principal, () => transitionCurriculumPack(principal, activationId, { to: "APPROVED", approvedOn: "2026-10-28", reviewDueOn: "2099-10-28" }));
  await assert.rejects(as(author, () => preflightPaperGeneration(author, input())), blocked, "APPROVED is not ACTIVE");
  await as(lead, () => transitionCurriculumPack(lead, activationId, { to: "ACTIVE" }));
  const receipt = await as(author, () => generatePaperWithReceipt(author, input(), { generate: good, assertProvider: () => undefined }));
  assert.equal(receipt.status, 200);
  const paper = (receipt.body as { paper: { curriculumPackPin?: unknown } }).paper;
  assert.deepEqual(paper.curriculumPackPin, { packId, version: 1, contentSha256: row.contentSha256 });

  const record = await as(author, () => createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Pinned paper", data: { ...paper, curriculumId, curriculumVersion }, idempotencyKey: randomUUID() }));
  await as(principal, () => transitionCurriculumPack(principal, activationId, { to: "REVOKED", reason: "Synthetic notice superseded" }));
  await assert.rejects(as(author, () => preflightPaperGeneration(author, input())), blocked);
  await assert.rejects(as(lead, () => updateWorkspaceRecord(lead, record.id, { version: record.version, action: "approve" })), /Curriculum pack blocked/);
});
