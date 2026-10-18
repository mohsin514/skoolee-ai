import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { assessmentFixture } from "../school-ai/assessment-fixture";
import { acceptCorrection, acceptInvite, adoptQuestion, authorizeShare, createNetwork, inviteSchool, networkOverview, proposeCorrection, publishQuestion, reportUse, reviewQuestion, statSummary, submitQuestion, withdrawQuestion } from "../../src/lib/question-network/service";

// SKO-454: rights and audience before sharing; secured items and learner names stay private; reviews
// need expertise and record conflicts; disagreement needs adjudication; corrections are new versions
// adopters accept; withdrawal blocks reuse without touching delivered papers; answer keys never reach
// learners; small-cohort statistics are suppressed.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient();
const school = (tag: string) => ({ id: `qn-${tag}-${randomUUID()}`, campusId: randomUUID() });
const A = school("a"), B = school("b"), C = school("c");
const actor = (s: { id: string; campusId: string }, role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId: s.id, campusId: s.campusId, role, email: `${randomUUID()}@example.invalid` });
const adminA = actor(A, "CAMPUS_ADMIN"), principalA = actor(A, "PRINCIPAL"), teacherA = actor(A, "TEACHER"), teacherA2 = actor(A, "TEACHER"), studentA = actor(A, "STUDENT");
const adminB = actor(B, "CAMPUS_ADMIN"), teacherB = actor(B, "TEACHER"), teacherB2 = actor(B, "TEACHER"), teacherC = actor(C, "TEACHER");
const ctx = <T>(u: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: u.schoolId, campusId: u.campusId, userId: u.userId, role: u.role }, work);
const ids: Record<string, string> = {};
const rights = (permits: string, extra: object = {}) => ({ basis: "SCHOOL_OWNED", permits, confirmed: true, ...extra });
const expertise = { subject: "Mathematics", language: "en" };
let paperId = "", paperVersion = 0, namedPaperId = "", namedVersion = 0;

