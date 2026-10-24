import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-409 browser acceptance against the isolated database, app and a synthetic object store.
// The app must run with S3_ENDPOINT=http://127.0.0.1:55442 and S3_BUCKET_NAME=synthetic-only.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55450" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55450 is allowed");
const base = process.env.ASSIGNMENTS_TEST_APP || "http://localhost:3120";
const evidence = process.env.ASSIGNMENTS_EVIDENCE_DIR || "/tmp/sko409-evidence";
const raw = new PrismaClient(), password = "SyntheticAssign409!";
const schoolId = `asg409b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const people = new Map<string, { id: string; email: string; studentId?: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const objects = new Map<string, Buffer>();
let browser: Browser, assignmentId = "", draftId = "";
const TITLE = "Plant growth investigation";

const store = createServer((req, res) => {
  const path = decodeURIComponent((req.url || "").split("?")[0]);
  if (!path.startsWith("/synthetic-only/")) { res.writeHead(404); res.end(); return; }
  const key = path.slice("/synthetic-only/".length);
  if (req.method === "PUT") {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (objects.has(key)) { res.writeHead(412, { "content-type": "application/xml" }); res.end("<Error><Code>PreconditionFailed</Code></Error>"); return; }
      objects.set(key, Buffer.concat(chunks)); res.writeHead(200, { etag: '"synthetic"' }); res.end();
    });
    return;
  }
  const body = objects.get(key);
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "application/pdf", "content-length": body.length }); res.end(req.method === "HEAD" ? undefined : body);
});

async function person(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${id}@example.invalid`;
  await raw.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, { id, email });
  return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved });
  const ctx = await browser.newContext({ viewport });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
async function open(key: string, path: string, viewport?: { width: number; height: number }) {
  const ctx = await context(key, viewport), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + path);
  return { ctx, page, errors };
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
// Grow the viewport to the tallest scroll area so fixed bars and inner scroll panes do not hide content.
const shot = async (page: Page, name: string) => {
  await settled(page);
  const size = page.viewportSize()!;
  const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll<HTMLElement>("main, section, div")].filter(el => el.scrollHeight > el.clientHeight + 4 && /auto|scroll|hidden/.test(getComputedStyle(el).overflowY)).map(el => el.scrollHeight - el.clientHeight + document.documentElement.clientHeight)));
  await page.setViewportSize({ width: size.width, height: Math.min(Math.ceil(height) + 24, 7000) });
  await settled(page);
  await page.screenshot({ path: `${evidence}/${name}.png` });
  await page.setViewportSize(size);
};
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const openAssignment = async (page: Page, title = TITLE) => { await page.locator("ul[aria-label] li").filter({ hasText: title }).first().getByRole("button").click(); await page.getByRole("heading", { level: 2, name: title }).waitFor(); };
const api = async (ctx: BrowserContext, body: Record<string, unknown>) => { const response = await ctx.request.post(`${base}/api/assignments/${assignmentId}`, { data: body }); assert.equal(response.status(), 200, await response.text()); return (await response.json()).result; };

