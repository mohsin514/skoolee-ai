import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createBridge, decideFamilyConsent, exportTransfer, getTransfer, importTransfer, listFamilyTransfers, reviewMapping, setDestination } from "../../src/lib/learning/transfer";

// SKO-471 on the isolated database: one case per learner and source; evidence is withheld until a guardian
// consents and again after withdrawal; every mapping is reviewed by a teacher (one-to-many and "not
// comparable" allowed); the bridge is a draft learning action with gaps as diagnostic checks; a new source
// version makes mappings and the plan stale; marks are never touched; other schools and unrelated teachers
// see nothing.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `transfer-${randomUUID()}`, otherSchoolId = `transfer-other-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID(), studentId = randomUUID();
const actor = (role: AuthUser["role"], school = schoolId, campus = campusId): AuthUser => ({ userId: randomUUID(), schoolId: school, campusId: campus, role, email: `${randomUUID()}@example.invalid` });
const lead = actor("PRINCIPAL"), teacher = actor("TEACHER"), otherTeacher = actor("TEACHER"), guardian = actor("PARENT"), stranger = actor("PRINCIPAL", otherSchoolId, otherCampusId);
const as = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, work);
let curriculumId = "", markId = "";
const source = (version: string, reorder = false) => {
  const objectives = [
    { id: "SRC-ALG-1", version: "2", title: "Solve linear equations in one variable", work: "Worksheet: solved 9 of 10 linear equations with working shown", result: "B+" },
    { id: "SRC-GEO-4", version: "1", title: "Calculate area of triangles and rectangles", work: "Project: measured classroom floor area", result: "A" },
    { id: "SRC-MUS-2", version: "1", title: "Perform a traditional folk melody", work: null, result: "Merit" },
  ];
  return { institution: "Synthetic Riverside Academy", learnerRef: "RA-2291", curriculumId: "riverside-maths-7", curriculumName: "Riverside Maths Year 7", version, language: version === "2026.1" ? "en" : null, objectives: reorder ? [...objectives].reverse() : objectives };
};

before(async () => {
  for (const [id, campus] of [[schoolId, campusId], [otherSchoolId, otherCampusId]]) {
    await raw.school.create({ data: { id, name: "Synthetic transfer school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Dubai", status: "ACTIVE", plan: "PRO" } });
    await raw.campus.create({ data: { id: campus, schoolId: id, name: "Campus", regId: campus, city: "Dubai" } });
  }
  for (const user of [lead, teacher, otherTeacher, guardian, stranger]) await raw.user.create({ data: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true, isActive: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 7", academicYear: 2026, classTeacherId: teacher.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId, totalMarks: 100 } });
  await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic مریم Learner", rollNo: "T-1", gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-01-01Z") } });
  const rel = await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: guardian.userId, createdByUserId: lead.userId, fullName: "Synthetic Guardian", email: guardian.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date("2026-01-01Z") } });
  await raw.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: lead.userId, reason: "Synthetic", effectiveFrom: new Date("2026-01-01Z"), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  const exam = await raw.exam.create({ data: { schoolId, campusId, classId, title: "Placement-free check", term: "1", academicYear: 2026, status: "MARKS_ENTRY" } });
  markId = (await raw.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId, subjectId, marksObtained: 71, grade: "B", enteredBy: lead.userId } })).id;
  const data = { subjectId, classId, academicYear: "2026", board: "Synthetic destination board", sources: [{ id: "s1", title: "Grade 7 syllabus", kind: "SYLLABUS", reference: "Synthetic p1", excerpt: "Linear equations, area, data.", approved: true }],
    outcomes: [
      { id: "o-lin", title: "Solve linear equations with one unknown", sourceId: "s1", sourcePage: "1", taught: true, included: true },
      { id: "o-area", title: "Calculate the area of triangles", sourceId: "s1", sourcePage: "1", taught: true, included: true },
      { id: "o-rect", title: "Calculate the area of rectangles and composite shapes", sourceId: "s1", sourcePage: "1", taught: true, included: true },
      { id: "o-data", title: "Interpret bar charts and tables", sourceId: "s1", sourcePage: "2", taught: true, included: true },
    ] };
  let record = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Destination Grade 7 maths", data, idempotencyKey: randomUUID() });
  record = await updateWorkspaceRecord(lead, record.id, { version: record.version, action: "approve" });
  curriculumId = record.id;
});
after(async () => { await raw.school.deleteMany({ where: { id: { in: [schoolId, otherSchoolId] } } }); await raw.$disconnect(); await prisma.$disconnect(); });

