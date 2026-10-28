import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { assessmentFixture } from "../school-ai/assessment-fixture";

// SKO-427 on the isolated app with synthetic data: a learner builds an entry from work whose feedback was
// returned (never from unreleased marking) and a later revision; the goal is snapshotted; editing the
// reflection never touches feedback or the submitted work; the teacher approves an exact reflection
// version; comparisons warn when the rubric differs; sharing is per guardian, needs current permission,
// and revocation, expiry and lost permission close old links and exports; removing an entry leaves the
// assignment intact.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.PORTFOLIO_TEST_APP || "http://localhost:3107";
const evidence = process.env.PORTFOLIO_EVIDENCE_DIR || "/tmp/sko427-evidence";
const db = new PrismaClient(), password = "SyntheticFolio427!";
const schoolId = `folio427-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const DAY = 86_400_000;

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: Record<string, unknown> = {}; try { json = JSON.parse(body); } catch { /* html */ } return { status: r.status(), json: json as { data?: any; error?: string }, body }; };
const id = (key: string) => users.get(key)!.id;
const access = async (relationshipId: string, learningRecords: boolean) => {
  // Versions never overlap: close the open one, then start the new one at the same instant.
  const at = new Date();
  const open = await db.guardianAccessVersion.findFirst({ where: { relationshipId, effectiveUntil: null } });
  if (open) await db.guardianAccessVersion.update({ where: { id: open.id }, data: { effectiveUntil: at } });
  return db.guardianAccessVersion.create({ data: { schoolId, relationshipId, createdByUserId: id("teacher"), reason: "Synthetic portfolio fixture", effectiveFrom: open ? at : new Date(at.getTime() - 1000), permissions: { learningRecords, attendance: true, finances: false, communication: true, pickup: false } } });
};
const relate = async (studentId: string, guardianKey: string, learningRecords = true) => {
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: id(guardianKey), createdByUserId: id("teacher"), fullName: `Synthetic ${guardianKey}`, email: users.get(guardianKey)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await access(relationship.id, learningRecords);
  return relationship.id;
};
async function assignment(title: string, rubric: { id: string; title: string; maxPoints: number }[], outcomes: string[] | null) {
  const aid = randomUUID(), teacher = id("teacher");
  await db.assignment.create({ data: { id: aid, schoolId, campusId, classId, subjectId, title, instructions: "Synthetic.", status: "RELEASED", ownerId: teacher, currentVersion: 1, rubric } });
  await db.assignmentRubricVersion.create({ data: { schoolId, assignmentId: aid, version: 1, criteria: rubric, totalPoints: rubric.reduce((n, c) => n + c.maxPoints, 0), createdById: teacher } });
  await db.assignmentVersion.create({ data: { schoolId, assignmentId: aid, version: 1, title, instructions: "Synthetic.", rubricVersion: 1, audience: [ids.mira, ids.omar], submissionMode: "ONLINE", allowedTypes: [], timezone: "Asia/Karachi", opensAt: new Date(Date.now() - 20 * DAY), dueAt: new Date(Date.now() - 10 * DAY), dueLocal: "2026-10-01T09:00", latePolicy: "ACCEPT_FLAGGED", resubmission: "AFTER_RETURN", resourceIds: [], releasedById: teacher, objectives: outcomes ? { curriculumId: ids.curriculum, curriculumVersion: 1, outcomeIds: outcomes } : undefined } });
  return aid;
}
async function attempt(aid: string, studentId: string, version: number, text: string, daysAgo: number, feedback: { status: string; scores: [string, number][]; comment: string } | null) {
  let sub = await db.assignmentSubmission.findFirst({ where: { assignmentId: aid, studentId } });
  if (!sub) sub = await db.assignmentSubmission.create({ data: { schoolId, assignmentId: aid, studentId, status: "RETURNED", latestVersion: version } });
  const at = new Date(Date.now() - daysAgo * DAY);
  const sv = await db.assignmentSubmissionVersion.create({ data: { schoolId, submissionId: sub.id, assignmentId: aid, studentId, version, assignmentVersion: 1, rubricVersion: 1, mode: "ONLINE", idempotencyKey: `idem-${randomUUID()}`, receiptCode: `R-${randomUUID().slice(0, 8)}`, text, artifactSha256: createHash("sha256").update(text + randomUUID()).digest("hex"), receivedAt: at, submittedAt: at, effectiveDueAt: new Date(at.getTime() + DAY), late: false, recordedById: studentId } as never });
  if (feedback) await db.assignmentFeedback.create({ data: { schoolId, submissionVersionId: sv.id, rubricVersion: 1, criteria: feedback.scores.map(([criterionId, points]) => ({ criterionId, points, comment: "" })), comment: feedback.comment, totalPoints: feedback.scores.reduce((n, [, p]) => n + p, 0), status: feedback.status, markerId: id("teacher"), returnedAt: feedback.status === "RETURNED" ? new Date(at.getTime() + DAY / 2) : null } });
  return sv.id;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Academy", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar Main", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await user("teacher", "TEACHER"); await user("otherTeacher", "TEACHER");
  const learner = await user("learner", "STUDENT"), other = await user("otherLearner", "STUDENT");
  await user("parentA", "PARENT"); await user("parentB", "PARENT"); await user("parentC", "PARENT", "en"); await user("parent-ar", "PARENT", "ar");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 6", section: "B", academicYear: 2026, classTeacherId: id("teacher") } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Synthetic Science", teacherId: id("teacher") } });
  for (const [key, account, name] of [["mira", learner, "Synthetic Mira Ali"], ["omar", other, "Synthetic Omar Raza"]] as const) { ids[key] = randomUUID(); await db.student.create({ data: { id: ids[key], schoolId, campusId, classId, studentUserId: account, fullName: name, rollNo: key, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); }
  ids.relA = await relate(ids.mira, "parentA"); await relate(ids.mira, "parentB", false); await relate(ids.omar, "parentC"); ids.relAr = await relate(ids.mira, "parent-ar");
  const { curriculum } = assessmentFixture(subjectId, classId);
  curriculum.outcomes = [{ id: "o-evidence", code: "SCI.6.2", title: "Explain scientific evidence", sourceId: "source-1", sourcePage: "1", included: true, taught: true }, { id: "o-fair", code: "SCI.6.3", title: "Plan a fair test", sourceId: "source-1", sourcePage: "1", included: true, taught: true }];
  ids.curriculum = (await db.schoolAiRecord.create({ data: { schoolId, campusId, kind: "CURRICULUM", title: "Synthetic science curriculum", version: 1, status: "APPROVED", data: curriculum as never, classId, subjectId, createdById: id("teacher"), updatedById: id("teacher"), idempotencyKey: randomUUID(), requestHash: randomUUID() } })).id;
  const rubricA = [{ id: "claim", title: "States a claim", maxPoints: 4 }, { id: "evidence", title: "Uses evidence", maxPoints: 4 }];
  ids.aA = await assignment("Plant growth report", rubricA, ["o-evidence", "o-fair"]);
  ids.aB = await assignment("Rust investigation", [{ id: "claim", title: "States a claim", maxPoints: 5 }, { id: "method", title: "Describes the method", maxPoints: 5 }], ["o-evidence"]);
  ids.v1 = await attempt(ids.aA, ids.mira, 1, "Plants grow taller with more light.", 12, { status: "RETURNED", scores: [["claim", 3], ["evidence", 1]], comment: "Clear claim. Add measurements as evidence." });
  ids.v2 = await attempt(ids.aA, ids.mira, 2, "Plants with 8 hours of light grew 4 cm more (table).", 6, { status: "RETURNED", scores: [["claim", 4], ["evidence", 3]], comment: "Much stronger use of data." });
  ids.v3 = await attempt(ids.aA, ids.mira, 3, "Draft third try.", 2, { status: "DRAFT", scores: [["claim", 4], ["evidence", 4]], comment: "UNRELEASED-MARK-427" });
  ids.b1 = await attempt(ids.aB, ids.mira, 1, "The nail rusted faster in salt water.", 4, { status: "RETURNED", scores: [["claim", 4], ["method", 3]], comment: "Good method." });
  ids.omarV = await attempt(ids.aA, ids.omar, 1, "Omar's report.", 10, { status: "RETURNED", scores: [["claim", 2], ["evidence", 2]], comment: "ok" });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("entries use only returned feedback, snapshot the goal and are not duplicated on retry", async () => {
  const ev = (await call("learner", "get", "/api/portfolio?view=evidence")).json.data;
  const att = (vid: string) => ev.attempts.find((a: { id: string }) => a.id === vid);
  assert.deepEqual([att(ids.v1).hasFeedback, att(ids.v2).hasFeedback, att(ids.v3).hasFeedback], [true, true, false], "unreleased marking is not feedback");
  assert.deepEqual(att(ids.v1).goals.map((g: { code: string }) => g.code), ["SCI.6.2", "SCI.6.3"]);
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "entry", earlierVersionId: ids.v3, idempotencyKey: `k-${randomUUID()}` })).status, 409);
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "entry", earlierVersionId: ids.v1, idempotencyKey: `k-${randomUUID()}` })).status, 400, "choose the goal the work shows");
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "entry", earlierVersionId: ids.omarV, outcomeId: "o-evidence", idempotencyKey: `k-${randomUUID()}` })).status, 400, "another learner's work");
  const key = `k-${randomUUID()}`;
  const made = await call("learner", "post", "/api/portfolio", { action: "entry", earlierVersionId: ids.v1, laterVersionId: ids.v2, outcomeId: "o-evidence", reflection: "I added measurements after the feedback.", idempotencyKey: key });
  assert.equal(made.status, 201, JSON.stringify(made.json)); ids.e1 = made.json.data.id;
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "entry", earlierVersionId: ids.v1, laterVersionId: ids.v2, outcomeId: "o-evidence", idempotencyKey: key })).json.data.id, ids.e1, "a retry keeps one entry");
  ids.e2 = (await call("learner", "post", "/api/portfolio", { action: "entry", earlierVersionId: ids.v1, laterVersionId: ids.b1, outcomeId: "o-evidence", reflection: "My later investigation used a method.", idempotencyKey: `k-${randomUUID()}` })).json.data.id;
  const view = (await call("learner", "get", "/api/portfolio")).json.data;
  const e1 = view.entries.find((e: { id: string }) => e.id === ids.e1), e2 = view.entries.find((e: { id: string }) => e.id === ids.e2);
  assert.deepEqual([e1.goal.code, e1.goal.title, e1.earlier.version, e1.later.version], ["SCI.6.2", "Explain scientific evidence", 1, 2], "source, version and goal are kept");
  assert.equal(e1.comparison.comparable, true);
  assert.deepEqual(e1.comparison.rows.map((r: { id: string; before: number; after: number }) => [r.id, r.before, r.after]), [["claim", 3, 4], ["evidence", 1, 3]], "criterion by criterion");
  assert.deepEqual([e2.comparison.comparable, e2.comparison.warning], [false, "RUBRIC_CHANGED"], "a different rubric is never compared directly");
  assert.ok(!JSON.stringify(view).includes("UNRELEASED-MARK-427"));
  assert.equal(view.entries[0].staffNote, undefined, "learners never receive staff notes");
});

test("the learner edits the reflection; the teacher approves an exact version; feedback and work never change", async () => {
  const before = await db.assignmentFeedback.findMany({ where: { submissionVersionId: { in: [ids.v1, ids.v2] } }, orderBy: { id: "asc" } });
  const beforeWork = await db.assignmentSubmissionVersion.findMany({ where: { id: { in: [ids.v1, ids.v2] } }, select: { id: true, text: true }, orderBy: { id: "asc" } });
  let e = await db.portfolioEntry.findUniqueOrThrow({ where: { id: ids.e1 } });
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "reflect", entryId: ids.e1, knownVersion: e.version, reflection: "I added a table of measurements, so my claim now rests on evidence.", propose: true })).status, 200);
  e = await db.portfolioEntry.findUniqueOrThrow({ where: { id: ids.e1 } });
  assert.deepEqual([e.status, e.reflectionVersion], ["PROPOSED", 2]);
  assert.equal((await call("otherTeacher", "post", "/api/portfolio", { action: "review", entryId: ids.e1, knownVersion: e.version, decision: "approve" })).status, 404, "a teacher outside the class cannot review");
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "review", entryId: ids.e1, knownVersion: e.version, decision: "approve" })).status, 403);
  assert.equal((await call("teacher", "post", "/api/portfolio", { action: "review", entryId: ids.e1, knownVersion: e.version, decision: "approve", teacherComment: "Your data now supports the claim.", staffNote: "STAFF-ONLY-427: discuss stretch task", familyVisible: true })).status, 200);
  e = await db.portfolioEntry.findUniqueOrThrow({ where: { id: ids.e1 } });
  assert.deepEqual([e.status, e.approvedVersion, e.familyVisible], ["APPROVED", 2, true]);
  ids.approvedText = e.approvedReflection!;
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "reflect", entryId: ids.e1, knownVersion: e.version, reflection: "UNREVIEWED-EDIT-427 I also want to add a graph." })).status, 200);
  e = await db.portfolioEntry.findUniqueOrThrow({ where: { id: ids.e1 } });
  assert.deepEqual([e.status, e.approvedReflection, e.approvedVersion], ["PROPOSED", ids.approvedText, 2], "an edit needs review again; the approved text stays");
  assert.deepEqual(await db.assignmentFeedback.findMany({ where: { submissionVersionId: { in: [ids.v1, ids.v2] } }, orderBy: { id: "asc" } }), before, "feedback is untouched");
  assert.deepEqual(await db.assignmentSubmissionVersion.findMany({ where: { id: { in: [ids.v1, ids.v2] } }, select: { id: true, text: true }, orderBy: { id: "asc" } }), beforeWork, "the submitted work is untouched");
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "reflect", entryId: ids.e1, knownVersion: e.version - 1, reflection: "stale" })).status, 409);
});

test("sharing is per guardian with current permission; revoke, expiry and lost permission close old links", async () => {
  assert.equal((await call("teacher", "post", "/api/portfolio", { action: "share", studentId: ids.mira, guardianUserId: id("parentB"), entryIds: [ids.e1] })).status, 409, "no learning-record permission");
  assert.equal((await call("teacher", "post", "/api/portfolio", { action: "share", studentId: ids.mira, guardianUserId: id("parentA"), entryIds: [ids.e1, ids.e2] })).status, 409, "only entries approved for families");
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "share", studentId: ids.mira, guardianUserId: id("parentA"), entryIds: [ids.e1] })).status, 403, "learners do not share");
  const shared = await call("teacher", "post", "/api/portfolio", { action: "share", studentId: ids.mira, guardianUserId: id("parentA"), entryIds: [ids.e1], title: "Science progress", days: 30 });
  assert.equal(shared.status, 201, JSON.stringify(shared.json)); ids.share = shared.json.data.id;
  const list = (await call("parentA", "get", "/api/portfolio?view=shares")).json.data;
  assert.deepEqual(list.map((s: { id: string }) => s.id), [ids.share]);
  const opened = await call("parentA", "get", `/api/portfolio?share=${ids.share}`);
  assert.equal(opened.status, 200);
  assert.equal(opened.json.data.entries[0].reflection, ids.approvedText, "families see the approved reflection only");
  assert.ok(!opened.body.includes("UNREVIEWED-EDIT-427") && !opened.body.includes("STAFF-ONLY-427") && !opened.body.includes("UNRELEASED-MARK-427"), "no unreviewed text, staff note or unreleased mark");
  assert.equal(opened.json.data.entries[0].teacherComment, null, "the entry is back under review, so its comment is withheld");
  const exported = await call("parentA", "get", `/api/portfolio/export?share=${ids.share}`);
  assert.equal(exported.status, 200);
  assert.ok(exported.body.includes("Version 1") && exported.body.includes("Explain scientific evidence") && !exported.body.includes("STAFF-ONLY-427"), "export names source, version and goal without staff notes");
  assert.equal((await call("parentC", "get", `/api/portfolio?share=${ids.share}`)).status, 404, "another family");
  assert.equal((await call("parentB", "get", `/api/portfolio?share=${ids.share}`)).status, 404, "another guardian of the same child");
  assert.equal((await call("teacher", "post", "/api/portfolio", { action: "revoke", shareId: ids.share })).status, 200);
  assert.equal((await call("parentA", "get", `/api/portfolio?share=${ids.share}`)).status, 404, "a revoked share does not open");
  assert.equal((await call("parentA", "get", `/api/portfolio/export?share=${ids.share}`)).status, 404, "nor its export");
  // Re-approve so the next shares are valid; then test expiry and lost permission.
  const e = await db.portfolioEntry.findUniqueOrThrow({ where: { id: ids.e1 } });
  await call("teacher", "post", "/api/portfolio", { action: "review", entryId: ids.e1, knownVersion: e.version, decision: "approve", teacherComment: "Graph idea approved.", familyVisible: true });
  const s2 = (await call("teacher", "post", "/api/portfolio", { action: "share", studentId: ids.mira, guardianUserId: id("parentA"), entryIds: [ids.e1], days: 10 })).json.data.id;
  await db.portfolioShare.update({ where: { id: s2 }, data: { createdAt: new Date(Date.now() - 2 * DAY), expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call("parentA", "get", `/api/portfolio?share=${s2}`)).status, 404, "an expired share does not open");
  const s3 = (await call("teacher", "post", "/api/portfolio", { action: "share", studentId: ids.mira, guardianUserId: id("parentA"), entryIds: [ids.e1], days: 10 })).json.data.id;
  assert.equal((await call("parentA", "get", `/api/portfolio?share=${s3}`)).status, 200);
  await access(ids.relA, false);
  assert.equal((await call("parentA", "get", `/api/portfolio?share=${s3}`)).status, 404, "the guardian's permission is rechecked on every open");
  assert.equal((await call("parentA", "get", "/api/portfolio?view=shares")).json.data.length, 0);
  ids.shareAr = (await call("teacher", "post", "/api/portfolio", { action: "share", studentId: ids.mira, guardianUserId: id("parent-ar"), entryIds: [ids.e1], title: "Science progress", days: 30 })).json.data.id;
});

test("removing an entry leaves the assignment intact and the collection says what was withdrawn", async () => {
  const e2 = await db.portfolioEntry.findUniqueOrThrow({ where: { id: ids.e2 } });
  assert.equal((await call("teacher", "post", "/api/portfolio", { action: "review", entryId: ids.e2, knownVersion: e2.version, decision: "changes", teacherComment: "Say which part of the method improved." })).status, 200);
  assert.equal((await db.portfolioEntry.findUniqueOrThrow({ where: { id: ids.e2 } })).status, "CHANGES_REQUESTED");
  const counts = async () => [await db.assignmentSubmissionVersion.count({ where: { assignmentId: ids.aA } }), await db.assignmentFeedback.count({ where: { submissionVersion: { assignmentId: ids.aA } } })];
  const before = await counts();
  const extra = (await call("learner", "post", "/api/portfolio", { action: "entry", earlierVersionId: ids.v2, outcomeId: "o-fair", reflection: "Fair test.", idempotencyKey: `k-${randomUUID()}` })).json.data.id;
  assert.equal((await call("learner", "post", "/api/portfolio", { action: "remove", entryId: extra })).status, 200);
  assert.deepEqual(await counts(), before, "the original assignment record remains");
  assert.ok(!(await call("learner", "get", "/api/portfolio")).json.data.entries.some((e: { id: string }) => e.id === extra));
});

test("screens: learner portfolio (EN, phone), teacher review, family collection in Arabic", async () => {
  const page = await (await context("learner")).newPage();
  await page.goto(`${base}/student/portfolio`);
  await page.locator(`[data-pf-entry="${ids.e1}"] [data-pf-compare=comparable]`).waitFor();
  await shot(page, "01-learner-portfolio-en");
  await page.close();
  const phone = await (await context("learner", { width: 390, height: 844 })).newPage();
  await phone.goto(`${base}/student/portfolio`);
  await phone.locator(`[data-pf-entry="${ids.e2}"] [data-pf-compare=incomparable]`).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await phone.locator(`[data-pf-entry="${ids.e2}"]`).scrollIntoViewIfNeeded();
  await shot(phone, "02-learner-incomparable-phone");
  await phone.close();
  const t = await (await context("teacher")).newPage();
  await t.goto(`${base}/teacher/portfolio`);
  await t.locator(`[data-pf-entry="${ids.e1}"] [data-pf-review]`).click();
  await t.locator("[data-pf-review-dialog]").waitFor();
  await shot(t, "03-teacher-review");
  await t.close();
  const ar = await (await context("parent-ar")).newPage();
  await ar.goto(`${base}/parent/results`);
  await ar.locator(`[data-fp-share="${ids.shareAr}"] [data-fp-open]`).click();
  await ar.locator("[data-fp-collection] [data-fp-entry]").first().waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  assert.ok(!(await ar.locator("[data-family-portfolio]").innerText()).includes("STAFF-ONLY-427"));
  await ar.locator("[data-family-portfolio]").scrollIntoViewIfNeeded();
  await shot(ar, "04-family-collection-ar");
  await ar.close();
});
