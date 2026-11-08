import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-455 on the isolated app: a Year 11 student sets a goal shared with the counsellor only and adds
// a dated action; the guardian sees nothing; the designated counsellor reads the shared plan, keeps a
// confidential note that no export contains, and approves a school-mediated alumni introduction only
// with the safeguarding check and guardian consent. EN desktop, AR phone.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.PATHWAY_TEST_APP || "http://localhost:3108";
const evidence = process.env.PATHWAY_EVIDENCE_DIR || "/tmp/sko455-evidence";
const db = new PrismaClient(), password = "SyntheticPathway455!";
const schoolId = `pw455-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await c.storageState());
  return c;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Secondary", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Main", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await user("principal", "PRINCIPAL"); await user("counsellor", "TEACHER"); await user("student", "STUDENT"); await user("student-ar", "STUDENT", "ar"); await user("parent", "PARENT");
  const classId = randomUUID();
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Year 11", section: "A", academicYear: 2026, classTeacherId: users.get("counsellor")!.id } });
  ids.student = (await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Year 11", rollNo: "Y11-1", gender: "FEMALE", status: "active", studentUserId: users.get("student")!.id, dateOfBirth: new Date("2010-05-01T00:00:00Z") } })).id;
  await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Year 11 AR", rollNo: "Y11-2", gender: "MALE", status: "active", studentUserId: users.get("student-ar")!.id, dateOfBirth: new Date("2010-07-01T00:00:00Z") } });
  const rel = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId: ids.student, guardianUserId: users.get("parent")!.id, createdByUserId: users.get("principal")!.id, fullName: "Synthetic guardian", email: users.get("parent")!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: users.get("principal")!.id, reason: "Synthetic fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  await db.pathwayCounsellor.create({ data: { schoolId, campusId, userId: users.get("counsellor")!.id, grantedById: users.get("principal")!.id } });
  await db.pathwayOpportunity.create({ data: { schoolId, campusId, title: "Synthetic engineering scholarship", provider: "Synthetic Foundation", kind: "SCHOLARSHIP", sourceUrl: "https://example.invalid/scholarship", eligibility: "Year 11–13 students", deadline: new Date("2099-01-31T00:00:00Z"), lastVerifiedAt: new Date(), verifiedById: users.get("counsellor")!.id } });
  await db.pathwayOpportunity.create({ data: { schoolId, campusId, title: "Synthetic summer camp", provider: "Synthetic Institute", kind: "COURSE", sourceUrl: "https://example.invalid/camp", eligibility: "Year 10–11", deadline: new Date("2099-06-30T00:00:00Z"), lastVerifiedAt: new Date(Date.now() - 120 * 86_400_000), verifiedById: users.get("counsellor")!.id } });
  const next = new Date(); next.setUTCFullYear(next.getUTCFullYear() + 1);
  await db.alumniProfile.create({ data: { schoolId, campusId, displayName: "Synthetic alumna", pathway: "Civil engineering, Synthetic University", contactEmail: "alumna@example.invalid", dateOfBirth: new Date("1998-04-01T00:00:00Z"), visibility: "STUDENTS", mentoring: true, consentEvidence: "Signed form AL-22", consentGivenAt: new Date(), reviewDueOn: next, recordedById: users.get("counsellor")!.id } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  for (const m of [db.mentoringRequest, db.alumniProfile, db.counsellingNote, db.counsellingAppointment, db.pathwayOpportunity, db.pathwayAction, db.pathwayGoal, db.pathwayCounsellor]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("the student sets a goal for the counsellor only, adds a dated action and asks for an introduction", async () => {
  const page = await (await context("student")).newPage();
  await page.goto(`${base}/student/portfolio`);
  const panel = page.locator('section[aria-labelledby="pathways"]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByText("Start with one goal you would like to explore.").waitFor();
  await panel.getByLabel("Goal", { exact: true }).fill("Explore engineering");
  await panel.getByLabel("My counsellor").check();
  await panel.getByText("You and your counsellor").waitFor();
  await panel.getByRole("button", { name: "Save goal" }).click();
  await panel.getByText("Goal saved and shared with the selected audience.").waitFor({ timeout: 30_000 });
  await panel.getByLabel("Next action").fill("Apply for the engineering scholarship");
  await panel.getByLabel("Deadline", { exact: true }).fill("2027-01-15");
  await panel.getByLabel("Linked opportunity").selectOption({ label: "Synthetic engineering scholarship" });
  await panel.getByRole("button", { name: "Add next action" }).click();
  await panel.getByText("Next action saved.").waitFor({ timeout: 30_000 });
  assert.ok(await panel.getByText("Needs re-checking").isVisible(), "an old check is labelled");
  await panel.getByLabel("What would you like to learn?").fill("What studying civil engineering is like");
  await panel.getByRole("button", { name: "Ask for a school-arranged introduction" }).click();
  await panel.getByText("Request sent to the school for review.").waitFor({ timeout: 30_000 });
  assert.equal(await panel.getByText("alumna@example.invalid").count(), 0, "no contact details reach the student");
  await page.close();
  const guardian = await (await context("parent")).request.get(`${base}/api/pathways`);
  assert.deepEqual((await guardian.json()).data.children[0].plan, [], "the guardian sees nothing that was not shared with them");
});

test("the counsellor reads the shared plan, keeps a confidential note no export contains, and mediates the introduction (EN desktop)", async () => {
  const c = await context("counsellor");
  const page = await c.newPage();
  await page.goto(`${base}/teacher/students`);
  const panel = page.locator('section[aria-labelledby="pathways"]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByText("Apply for the engineering scholarship").waitFor({ timeout: 30_000 });
  await panel.getByLabel("New confidential note").fill("CONFIDENTIAL-7Q2 worried about exam pressure.");
  await panel.getByRole("button", { name: "Save note" }).click();
  await panel.getByText("Confidential note saved.").waitFor({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Open notes" }).click();
  await panel.getByText(/CONFIDENTIAL-7Q2/u).waitFor({ timeout: 30_000 });
  for (const key of ["counsellor", "student"]) {
    const res = await (await context(key)).request.get(`${base}/api/pathways?view=export&studentId=${ids.student}`);
    const text = (await res.json()).data.text as string;
    assert.ok(!text.includes("CONFIDENTIAL-7Q2") && text.includes("Explore engineering"), `${key} export excludes notes`);
  }
  assert.equal((await (await context("principal")).request.get(`${base}/api/pathways?view=notes&studentId=${ids.student}`)).status(), 403, "leaders are not designated counsellors");
  const request = panel.locator("div.rounded-lg", { hasText: "What studying civil engineering is like" });
  await request.getByLabel("Decision note").fill("Supervised call in the careers office");
  await request.getByRole("button", { name: "Approve supervised introduction" }).click();
  await panel.getByText("Confirm the school's safeguarding check before approving.").waitFor({ timeout: 30_000 });
  await request.getByLabel("School safeguarding check done").check();
  await request.getByRole("button", { name: "Approve supervised introduction" }).click();
  await panel.getByText("This student is a minor or their age is not recorded; guardian consent is required.").waitFor({ timeout: 30_000 });
  await request.getByLabel("Guardian consent recorded").check();
  await request.getByRole("button", { name: "Approve supervised introduction" }).click();
  await panel.getByText("Supervised introduction approved.").waitFor({ timeout: 30_000 });
  assert.equal((await db.mentoringRequest.findFirstOrThrow({ where: { schoolId } })).status, "APPROVED");
  await panel.getByRole("heading", { name: "Plans shared with you" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/pathways-counsellor-en-1440.png` });
  await page.close();
});

test("the student's pathway reads right to left on a phone (AR)", async () => {
  const page = await (await context("student-ar", { width: 390, height: 844 })).newPage();
  await page.goto(`${base}/student/portfolio`);
  const panel = page.locator('section[aria-labelledby="pathways"]');
  await panel.waitFor({ timeout: 60_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  await panel.getByText("من يمكنه رؤية هذا الهدف؟").first().waitFor({ timeout: 30_000 });
  await panel.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/pathways-student-ar-390.png` });
  await page.close();
});
