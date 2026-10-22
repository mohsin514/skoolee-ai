import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-400 browser acceptance against the isolated database, app and a synthetic object store.
// The app must run with S3_ENDPOINT=http://127.0.0.1:55441 and S3_BUCKET_NAME=synthetic-only.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RESOURCES_TEST_APP || "http://localhost:3107";
const evidence = process.env.RESOURCES_EVIDENCE_DIR || "/tmp/sko400-evidence";
const raw = new PrismaClient(), password = "SyntheticLibrary400!";
const schoolId = `res400b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const people = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const objects = new Map<string, Buffer>();
let failPuts = false, browser: Browser;

const store = createServer((req, res) => {
  const path = decodeURIComponent((req.url || "").split("?")[0]);
  if (!path.startsWith("/synthetic-only/")) { res.writeHead(404); res.end(); return; }
  const key = path.slice("/synthetic-only/".length);
  if (req.method === "PUT") {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (failPuts) { res.writeHead(403, { "content-type": "application/xml" }); res.end("<Error><Code>AccessDenied</Code></Error>"); return; }
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
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const list = (page: Page) => page.locator("ul[aria-label]").last();

async function seedResource(title: string, kind: string, audience: string, file?: string) {
  const id = randomUUID(), teacher = people.get("teacher")!.id;
  await raw.learningResource.create({ data: { id, schoolId, campusId, classId, title, kind, audience, language: "en", sourceRights: "Synthetic department material", ownerId: teacher, latestVersion: 1, status: "PUBLISHED", publishedVersion: 1 } });
  const storageKey = file ? `resources/${campusId}/${id}/${randomUUID()}-${file}` : null;
  if (storageKey) objects.set(storageKey, Buffer.from("%PDF-1.4 synthetic"));
  await raw.learningResourceVersion.create({ data: { schoolId, resourceId: id, version: 1, description: `${title}: a synthetic description for accessibility.`, createdById: teacher,
    ...(storageKey ? { storageKey, fileName: file, contentType: "application/pdf", sizeBytes: 18, uploadedAt: new Date() } : { linkUrl: "https://example.invalid/synthetic-routine" }) } });
  return id;
}

before(async () => {
  await new Promise<void>((resolve, reject) => { store.once("error", reject); store.listen(55441, "127.0.0.1", resolve); });
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Juniper School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Juniper Main", regId: campusId, city: "Lahore" } });
  const teacher = await person("teacher", "TEACHER"), admin = await person("admin", "ADMIN");
  await person("student", "STUDENT"); await person("student-ur", "STUDENT", "ur"); await person("parent-ar", "PARENT", "ar");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 7", section: "B", academicYear: 2026, classTeacherId: teacher } });
  await raw.subject.create({ data: { schoolId, campusId, classId, name: "Science", teacherId: teacher } });
  for (const [index, key] of ["student", "student-ur"].entries()) {
    const studentId = randomUUID();
    await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, studentUserId: people.get(key)!.id, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", enrollmentDate: new Date("2026-09-01Z") } });
    if (index === 0) {
      const relationship = await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: people.get("parent-ar")!.id, createdByUserId: admin, fullName: "Synthetic guardian", email: people.get("parent-ar")!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
      await raw.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: admin, reason: "Synthetic library fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
    }
  }
  await seedResource("Cell structure notes", "NOTES", "CLASS", "cell-notes.pdf");
  await seedResource("Weekly science routine", "ROUTINE", "CLASS_AND_GUARDIANS");
  await seedResource("Cell quiz answer key", "ANSWER_KEY", "STAFF", "answer-key.pdf");
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); store.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); });

test("a teacher uploads a handout, publishes it, and previews what learners and families see", async () => {
  const { ctx, page, errors } = await open("teacher", "/teacher/resources");
  // The teacher's page is "Resources" (registry label); "Add resource" is its PageHeader primary (§4.4b).
  await page.getByRole("heading", { level: 1, name: "Resources", exact: true }).waitFor();
  await list(page).getByText("Cell quiz answer key", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add resource" }).click();
  const form = page.getByRole("form", { name: "New resource" });
  await form.getByLabel("Title").fill("Microscope handout");
  await form.getByLabel("Source and sharing rights").fill("Written by the synthetic science team");
  await form.getByLabel("Description and accessible summary").fill("Labelled diagram of a light microscope with each part explained.");
  await form.getByLabel("File", { exact: true }).setInputFiles({ name: "microscope.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 microscope") });
  await form.getByRole("button", { name: "Save draft" }).click();
  const item = list(page).locator("li").filter({ hasText: "Microscope handout" }).first();
  await item.getByText("Draft", { exact: false }).waitFor();
  await item.getByText("Versions (1)").click();
  await item.getByRole("button", { name: "Publish version 1" }).click();
  await item.getByText("Published · v1").waitFor();
  assert.ok([...objects.keys()].some(key => key.startsWith(`resources/${campusId}/`) && key.endsWith("microscope.pdf")), "the bytes reached the private store");
  await shot(page, "resources-teacher-en-1440");
  await page.getByRole("combobox", { name: /^View/ }).selectOption("GUARDIANS");
  await page.getByText("Preview — exactly what this audience sees right now.").waitFor();
  assert.deepEqual(await list(page).locator("li p.font-semibold").allTextContents(), ["Weekly science routine"]);
  await shot(page, "resources-teacher-preview-families-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("a failed upload keeps the draft and says so; it cannot be published", async () => {
  const { ctx, page } = await open("teacher", "/teacher/resources");
  await page.getByRole("button", { name: "Add resource" }).click();
  const form = page.getByRole("form", { name: "New resource" });
  await form.getByLabel("Title").fill("Interrupted worksheet");
  await form.getByLabel("Description and accessible summary").fill("A worksheet whose upload is interrupted on purpose.");
  await form.getByLabel("File", { exact: true }).setInputFiles({ name: "worksheet.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 worksheet") });
  failPuts = true;
  await form.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("status").filter({ hasText: "could not" }).waitFor();
  failPuts = false;
  const item = list(page).locator("li").filter({ hasText: "Interrupted worksheet" }).first();
  await item.getByText("Versions (1)").click();
  await item.getByText("File not uploaded").waitFor();
  assert.equal(await item.getByRole("button", { name: /Publish version/ }).count(), 0);
  assert.equal(await page.getByRole("form", { name: "New resource" }).count(), 0, "the form closes so a retry cannot duplicate the draft");
  await page.getByRole("status").scrollIntoViewIfNeeded();
  await shot(page, "resources-upload-failed-draft-en-1440");
  await ctx.close();
});

test("a learner sees class material without the answer key and downloads the published file", async () => {
  const { ctx, page, errors } = await open("student", "/student/resources");
  await list(page).getByText("Cell structure notes", { exact: true }).waitFor();
  const titles = await list(page).locator("li p.font-semibold").allTextContents();
  assert.ok(titles.includes("Microscope handout") && titles.includes("Weekly science routine"));
  assert.equal(titles.some(title => /answer key/i.test(title)), false);
  await page.getByLabel("Search titles").fill("answer");
  await page.getByText("Nothing has been shared with you yet.").waitFor();
  await page.getByLabel("Search titles").fill("");
  await list(page).getByText("Cell structure notes", { exact: true }).waitFor();
  const href = await list(page).locator("li").filter({ hasText: "Cell structure notes" }).getByRole("link").getAttribute("href");
  const download = await ctx.request.get(base + href!);
  assert.equal(download.status(), 200);
  assert.equal((await download.body()).toString(), "%PDF-1.4 synthetic");
  const key = await raw.learningResource.findFirstOrThrow({ where: { schoolId, kind: "ANSWER_KEY" } });
  assert.equal((await ctx.request.get(`${base}/api/resources/${key.id}/file`)).status(), 404, "direct download of the answer key is refused");
  await shot(page, "resources-student-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("an Arabic guardian sees only family material; an Urdu learner layout is RTL without overflow at 390px", async () => {
  {
    const { ctx, page, errors } = await open("parent-ar", "/parent/resources", { width: 390, height: 860 });
    await list(page).getByText("Weekly science routine", { exact: true }).waitFor();
    assert.deepEqual(await list(page).locator("li p.font-semibold").allTextContents(), ["Weekly science routine"]);
    assert.equal(await page.locator("div[dir=rtl]").count() > 0, true);
    assert.equal(await noOverflow(page), true);
    await shot(page, "resources-parent-ar-390");
    assert.deepEqual(errors, []); await ctx.close();
  }
  {
    const { ctx, page, errors } = await open("student-ur", "/student/resources", { width: 390, height: 860 });
    await list(page).getByText("Cell structure notes", { exact: true }).waitFor();
    await page.getByText("ڈاؤن لوڈ").first().waitFor();
    assert.equal(await noOverflow(page), true);
    await shot(page, "resources-student-ur-390");
    assert.deepEqual(errors, []); await ctx.close();
  }
});