let caseId = "";
test("one case per learner and source; nothing is readable until a guardian consents to chosen fields", async () => {
  const first = await as(teacher, () => importTransfer(teacher, { studentId, source: source("2026.1") }));
  const replay = await as(teacher, () => importTransfer(teacher, { studentId, source: source("2026.1", true) }));
  caseId = first.id;
  assert.equal(replay.id, caseId); assert.equal(replay.replayed, true, "the same export under another name is the same case");
  assert.equal(await raw.learningTransferCase.count({ where: { schoolId } }), 1);
  assert.equal(await raw.student.count({ where: { schoolId } }), 1, "no new learner identity");
  await assert.rejects(() => as(otherTeacher, () => getTransfer(otherTeacher, caseId)), { status: 404 }, "a teacher who does not teach the learner sees nothing");
  await assert.rejects(() => as(stranger, () => getTransfer(stranger, caseId)), { status: 404 }, "another school sees nothing");
  const shell = await as(teacher, () => getTransfer(teacher, caseId));
  assert.equal(shell.rights, "MISSING"); assert.deepEqual(shell.objectives, [], "evidence is withheld without consent");
  assert.ok(shell.missing.includes("WORK"), "missing work is shown separately");
  await assert.rejects(() => as(teacher, () => setDestination(teacher, { caseId, curriculumRecordId: curriculumId, version: shell.version })), { status: 403 });
  const family = await as(guardian, () => listFamilyTransfers(guardian));
  assert.equal(family.length, 1); assert.equal(family[0].rights, "MISSING");
  await assert.rejects(() => as(guardian, () => decideFamilyConsent(guardian, { caseId, fields: ["objectives"], expiresOn: "2020-01-01" }, "GRANT")), { status: 400 });
  await as(guardian, () => decideFamilyConsent(guardian, { caseId, fields: ["objectives", "work"], expiresOn: "2027-06-30" }, "GRANT"));
  const shared = await as(teacher, () => getTransfer(teacher, caseId));
  assert.equal(shared.rights, "GRANTED"); assert.equal(shared.objectives.length, 3);
  assert.ok(shared.objectives.every(o => o.result === null), "results were not shared, so none are shown");
  assert.ok(shared.objectives.find(o => o.id === "SRC-ALG-1")?.work, "shared work is shown");
});

test("teachers review every mapping, including one-to-many and not comparable; the bridge is a draft action with diagnostic gaps", async () => {
  let view = await as(teacher, () => getTransfer(teacher, caseId));
  await as(teacher, () => setDestination(teacher, { caseId, curriculumRecordId: curriculumId, version: view.version }));
  view = await as(teacher, () => getTransfer(teacher, caseId));
  const byId = (id: string) => view.objectives.find(o => o.id === id)!;
  const suggestion = byId("SRC-ALG-1").mapping!.suggestion as { kind: string; targets: { id: string; sharedWords: string[] }[] };
  assert.equal(suggestion.kind, "CANDIDATES"); assert.equal(suggestion.targets[0].id, "o-lin");
  assert.ok(suggestion.targets[0].sharedWords.includes("linear"), "the suggestion cites the shared words");
  assert.equal((byId("SRC-MUS-2").mapping!.suggestion as { kind: string }).kind, "NOT_COMPARABLE", "no comparable target is a first-class result");
  await assert.rejects(() => as(teacher, () => createBridge(teacher, { caseId, version: view.version, reviewDate: "2026-12-01" })), { status: 409 }, "unreviewed mappings block the plan");
  await assert.rejects(() => as(teacher, () => reviewMapping(teacher, { caseId, sourceObjectiveId: "SRC-ALG-1", decision: "ACCEPTED", targetOutcomeIds: [], version: byId("SRC-ALG-1").mapping!.version })), { status: 400 });
  await as(teacher, () => reviewMapping(teacher, { caseId, sourceObjectiveId: "SRC-ALG-1", decision: "ACCEPTED", targetOutcomeIds: ["o-lin"], version: byId("SRC-ALG-1").mapping!.version }));
  await as(teacher, () => reviewMapping(teacher, { caseId, sourceObjectiveId: "SRC-GEO-4", decision: "ACCEPTED", targetOutcomeIds: ["o-area", "o-rect"], note: "Covers both shapes", version: byId("SRC-GEO-4").mapping!.version }));
  await as(teacher, () => reviewMapping(teacher, { caseId, sourceObjectiveId: "SRC-MUS-2", decision: "REJECTED", targetOutcomeIds: [], note: "Music is outside this subject", version: byId("SRC-MUS-2").mapping!.version }));
  view = await as(teacher, () => getTransfer(teacher, caseId));
  const bridge = await as(teacher, () => createBridge(teacher, { caseId, version: view.version, reviewDate: "2026-12-01" }));
  assert.equal(bridge.confirmed, 2); assert.equal(bridge.gaps, 1, "only the uncovered objective needs a diagnostic check");
  const plan = await raw.interventionPlan.findUniqueOrThrow({ where: { id: bridge.planId } });
  assert.equal(plan.status, "DRAFT", "the learning action still goes through its own review");
  assert.match(plan.plannedActivity ?? "", /Diagnostic check: Interpret bar charts/);
  assert.match(plan.concern ?? "", /No grade was converted and no placement was made/);
  assert.equal((await raw.mark.findUniqueOrThrow({ where: { id: markId } })).marksObtained, 71, "existing marks are untouched");
  const exported = await as(teacher, () => exportTransfer(teacher, caseId));
  assert.deepEqual(exported.mappings.map(m => m.decision).sort(), ["ACCEPTED", "ACCEPTED"], "only reviewed, approved mappings leave the school");
  assert.ok(!JSON.stringify(exported).includes("Merit"), "unshared results never appear in an export");
});

