import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-412 on the isolated app with synthetic data and a synthetic object store. The app must run with
// MARK_SCAN_EXTRACTOR=synthetic and S3_ENDPOINT=http://127.0.0.1:55441: readings come from the request,
// never from the photo. Covers an uncertain 7/1 digit, a confidently wrong value and an absence (all
// reviewed by the teacher), a blurred page kept as retake, a duplicate page ignored, a replaced page sent
// back to review, a missing page blocking approval, a QR from elsewhere granting nothing, a locked exam,
// a mark changed by someone else since the scan, an idempotent retried import, and reversal.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.SCAN_TEST_APP || "http://localhost:3107";
const evidence = process.env.SCAN_EVIDENCE_DIR || "/tmp/sko412-evidence";
const db = new PrismaClient(), password = "SyntheticScan412!";
const schoolId = `scan412-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), examId = randomUUID(), subjectId = randomUUID();
const otherSchoolId = `scan412o-${randomUUID()}`, otherCampusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils: string[] = [];
const objects = new Map<string, Buffer>();
const ids: Record<string, string> = {};
let browser: Browser;

// Synthetic object store: any bucket, If-None-Match honoured, GET returns what was stored.
const store = createServer((req, res) => {
  const path = decodeURIComponent((req.url || "").split("?")[0]).split("/").slice(2).join("/");
  if (req.method === "PUT") {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (objects.has(path)) { res.writeHead(412, { "content-type": "application/xml" }); res.end("<Error><Code>PreconditionFailed</Code></Error>"); return; }
      objects.set(path, Buffer.concat(chunks)); res.writeHead(200, { etag: '"synthetic"' }); res.end();
    });
    return;
  }
  const body = objects.get(path);
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "image/png", "content-length": body.length }); res.end(req.method === "HEAD" ? undefined : body);
});

async function user(key: string, role: string, school = schoolId, campus = campusId, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId: school, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
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
const call = async (ctx: BrowserContext, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); return { status: r.status(), json: await r.json().catch(() => ({})) }; };
/** A synthetic photo of a written page, rendered in the browser (distinct text → distinct bytes). */
async function photo(label: string) {
  const page = await browser.newPage({ viewport: { width: 620, height: 877 } });
  await page.setContent(`<body style="margin:0;background:#fff;font:16px sans-serif"><div style="height:14%;padding:12px;border-bottom:2px solid #000">Synthetic marks sheet · ${label}</div>${Array.from({ length: 5 }, (_, i) => `<div style="height:16.4%;border-bottom:1px solid #000;padding:8px">Row ${i + 1} <span style="float:right;font:32px serif">${(i * 3 + label.length) % 20}</span></div>`).join("")}</body>`);
  const png = await page.screenshot({ type: "png" }); await page.close(); return png.toString("base64");
}
type Cell = { id: string; studentId: string; rowNumber: number; pageNumber: number; status: string; proposedValue: number | null; proposedAbsent: boolean; confidence: number | null; changedSinceScan: boolean };
type View = { batch: { id: string; status: string; version: number; receipt: { changed: { studentId: string }[]; kept: string[]; unchanged: string[]; excluded: number; corrected: number } | null }; template: { pageCount: number }; pages: { id: string; pageNumber: number; status: string }[]; missingPages: number[]; cells: Cell[]; counts: { needsReview: number } };
const view = async (ctx: BrowserContext, id: string) => { const r = await call(ctx, "get", `/api/marks-scan/${id}`); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json.data as View; };
const act = (ctx: BrowserContext, id: string, data: Record<string, unknown>) => call(ctx, "post", `/api/marks-scan/${id}`, data);
const good = { sharpness: 180, contrast: 40 };

before(async () => {
  await new Promise<void>(resolve => store.listen(55441, "127.0.0.1", resolve));
  for (const [id, campus, name] of [[schoolId, campusId, "Synthetic Juniper School"], [otherSchoolId, otherCampusId, "Synthetic Alder School"]]) {
    await db.school.create({ data: { id, name, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
    await db.campus.create({ data: { id: campus, schoolId: id, name: `${name} Main`, regId: campus, city: "Lahore" } });
    await db.academicCycle.create({ data: { schoolId: id, campusId: campus, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  }
  await user("teacher", "TEACHER"); await user("teacher-ar", "TEACHER", schoolId, campusId, "ar"); await user("unassigned", "TEACHER");
  await user("foreign", "TEACHER", otherSchoolId, otherCampusId);
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 7", section: "B", academicYear: 2026, classTeacherId: users.get("teacher-ar")!.id } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Synthetic Science", teacherId: users.get("teacher")!.id, totalMarks: 20 } });
  for (let i = 1; i <= 6; i++) { const id = randomUUID(); pupils.push(id); await db.student.create({ data: { id, schoolId, campusId, classId, fullName: `Synthetic Pupil ${String.fromCharCode(64 + i)}`, rollNo: `70${i}`, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); }
  await db.exam.create({ data: { id: examId, schoolId, campusId, classId, title: "Synthetic Unit Test", term: "Term 1", academicYear: 2026, status: "MARKS_ENTRY" } });
  // Pupil C already has 12 in the gradebook before the scan.
  await db.mark.create({ data: { schoolId, campusId, examId, subjectId, studentId: pupils[2], marksObtained: 12, enteredBy: users.get("teacher")!.id } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close(); store.close();
  for (const id of [schoolId, otherSchoolId]) { await db.mark.deleteMany({ where: { schoolId: id } }).catch(() => undefined); await db.school.delete({ where: { id } }).catch(() => undefined); }
  await db.$disconnect();
});

test("a printed sheet carries only an opaque code; it grants nothing outside the exam's staff", async () => {
  const teacher = await context("teacher");
  assert.equal((await call(await context("unassigned"), "post", "/api/marks-scan", { action: "template", examId, subjectId })).status, 404, "a teacher not on this subject or class gets nothing");
  const made = await call(teacher, "post", "/api/marks-scan", { action: "template", examId, subjectId, rowsPerPage: 5 });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  ids.template = made.json.data.id;
  const sheet = (await call(teacher, "get", `/api/marks-scan/template/${ids.template}`)).json.data;
  assert.equal(sheet.pages.length, 2);
  assert.match(sheet.pages[0].code, /^SKMS1:[A-Za-z0-9_-]{16}:1$/);
  assert.ok(!sheet.pages[0].code.includes(examId) && !sheet.pages[0].code.includes(schoolId), "the code names no exam or school");
  ids.code1 = sheet.pages[0].code; ids.code2 = sheet.pages[1].code;
  const foreign = await context("foreign");
  assert.equal((await call(foreign, "post", "/api/marks-scan", { action: "start", qr: ids.code1 })).status, 404, "a QR from another school resolves to nothing");
  assert.equal((await call(foreign, "get", `/api/marks-scan/template/${ids.template}`)).status, 404);
  assert.equal((await call(await context("unassigned"), "post", "/api/marks-scan", { action: "start", qr: ids.code1 })).status, 404, "holding the paper is not access");
});

test("capture: blurred page kept as retake, duplicate ignored, replaced page back to review, missing page blocks approval", async () => {
  const teacher = await context("teacher");
  const started = await call(teacher, "post", "/api/marks-scan", { action: "start", qr: ids.code1 });
  assert.equal(started.status, 201, JSON.stringify(started.json));
  ids.batch = started.json.data.id;
  const page1 = await photo("page one");
  const readings1 = [
    { row: 1, value: 7, confidence: 0.55, alternatives: [1] }, // ambiguous 7/1
    { row: 2, value: 18, confidence: 0.97 }, // confidently wrong (the paper says 13)
    { row: 3, absent: true, confidence: 0.95 },
    { row: 4, value: 15, confidence: 0.99 },
    { row: 5, value: 9, confidence: 0.99 },
  ];
  const first = await act(teacher, ids.batch, { action: "page", qr: ids.code1, image: page1, contentType: "image/png", ...good, syntheticReadings: readings1 });
  assert.equal(first.json.data?.status, "ACCEPTED", JSON.stringify(first.json));
  assert.equal((await act(teacher, ids.batch, { action: "page", qr: ids.code1, image: page1, contentType: "image/png", ...good, syntheticReadings: readings1 })).json.data.status, "DUPLICATE");
  const blurred = await act(teacher, ids.batch, { action: "page", qr: ids.code2, image: await photo("page two blurred"), contentType: "image/png", sharpness: 30, contrast: 40, syntheticReadings: [{ row: 6, value: 11, confidence: 0.9 }] });
  assert.deepEqual([blurred.json.data.status, blurred.json.data.reason], ["RETAKE", "BLURRED"]);
  assert.equal((await act(teacher, ids.batch, { action: "page", qr: "SKMS1:AAAAAAAAAAAAAAAA:2", image: page1, contentType: "image/png", ...good })).status, 409, "a page from another sheet is refused");
  let v = await view(teacher, ids.batch);
  assert.deepEqual(v.missingPages, [2], "a blurred page is never accepted");
  assert.equal(v.cells.length, 5, "only the accepted page has cells");
  assert.deepEqual(v.cells.map(c => c.rowNumber).slice(0, 1), [1], "the least certain reading is reviewed first");
  assert.ok(v.cells.every(c => c.status === "NEEDS_REVIEW"), "a reading is never a mark");
  for (const c of v.cells) assert.equal((await act(teacher, ids.batch, { action: "review", cellId: c.id, value: c.rowNumber === 2 ? 13 : c.proposedValue ?? 0, absent: c.proposedAbsent })).status, 200);
  v = await view(teacher, ids.batch);
  const approveMissing = await act(teacher, ids.batch, { action: "approve", knownVersion: v.batch.version });
  assert.equal(approveMissing.status, 409); assert.match(approveMissing.json.error, /missing/);
  // Page 2 retaken, then photographed again differently: the replacement resets its cells.
  assert.equal((await act(teacher, ids.batch, { action: "page", qr: ids.code2, image: await photo("page two"), contentType: "image/png", ...good, syntheticReadings: [{ row: 6, value: 11, confidence: 0.9 }] })).json.data.status, "ACCEPTED");
  v = await view(teacher, ids.batch);
  const row6 = v.cells.find(c => c.rowNumber === 6)!;
  assert.equal((await act(teacher, ids.batch, { action: "review", cellId: row6.id, value: 11, absent: false })).status, 200);
  const replaced = await act(teacher, ids.batch, { action: "page", qr: ids.code2, image: await photo("page two again"), contentType: "image/png", ...good, syntheticReadings: [{ row: 6, value: 16, confidence: 0.8 }] });
  assert.equal(replaced.json.data.status, "REPLACED");
  v = await view(teacher, ids.batch);
  assert.equal(v.cells.find(c => c.rowNumber === 6)!.status, "NEEDS_REVIEW", "a replaced page goes back to review");
  assert.equal(v.pages.filter(p => p.pageNumber === 2 && p.status === "ACCEPTED").length, 1);
  assert.deepEqual(v.pages.filter(p => p.pageNumber === 2).map(p => p.status).sort(), ["ACCEPTED", "REPLACED", "RETAKE"]);
  assert.equal((await act(teacher, ids.batch, { action: "approve", knownVersion: v.batch.version })).status, 409, "every mark must be checked");
  const image = await teacher.request.get(`${base}/api/marks-scan/${ids.batch}?image=${v.pages.find(p => p.status === "ACCEPTED")!.id}`);
  assert.equal(image.status(), 200); assert.equal(image.headers()["content-type"], "image/png");
  assert.equal((await (await context("foreign")).request.get(`${base}/api/marks-scan/${ids.batch}?image=${v.pages[0].id}`)).status(), 404);
});

test("teacher checks the uncertain mark beside its crop, approves, and imports after deciding a conflict", async () => {
  const ctx = await context("teacher"), page = await ctx.newPage();
  await page.goto(`${base}/teacher/marks`);
  await page.locator("[data-scan-start]").click();
  await page.locator("[data-mark-scan][data-scan-status=REVIEW]").waitFor();
  const row6 = page.locator(`[data-scan-cell="${pupils[5]}"]`);
  await row6.locator("[data-scan-check]").click();
  const dialog = page.locator("[data-scan-cell-dialog]");
  await dialog.waitFor();
  await dialog.locator("input[type=number]").fill("16");
  await shot(page, "01-check-mark-en");
  await dialog.locator("[data-scan-confirm]").click();
  await page.locator(`[data-scan-cell="${pupils[5]}"][data-cell-status=REVIEWED]`).waitFor();
  // Someone else changes pupil C after the scan began.
  await db.mark.updateMany({ where: { examId, studentId: pupils[2] }, data: { marksObtained: 14 } });
  // Locked exam: approval refused; reopening allows it.
  await db.exam.update({ where: { id: examId }, data: { isLocked: true } });
  let v = await view(ctx, ids.batch);
  assert.equal((await act(ctx, ids.batch, { action: "approve", knownVersion: v.batch.version })).status, 409, "a locked exam takes no import");
  await db.exam.update({ where: { id: examId }, data: { isLocked: false } });
  await page.locator("[data-scan-approve]").click();
  await page.locator("[data-mark-scan][data-scan-status=APPROVED]").waitFor();
  v = await view(ctx, ids.batch);
  assert.equal((await act(ctx, ids.batch, { action: "commit", commitKey: `probe-${randomUUID()}`, knownVersion: v.batch.version })).json.error?.includes("CONFLICTS"), true, "a mark changed since the scan needs a decision");
  await db.exam.update({ where: { id: examId }, data: { isLocked: true } });
  assert.equal((await act(ctx, ids.batch, { action: "commit", commitKey: `probe-${randomUUID()}`, knownVersion: v.batch.version, decisions: { [pupils[2]]: "overwrite" } })).status, 409, "the lock is rechecked at import");
  await db.exam.update({ where: { id: examId }, data: { isLocked: false } });
  await page.reload(); await page.locator("[data-scan-start]").click();
  await page.locator("[data-scan-import]").click();
  const importDialog = page.locator("[data-scan-import-dialog]");
  await importDialog.locator(`[data-import-conflict="${pupils[2]}"]`).waitFor();
  assert.equal(await page.locator("[data-scan-commit]").isDisabled(), true, "import waits for the conflict decision");
  await importDialog.locator(`[data-import-conflict="${pupils[2]}"] [data-decide=keep]`).check();
  await shot(page, "02-import-conflict-en");
  await page.locator("[data-scan-commit]").click();
  await page.locator("[data-scan-receipt]").waitFor();
  await shot(page, "03-receipt-en");
  const marks = new Map((await db.mark.findMany({ where: { examId, subjectId } })).map(m => [m.studentId, m]));
  assert.deepEqual([marks.get(pupils[0])!.marksObtained, marks.get(pupils[1])!.marksObtained, marks.get(pupils[2])!.marksObtained, marks.get(pupils[2])!.isAbsent, marks.get(pupils[5])!.marksObtained], [7, 13, 14, false, 16], "corrected value written; the other teacher's change kept");
  assert.equal(marks.get(pupils[2])!.marksObtained, 14);
  assert.equal(marks.get(pupils[0])!.grade !== null, true, "grades go through the usual rules");
  // Pupil C's sheet said absent; kept as 14 by decision. Pupil row 3 is pupil C.
  const batch = await db.markScanBatch.findUniqueOrThrow({ where: { id: ids.batch } });
  const receipt = batch.receipt as { changed: unknown[]; kept: string[]; corrected: number };
  assert.deepEqual([receipt.changed.length, receipt.kept, receipt.corrected], [5, [pupils[2]], 1]);
  const before = await db.auditLog.count({ where: { schoolId, tableName: "marks" } });
  const retry = await act(ctx, ids.batch, { action: "commit", commitKey: batch.commitKey, knownVersion: 0 });
  assert.deepEqual([retry.status, retry.json.data.repeated], [200, true], "a retried import returns the same receipt");
  assert.deepEqual(retry.json.data.receipt.changed, receipt.changed);
  assert.equal(await db.auditLog.count({ where: { schoolId, tableName: "marks" } }), before, "and writes nothing again");
  assert.equal((await db.exam.findUniqueOrThrow({ where: { id: examId } })).status, "MARKS_ENTRY", "results stay unpublished");
  await page.close();
});

test("reversal is refused after a later change, then restores the earlier marks", async () => {
  const ctx = await context("teacher");
  await db.mark.updateMany({ where: { examId, studentId: pupils[4] }, data: { marksObtained: 10 } });
  const blocked = await act(ctx, ids.batch, { action: "reverse" });
  assert.equal(blocked.status, 409); assert.match(blocked.json.error, /CHANGED_SINCE_IMPORT/);
  assert.equal(await db.mark.count({ where: { examId } }), 6, "nothing changed");
  await db.mark.updateMany({ where: { examId, studentId: pupils[4] }, data: { marksObtained: 9 } });
  assert.equal((await act(ctx, ids.batch, { action: "reverse" })).status, 200);
  const marks = await db.mark.findMany({ where: { examId } });
  assert.deepEqual(marks.map(m => [m.studentId, m.marksObtained]), [[pupils[2], 14]], "imported marks removed; the kept mark untouched");
  assert.equal((await view(ctx, ids.batch)).batch.status, "REVERSED");
  assert.equal((await act(ctx, ids.batch, { action: "reverse" })).status, 409);
});

test("Arabic: the class teacher reviews a new scan right to left", async () => {
  const ctx = await context("teacher-ar"), started = await call(ctx, "post", "/api/marks-scan", { action: "start", templateId: ids.template });
  assert.equal(started.status, 201, "the class teacher may scan too");
  await act(ctx, started.json.data.id, { action: "page", qr: ids.code1, image: await photo("arabic page one"), contentType: "image/png", ...good, syntheticReadings: [{ row: 1, value: 7, confidence: 0.55, alternatives: [1] }, { row: 2, value: 13, confidence: 0.97 }, { row: 3, absent: true, confidence: 0.95 }] });
  const page = await ctx.newPage();
  await page.goto(`${base}/teacher/marks`);
  await page.locator("[data-scan-start]").click();
  assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
  await page.locator("[data-scan-missing]").waitFor();
  await page.locator("[data-mark-scan]").scrollIntoViewIfNeeded();
  await shot(page, "04-review-ar");
  await page.locator(`[data-scan-cell="${pupils[0]}"] [data-scan-check]`).click();
  await page.locator("[data-scan-cell-dialog]").waitFor();
  await shot(page, "05-check-mark-ar");
  await page.close();
});
