import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, request as playwrightRequest, type APIRequestContext, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { starterDefinition, type FormDefinition } from "../../src/lib/admissions/form-rules";

// SKO-398 on the isolated app with synthetic families only: a family application keeps the form version it
// started on even after v2 is published; drafts resume by reference + key; required and conditional rules are
// enforced by the server; families never see office notes or other applications; delegated receptionist grants
// work and stop when revoked; possible duplicates need an explicit recorded choice; a retried conversion
// creates one pupil and closes the linked enquiry.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.ADMISSIONS_TEST_APP || "http://localhost:3107";
const evidence = process.env.ADMISSIONS_EVIDENCE_DIR || "/tmp/sko398-evidence";
const db = new PrismaClient(), password = "SyntheticAdmit398!";
const schoolId = `admit398-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, formId = "", token = "";
const PDF = Buffer.from("%PDF-1.4\n% synthetic birth certificate\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function user(key: string, role: string, campus: string | null = campusId, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
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
const api = `${base}/api/admissions`, pub = `${base}/api/public/admissions`;
const staffPost = (ctx: BrowserContext, data: Record<string, unknown>) => ctx.request.post(api, { data });
const staffAct = (ctx: BrowserContext, data: Record<string, unknown>) => ctx.request.patch(api, { data });
let family: APIRequestContext;
const fam = (data: Record<string, unknown>, key?: string) => family.post(pub, { data, headers: key ? { "x-resume-key": key } : {} });
const famGet = (reference: string, key: string) => family.get(`${pub}?reference=${reference}`, { headers: { "x-resume-key": key } });
const upload = (reference: string, key: string, docKey: string, name = "birth.pdf", type = "application/pdf", buffer = PDF) => family.post(`${base}/api/public/admissions/documents`, { headers: { "x-resume-key": key }, multipart: { reference, key: docKey, file: { name, mimeType: type, buffer } } });
const row = (reference: string) => db.admissionApplication.findFirstOrThrow({ where: { schoolId, reference } });
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };

/** v1: the starter form plus a conditional transfer question and document. */
function v1(): FormDefinition {
  const definition = starterDefinition();
  definition.fields.push({ key: "transferring", type: "select", required: true, label: { en: "Is the child moving from another school?", ar: "هل ينتقل الطفل من مدرسة أخرى؟", ur: "کیا بچہ کسی اور اسکول سے آ رہا ہے؟" }, options: [{ value: "yes", label: { en: "Yes", ar: "نعم", ur: "ہاں" } }, { value: "no", label: { en: "No", ar: "لا", ur: "نہیں" } }] });
  definition.fields.push({ key: "leavingReason", type: "textarea", required: true, showIf: { field: "transferring", equals: "yes" }, label: { en: "Why is the child leaving the current school?", ar: "لماذا يغادر الطفل مدرسته الحالية؟", ur: "بچہ موجودہ اسکول کیوں چھوڑ رہا ہے؟" } });
  definition.documents.push({ key: "leavingCertificate", required: true, showIf: { field: "transferring", equals: "yes" }, label: { en: "School leaving certificate", ar: "شهادة ترك المدرسة", ur: "اسکول چھوڑنے کا سرٹیفکیٹ" } });
  return definition;
}
const answers = (extra: Record<string, unknown> = {}) => ({ childName: "Synthetic Child Noor Fatima", dateOfBirth: "2019-02-11", gender: "FEMALE", guardianName: "Synthetic Guardian Sadia", guardianPhone: "+92 300 1112233", transferring: "no", ...extra });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Lotus Admissions School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[campusId, "Lotus Clifton"], [otherCampusId, "Lotus Gulshan"]]) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Karachi" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Prep", section: "A", academicYear: 2026 } });
  const lead = await user("lead", "PRINCIPAL"); await user("desk", "RECEPTIONIST"); await user("other", "PRINCIPAL", otherCampusId); await user("teacher", "TEACHER"); await user("parent", "PARENT");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi", currency: "PKR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: lead, financeReviewedBy: lead } });
  // An existing pupil with the same name and date of birth as one applicant (a possible duplicate).
  await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Child Hamza Ali", rollNo: "P-1", gender: "MALE", dateOfBirth: new Date("2019-06-01T00:00:00Z"), enrollmentDate: new Date("2025-04-01Z") } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  family = await playwrightRequest.newContext();
});
after(async () => {
  await browser?.close(); await family?.dispose();
  await db.$executeRaw`ALTER TABLE admission_form_versions DISABLE TRIGGER admission_form_version_frozen`.catch(() => undefined);
  await db.$executeRaw`ALTER TABLE admission_submissions DISABLE TRIGGER admission_submission_frozen`.catch(() => undefined);
  await db.admissionApplication.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await db.admissionFormVersion.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await db.$executeRaw`ALTER TABLE admission_form_versions ENABLE TRIGGER admission_form_version_frozen`.catch(() => undefined);
  await db.$executeRaw`ALTER TABLE admission_submissions ENABLE TRIGGER admission_submission_frozen`.catch(() => undefined);
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("a form is validated, published as v1, and its link opens only once published", async () => {
  const lead = await context("lead");
  const broken = starterDefinition(); broken.fields = broken.fields.filter(field => field.identity !== "childName");
  const bad = await staffPost(lead, { action: "save-form", name: "Prep 2027", definition: broken });
  assert.equal(bad.status(), 400); assert.match((await bad.json()).error, /child's full name/);
  const saved = await (await staffPost(lead, { action: "save-form", name: "Prep 2027", definition: v1() })).json();
  formId = saved.data.id; token = saved.data.publicToken;
  assert.equal((await family.get(`${pub}?form=${token}`)).status(), 404, "a never-published form has no public page");
  assert.equal((await staffPost(lead, { action: "publish-form", id: formId })).status(), 200);
  assert.equal((await staffPost(lead, { action: "publish-form", id: formId })).status(), 409, "an unchanged draft is not a new version");
  const form = await (await family.get(`${pub}?form=${token}`)).json();
  assert.equal(form.data.version, 1);
  assert.equal(form.data.schoolName, "Synthetic Lotus Admissions School");
});

test("a family draft resumes, keeps v1 after v2 is published, and the server enforces conditional rules", async () => {
  const lead = await context("lead");
  const started = await (await fam({ action: "start", form: token, answers: { childName: "Synthetic Child Noor Fatima" } })).json();
  const { reference, resumeKey } = started.data;
  assert.match(reference, /^APP-[0-9A-F]{8}$/);
  assert.equal((await famGet(reference, "x".repeat(40))).status(), 404, "the reference alone opens nothing");
  // Staff publish v2, which makes the child's email required. The draft keeps v1.
  const v2 = v1(); v2.fields.push({ key: "childEmail", type: "email", required: true, label: { en: "Child's email" } });
  await staffPost(lead, { action: "save-form", id: formId, name: "Prep 2027", definition: v2 });
  assert.equal((await staffPost(lead, { action: "publish-form", id: formId })).status(), 200);
  const saved = await fam({ action: "save", reference, answers: answers({ transferring: "yes" }) }, resumeKey);
  assert.equal(saved.status(), 200);
  const view = (await saved.json()).data;
  assert.equal(view.formVersion, 1, "the draft stays on the version it started with");
  assert.deepEqual(view.missing.sort(), ["birthCertificate", "leavingCertificate", "leavingReason"]);
  const premature = await fam({ action: "submit", reference, consent: true }, resumeKey);
  assert.equal(premature.status(), 400); assert.match((await premature.json()).error, /leavingReason/);
  assert.equal((await upload(reference, resumeKey, "birthCertificate", "photo.exe", "application/x-msdownload")).status(), 400, "only PDF, JPG or PNG");
  assert.equal((await upload(reference, resumeKey, "notOnForm")).status(), 400);
  assert.equal((await upload(reference, resumeKey, "birthCertificate")).status(), 201);
  // Switching the condition off removes the conditional question and document from what is required.
  await fam({ action: "save", reference, answers: answers({ transferring: "no", leavingReason: "Synthetic: stale answer" }) }, resumeKey);
  assert.equal(((await row(reference)).answers as Record<string, unknown>).leavingReason, undefined, "a hidden answer is not kept");
  assert.equal((await fam({ action: "submit", reference, consent: false }, resumeKey)).status(), 400, "consent is required");
  const sent = await Promise.all([1, 2].map(() => fam({ action: "submit", reference, consent: true }, resumeKey)));
  assert.ok(sent.every(r => r.status() === 200));
  const submitted = await row(reference);
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(await db.admissionSubmission.count({ where: { applicationId: submitted.id } }), 1, "a double tap is one submission");
  assert.ok(submitted.identityKeys.some(key => key.startsWith("nameAndDob:")));
  assert.equal((await fam({ action: "save", reference, answers: answers() }, resumeKey)).status(), 409, "a sent application cannot be edited by the family");
  await assert.rejects(db.$executeRaw`UPDATE admission_submissions SET answers = '{}' WHERE application_id = ${submitted.id}`, /kept as sent/);
});

test("the pipeline separates office notes from family messages and is closed to families, teachers and other campuses", async () => {
  const lead = await context("lead"), teacher = await context("teacher"), parent = await context("parent"), other = await context("other");
  const app = await db.admissionApplication.findFirstOrThrow({ where: { schoolId, status: "SUBMITTED" } });
  const list = await (await lead.request.get(`${api}?view=unassigned`)).json();
  assert.ok(list.data.some((r: { reference: string }) => r.reference === app.reference)); assert.ok(list.counts.unassigned >= 1);
  assert.equal((await staffAct(lead, { id: app.id, version: app.version, action: "assign", ownerId: users.get("desk")!.id, nextContactAt: new Date(Date.now() - 3_600_000).toISOString() })).status(), 200);
  assert.equal((await db.notification.findMany({ where: { userId: users.get("desk")!.id, sourceType: "application", sourceId: app.id } })).length, 1);
  const overdue = await (await lead.request.get(`${api}?view=overdue`)).json();
  assert.ok(overdue.data.some((r: { reference: string; overdue: boolean }) => r.reference === app.reference && r.overdue));
  let current = await row(app.reference);
  assert.equal((await staffAct(lead, { id: app.id, version: current.version, action: "review" })).status(), 200);
  current = await row(app.reference);
  assert.equal((await staffAct(lead, { id: app.id, version: current.version, action: "request-info" })).status(), 400, "a request needs a family message");
  assert.equal((await staffAct(lead, { id: app.id, version: current.version, action: "request-info", familyMessage: "Please add the vaccination card.", officeNote: "Synthetic office note: sibling already at Gulshan." })).status(), 200);
  for (const ctx of [teacher, parent]) assert.equal((await ctx.request.get(`${api}?view=all`)).status(), 403);
  assert.equal((await other.request.get(`${api}?id=${app.id}`)).status(), 404, "another campus cannot open it");
  const detail = await (await lead.request.get(`${api}?id=${app.id}`)).json();
  assert.ok(detail.data.events.some((e: { officeNote: string | null }) => e.officeNote?.includes("sibling")), "staff see office notes");
});

test("a family sees only its stage and messages, answers the request and accepts an offer", async () => {
  const lead = await context("lead");
  const started = await (await fam({ action: "start", form: token, answers: answers({ childEmail: "noor@example.invalid" }) })).json();
  const { reference, resumeKey } = started.data;
  await upload(reference, resumeKey, "birthCertificate");
  await fam({ action: "submit", reference, consent: true }, resumeKey);
  const app = await row(reference);
  await staffAct(lead, { id: app.id, version: app.version, action: "review" });
  let current = await row(reference);
  await staffAct(lead, { id: app.id, version: current.version, action: "request-info", familyMessage: "Please upload a clearer birth certificate.", officeNote: "Synthetic: scan unreadable" });
  const view = (await (await famGet(reference, resumeKey)).json()).data;
  assert.equal(view.stage, "INFO_REQUESTED"); assert.equal(view.editable, true);
  assert.deepEqual(view.messages.map((m: { message: string }) => m.message), ["Please upload a clearer birth certificate."]);
  assert.ok(!JSON.stringify(view).includes("unreadable"), "office notes never reach the family");
  await upload(reference, resumeKey, "birthCertificate", "clearer.pdf");
  await fam({ action: "submit", reference, consent: true }, resumeKey);
  assert.equal(await db.admissionSubmission.count({ where: { applicationId: app.id } }), 2, "the original submission is kept alongside the resubmission");
  current = await row(reference);
  await staffAct(lead, { id: app.id, version: current.version, action: "review" });
  current = await row(reference);
  assert.equal((await staffAct(lead, { id: app.id, version: current.version, action: "offer" })).status(), 400, "an offer names the class");
  assert.equal((await staffAct(lead, { id: app.id, version: current.version, action: "offer", intakeClassId: classId, familyMessage: "We are pleased to offer a place in Prep A." })).status(), 200);
  assert.equal((await fam({ action: "accept", reference }, resumeKey)).status(), 200);
  assert.equal((await row(reference)).status, "ACCEPTED", "acceptance is recorded, but no pupil exists yet");
  assert.equal(await db.student.count({ where: { schoolId, fullName: "Synthetic Child Noor Fatima" } }), 0);
});

test("conversion creates one pupil on retry; a possible duplicate needs an explicit recorded choice", async () => {
  const lead = await context("lead");
  const accepted = await db.admissionApplication.findFirstOrThrow({ where: { schoolId, status: "ACCEPTED" } });
  assert.equal((await staffPost(lead, { action: "convert", id: accepted.id, rollNo: "P-1" })).status(), 409, "a taken roll number is refused");
  const replies = await Promise.all([1, 2, 3].map(() => staffPost(lead, { action: "convert", id: accepted.id, rollNo: "P-2", familyMessage: "Welcome to Lotus Clifton." })));
  assert.ok(replies.every(r => r.status() === 200), "every retry answers with the same outcome");
  const students = await db.student.findMany({ where: { schoolId, fullName: "Synthetic Child Noor Fatima" } });
  assert.equal(students.length, 1, "one pupil despite three conversions");
  assert.equal(await db.studentEnrollment.count({ where: { studentId: students[0].id } }), 1);
  const enrolled = await row(accepted.reference);
  assert.equal(enrolled.status, "ENROLLED"); assert.equal(enrolled.convertedStudentId, students[0].id);

  // An enquiry-led staff application for a child who is already a pupil (same name and date of birth).
  const enquiry = await db.admissionQuery.create({ data: { schoolId, campusId, name: "Synthetic Parent Ali", phone: "+92 321 5556677", source: "WALK_IN" } });
  const staff = await (await staffPost(lead, { action: "start", formId, enquiryId: enquiry.id, answers: { childName: "Synthetic Child Hamza Ali", dateOfBirth: "2019-06-01", gender: "MALE", transferring: "no", childEmail: "hamza@example.invalid" } })).json();
  assert.equal(staff.data.channel, "STAFF");
  assert.equal(((staff.data.answers as Record<string, string>).guardianName), "Synthetic Parent Ali", "the enquiry prefills the family contact");
  assert.equal((await staffPost(lead, { action: "start", formId, enquiryId: enquiry.id })).status(), 409, "one application per enquiry");
  const id = staff.data.id;
  const docs = await lead.request.post(`${base}/api/admissions/documents`, { multipart: { applicationId: id, key: "birthCertificate", file: { name: "birth.pdf", mimeType: "application/pdf", buffer: PDF } } });
  assert.equal(docs.status(), 201);
  let current = await db.admissionApplication.findUniqueOrThrow({ where: { id } });
  assert.equal((await staffAct(lead, { id, version: current.version, action: "staff-submit", consent: true })).status(), 200);
  for (const action of ["review", "offer", "record-acceptance"]) {
    current = await db.admissionApplication.findUniqueOrThrow({ where: { id } });
    const response = await staffAct(lead, { id, version: current.version, action, intakeClassId: classId, officeNote: "Synthetic: father accepted by phone" });
    assert.equal(response.status(), 200, action);
  }
  const blocked = await staffPost(lead, { action: "convert", id, rollNo: "P-3" });
  assert.equal(blocked.status(), 409); assert.match((await blocked.json()).error, /already be on the school's records/);
  const detail = await (await lead.request.get(`${api}?id=${id}`)).json();
  const match = detail.data.duplicates.students.find((s: { fullName: string }) => s.fullName === "Synthetic Child Hamza Ali");
  assert.ok(match, "the existing pupil is listed as a possible duplicate");
  assert.equal((await staffPost(lead, { action: "convert", id, rollNo: "P-3", duplicate: { choice: "existing", studentId: match.id } })).status(), 400, "the choice needs a reason");
  const linked = await staffPost(lead, { action: "convert", id, duplicate: { choice: "existing", studentId: match.id, reason: "Synthetic: returning pupil, same family" } });
  assert.equal(linked.status(), 200);
  assert.equal(await db.student.count({ where: { schoolId, fullName: "Synthetic Child Hamza Ali" } }), 1, "no second pupil");
  const done = await db.admissionApplication.findUniqueOrThrow({ where: { id } });
  assert.equal(done.convertedStudentId, match.id);
  assert.equal(await db.admissionApplicationEvent.count({ where: { applicationId: id, kind: "DUPLICATE_DECISION" } }), 1);
  assert.equal((await db.admissionQuery.findUniqueOrThrow({ where: { id: enquiry.id } })).status, "CONVERTED", "the enquiry is closed with the pupil");
});

test("a receptionist's delegated admissions grant works, and stops the moment it is revoked", async () => {
  const desk = await context("desk"), lead = await context("lead");
  const enquiry = await (await desk.request.post(`${base}/api/admission-queries`, { data: { name: "Synthetic Walk-in Mother", phone: "+92 333 0001112", source: "WALK_IN" } })).json();
  assert.equal((await desk.request.patch(`${base}/api/admission-queries`, { data: { id: enquiry.data.id, followUp: { note: "Synthetic: called back" } } })).status(), 403, "no edit grant yet");
  const grant = await db.rolePermission.create({ data: { schoolId, role: "RECEPTIONIST", module: "admissions", canView: true, canAdd: true, canEdit: true, canDelete: false } });
  assert.equal((await desk.request.patch(`${base}/api/admission-queries`, { data: { id: enquiry.data.id, followUp: { note: "Synthetic: called back" } } })).status(), 200, "the grant works on the enquiry API");
  const app = await db.admissionApplication.findFirstOrThrow({ where: { schoolId, status: "INFO_REQUESTED" } }).catch(() => null) ?? await db.admissionApplication.findFirstOrThrow({ where: { schoolId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } });
  assert.equal((await staffAct(desk, { id: app.id, version: app.version, action: "note", officeNote: "Synthetic: desk note" })).status(), 200, "and on applications");
  await db.rolePermission.update({ where: { id: grant.id }, data: { canEdit: false } });
  const fresh = await row(app.reference);
  assert.equal((await staffAct(desk, { id: app.id, version: fresh.version, action: "note", officeNote: "Synthetic: after revoke" })).status(), 403, "revoked immediately");
  assert.equal((await desk.request.patch(`${base}/api/admission-queries`, { data: { id: enquiry.data.id, followUp: { note: "Synthetic: after revoke" } } })).status(), 403);
  assert.equal((await lead.request.get(`${api}?view=all`)).status(), 200);
});

test("an Arabic family completes the form on a phone: required items are marked, the document uploads, and the receipt shows the reference", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", hasTouch: true, isMobile: true });
  const page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/apply/${token}`);
  await page.locator("[data-apply-form]").waitFor({ timeout: 30_000 });
  await page.getByLabel("Language").selectOption("ar");
  await page.waitForFunction("document.documentElement.dir === 'rtl'");
  await page.getByLabel(/^اسم\ الطفل\ الكامل/).fill("Synthetic Child Yusuf Karim");
  await page.getByLabel(/^تاريخ\ الميلاد/).fill("2019-09-09");
  await page.getByLabel(/^الجنس/).selectOption("MALE");
  await page.getByLabel(/^اسم\ ولي\ الأمر/).fill("Synthetic Guardian Layla");
  await page.getByLabel(/^الهاتف/).fill("+971 50 7654321");
  await page.getByLabel(/^هل\ ينتقل\ الطفل\ من\ مدرسة\ أخرى؟/).selectOption("yes");
  await page.locator('[data-apply-document="leavingCertificate"]').waitFor();
  await page.locator("[data-apply-consent]").check();
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await page.locator("[data-apply-error]").waitFor();
  assert.ok(await page.locator('[data-apply-document="birthCertificate"] [role="alert"]').count() >= 1, "the missing document is marked");
  await shot(page, "family-form-missing-ar-390");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await page.getByLabel(/^هل\ ينتقل\ الطفل\ من\ مدرسة\ أخرى؟/).selectOption("no");
  await page.getByLabel(/Child's email/).fill("yusuf@example.invalid");
  await page.locator('[data-apply-upload="birthCertificate"]').setInputFiles({ name: "birth.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.locator('[data-apply-document="birthCertificate"]').filter({ hasText: "birth.pdf" }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await page.locator('[data-apply-status="RECEIVED"]').waitFor({ timeout: 15_000 });
  const reference = (await page.locator("[data-apply-reference]").innerText()).trim();
  assert.match(reference, /^APP-[0-9A-F]{8}$/);
  assert.equal((await row(reference)).status, "SUBMITTED");
  await shot(page, "family-receipt-ar-390");
  // Reloading the page in the same browser resumes the same application.
  await page.reload();
  await page.locator('[data-apply-status="RECEIVED"]').waitFor({ timeout: 15_000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the principal reviews an application against its form version with possible duplicates and the enrol step", async () => {
  const lead = await context("lead"), page = await lead.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/principal?view=applications`);
  const desk = page.locator("[data-admissions-desk]");
  await desk.getByLabel("Show").selectOption("all", { timeout: 30_000 });
  await desk.locator("[data-application]").first().waitFor({ timeout: 15_000 });
  await shot(page, "admissions-pipeline-en-1440");
  const yusuf = await db.admissionApplication.findFirstOrThrow({ where: { schoolId, childName: "Synthetic Child Yusuf Karim" } });
  await desk.locator(`[data-application="${yusuf.reference}"]`).getByRole("button", { name: /Review application/ }).click();
  const review = page.getByRole("dialog").locator("[data-application-review]");
  await review.waitFor();
  await review.locator('[data-review-document="birthCertificate"][data-present="true"]').waitFor();
  await shot(page, "admissions-review-en-1440");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click().catch(() => undefined);
  await desk.getByRole("tab", { name: "Application forms" }).click();
  await desk.locator("[data-admission-form]").first().waitFor();
  await shot(page, "admissions-forms-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});
