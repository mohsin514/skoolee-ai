import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { addAction, addNote, decideMentoring, designateCounsellor, exportPlan, opportunityState, pathwayOverview, readNotes, recordAlumni, requestAppointment, requestMentoring, reviewAlumni, saveGoal, saveOpportunity, updateAppointment, verifyOpportunity } from "../../src/lib/pathways/service";

// SKO-455: the student owns goals and their audience; counselling notes are restricted, logged and
// never exported; opportunities show source freshness; alumni consent is explicit and revocable;
// mentoring is school-mediated with safeguarding and guardian consent for minors.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `pathway-${randomUUID()}`, campusId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const principal = actor("PRINCIPAL"), counsellor = actor("TEACHER"), teacher = actor("TEACHER"), minor = actor("STUDENT"), adult = actor("STUDENT"), parent = actor("PARENT");
const ctx = <T>(u: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: u.userId, role: u.role }, work);
const ids: Record<string, string> = {};
const SECRET = "CONFIDENTIAL-NOTE-7Q2";
const future = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic pathway school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic", regId: campusId, city: "Synthetic" } });
  for (const u of [principal, counsellor, teacher, minor, adult, parent]) await raw.user.create({ data: { id: u.userId, schoolId, campusId, role: u.role, email: u.email, fullName: `Synthetic ${u.role} ${u.userId.slice(0, 4)}`, onboardingComplete: true, isActive: true } });
  const classId = randomUUID();
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Year 11", section: "A", academicYear: 2026 } });
  ids.minor = (await raw.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Year 11", rollNo: "P1", gender: "FEMALE", status: "active", studentUserId: minor.userId, dateOfBirth: new Date("2010-05-01T00:00:00Z") } })).id;
  ids.adult = (await raw.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Year 13", rollNo: "P2", gender: "MALE", status: "active", studentUserId: adult.userId, dateOfBirth: new Date("2006-01-01T00:00:00Z") } })).id;
  const rel = await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId: ids.minor, guardianUserId: parent.userId, createdByUserId: principal.userId, fullName: "Synthetic guardian", email: parent.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await raw.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: principal.userId, reason: "Synthetic fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
});
after(async () => {
  for (const m of [raw.mentoringRequest, raw.alumniProfile, raw.counsellingNote, raw.counsellingAppointment, raw.pathwayOpportunity, raw.pathwayAction, raw.pathwayGoal, raw.pathwayCounsellor]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

test("the student owns goals and chooses their audience; counsellors and guardians see only what is shared", async () => {
  await assert.rejects(() => ctx(teacher, () => designateCounsellor(teacher, { userId: counsellor.userId })), { status: 403 });
  await ctx(principal, () => designateCounsellor(principal, { userId: counsellor.userId }));
  const shared = await ctx(minor, () => saveGoal(minor, { title: "Explore engineering", audience: ["COUNSELLOR"], nextReviewOn: "2027-03-20" }));
  const privateGoal = await ctx(minor, () => saveGoal(minor, { title: "Private hobby plan", audience: [] }));
  await assert.rejects(() => ctx(counsellor, () => saveGoal(counsellor, { title: "Not theirs", audience: [] })), /Only the student edits/);
  await ctx(minor, () => addAction(minor, { goalId: shared.id, title: "Visit an engineering open day", owner: "STUDENT", dueOn: "2027-02-10" }));
  await ctx(counsellor, () => addAction(counsellor, { goalId: shared.id, title: "Share scholarship list", owner: "COUNSELLOR", dueOn: "2027-02-01" }));
  await assert.rejects(() => ctx(counsellor, () => addAction(counsellor, { goalId: privateGoal.id, title: "Should not be possible", owner: "COUNSELLOR", dueOn: "2027-02-01" })), { status: 403 });
  await assert.rejects(() => ctx(teacher, () => exportPlan(teacher, ids.minor)), /designated counsellors only/);
  const counsellorView = await ctx(counsellor, () => pathwayOverview(counsellor));
  assert.equal(counsellorView.mode, "COUNSELLOR");
  assert.deepEqual(counsellorView.mode === "COUNSELLOR" && counsellorView.plans[0].goals.map((g) => g.title), ["Explore engineering"]);
  let guardianView = await ctx(parent, () => pathwayOverview(parent));
  assert.deepEqual(guardianView.mode === "GUARDIAN" && guardianView.children[0].plan.length, 0, "nothing is shared with the guardian yet");
  await ctx(minor, () => saveGoal(minor, { title: "Explore engineering", audience: ["COUNSELLOR", "GUARDIAN"], nextReviewOn: "2027-03-20" }, shared.id));
  guardianView = await ctx(parent, () => pathwayOverview(parent));
  assert.deepEqual(guardianView.mode === "GUARDIAN" && guardianView.children[0].plan.map((g) => [g.title, g.actions.length]), [["Explore engineering", 2]]);
  ids.goal = shared.id;
});

test("counselling notes are restricted, logged and never in any export", async () => {
  await ctx(counsellor, () => addNote(counsellor, { studentId: ids.minor, body: `${SECRET} discussed family pressure.` }));
  await assert.rejects(() => ctx(teacher, () => readNotes(teacher, ids.minor)), /restricted to designated staff/);
  await assert.rejects(() => ctx(principal, () => readNotes(principal, ids.minor)), { status: 403 }, "leadership alone is not a designation");
  assert.equal((await ctx(counsellor, () => readNotes(counsellor, ids.minor)))[0].body.startsWith(SECRET), true);
  const logs = await raw.confidentialAccessLog.findMany({ where: { schoolId, domain: "COUNSELLING" }, select: { action: true } });
  assert.deepEqual(logs.map((l) => l.action).sort(), ["CREATE", "DENIED", "DENIED", "VIEW"]);
  for (const u of [minor, counsellor, parent]) {
    const out = await ctx(u, () => exportPlan(u, ids.minor));
    assert.ok(!out.text.includes(SECRET) && !out.text.includes("family pressure"), `${u.role} export excludes notes`);
    assert.match(out.text, /Private counselling notes are not included/u);
  }
  assert.ok(!(await ctx(parent, () => exportPlan(parent, ids.minor))).text.includes("Private hobby plan"), "the guardian export holds only goals shared with guardians");
  const studentView = JSON.stringify(await ctx(minor, () => pathwayOverview(minor)));
  assert.ok(!studentView.includes(SECRET), "the student's own view has no notes");
});

test("opportunities show their source freshness; expired and withdrawn are labelled or hidden", async () => {
  await assert.rejects(() => ctx(teacher, () => saveOpportunity(teacher, { title: "x", provider: "y", kind: "OTHER", sourceUrl: "https://example.invalid", eligibility: "zzz" })), { status: 403 });
  const past = await ctx(counsellor, () => saveOpportunity(counsellor, { title: "Synthetic summer school", provider: "Synthetic University", kind: "COURSE", sourceUrl: "https://example.invalid/summer", eligibility: "Year 11 students", deadline: "2020-01-01" }));
  assert.equal(opportunityState(past), "DEADLINE_PASSED");
  const open = await ctx(counsellor, () => saveOpportunity(counsellor, { title: "Synthetic engineering scholarship", provider: "Synthetic Foundation", kind: "SCHOLARSHIP", sourceUrl: "https://example.invalid/scholar", eligibility: "Year 11–13", deadline: "2099-01-31" }));
  await raw.pathwayOpportunity.update({ where: { id: open.id }, data: { lastVerifiedAt: new Date(Date.now() - 100 * 86_400_000) } });
  assert.equal(opportunityState(await raw.pathwayOpportunity.findUniqueOrThrow({ where: { id: open.id } })), "NEEDS_VERIFICATION");
  assert.equal(opportunityState(await ctx(counsellor, () => verifyOpportunity(counsellor, open.id, { outcome: "CONFIRMED" }))), "CURRENT");
  await ctx(counsellor, () => verifyOpportunity(counsellor, past.id, { outcome: "WITHDRAWN" }));
  const view = await ctx(minor, () => pathwayOverview(minor));
  assert.deepEqual(view.mode === "STUDENT" && view.opportunities.map((o) => [o.title, o.state]), [["Synthetic engineering scholarship", "CURRENT"]]);
});

test("appointments go to designated counsellors and show only a general label", async () => {
  await assert.rejects(() => ctx(minor, () => requestAppointment(minor, { counsellorId: teacher.userId, startsAt: future(), minutes: 30 })), /designated counsellor/);
  const appt = await ctx(minor, () => requestAppointment(minor, { counsellorId: counsellor.userId, startsAt: future(), minutes: 30 }));
  assert.equal(appt.publicLabel, "Pathway meeting");
  await assert.rejects(() => ctx(teacher, () => updateAppointment(teacher, appt.id, { status: "CONFIRMED" })), { status: 403 });
  assert.equal((await ctx(counsellor, () => updateAppointment(counsellor, appt.id, { status: "CONFIRMED" }))).status, "CONFIRMED");
});

test("alumni consent is explicit and revocable; mentoring is mediated with safeguarding and guardian consent", async () => {
  await assert.rejects(() => ctx(counsellor, () => recordAlumni(counsellor, { displayName: "Too young", pathway: "College", contactEmail: "young@example.invalid", dateOfBirth: "2012-01-01", visibility: "STUDENTS", mentoring: true, consentEvidence: "Form A-1" })), /adults only/);
  const alum = await ctx(counsellor, () => recordAlumni(counsellor, { displayName: "Synthetic alumna", pathway: "Civil engineering, Synthetic University", contactEmail: "alumna@example.invalid", dateOfBirth: "1998-04-01", visibility: "STUDENTS", mentoring: true, consentEvidence: "Signed consent form AL-22" }));
  const overdue = await ctx(counsellor, () => recordAlumni(counsellor, { displayName: "Overdue alumnus", pathway: "Medicine", contactEmail: "overdue@example.invalid", dateOfBirth: "1995-04-01", visibility: "STUDENTS", mentoring: true, consentEvidence: "Signed consent form AL-09" }));
  await raw.alumniProfile.update({ where: { id: overdue.id }, data: { reviewDueOn: new Date("2020-01-01T00:00:00Z") } });
  const view = await ctx(minor, () => pathwayOverview(minor));
  assert.deepEqual(view.mode === "STUDENT" && view.alumni, [{ id: alum.id, displayName: "Synthetic alumna", pathway: "Civil engineering, Synthetic University" }], "no contact details, no overdue review");
  await assert.rejects(() => ctx(minor, () => requestMentoring(minor, { alumniId: overdue.id, purpose: "Learn about medicine pathways" })), { status: 404 });
  const req = await ctx(minor, () => requestMentoring(minor, { alumniId: alum.id, purpose: "Learn what civil engineering study involves" }));
  await assert.rejects(() => ctx(teacher, () => decideMentoring(teacher, req.id, { decision: "APPROVE", note: "ok", safeguardingChecked: true, guardianConsent: true })), { status: 403 });
  await assert.rejects(() => ctx(counsellor, () => decideMentoring(counsellor, req.id, { decision: "APPROVE", note: "Looks fine" })), /safeguarding check/);
  await assert.rejects(() => ctx(counsellor, () => decideMentoring(counsellor, req.id, { decision: "APPROVE", note: "Looks fine", safeguardingChecked: true })), /guardian consent is required/);
  assert.equal((await ctx(counsellor, () => decideMentoring(counsellor, req.id, { decision: "APPROVE", note: "Supervised introduction in school", safeguardingChecked: true, guardianConsent: true }))).status, "APPROVED");
  const adultReq = await ctx(adult, () => requestMentoring(adult, { alumniId: alum.id, purpose: "Ask about university applications" }));
  const pending = await ctx(adult, () => requestMentoring(adult, { alumniId: alum.id, purpose: "A second follow-up conversation" }));
  assert.equal((await ctx(counsellor, () => decideMentoring(counsellor, adultReq.id, { decision: "APPROVE", note: "Adult student, school-mediated", safeguardingChecked: true }))).status, "APPROVED");
  const withdrawn = await ctx(counsellor, () => reviewAlumni(counsellor, alum.id, { decision: "WITHDRAWN", note: "Alumna asked to stop by email" }));
  assert.equal((withdrawn as { cancelledRequests: number }).cancelledRequests, 3);
  assert.deepEqual((await raw.mentoringRequest.findMany({ where: { alumniId: alum.id } })).map((r) => r.status), ["CANCELLED", "CANCELLED", "CANCELLED"]);
  assert.equal(pending.status, "REQUESTED");
  const after = await ctx(minor, () => pathwayOverview(minor));
  assert.deepEqual(after.mode === "STUDENT" && after.alumni, [], "withdrawn consent removes the alumna from discovery");
  await assert.rejects(() => ctx(minor, () => requestMentoring(minor, { alumniId: alum.id, purpose: "Trying again after withdrawal" })), { status: 404 });
  const history = (await raw.alumniProfile.findUniqueOrThrow({ where: { id: alum.id } })).history as { event: string }[];
  assert.deepEqual(history.map((h) => h.event), ["CONSENT_RECORDED", "CONSENT_WITHDRAWN"], "the earlier consent is kept in history");
});
