import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { downloadEvidencePack, listEvidencePacks, produceEvidencePack } from "../../src/lib/school-ai/evidence-pack-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R19 against the isolated database (Property 29): the full chain, keys only with the
// right, named gaps, scope fences, a frozen record, and a download an independent tool verifies.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `evp408-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"], campus = campusId): AuthUser => ({ userId: randomUUID(), schoolId, campusId: campus, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), learner = actor("STUDENT"), outsider = actor("CAMPUS_ADMIN", otherCampusId), accountant = actor("ACCOUNTANT");
const studentId = randomUUID();
let missingCurriculum = "";
let examId = "", paperId = "";
const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, fn);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic evidence school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  for (const id of [campusId, otherCampusId]) await raw.campus.create({ data: { id, schoolId, name: `Synthetic campus ${id.slice(0, 4)}`, regId: id, city: "Synthetic" } });
  for (const user of [lead, author, learner, outsider, accountant]) await raw.user.create({ data: { id: user.userId, schoolId, campusId: user.campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 9", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, studentUserId: learner.userId, fullName: "Synthetic learner", rollNo: "E1", gender: "MALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Synthetic evidence test", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
  await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  paperId = paper.id;
  examId = (await as(author, () => createSchoolAiExam(author, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Synthetic evidence test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: [studentId], mode: "STANDARD" }))).id;
  await as(learner, () => startSchoolAiExam(learner, examId));
  // A source version the paper names but that is no longer stored: the pack names it as a gap.
  missingCurriculum = curriculum.id;
  await raw.schoolAiRevision.deleteMany({ where: { recordId: curriculum.id, version: curriculum.version } });
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

const contents = (files: unknown) => (files as Array<{ path: string; content: string }>).map(file => file.content).join("\n");

test("a pack holds the chain, names the missing source version, and leaves keys out by default", async () => {
  const { packId, manifest } = await as(lead, () => produceEvidencePack(lead, examId, {}));
  const types = new Set(manifest.records.map(record => record.type));
  for (const type of ["paper", "assignment", "attempt"]) assert.ok(types.has(type), `includes ${type}`);
  assert.ok(manifest.records.some(record => record.type === "paper" && record.id === paperId && record.version !== null));
  assert.deepEqual(manifest.gaps.map(gap => [gap.type, gap.id]), [["curriculum", missingCurriculum]], "the missing source version is named and the export completed (R19.11)");
  assert.equal(manifest.algorithm, "SHA-256");
  const stored = await raw.schoolAiEvidencePack.findUniqueOrThrow({ where: { id: packId } });
  assert.equal(/correctOptionId|modelAnswer|"rubric"/.test(contents(stored.files)), false, "no protected key value without the right (R19.5)");
  assert.equal(stored.includedKeys, false);
  const audit = await raw.auditLog.findMany({ where: { schoolId, recordId: packId } });
  assert.ok(audit.some(row => (row.newValue as { event?: string })?.event === "evidence_pack.produced"), "production is audited with scope and versions (R19.8)");
});

test("keys are included only for a role that may read them, and the inclusion is recorded", async () => {
  const { packId, manifest } = await as(lead, () => produceEvidencePack(lead, examId, { includeKeys: true }));
  assert.equal(manifest.includedKeys, true);
  const stored = await raw.schoolAiEvidencePack.findUniqueOrThrow({ where: { id: packId } });
  assert.match(contents(stored.files), /correctOptionId/, "the approver's pack carries the key");
  const audit = await raw.auditLog.findFirstOrThrow({ where: { schoolId, recordId: packId, tableName: "school_ai_evidence_packs" } });
  assert.equal((audit.newValue as { includedKeys?: boolean }).includedKeys, true, "inclusion is in the access audit (R19.6)");
  await assert.rejects(() => as(learner, () => produceEvidencePack(learner, examId, { includeKeys: true })), (error: { status?: number }) => error.status === 403 || error.status === 404);
  await assert.rejects(() => as(accountant, () => produceEvidencePack(accountant, examId, {})), (error: { status?: number }) => error.status === 403 || error.status === 404);
});

test("recordings need their own reason and right; another campus never sees the assessment", async () => {
  await assert.rejects(() => as(lead, () => produceEvidencePack(lead, examId, { includeCapture: true })), { status: 400 });
  await assert.rejects(() => as(outsider, () => produceEvidencePack(outsider, examId, {})), { status: 404 }, "R19.9/R19.10");
  const attemptId = (await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: examId } })).id;
  const single = await as(lead, () => produceEvidencePack(lead, examId, { scope: "ATTEMPT", attemptId }));
  assert.deepEqual(single.manifest.records.filter(record => record.type === "attempt").map(record => record.id), [attemptId]);
  assert.equal(single.manifest.scope.kind, "ATTEMPT");
});

test("a produced pack is frozen, and its download verifies with unzip and shasum alone", async () => {
  const { packId } = await as(lead, () => produceEvidencePack(lead, examId, {}));
  await assert.rejects(() => raw.schoolAiEvidencePack.update({ where: { id: packId }, data: { includedKeys: true } }), /immutable/);
  const { archive, filename } = await as(lead, () => downloadEvidencePack(lead, examId, packId));
  assert.match(filename, /^evidence-pack-assessment-.*\.zip$/);
  const dir = mkdtempSync(join(tmpdir(), "evidence-db-"));
  try {
    writeFileSync(join(dir, "pack.zip"), archive);
    execFileSync("unzip", ["-q", join(dir, "pack.zip"), "-d", join(dir, "out")]);
    const manifest = JSON.parse(readFileSync(join(dir, "out", "manifest.json"), "utf8"));
    for (const entry of manifest.files) {
      const digest = execFileSync("shasum", ["-a", "256", join(dir, "out", entry.path)], { encoding: "utf8" }).split(" ")[0];
      assert.equal(digest, entry.sha256, entry.path);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const row = await raw.schoolAiEvidencePack.findUniqueOrThrow({ where: { id: packId } });
  assert.ok(row.downloadedAt, "the download time is kept");
  const downloads = await raw.auditLog.findMany({ where: { schoolId, recordId: packId } });
  assert.ok(downloads.some(entry => (entry.newValue as { event?: string })?.event === "evidence_pack.downloaded"));
  const listed = await as(lead, () => listEvidencePacks(lead, examId));
  assert.ok(listed.length >= 4 && listed.every(pack => typeof pack.files === "number"));
});