test("a new source version makes every mapping and the plan stale until reviewed again", async () => {
  const changed = await as(teacher, () => importTransfer(teacher, { studentId, source: source("2026.2") }));
  assert.equal(changed.id, caseId); assert.equal(changed.stale, true);
  const view = await as(teacher, () => getTransfer(teacher, caseId));
  assert.equal(view.status, "STALE"); assert.ok(view.objectives.every(o => o.mapping?.stale));
  assert.ok(view.missing.includes("LANGUAGE"), "missing language metadata is shown, not guessed");
  const plan = await raw.learningTransferCase.findUniqueOrThrow({ where: { id: caseId } });
  assert.ok((await raw.interventionPlan.findUniqueOrThrow({ where: { id: plan.bridgePlanId! } })).staleSince, "the dependent plan is marked for review");
  await assert.rejects(() => as(teacher, () => createBridge(teacher, { caseId, version: view.version, reviewDate: "2026-12-01" })), { status: 409 });
  for (const o of view.objectives) await as(teacher, () => reviewMapping(teacher, { caseId, sourceObjectiveId: o.id, decision: o.id === "SRC-MUS-2" ? "NOT_COMPARABLE" : "ACCEPTED", targetOutcomeIds: o.id === "SRC-MUS-2" ? [] : o.id === "SRC-ALG-1" ? ["o-lin"] : ["o-area"], version: o.mapping!.version }));
  const fresh = await as(teacher, () => getTransfer(teacher, caseId));
  assert.ok(fresh.objectives.every(o => !o.mapping?.stale));
});

test("withdrawn consent stops new reads and downloads; restoring it resumes the draft", async () => {
  const before = await raw.learningTransferCase.findUniqueOrThrow({ where: { id: caseId } });
  const revoked = await as(guardian, () => decideFamilyConsent(guardian, { caseId }, "REVOKE"));
  assert.equal(revoked.downloadsBefore, (before.downloads as unknown[]).length, "earlier downloads are reported, not denied");
  const view = await as(teacher, () => getTransfer(teacher, caseId));
  assert.equal(view.rights, "REVOKED"); assert.deepEqual(view.objectives, []);
  await assert.rejects(() => as(teacher, () => exportTransfer(teacher, caseId)), { status: 403 });
  await assert.rejects(() => as(stranger, () => exportTransfer(stranger, caseId)), { status: 404 }, "a substituted id from another school reveals nothing");
  await as(guardian, () => decideFamilyConsent(guardian, { caseId, fields: ["objectives", "work"], expiresOn: "2027-06-30" }, "GRANT"));
  const resumed = await as(teacher, () => getTransfer(teacher, caseId));
  assert.equal(resumed.rights, "GRANTED"); assert.ok(resumed.objectives.every(o => o.mapping?.decision !== "PROPOSED"), "the reviewed draft is still there");
});
