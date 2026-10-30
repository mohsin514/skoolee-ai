import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import type { CurriculumData } from "../../src/lib/school-ai/assessment";
import { listCurricula, objectiveMap, recordMapping } from "../../src/lib/curriculum/service";
import { createResource, linkResourceObjectives } from "../../src/lib/resources/service";
import { assessmentFixture } from "../school-ai/assessment-fixture";

// SKO-406 against the isolated database, using the real School AI record lifecycle.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `cur406-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), teacher = actor("TEACHER"), outsider = actor("TEACHER");
let curriculumId = "", otherId = "", latest = 0, first = 0;

function data(): CurriculumData {
  const { curriculum } = assessmentFixture(subjectId, classId);
  curriculum.board = "Synthetic Board A";
  curriculum.pack = { authority: "Synthetic Board A", edition: "2026", language: "en", rights: "APPROVED" };
  curriculum.outcomes = [
    { id: "o-add", code: "SBA.M.1", title: "Add whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true },
    { id: "o-sub", code: "SBA.M.2", title: "Subtract whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true, prerequisiteIds: ["o-add"] },
  ];
  curriculum.sectionCoverage = [{ section: "Week 1", outcomeIds: ["o-add"], taughtOn: "2026-10-05", confirmed: true }];
  return curriculum;
}
async function approvedCurriculum(title: string, value: CurriculumData) {
  const created = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title, data: value, idempotencyKey: randomUUID() });
  return updateWorkspaceRecord(lead, created.id, { version: created.version, action: "approve" });
}
async function approvedPaper(curriculum: { id: string; version: number }, outcomeIds: string[]) {
  const { paper } = assessmentFixture(subjectId, classId);
  paper.blueprint.sections = paper.blueprint.sections.map(section => ({ ...section, outcomeIds }));
  paper.questions = paper.questions.map(question => ({ ...question, outcomeIds }));
  const created = await createWorkspaceRecord(lead, { kind: "PAPER", campusId, title: `Synthetic paper ${outcomeIds.join("+")}`, data: { ...paper, coverageSection: "Week 1", curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  return updateWorkspaceRecord(lead, created.id, { version: created.version, action: "approve" });
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic curriculum school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, teacher, outsider]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 3", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId } });
  const learnerId = randomUUID();
  await raw.student.create({ data: { id: learnerId, schoolId, campusId, classId, fullName: "Synthetic learner", rollNo: "1", gender: "FEMALE", status: "active" } });
  const v1 = await approvedCurriculum("Synthetic Board A mathematics", data());
  first = v1.version;
  const released = await approvedPaper(v1, ["o-add"]);
  await raw.schoolAiExamAssignment.create({ data: { schoolId, campusId, classId, paperId: released.id, paperVersion: released.version, paperSnapshot: (await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: released.id } })).data!, createdById: lead.userId, title: "Synthetic released quiz", startsAt: new Date("2026-10-06T08:00:00Z"), endsAt: new Date("2026-10-06T09:00:00Z"), studentIds: [learnerId], status: "ACTIVE", mode: "STANDARD" } });
  await approvedPaper(v1, ["o-add"]); // unreleased, pinned to v1
  // Rename an objective in a new version: same id, so links and history survive.
  const next = data(); next.outcomes[0].title = "Add whole numbers up to 1000";
  const saved = await updateWorkspaceRecord(lead, v1.id, { version: v1.version, data: next });
  const v2 = await updateWorkspaceRecord(lead, v1.id, { version: saved.version, action: "approve" });
  curriculumId = v2.id; latest = v2.version;
  // A second board with an identically titled objective.
  const other = data(); other.board = "Synthetic Board B"; other.outcomes = other.outcomes.map(outcome => ({ ...outcome, id: `b-${outcome.id}`, code: outcome.code!.replace("SBA", "SBB"), prerequisiteIds: outcome.prerequisiteIds?.map(id => `b-${id}`) }));
  other.sectionCoverage = other.sectionCoverage!.map(row => ({ ...row, outcomeIds: row.outcomeIds.map(id => `b-${id}`) }));
  otherId = (await approvedCurriculum("Synthetic Board B mathematics", other)).id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("the map shows distinct coverage states, compares versions and lists affected unreleased work", async () => {
  const map = await objectiveMap(lead, { recordId: curriculumId });
  assert.equal(map.record.version, latest);
  const add = map.coverage.find(row => row.outcomeId === "o-add")!;
  assert.equal(add.taught.sections.length, 1);
  assert.equal(add.assessed.releases.length, 0, "the released quiz was pinned to v1, so it is not evidence for this version");
  assert.deepEqual(map.comparison?.changes.map(change => [change.outcomeId, change.change]), [["o-add", "CHANGED"]]);
  assert.equal(map.comparison?.impact.affected.length, 1, "the unreleased v1 paper needs review");
  assert.equal(map.comparison?.impact.preserved.length, 1, "the released paper keeps v1");
  const old = await objectiveMap(lead, { recordId: curriculumId, compareTo: first });
  assert.equal(old.comparison?.from, first);
  const snapshot = await raw.schoolAiExamAssignment.findFirstOrThrow({ where: { schoolId } });
  assert.equal((snapshot.paperSnapshot as { curriculumVersion: number }).curriculumVersion, first, "the released snapshot is unchanged");
});