before(async () => {
  for (const s of [A, B, C]) {
    await raw.school.create({ data: { id: s.id, name: `Synthetic ${s.id.slice(3, 4).toUpperCase()} School`, slug: s.id, regId: s.id, contactEmail: `${s.id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
    await raw.campus.create({ data: { id: s.campusId, schoolId: s.id, name: "Synthetic", regId: s.campusId, city: "Synthetic" } });
  }
  for (const u of [adminA, principalA, teacherA, teacherA2, studentA, adminB, teacherB, teacherB2, teacherC]) await raw.user.create({ data: { id: u.userId, schoolId: u.schoolId, campusId: u.campusId, role: u.role, email: u.email, fullName: `Synthetic ${u.role}`, onboardingComplete: true, isActive: true } });
  const classId = randomUUID(), subjectId = randomUUID();
  await raw.class.create({ data: { id: classId, schoolId: A.id, campusId: A.campusId, name: "Grade 5", section: "A", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId: A.id, campusId: A.campusId, classId, name: "Mathematics", teacherId: teacherA.userId } });
  await raw.student.create({ data: { schoolId: A.id, campusId: A.campusId, classId, fullName: "Zainab Qureshi", rollNo: "Z1", gender: "FEMALE", status: "active", studentUserId: studentA.userId } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(adminA, { kind: "CURRICULUM", campusId: A.campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(adminA, curriculum.id, { version: curriculum.version, action: "approve" });
  const paperData = { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version };
  let paper = await createWorkspaceRecord(teacherA, { kind: "PAPER", campusId: A.campusId, title: "Synthetic addition paper", data: paperData, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(adminA, paper.id, { version: paper.version, action: "approve" }); paperId = paper.id; paperVersion = paper.version;
  const named = structuredClone(paperData); named.questions[2].prompt = "Zainab Qureshi has two apples and buys two more. Explain how to add them.";
  let namedPaper = await createWorkspaceRecord(teacherA, { kind: "PAPER", campusId: A.campusId, title: "Named paper", data: named, idempotencyKey: randomUUID() });
  namedPaper = await updateWorkspaceRecord(adminA, namedPaper.id, { version: namedPaper.version, action: "approve" }); namedPaperId = namedPaper.id; namedVersion = namedPaper.version;
  await raw.schoolAiExposureEntry.create({ data: { schoolId: A.id, campusId: A.campusId, itemGroupId: "g-q2", questionId: "q2", itemRevision: 1, paperId, paperVersion, formLabel: "A", cohortIds: [], examDate: new Date("2099-06-01T08:00:00Z") } });
});
after(async () => {
  const schools = [A.id, B.id, C.id];
  const items = await raw.questionNetworkItem.findMany({ where: { contributorSchoolId: { in: schools } }, select: { id: true } });
  await raw.questionNetworkReview.deleteMany({ where: { itemId: { in: items.map((i) => i.id) } } });
  await raw.questionNetworkStat.deleteMany({ where: { reporterSchoolId: { in: schools } } });
  await raw.questionNetworkAdoption.deleteMany({ where: { adopterSchoolId: { in: schools } } });
  await raw.questionNetworkItem.deleteMany({ where: { contributorSchoolId: { in: schools } } });
  const networks = await raw.questionNetwork.findMany({ where: { ownerSchoolId: { in: schools } }, select: { id: true } });
  await raw.questionNetworkMember.deleteMany({ where: { networkId: { in: networks.map((n) => n.id) } } });
  await raw.questionNetwork.deleteMany({ where: { ownerSchoolId: { in: schools } } });
  await raw.school.deleteMany({ where: { id: { in: schools } } }); await raw.$disconnect(); await prisma.$disconnect();
});

test("rights, audience, secured items and learner names are checked before anything is shared", async () => {
  ids.network = (await ctx(adminA, () => createNetwork(adminA, { name: "Synthetic partner network" }))).id;
  const invite = await ctx(adminA, () => inviteSchool(adminA, ids.network, { schoolSlug: B.id }));
  await assert.rejects(() => ctx(teacherB, () => acceptInvite(teacherB, invite.id)), { status: 403 });
  await ctx(adminB, () => acceptInvite(adminB, invite.id));
  const q1 = { paperId, paperVersion, questionId: "q1" };
  await assert.rejects(() => ctx(teacherA, () => submitQuestion(teacherA, { source: q1, audience: "PUBLIC", rights: rights("SCHOOL") })), /permit sharing with school audiences only/);
  await assert.rejects(() => ctx(teacherA, () => submitQuestion(teacherA, { source: q1, audience: "SCHOOL", rights: rights("SCHOOL", { basis: "LICENSED" }) })), /holder and licence/);
  await assert.rejects(() => ctx(teacherA, () => submitQuestion(teacherA, { source: q1, audience: "SCHOOL", rights: { basis: "OWN_WORK", permits: "SCHOOL" } })), { status: 400 });
  await assert.rejects(() => ctx(teacherA, () => submitQuestion(teacherA, { source: { paperId, paperVersion, questionId: "q2" }, audience: "NETWORK", networkId: ids.network, rights: rights("NETWORK") })), /secured for an upcoming or active exam/);
  await assert.rejects(() => ctx(teacherA, () => submitQuestion(teacherA, { source: { paperId: namedPaperId, paperVersion: namedVersion, questionId: "q3" }, audience: "NETWORK", networkId: ids.network, rights: rights("NETWORK") })), /learner's name/);
  assert.equal(await raw.questionNetworkItem.count({ where: { contributorSchoolId: A.id } }), 0, "nothing left the school");

  const item = await ctx(teacherA, () => submitQuestion(teacherA, { source: q1, audience: "NETWORK", networkId: ids.network, rights: rights("NETWORK") }));
  assert.equal(item.status, "AWAITING_AUTHORITY", "a teacher's network share waits for a school leader");
  assert.deepEqual(item.tags, { subject: "Mathematics", grade: "Grade 5", curriculum: "", language: "en" });
  assert.equal((await ctx(teacherB, () => networkOverview(teacherB))).reviewQueue.length, 0, "not visible before authority");
  await ctx(adminA, () => authorizeShare(adminA, item.id));
  ids.item = item.id;
});

test("reviews need expertise, record conflicts, and disagreement needs an adjudication", async () => {
  await assert.rejects(() => ctx(teacherC, () => reviewQuestion(teacherC, ids.item, { expertise, conflict: false, decision: "APPROVE" })), { status: 404 }, "outside the network");
  await assert.rejects(() => ctx(teacherA, () => reviewQuestion(teacherA, ids.item, { expertise, conflict: false, decision: "APPROVE" })), /do not review their own/);
  await assert.rejects(() => ctx(teacherB, () => reviewQuestion(teacherB, ids.item, { expertise: { subject: "Science", language: "en" }, conflict: false, decision: "APPROVE" })), /subject and language/);
  await ctx(teacherB, () => reviewQuestion(teacherB, ids.item, { expertise, conflict: false, decision: "APPROVE" }));
  await ctx(adminB, () => reviewQuestion(adminB, ids.item, { expertise, conflict: true, conflictNote: "I co-wrote the source unit.", decision: "APPROVE" }));
  await assert.rejects(() => ctx(teacherA, () => publishQuestion(teacherA, ids.item, {})), /must approve this version; it has 1/);
  await ctx(teacherA2, () => reviewQuestion(teacherA2, ids.item, { expertise, conflict: false, issues: [{ code: "AMBIGUOUS", detail: "Option text could be clearer." }], decision: "REQUEST_CHANGES" }));
  await ctx(teacherB2, () => reviewQuestion(teacherB2, ids.item, { expertise, conflict: false, decision: "APPROVE" }));
  await assert.rejects(() => ctx(teacherA, () => publishQuestion(teacherA, ids.item, {})), /Reviewers disagree/);
  await assert.rejects(() => ctx(teacherA, () => publishQuestion(teacherA, ids.item, { adjudication: "The options are unambiguous for this grade." })), /leader of the contributing school/);
  const { item } = await ctx(principalA, () => publishQuestion(principalA, ids.item, { adjudication: "The options are unambiguous for this grade; wording kept." }));
  assert.equal(item.status, "PUBLISHED");
  assert.deepEqual((item.adjudication as { approvals: number; objections: number; conflicts: number }), { ...(item.adjudication as object), approvals: 2, objections: 1, conflicts: 1 });
  const viewB = await ctx(teacherB, () => networkOverview(teacherB));
  const shown = viewB.library.find((i) => i.id === ids.item)!;
  assert.deepEqual(shown.summary, { approvals: 2, objections: 1, conflicts: 1 }, "disagreement stays visible");
  assert.equal((shown.answerKey as { correctOptionId: string }).correctOptionId, "a1", "teaching staff see the key");
  assert.equal((await ctx(teacherC, () => networkOverview(teacherC))).library.length, 0, "outside the network sees nothing");
  await assert.rejects(() => ctx(studentA, () => networkOverview(studentA)), { status: 403 }, "learners never reach questions or keys");
});

test("an embargoed share stays hidden from other schools", async () => {
  const embargoed = await ctx(adminA, () => submitQuestion(adminA, { source: { paperId, paperVersion, questionId: "q3" }, audience: "NETWORK", networkId: ids.network, rights: rights("NETWORK"), embargoUntil: "2099-12-31" }));
  assert.equal(embargoed.status, "IN_REVIEW");
  assert.ok(!(await ctx(teacherB, () => networkOverview(teacherB))).reviewQueue.some((i) => i.id === embargoed.id));
  await assert.rejects(() => ctx(teacherB, () => reviewQuestion(teacherB, embargoed.id, { expertise, conflict: false, decision: "APPROVE" })), { status: 404 });
});

test("statistics are suppressed for small cohorts and never name schools", async () => {
  await ctx(teacherB, () => adoptQuestion(teacherB, ids.item));
  await ctx(teacherB, () => reportUse(teacherB, ids.item, { sampleSize: 8, meanScore: 0.9, context: "Grade 5 term 1" }));
  await ctx(teacherA, () => reportUse(teacherA, ids.item, { sampleSize: 25, meanScore: 0.6, context: "Grade 5 term 1" }));
  await assert.rejects(() => ctx(teacherC, () => reportUse(teacherC, ids.item, { sampleSize: 40, meanScore: 0.5, context: "x term" })), { status: 404 });
  let s = (await ctx(teacherB, () => networkOverview(teacherB))).library.find((i) => i.id === ids.item)!.stats;
  assert.deepEqual(s, { shown: false, reports: 1, suppressed: 1, minimum: 30 });
  await ctx(teacherB, () => reportUse(teacherB, ids.item, { sampleSize: 15, meanScore: 0.8, context: "Grade 5 term 2" }));
  s = (await ctx(teacherB, () => networkOverview(teacherB))).library.find((i) => i.id === ids.item)!.stats;
  assert.deepEqual([s.shown, s.shown && s.sampleSize, s.shown && s.meanScore, s.suppressed], [true, 40, 0.68, 1]);
  assert.deepEqual(statSummary([{ sampleSize: 5, meanScore: 1 }]), { shown: false, reports: 0, suppressed: 1, minimum: 30 });
});

test("a correction is a reviewed new version; adopters keep theirs until they accept; withdrawal blocks reuse only", async () => {
  const papersBefore = await raw.schoolAiRevision.count({ where: { schoolId: A.id } });
  const v2 = await ctx(teacherB, () => proposeCorrection(teacherB, ids.item, { modelAnswer: "Four, because two and two make four.", changeNote: "The model answer now explains the reasoning." }));
  assert.deepEqual([v2.version, v2.status, v2.correctionOfId], [2, "IN_REVIEW", ids.item]);
  await assert.rejects(() => ctx(teacherA, () => proposeCorrection(teacherA, ids.item, { changeNote: "A second competing correction." })), /already in review/);
  await ctx(teacherA2, () => reviewQuestion(teacherA2, v2.id, { expertise, conflict: false, decision: "APPROVE" }));
  await ctx(adminA, () => reviewQuestion(adminA, v2.id, { expertise, conflict: false, decision: "APPROVE" }));
  await assert.rejects(() => ctx(teacherB, () => publishQuestion(teacherB, v2.id, {})), { status: 403 }, "a proposer from another school cannot publish the contributor's item");
  const published = await ctx(principalA, () => publishQuestion(principalA, v2.id, {}));
  assert.equal(published.notified, 1);
  assert.equal((await raw.questionNetworkItem.findUniqueOrThrow({ where: { id: ids.item } })).status, "SUPERSEDED");
  const adoption = await raw.questionNetworkAdoption.findFirstOrThrow({ where: { adopterSchoolId: B.id } });
  assert.deepEqual([adoption.status, adoption.itemId], ["CORRECTION_AVAILABLE", ids.item], "the adopted version is unchanged until accepted");
  assert.equal(await raw.notification.count({ where: { schoolId: B.id, userId: teacherB.userId, type: "QUESTION_NETWORK" } }), 1);
  const accepted = await ctx(teacherB, () => acceptCorrection(teacherB, adoption.id));
  assert.deepEqual([accepted.status, accepted.itemId], ["ACTIVE", v2.id]);

  await assert.rejects(() => ctx(teacherB, () => withdrawQuestion(teacherB, v2.id, { reason: "Not ours to withdraw at all." })), { status: 403 });
  const withdrawn = await ctx(adminA, () => withdrawQuestion(adminA, v2.id, { reason: "Source licence ended for network use." }));
  assert.equal(withdrawn.notified, 1);
  assert.equal(await raw.questionNetworkItem.count({ where: { shareKey: v2.shareKey, status: { not: "WITHDRAWN" } } }), 0);
  const after = await raw.questionNetworkAdoption.findUniqueOrThrow({ where: { id: adoption.id } });
  assert.equal(after.status, "WITHDRAWN_UPSTREAM");
  assert.equal((after.history as unknown[]).length, 4, "adopted, correction, accepted, withdrawn");
  await assert.rejects(() => ctx(teacherB2, () => adoptQuestion(teacherB2, v2.id)), /Only a published, reviewed version/);
  assert.equal(await raw.schoolAiRevision.count({ where: { schoolId: A.id } }), papersBefore, "no paper or delivered assessment was changed");
});