before(async () => {
  await new Promise<void>((resolve, reject) => { store.once("error", reject); store.listen(55442, "127.0.0.1", resolve); });
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Cedar School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Cedar Main", regId: campusId, city: "Lahore" } });
  const teacher = await person("teacher", "TEACHER"), admin = await person("admin", "ADMIN");
  await person("student", "STUDENT"); await person("student-ar", "STUDENT", "ar"); await person("student-ur", "STUDENT", "ur"); await person("parent-ar", "PARENT", "ar");
  await raw.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: admin } });
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Demo 6", section: "A", academicYear: 2026, classTeacherId: teacher } });
  await raw.subject.create({ data: { schoolId, campusId, classId, name: "Science", teacherId: teacher } });
  for (const [index, key] of ["student", "student-ar", "student-ur"].entries()) {
    const studentId = randomUUID();
    await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, studentUserId: people.get(key)!.id, fullName: `Demo pupil 0${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", enrollmentDate: new Date("2026-09-01Z") } });
    people.get(key)!.studentId = studentId;
    if (key === "student-ar") {
      const relationship = await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: people.get("parent-ar")!.id, createdByUserId: admin, fullName: "Synthetic guardian", email: people.get("parent-ar")!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
      await raw.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: admin, reason: "Synthetic assignment fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
    }
  }
  draftId = (await raw.assignment.create({ data: { schoolId, campusId, classId, title: "Unreleased draft quiz", instructions: "Draft only, never released.", ownerId: teacher } })).id;
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); store.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); });

test("a teacher writes instructions and a rubric, previews the exact audience and releases", async () => {
  const { ctx, page, errors } = await open("teacher", "/teacher/assignments");
  // The teacher's page is "Homework" (registry label) and its one primary is "Create homework" (§4.4).
  await page.getByRole("heading", { level: 1, name: "Homework", exact: true }).waitFor();
  await page.getByRole("button", { name: "Create homework" }).click();
  const form = page.getByRole("form", { name: "Assignment" });
  await form.getByLabel("Title").fill(TITLE);
  await form.getByLabel("Subject").selectOption({ label: "Science" });
  await form.getByLabel("How learners hand in").selectOption("BOTH");
  await form.getByLabel("Instructions").fill("Grow two bean plants, one in light and one in shade. Measure them daily and write a claim backed by your data.");
  await form.getByLabel("Due date and time").fill("2026-12-01T17:00");
  await form.getByLabel("Criterion 1", { exact: true }).fill("Claim");
  await form.getByLabel("Points").first().fill("4");
  await form.getByLabel("What good work shows").first().fill("States a testable claim");
  await form.getByRole("button", { name: "Add criterion" }).click();
  await form.getByLabel("Criterion 2", { exact: true }).fill("Evidence");
  await form.getByLabel("Points").nth(1).fill("6");
  await form.getByText("Total: 10").waitFor();
  await form.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("heading", { level: 2, name: TITLE }).waitFor();
  assignmentId = (await raw.assignment.findFirstOrThrow({ where: { schoolId, title: TITLE } })).id;
  await page.getByRole("button", { name: "Preview and release" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Review before release — Release version 1").waitFor();
  await dialog.getByText(/Asia\/Karachi/).waitFor();
  assert.deepEqual(await dialog.locator("ul li").allTextContents(), ["Demo pupil 01", "Demo pupil 02", "Demo pupil 03"]);
  await shot(page, "assignments-teacher-release-review-en-1440");
  await dialog.getByRole("button", { name: "Release to learners" }).click();
  await page.getByText("Released.").waitFor();
  await page.getByText(/Due .* \(Asia\/Karachi\)/).waitFor();
  const release = await raw.assignmentVersion.findFirstOrThrow({ where: { assignmentId } });
  assert.equal(release.dueAt.toISOString(), "2026-12-01T12:00:00.000Z", "17:00 Karachi");
  assert.equal(release.audience.length, 3);
  assert.deepEqual(errors, []); await ctx.close();
});

test("a learner submits text and a file; a network retry returns the same receipt", async () => {
  const { ctx, page, errors } = await open("student", "/student/assignments");
  await openAssignment(page);
  await page.getByRole("textbox", { name: "Your answer" }).fill("Light plants grew 4 cm taller than shade plants over ten days.");
  await page.getByText("Saved on this device only. It is not on the server yet.").waitFor();
  // The visible control is the shared "Choose file" button; the hidden picker it opens takes the file.
  await page.locator("[data-assignment-file]").setInputFiles({ name: "bean-data.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 bean growth table") });
  await page.getByText(/Uploaded and checked/).waitFor();
  // The first submit reaches the server but the response is lost on the way back.
  let dropped = false;
  await page.route(`**/api/assignments/${assignmentId}`, async route => {
    const body = route.request().postDataJSON?.();
    if (!dropped && body?.op === "submit") { dropped = true; await route.fetch(); await route.abort("connectionreset"); return; }
    await route.continue();
  });
  await page.getByRole("button", { name: "Submit work" }).click();
  await page.getByRole("alert").filter({ hasText: "Not confirmed" }).waitFor();
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByText(/Submitted at .*\. Receipt RC-[A-Z0-9]{8} is saved\./).waitFor();
  await page.getByText(/already received; here is the original receipt/).waitFor();
  assert.equal(await raw.assignmentSubmissionVersion.count({ where: { assignmentId, studentId: people.get("student")!.studentId } }), 1, "one version despite two submit requests");
  const version = await raw.assignmentSubmissionVersion.findFirstOrThrow({ where: { assignmentId, studentId: people.get("student")!.studentId } });
  assert.ok(version.fileSha256 && version.storageKey && objects.has(version.storageKey));
  await shot(page, "assignments-student-receipt-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("a teacher marks privately, returns feedback with a revision, records paper work and grants an extension", async () => {
  const learnerAr = await context("student-ar");
  await api(learnerAr, { op: "draft", text: "النباتات في الضوء نمت أكثر. Height: 12 cm vs 8 cm." });
  await api(learnerAr, { op: "submit", idempotencyKey: `seed-${randomUUID()}` });
  await learnerAr.close();
  const { ctx, page, errors } = await open("teacher", "/teacher/assignments");
  await page.getByRole("button", { name: /Needs feedback/ }).click();
  await openAssignment(page);
  // Unreturned marking draft for the English learner.
  await page.getByRole("button", { name: /Demo pupil 01/ }).click();
  await page.getByLabel("Claim: Points out of 4").fill("3");
  await page.getByRole("button", { name: "Save marking draft" }).click();
  await page.getByText("Saved.").waitFor();
  // Returned feedback with another version allowed for the Arabic learner.
  await page.getByRole("button", { name: /Demo pupil 02/ }).click();
  await page.getByLabel("Claim: Points out of 4").fill("3");
  await page.getByLabel("Evidence: Points out of 6").fill("4");
  await page.getByLabel("Comment").nth(1).fill("Add evidence for your claim.");
  await page.getByLabel("Overall comment").fill("Good start — measure both plants on the same days.");
  await page.getByLabel(/Request a gradebook transfer/).check();
  await page.getByLabel("Allow another version").check();
  await page.getByText("Total: 7 / 10 · formative only").waitFor();
  await shot(page, "assignments-teacher-marking-en-1440");
  await page.getByRole("button", { name: "Return feedback" }).click();
  await page.getByText("Feedback returned.").first().waitFor();
  // Paper work and an extension for the Urdu learner.
  await page.getByRole("button", { name: /Demo pupil 03/ }).click();
  await page.getByText("Grant an extension").click();
  await page.getByLabel("New due date and time").fill("2026-12-04T17:00");
  await page.getByLabel("Reason").fill("Family travel approved by the head of year");
  await page.getByRole("button", { name: "Grant extension" }).click();
  await page.getByText(/Extended: 2026-12-04 17:00/).waitFor();
  await page.getByText("Record paper work").click();
  await page.getByLabel("What was handed in").fill("Two handwritten pages with a growth table");
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByText(/Receipt RC-/).waitFor();
  const feedback = await raw.assignmentFeedback.findMany({ where: { schoolId } });
  assert.deepEqual(feedback.map(f => f.status).sort(), ["DRAFT", "RETURNED"]);
  assert.equal(feedback.find(f => f.status === "RETURNED")?.gradebookTransfer, "REQUESTED");
  await shot(page, "assignments-teacher-queue-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("unreturned feedback stays hidden from the learner; other pupils' work and drafts return 404", async () => {
  const { ctx, page, errors } = await open("student", "/student/assignments");
  await openAssignment(page);
  await page.getByText("No feedback returned yet.").waitFor();
  assert.equal(await page.getByText("3 / 4").count(), 0, "the marking draft is not shown");
  const other = await raw.assignmentSubmissionVersion.findFirstOrThrow({ where: { assignmentId, studentId: people.get("student-ar")!.studentId } });
  const mine = await raw.assignmentSubmissionVersion.findFirstOrThrow({ where: { assignmentId, studentId: people.get("student")!.studentId } });
  assert.equal((await ctx.request.get(`${base}/api/assignments/${draftId}`)).status(), 404, "a draft is not reachable");
  assert.equal((await ctx.request.get(`${base}/api/assignments/${assignmentId}/submissions/${other.id}/file`)).status(), 404);
  const download = await ctx.request.get(`${base}/api/assignments/${assignmentId}/submissions/${mine.id}/file`);
  assert.equal(download.status(), 200);
  assert.equal((await download.body()).toString(), "%PDF-1.4 bean growth table");
  const urdu = await context("student-ur");
  assert.equal((await urdu.request.get(`${base}/api/assignments/${assignmentId}/submissions/${mine.id}/file`)).status(), 404, "another pupil's file is refused");
  assert.equal((await urdu.request.post(`${base}/api/assignments/${draftId}`, { data: { op: "submit", idempotencyKey: `probe-${randomUUID()}` } })).status(), 404);
  await urdu.close();
  await shot(page, "assignments-student-feedback-hidden-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("an Arabic learner reads returned feedback and submits a revision at 390px; earlier work stays", async () => {
  const { ctx, page, errors } = await open("student-ar", "/student/assignments", { width: 390, height: 860 });
  await openAssignment(page);
  await page.getByText("أُعيدت الملاحظات. يمكنك رفع نسخة منقّحة.").waitFor();
  await page.getByText("Add evidence for your claim.").waitFor();
  assert.equal(await page.locator("div[dir=rtl]").count() > 0, true);
  assert.equal(await noOverflow(page), true);
  await shot(page, "assignments-student-returned-ar-390");
  await page.getByRole("textbox", { name: "إجابتك" }).fill("نسخة منقّحة: قسنا النباتين في الأيام نفسها. Light 12 cm, shade 8 cm.");
  await page.getByRole("button", { name: "تسليم العمل" }).click();
  await page.getByText(/تم التسليم في .*\. الإيصال RC-[A-Z0-9]{8} محفوظ\./).waitFor();
  await page.getByRole("heading", { name: "إصداراتك (2)" }).waitFor();
  assert.equal(await noOverflow(page), true);
  await shot(page, "assignments-student-revision-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});

test("an Arabic guardian sees returned feedback but not the work; an Urdu learner sees the extension at 390px", async () => {
  {
    const { ctx, page, errors } = await open("parent-ar", "/parent/assignments", { width: 390, height: 860 });
    await openAssignment(page);
    await page.getByText("Add evidence for your claim.").waitFor();
    assert.equal(await page.getByText("Height: 12 cm vs 8 cm").count(), 0, "families do not see the work itself");
    assert.equal(await page.getByText(/gradebook|سجل الدرجات/i).count(), 0);
    assert.equal(await noOverflow(page), true);
    await shot(page, "assignments-parent-ar-390");
    assert.deepEqual(errors, []); await ctx.close();
  }
  {
    const { ctx, page, errors } = await open("student-ur", "/student/assignments", { width: 390, height: 860 });
    await openAssignment(page);
    await page.getByText(/آپ کے استاد نے آپ کی آخری تاریخ .* تک بڑھا دی۔/).waitFor();
    await page.getByText("کاغذی").first().waitFor();
    assert.equal(await noOverflow(page), true);
    await shot(page, "assignments-student-extension-ur-390");
    assert.deepEqual(errors, []); await ctx.close();
  }
});
