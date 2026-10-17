import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { chromium, request as playwrightRequest, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-469 on the isolated app, synthetic pupils only (no real identity documents): only approved template
// versions issue; missing fields block issue; reception requests need a leader's approval; a retried request
// issues once; downloads are the frozen document (identical bytes after the pupil and template change);
// corrections are reissues with a reason and a new serial; revocation and replacement show on the public
// verification link, which reveals only the document's face; other campuses and roles are refused.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DESK_TEST_APP || "http://localhost:3107";
const evidence = process.env.DESK_EVIDENCE_DIR || "/tmp/sko469-evidence";
const db = new PrismaClient(), password = "SyntheticCert469!";
const schoolId = `cert469-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID(), otherClassId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils = { complete: randomUUID(), missing: randomUUID(), namesake: randomUUID(), other: randomUUID() };
const LONG_NAME = "Synthetic Muhammad Abdul-Rahman Bin Khalid Al-Farouqi Siddiqui";
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
let browser: Browser, certTemplate = "", cardTemplate = "";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function user(key: string, role: string, campus: string | null = campusId, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce", acceptDownloads: true });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", acceptDownloads: true });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const api = `${base}/api/front-desk/certificates`;
const post = (ctx: BrowserContext, data: Record<string, unknown>) => ctx.request.post(api, { data });
const decide = (ctx: BrowserContext, data: Record<string, unknown>) => ctx.request.patch(api, { data });
const issueRow = (serial: string) => db.certificateIssue.findFirstOrThrow({ where: { schoolId, serial } });
const download = async (ctx: BrowserContext, id: string) => { const response = await ctx.request.get(`${api}?download=${id}`); return { status: response.status(), body: await response.body(), hash: response.headers()["x-artifact-hash"], pdfSha: response.headers()["x-pdf-sha256"], state: response.headers()["x-document-state"] }; };
const verify = async (token: string) => { const anonymous = await playwrightRequest.newContext(); const response = await anonymous.get(`${base}/api/public/certificates/verify?token=${token}`); const json = await response.json(); await anonymous.dispose(); return { status: response.status(), json }; };
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Jasmine Certificate School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[campusId, "Jasmine Gulberg"], [otherCampusId, "Jasmine DHA"]]) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Lahore" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 7", section: "B", academicYear: 2026 } });
  await db.class.create({ data: { id: otherClassId, schoolId, campusId: otherCampusId, name: "Grade 7", section: "A", academicYear: 2026 } });
  const lead = await user("lead", "PRINCIPAL"); await user("desk", "RECEPTIONIST"); await user("desk-ar", "RECEPTIONIST", campusId, "ar");
  await user("other", "RECEPTIONIST", otherCampusId); await user("teacher", "TEACHER");
  const pupil = (id: string, fullName: string, rollNo: string, extra: Record<string, unknown> = {}, campus = campusId, cls = classId) => db.student.create({ data: { id, schoolId, campusId: campus, classId: cls, fullName, rollNo, gender: "MALE", enrollmentDate: new Date("2025-04-01Z"), ...extra } });
  await pupil(pupils.complete, LONG_NAME, "J-701", { dateOfBirth: new Date("2013-05-09Z"), guardianName: "Synthetic Guardian Khalid", admissionNo: "ADM-2025-0042" });
  await pupil(pupils.missing, "Synthetic Pupil Hina", "J-702");
  await pupil(pupils.namesake, LONG_NAME, "J-703", { dateOfBirth: new Date("2014-01-02Z"), guardianName: "Synthetic Guardian Omar" });
  await pupil(pupils.other, "Synthetic Other Campus Pupil", "D-701", { dateOfBirth: new Date("2013-01-01Z"), guardianName: "Synthetic Guardian" }, otherCampusId, otherClassId);
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi", currency: "PKR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: lead, financeReviewedBy: lead } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  // Issued documents are kept by design (Restrict); the synthetic school is removed bottom-up.
  await db.certificateIssue.updateMany({ where: { schoolId }, data: { previousId: null } }).catch(() => undefined);
  await db.$executeRaw`ALTER TABLE certificate_issues DISABLE TRIGGER certificate_issue_frozen`.catch(() => undefined);
  await db.certificateIssue.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await db.$executeRaw`ALTER TABLE certificate_issues ENABLE TRIGGER certificate_issue_frozen`.catch(() => undefined);
  await db.certificateTemplateVersion.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("templates: unknown variables are refused, only a leader approves, and only approved versions issue", async () => {
  const desk = await context("desk"), lead = await context("lead");
  const bad = await post(desk, { action: "save-template", kind: "STUDENT_CERTIFICATE", name: "Bonafide", language: "en", title: "Bonafide Certificate", body: "This is to certify that {{studentNmae}} studies here." });
  assert.equal(bad.status(), 400); assert.match((await bad.json()).error, /Unknown variable/);
  const saved = await post(desk, { action: "save-template", kind: "STUDENT_CERTIFICATE", name: "Bonafide", language: "en", title: "Bonafide Certificate", body: "This is to certify that {{studentName}} (roll {{rollNo}}), child of {{guardianName}}, born {{dateOfBirth}}, is a pupil of {{className}} {{section}} at {{schoolName}}. Issued {{issueDate}}, serial {{serial}}." });
  certTemplate = (await saved.json()).data.id;
  const early = await post(desk, { action: "issue", templateId: certTemplate, studentId: pupils.complete, idempotencyKey: randomUUID() });
  assert.equal(early.status(), 409, "a draft cannot issue");
  assert.equal((await post(desk, { action: "approve-template", id: certTemplate })).status(), 403, "reception cannot approve");
  assert.equal((await post(lead, { action: "approve-template", id: certTemplate })).status(), 200);
  assert.equal((await post(lead, { action: "approve-template", id: certTemplate })).status(), 409, "an unchanged draft is not a new version");
  assert.equal((await desk.request.delete(`${api}?id=${certTemplate}`)).status(), 409, "an approved template is kept");
  const draft = await (await post(desk, { action: "save-template", kind: "STUDENT_CERTIFICATE", name: "Scratch", language: "en", title: "Scratch", body: "Scratch text for {{studentName}}." })).json();
  assert.equal((await desk.request.delete(`${api}?id=${draft.data.id}`)).status(), 200, "a never-approved draft can be deleted");
});

test("preview shows the exact text; missing fields block issuing; namesakes are told apart", async () => {
  const desk = await context("desk");
  const complete = (await (await post(desk, { action: "preview", templateId: certTemplate, studentId: pupils.complete })).json()).data;
  assert.deepEqual(complete.missing, []);
  assert.match(complete.body, new RegExp(LONG_NAME)); assert.match(complete.body, /Synthetic Guardian Khalid/); assert.match(complete.body, /Grade 7 B/);
  const missing = (await (await post(desk, { action: "preview", templateId: certTemplate, studentId: pupils.missing })).json()).data;
  assert.deepEqual(missing.missing.sort(), ["dateOfBirth", "guardianName"]);
  const refused = await post(desk, { action: "issue", templateId: certTemplate, studentId: pupils.missing, idempotencyKey: randomUUID() });
  assert.equal(refused.status(), 400); assert.match((await refused.json()).error, /missing: .*dateOfBirth/);
  const found = await (await desk.request.get(`${api}?students=${encodeURIComponent("Abdul-Rahman")}`)).json();
  assert.deepEqual(found.data.map((s: { rollNo: string }) => s.rollNo).sort(), ["J-701", "J-703"], "namesakes are listed with their roll numbers");
  assert.ok(found.data.every((s: Record<string, unknown>) => !("dateOfBirth" in s) && !("guardianName" in s)), "the lookup discloses only identifiers");
});

test("a reception request waits for a leader, a retry issues once, and the download is the frozen document", async () => {
  const desk = await context("desk"), lead = await context("lead");
  const key = randomUUID();
  const replies = await Promise.all([1, 2, 3].map(() => post(desk, { action: "issue", templateId: certTemplate, studentId: pupils.complete, idempotencyKey: key })));
  assert.ok(replies.every(r => r.status() === 201));
  const rows = await db.certificateIssue.findMany({ where: { campusId, idempotencyKey: key } });
  assert.equal(rows.length, 1, "one request despite three sends");
  const issue = rows[0];
  assert.equal(issue.status, "PENDING_APPROVAL");
  assert.equal((await download(desk, issue.id)).status, 409, "not downloadable before approval");
  const alert = await db.notification.findMany({ where: { userId: users.get("lead")!.id, sourceType: "certificate", sourceId: issue.id } });
  assert.equal(alert.length, 1);
  assert.equal((await decide(desk, { id: issue.id, version: issue.version, action: "approve" })).status(), 403, "reception cannot approve");
  assert.equal((await decide(lead, { id: issue.id, version: issue.version, action: "approve" })).status(), 200);
  const issued = await issueRow(issue.serial);
  assert.equal(issued.status, "ISSUED"); assert.equal(issued.approvedById, users.get("lead")!.id); assert.equal(issued.requestedById, users.get("desk")!.id);
  assert.equal((await db.notification.findFirstOrThrow({ where: { userId: users.get("lead")!.id, sourceType: "certificate", sourceId: issue.id } })).resolution, "COMPLETED");
  const first = await download(desk, issue.id), second = await download(desk, issue.id);
  assert.equal(first.status, 200); assert.equal(first.body.subarray(0, 4).toString(), "%PDF");
  assert.equal(first.hash, issued.artifactHash);
  assert.equal(sha(first.body), sha(second.body), "the same document gives the same bytes");
  assert.equal(first.pdfSha, sha(first.body), "the stored PDF hash matches the bytes");
  assert.equal((await issueRow(issue.serial)).pdfSha256, first.pdfSha);
  await writeFile(`${evidence}/certificate-en.pdf`, first.body);
  execFileSync("pdftoppm", ["-png", "-r", "60", "-singlefile", `${evidence}/certificate-en.pdf`, `${evidence}/certificate-en`]);
  const text = execFileSync("pdftotext", [`${evidence}/certificate-en.pdf`, "-"]).toString();
  assert.match(text, new RegExp(issued.serial)); assert.match(text, /Synthetic Guardian Khalid/);

  // The pupil moves class and the template is re-approved; the issued document does not change.
  await db.student.update({ where: { id: pupils.complete }, data: { guardianName: "Synthetic Guardian Changed" } });
  await post(desk, { action: "save-template", id: certTemplate, kind: "STUDENT_CERTIFICATE", name: "Bonafide", language: "en", title: "Bonafide Certificate (2027)", body: "Certified: {{studentName}} of {{className}}, guardian {{guardianName}}, born {{dateOfBirth}}. {{serial}}" });
  assert.equal((await post(lead, { action: "approve-template", id: certTemplate })).status(), 200);
  const again = await download(desk, issue.id);
  assert.equal(sha(again.body), sha(first.body), "re-downloading the original is unchanged");
  await assert.rejects(db.$executeRaw`UPDATE certificate_issues SET rendered_body = 'tampered' WHERE id = ${issue.id}`, /cannot be changed/);
  await assert.rejects(db.$executeRaw`UPDATE certificate_issues SET pdf = '\\x00' WHERE id = ${issue.id}`, /cannot be replaced/);
});

test("a correction is a reissue with a reason and a new serial; the original is superseded and stays retrievable", async () => {
  const desk = await context("desk"), lead = await context("lead");
  const original = await db.certificateIssue.findFirstOrThrow({ where: { schoolId, status: "ISSUED", studentId: pupils.complete } });
  assert.equal((await post(desk, { action: "issue", templateId: certTemplate, studentId: pupils.complete, previousId: original.id, idempotencyKey: randomUUID() })).status(), 400, "a reason is required");
  assert.equal((await post(desk, { action: "issue", templateId: certTemplate, studentId: pupils.namesake, previousId: original.id, reissueReason: "Synthetic: wrong pupil", idempotencyKey: randomUUID() })).status(), 400, "a reissue cannot move to another pupil");
  const reissue = await post(desk, { action: "issue", templateId: certTemplate, studentId: pupils.complete, previousId: original.id, reissueReason: "Synthetic: guardian name corrected", idempotencyKey: randomUUID() });
  assert.equal(reissue.status(), 201);
  const successor = await issueRow((await reissue.json()).data.serial);
  assert.notEqual(successor.serial, original.serial); assert.equal(successor.previousId, original.id);
  assert.equal((await post(desk, { action: "issue", templateId: certTemplate, studentId: pupils.complete, previousId: original.id, reissueReason: "Synthetic: again", idempotencyKey: randomUUID() })).status(), 409, "only one open replacement");
  await decide(lead, { id: successor.id, version: successor.version, action: "approve" });
  assert.equal((await issueRow(original.serial)).status, "SUPERSEDED");
  assert.match((await issueRow(successor.serial)).renderedBody, /Synthetic Guardian Changed/);
  const old = await download(desk, original.id);
  assert.equal(old.status, 200, "the superseded original can still be retrieved");
  assert.equal(old.state, "SUPERSEDED");
  const verdict = await verify(original.verifyToken);
  assert.equal(verdict.json.data.state, "SUPERSEDED"); assert.equal(verdict.json.data.replacedBy, successor.serial);
});

test("revocation shows on the public link, which reveals only the document's face to anyone", async () => {
  const desk = await context("desk"), lead = await context("lead"), other = await context("other");
  const current = await db.certificateIssue.findFirstOrThrow({ where: { schoolId, status: "ISSUED", studentId: pupils.complete } });
  const valid = await verify(current.verifyToken);
  assert.equal(valid.status, 200); assert.equal(valid.json.data.state, "VALID");
  assert.deepEqual(Object.keys(valid.json.data).sort(), ["issuedOn", "school", "serial", "state", "title"], "no pupil fields are disclosed");
  const beforeRevoke = await download(desk, current.id);
  assert.equal(beforeRevoke.status, 200);
  assert.equal((await decide(desk, { id: current.id, version: current.version, action: "revoke", note: "Synthetic: issued in error" })).status(), 403, "reception cannot revoke");
  assert.equal((await decide(lead, { id: current.id, version: current.version, action: "revoke" })).status(), 400, "a reason is required");
  assert.equal((await decide(lead, { id: current.id, version: current.version, action: "revoke", note: "Synthetic: issued in error" })).status(), 200);
  const revoked = await verify(current.verifyToken);
  const after = await download(desk, current.id);
  assert.equal(after.state, "REVOKED");
  assert.equal(after.pdfSha, beforeRevoke.pdfSha, "a revoked document is the same file");
  assert.equal(revoked.json.data.state, "REVOKED"); assert.ok(revoked.json.data.revokedOn);
  const signedIn = await other.request.get(`${base}/api/public/certificates/verify?token=${current.verifyToken}`);
  assert.deepEqual((await signedIn.json()).data, revoked.json.data, "an unrelated account sees exactly the same");
  assert.equal((await verify("x".repeat(24))).status, 404);
});

test("other campuses, teachers and unrelated pupils are refused", async () => {
  const other = await context("other"), teacher = await context("teacher"), desk = await context("desk");
  const issue = await db.certificateIssue.findFirstOrThrow({ where: { schoolId, campusId } });
  assert.equal((await download(other, issue.id)).status, 404);
  assert.equal(((await (await other.request.get(`${api}?issues=1`)).json()).data ?? []).length, 0);
  assert.equal((await post(other, { action: "preview", templateId: certTemplate, studentId: pupils.complete })).status(), 404);
  assert.equal((await post(desk, { action: "preview", templateId: certTemplate, studentId: pupils.other })).status(), 404, "a pupil of another campus is not found");
  assert.equal((await teacher.request.get(`${api}?issues=1`)).status(), 403);
});

test("an Arabic ID card needs a photo, renders right-to-left with fixed-direction identifiers, and a leader issues it directly", async () => {
  const desk = await context("desk"), lead = await context("lead");
  const saved = await (await post(desk, { action: "save-template", kind: "ID_CARD", name: "بطاقة الطالب", language: "ar", title: "بطاقة هوية الطالب", body: "{{photo}}الاسم: {{studentName}}\nالرقم: {{rollNo}}\nالصف: {{className}} {{section}}\nتاريخ الإصدار: {{issueDate}}" })).json();
  cardTemplate = saved.data.id;
  assert.equal(saved.data.requiresApproval, true, "ID cards always need approval");
  await post(lead, { action: "approve-template", id: cardTemplate });
  const noPhoto = await (await post(desk, { action: "preview", templateId: cardTemplate, studentId: pupils.complete })).json();
  assert.deepEqual(noPhoto.data.missing, ["photo"]);
  await db.student.update({ where: { id: pupils.complete }, data: { profileImageUrl: PHOTO } });
  const issued = await post(lead, { action: "issue", templateId: cardTemplate, studentId: pupils.complete, idempotencyKey: randomUUID() });
  assert.equal(issued.status(), 201);
  const card = await issueRow((await issued.json()).data.serial);
  assert.equal(card.status, "ISSUED", "a leader's own request needs no second approval"); assert.equal(card.approvedById, users.get("lead")!.id);
  const pdf = await download(desk, card.id);
  assert.equal(pdf.status, 200);
  await writeFile(`${evidence}/id-card-ar.pdf`, pdf.body);
  execFileSync("pdftoppm", ["-png", "-r", "150", "-singlefile", `${evidence}/id-card-ar.pdf`, `${evidence}/id-card-ar`]);
});

test("reception previews and requests a document in the UI; the Arabic queue reads right-to-left at phone width", async () => {
  const desk = await context("desk"), page = await desk.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/receptionist?view=certificates`);
  const panel = page.locator("[data-certificates-desk]");
  await panel.locator("[data-issue]").first().waitFor({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Issue document" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Template").selectOption(certTemplate);
  await dialog.getByLabel("Find the pupil (name, roll or admission number)").fill("Hina");
  await dialog.locator('[data-student-option="J-702"]').click();
  await dialog.locator("[data-preview-missing]").waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Request approval" }).isDisabled(), true, "missing fields block the request");
  await dialog.getByLabel("Find the pupil (name, roll or admission number)").fill("Abdul-Rahman");
  await dialog.locator('[data-student-option="J-703"]').click();
  await dialog.locator("[data-issue-preview]").filter({ hasText: "Synthetic Guardian Omar" }).waitFor();
  await shot(page, "certificates-preview-en-1440");
  await dialog.getByRole("button", { name: "Request approval" }).click();
  await panel.locator('[data-issue-status="PENDING_APPROVAL"]').filter({ hasText: "J-703" }).waitFor({ timeout: 15_000 });
  await shot(page, "certificates-queue-en-1440");
  assert.deepEqual(errors, []);
  await page.close();

  const ar = await context("desk-ar", { width: 390, height: 844 }), arPage = await ar.newPage();
  await arPage.goto(`${base}/receptionist?view=certificates`);
  await arPage.waitForLoadState("networkidle");
  if (!arPage.url().includes("view=certificates")) await arPage.goto(`${base}/receptionist?view=certificates`);
  await arPage.locator("[data-issue]").first().waitFor({ timeout: 30_000 });
  assert.equal(await arPage.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await arPage.locator("[data-certificates-desk]").innerText(), /الشهادات وبطاقات الهوية/);
  assert.equal(await arPage.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "long names and serials do not overflow");
  await shot(arPage, "certificates-queue-ar-390");
  await arPage.close();
});