test("objectives from two boards stay distinct until a lead records a decision; teachers cannot decide", async () => {
  const map = await objectiveMap(lead, { recordId: curriculumId });
  assert.equal(map.mappings.length, 0, "an identical title never merges objectives");
  assert.ok(map.mappingTargets.some(target => target.id === otherId));
  const pair = { from: { recordId: curriculumId, version: latest, outcomeId: "o-sub" }, to: { recordId: otherId, version: 1, outcomeId: "b-o-sub" } };
  await assert.rejects(() => recordMapping(teacher, { ...pair, relation: "SAME" }), { status: 403 });
  await assert.rejects(() => recordMapping(lead, { ...pair, to: { ...pair.to, outcomeId: "missing" }, relation: "SAME" }), { status: 400 });
  await recordMapping(lead, { ...pair, relation: "PARTIAL", note: "Board B stops at 100." });
  await recordMapping(lead, { ...pair, relation: "SAME" });
  const after = await objectiveMap(lead, { recordId: curriculumId });
  assert.deepEqual(after.mappings.map(row => row.relation), ["SAME"], "the latest decision is current");
  assert.equal(await raw.curriculumObjectiveMapping.count({ where: { schoolId } }), 2, "earlier decisions remain");
  await assert.rejects(() => raw.curriculumObjectiveMapping.updateMany({ where: { schoolId }, data: { relation: "NOT_EQUIVALENT" } }), /kept/);
  assert.equal(await raw.auditLog.count({ where: { schoolId, tableName: "curriculum_objective_mappings" } }), 2);
});

test("teachers see their subjects only and link their resources to exact objective versions", async () => {
  assert.deepEqual((await listCurricula(teacher)).map(row => row.id).sort(), [curriculumId, otherId].sort());
  assert.deepEqual(await listCurricula(outsider), [], "a teacher without the subject sees no curricula");
  await assert.rejects(() => objectiveMap(outsider, { recordId: curriculumId }), (error: { status?: number }) => error.status === 403 || error.status === 404);
  const view = await objectiveMap(teacher, { recordId: curriculumId });
  assert.equal(view.canDecide, false);
  assert.ok(view.unmapped.resources.length === 0);
  const { resource } = await createResource(teacher, { classId, title: "Number line handout", kind: "HANDOUT", audience: "CLASS", sourceRights: "Synthetic", description: "A number line for adding and subtracting.", content: { link: "https://example.invalid/number-line" } });
  assert.deepEqual((await objectiveMap(teacher, { recordId: curriculumId })).unmapped.resources.map(row => row.id), [resource.id], "an unlinked resource is review work");
  await assert.rejects(() => linkResourceObjectives(teacher, resource.id, { objectives: { curriculumId, curriculumVersion: latest, outcomeIds: ["o-add", "o-add"] } }), { status: 400 });
  await assert.rejects(() => linkResourceObjectives(teacher, resource.id, { objectives: { curriculumId, curriculumVersion: latest, outcomeIds: ["nope"] } }), { status: 400 });
  await linkResourceObjectives(teacher, resource.id, { objectives: { curriculumId, curriculumVersion: latest, outcomeIds: ["o-add", "o-sub"] } });
  const linked = await objectiveMap(teacher, { recordId: curriculumId });
  assert.deepEqual(linked.coverage.map(row => row.resources.length), [1, 1], "one resource counts once for each objective");
  assert.equal(linked.unmapped.resources.length, 0);
  await assert.rejects(() => linkResourceObjectives(outsider, resource.id, { objectives: { curriculumId, curriculumVersion: latest, outcomeIds: ["o-add"] } }), { status: 403 });
});
