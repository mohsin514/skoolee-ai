import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";

// SKO-471 browser acceptance: the teacher imports a learner's evidence on the pupil record; nothing is shown
// until the guardian consents from the family home (Arabic, phone, bounded dialog); then the teacher maps
// two objectives, rejects one, drafts the bridge plan and downloads the reviewed mapping after confirming
// the exact fields, recipient and expiry.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.TRANSFER_TEST_APP || "http://localhost:3108";
const evidence = process.env.TRANSFER_EVIDENCE_DIR || "/tmp/sko471-evidence";
const raw = new PrismaClient(), password = "SyntheticTransfer471!";
const schoolId = `trf471-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID(), studentId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;

async function person(key: string, role: AuthUser["role"], language = "en") {
  const user: AuthUser = { userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 };
  await raw.user.create({ data: { id: user.userId, email: user.email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, user);
  return user;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, acceptDownloads: true });
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const shot = async (page: Page, name: string, fullPage = false) => { await settled(page); await page.waitForTimeout(300); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage }); };
const objectives = [
  { id: "SRC-ALG-1", version: "2", title: "Solve linear equations in one variable", work: "Worksheet: solved 9 of 10 linear equations with working shown", result: "B+" },
  { id: "SRC-GEO-4", version: "1", title: "Calculate area of triangles and rectangles", work: "Project: measured classroom floor area", result: "A" },
  { id: "SRC-MUS-2", version: "1", title: "Perform a traditional folk melody", work: null, result: "Merit" },
];

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Palm Receiving School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Dubai", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Palm Main", regId: campusId, city: "Dubai" } });
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  const lead = await person("lead", "PRINCIPAL"); const teacher = await person("teacher", "TEACHER"); const guardian = await person("guardian", "PARENT", "ar");
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 7", section: "B", academicYear: 2026, classTeacherId: teacher.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId } });
  await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic Maryam مريم", rollNo: "7B-1", admissionNo: "PALM-77", gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-01-01Z"), parentUserId: guardian.userId } });
  const rel = await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: guardian.userId, createdByUserId: lead.userId, fullName: "Synthetic guardian", email: guardian.email, relationship: "Mother", status: "ACTIVE", verifiedAt: new Date("2026-01-01Z") } });
  await raw.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: lead.userId, reason: "Synthetic", effectiveFrom: new Date("2026-01-01Z"), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  const data = { subjectId, classId, academicYear: "2026", board: "Synthetic destination board", sources: [{ id: "s1", title: "Grade 7 syllabus", kind: "SYLLABUS", reference: "Synthetic p1", excerpt: "Linear equations, area, data.", approved: true }],
    outcomes: [
      { id: "o-lin", title: "Solve linear equations with one unknown", sourceId: "s1", sourcePage: "1", taught: true, included: true },
      { id: "o-area", title: "Calculate the area of triangles", sourceId: "s1", sourcePage: "1", taught: true, included: true },
      { id: "o-rect", title: "Calculate the area of rectangles and composite shapes", sourceId: "s1", sourcePage: "1", taught: true, included: true },
      { id: "o-data", title: "Interpret bar charts and tables", sourceId: "s1", sourcePage: "2", taught: true, included: true },
    ] };
  let record = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Palm Grade 7 maths", data, idempotencyKey: randomUUID() });
  record = await updateWorkspaceRecord(lead, record.id, { version: record.version, action: "approve" });
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the teacher imports evidence; it stays hidden until the family consents", async () => {
  const ctx = await context("teacher"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/pupils/${studentId}`);
  const panel = page.locator("[data-transfer-panel]");
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByRole("button", { name: "Import evidence from another school" }).click();
  await panel.getByLabel("Previous school", { exact: true }).fill("Synthetic Riverside Academy");
  await panel.getByLabel("Learner ID at the previous school").fill("RA-2291");
  await panel.getByLabel("Previous curriculum", { exact: true }).fill("Riverside Maths Year 7");
  await panel.getByLabel("Curriculum identifier").fill("riverside-maths-7");
  await panel.getByLabel("Curriculum version").fill("2026.1");
  await panel.getByLabel("Objectives and work (JSON from the previous school)").fill(JSON.stringify({ objectives }));
  await panel.getByRole("button", { name: "Review imported evidence" }).click();
  await panel.locator("[data-rights-notice]").waitFor();
  assert.equal(await panel.locator("[data-objective]").count(), 0, "no evidence before consent");
  await panel.getByText("Language not stated").waitFor();
  await shot(page, "transfer-awaiting-consent-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the guardian shares objectives and work on an Arabic phone through a bounded confirmation", async () => {
  const ctx = await context("guardian", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/parent`);
  const card = page.locator("[data-family-transfer]");
  await card.waitFor({ timeout: 60_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
  await card.getByText("نماذج من الأعمال").click();
  await card.getByLabel("المشاركة حتى").fill("2027-06-30");
  await card.getByRole("button", { name: "مراجعة ومشاركة" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByText(/الأهداف.*نماذج من الأعمال/u).waitFor();
  const box = await dialog.boundingBox();
  assert.ok(box && box.width <= 390 && box.x >= 0, "the dialog fits the phone");
  await shot(page, "transfer-family-consent-ar-390");
  await dialog.getByRole("button", { name: "مشاركة", exact: true }).click();
  await card.locator('[data-rights="GRANTED"]').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await ctx.close();
});

test("the teacher maps two objectives, rejects one, drafts the bridge and downloads the reviewed mapping", async () => {
  const ctx = await context("teacher"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/pupils/${studentId}`);
  const panel = page.locator("[data-transfer-panel]");
  await panel.locator("[data-transfer-case]").getByRole("button", { name: "Open" }).click();
  await panel.getByLabel("Destination curriculum").selectOption({ label: "Palm Grade 7 maths · v2" }).catch(async () => { await panel.getByLabel("Destination curriculum").selectOption({ index: 1 }); });
  await panel.getByRole("button", { name: "Use this curriculum" }).click();
  const algebra = panel.locator('[data-objective="SRC-ALG-1"]');
  await algebra.getByText("shared words", { exact: false }).waitFor();
  assert.equal(await algebra.getByText("B+").count(), 0, "results were not shared, so none are shown");
  await algebra.getByRole("button", { name: "Accept mapping" }).click();
  await panel.locator('[data-objective="SRC-ALG-1"][data-decision="ACCEPTED"]').waitFor();
  const geometry = panel.locator('[data-objective="SRC-GEO-4"]');
  await geometry.getByRole("button", { name: "Accept mapping" }).click();
  await panel.locator('[data-objective="SRC-GEO-4"][data-decision="ACCEPTED"]').waitFor();
  const music = panel.locator('[data-objective="SRC-MUS-2"]');
  await music.getByText("No comparable objective found", { exact: false }).waitFor();
  await music.getByRole("button", { name: "Reject" }).click();
  await panel.locator('[data-objective="SRC-MUS-2"][data-decision="REJECTED"]').waitFor();
  await shot(page, "transfer-workbench-en-1440", true);
  await panel.getByLabel("Review date").fill("2026-12-01");
  await panel.getByRole("button", { name: "Create bridge plan" }).click();
  const bridge = panel.locator("[data-bridge]");
  await bridge.waitFor();
  await bridge.getByText("Interpret bar charts and tables", { exact: false }).waitFor();
  const plan = await raw.interventionPlan.findFirstOrThrow({ where: { schoolId, studentId } });
  assert.equal(plan.status, "DRAFT");
  await panel.getByRole("button", { name: "Download reviewed mapping" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByText("Recipient: you, for this school only").waitFor();
  await shot(page, "transfer-download-confirm-en-1440");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download", exact: true }).click()]);
  const file = await download.path();
  const body = JSON.parse(await (await import("node:fs/promises")).readFile(file!, "utf8"));
  assert.deepEqual(body.mappings.map((m: { decision: string }) => m.decision), ["ACCEPTED", "ACCEPTED"]);
  assert.ok(!JSON.stringify(body).includes("Merit") && !JSON.stringify(body).includes("B+"), "no unshared results leave the school");
  assert.deepEqual(errors, []); await ctx.close();
});
