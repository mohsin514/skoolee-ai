import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-461 on the isolated app: teaching evidence is bounded to the selected academic period, counts
// only published results, attributes subject results to the subject teacher and marks class outcomes
// as shared, shows missing evidence as unavailable (never zero), lists teachers by name (no ranking),
// limits leaders to their campus and teachers to themselves, and keeps support notes append-only and
// audited, separate from any employment decision.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.EVIDENCE_TEST_APP || "http://localhost:3108";
const evidence = process.env.EVIDENCE_DIR || "/tmp/sko461-evidence";
const db = new PrismaClient(), password = "SyntheticEvidence461!";
const schoolId = `ev461-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;
const id = (key: string) => users.get(key)!.id;

async function user(key: string, role: string, campusId: string, name: string, language = "en") {
  const uid = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id: uid, email, password: await bcrypt.hash(password, 12), fullName: name, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id: uid, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const get = async (key: string, query = "") => (await context(key)).request.get(`${base}/api/teachers/performance?academicYear=2026${query}`);
const measure = (row: { measures: { key: string }[] }, key: string) => row.measures.find(m => m.key === key) as unknown as { value: number | null; unavailable: string | null; shared: boolean; caution: string | null; coverage: string | null };
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Hazel Evidence School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [campus, name] of [[campusA, "Hazel North"], [campusB, "Hazel South"]]) await db.campus.create({ data: { id: campus, schoolId, name, regId: campus, city: "Lahore" } });
  await user("leader", "CAMPUS_ADMIN", campusA, "Synthetic Leader"); await user("leader-ar", "CAMPUS_ADMIN", campusA, "Synthetic Leader AR", "ar");
  await user("zahra", "TEACHER", campusA, "Synthetic Zahra"); await user("adeel", "TEACHER", campusA, "Synthetic Adeel"); await user("south", "TEACHER", campusB, "Synthetic South");
  await user("zahra-ar", "TEACHER", campusA, "Synthetic Zahra AR", "ar"); await user("accountant", "ACCOUNTANT", campusA, "Synthetic Accountant");
  await db.academicCycle.create({ data: { schoolId, campusId: campusA, label: "2026–27", academicYear: 2026, status: "ACTIVE", startDate: new Date("2026-04-01Z"), endDate: new Date("2027-03-31Z") } });
  const seven = (await db.class.create({ data: { schoolId, campusId: campusA, name: "Seven", section: "A", academicYear: 2026, classTeacherId: id("zahra") } })).id;
  const old = (await db.class.create({ data: { schoolId, campusId: campusA, name: "Six", section: "A", academicYear: 2025 } })).id;
  const math = (await db.subject.create({ data: { schoolId, campusId: campusA, classId: seven, name: "Mathematics", totalMarks: 100, teacherId: id("zahra") } })).id;
  await db.subject.create({ data: { schoolId, campusId: campusA, classId: seven, name: "English", totalMarks: 100, teacherId: id("zahra-ar") } });
  const oldMath = (await db.subject.create({ data: { schoolId, campusId: campusA, classId: old, name: "Mathematics", totalMarks: 100, teacherId: id("zahra") } })).id;
  const pupils: string[] = [];
  for (let n = 0; n < 3; n++) pupils.push((await db.student.create({ data: { schoolId, campusId: campusA, classId: seven, fullName: `Synthetic Pupil ${n + 1}`, rollNo: `HZ-${n + 1}`, gender: "OTHER", enrollmentDate: new Date("2025-01-01Z") } })).id);
  // Registers on two days in the period and one before it (must not count).
  for (const day of ["2026-09-01", "2026-09-02", "2025-12-01"]) for (const pupil of pupils) await db.attendance.create({ data: { schoolId, campusId: campusA, classId: seven, studentId: pupil, date: new Date(`${day}T00:00:00Z`), status: "PRESENT" } });
  const exam = (status: string, year: number, cls: string, subject: string) => db.exam.create({ data: { schoolId, campusId: campusA, classId: cls, subjectId: subject, title: `Synthetic ${status} ${year}`, term: "TERM_1", academicYear: year, examType: "MID_TERM", status, ...(status === "PUBLISHED" ? { publishedAt: new Date("2026-10-01Z") } : {}) } });
  const published = await exam("PUBLISHED", 2026, seven, math), locked = await exam("LOCKED", 2026, seven, math), earlier = await exam("PUBLISHED", 2025, old, oldMath);
  for (const [index, pupil] of pupils.entries()) {
    await db.mark.create({ data: { schoolId, campusId: campusA, examId: published.id, studentId: pupil, subjectId: math, marksObtained: [80, 60, 40][index] } });
    await db.mark.create({ data: { schoolId, campusId: campusA, examId: locked.id, studentId: pupil, subjectId: math, marksObtained: 95 } });
  }
  await db.mark.create({ data: { schoolId, campusId: campusA, examId: earlier.id, studentId: pupils[0], subjectId: oldMath, marksObtained: 5 } });
  await db.reportCard.create({ data: { schoolId, campusId: campusA, studentId: pupils[0], examId: published.id, totalMarks: 100, obtainedMarks: 70, percentage: 70, generatedAt: new Date("2026-10-02Z"), status: "PUBLISHED" } });
  await db.reportCard.create({ data: { schoolId, campusId: campusA, studentId: pupils[1], examId: locked.id, totalMarks: 100, obtainedMarks: 99, percentage: 99, generatedAt: new Date("2026-10-03Z") } });
  for (const [day, status] of [["2026-09-01", "PRESENT"], ["2026-09-02", "ABSENT"], ["2025-12-01", "PRESENT"]] as const) await db.teacherAttendance.create({ data: { schoolId, campusId: campusA, userId: id("zahra"), date: new Date(`${day}T00:00:00Z`), status } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.teacherSupportNote.deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("evidence is bounded, published-only, attributed honestly and never ranked", async () => {
  const response = await get("leader");
  assert.equal(response.status(), 200, await response.text());
  const data = (await response.json()).data;
  assert.equal(data.period.start, "2026-04-01");
  assert.equal(data.period.end, new Date().toISOString().slice(0, 10), "the period never runs past today");
  assert.equal(data.period.source, "ACADEMIC_CYCLE");
  assert.deepEqual(data.teachers.map((t: { fullName: string }) => t.fullName), ["Synthetic Adeel", "Synthetic Zahra", "Synthetic Zahra AR"], "listed by name, campus only, no ranking");
  const zahra = data.teachers.find((t: { teacherId: string }) => t.teacherId === id("zahra"));
  assert.deepEqual([measure(zahra, "registers").value, measure(zahra, "registers").coverage], [100, "2 of 2 class-days"], "last year's register is outside the period");
  assert.equal(measure(zahra, "marksEntry").value, 100);
  assert.equal(measure(zahra, "subjectResults").value, 60, "only the published 2026 exam counts (not the locked one, not 2025)");
  assert.match(String(measure(zahra, "subjectResults").caution), /Small sample/);
  assert.deepEqual([measure(zahra, "classOutcomes").value, measure(zahra, "classOutcomes").shared], [70, true], "an unpublished report card is excluded; the outcome is shared");
  assert.match(String(measure(zahra, "classOutcomes").caution), /Shared outcome: 2 teacher\(s\)/);
  assert.equal(measure(zahra, "staffAttendance").value, 50);
  const adeel = data.teachers.find((t: { teacherId: string }) => t.teacherId === id("adeel"));
  for (const m of adeel.measures) assert.deepEqual([m.value, Boolean(m.unavailable)], [null, true], `${m.key} is unavailable, not zero`);
  assert.ok(data.policy.some((line: string) => /no ranking/.test(line)));
});

test("leaders see their campus, teachers only themselves, others nothing", async () => {
  const self = (await (await get("zahra")).json()).data;
  assert.deepEqual([self.self, self.teachers.length, self.teachers[0].teacherId], [true, 1, id("zahra")]);
  assert.equal((await get("zahra", `&teacherId=${id("adeel")}`)).status(), 403);
  assert.equal((await get("accountant")).status(), 403);
  assert.equal((await get("leader", `&campusId=${campusB}`)).status(), 403, "a campus leader cannot read another campus");
});

test("support notes are append-only, audited and kept apart from employment decisions", async () => {
  const post = async (key: string, teacherId: string, body: string) => (await context(key)).request.post(`${base}/api/teachers/performance/notes`, { data: { teacherId, academicYear: 2026, body } });
  assert.equal((await post("leader", id("zahra"), "short")).status(), 400);
  const action = await post("leader", id("zahra"), "Agreed a peer observation of a Year 7 algebra lesson next week.");
  assert.equal(action.status(), 201, await action.text());
  assert.equal((await action.json()).data.kind, "SUPPORT_ACTION");
  const reply = await post("zahra", id("zahra"), "Thank you; I will share my lesson plan beforehand.");
  assert.equal((await reply.json()).data.kind, "TEACHER_RESPONSE");
  assert.equal((await post("zahra", id("adeel"), "Writing about a colleague should not be possible.")).status(), 403);
  const notes = (await (await (await context("zahra")).request.get(`${base}/api/teachers/performance/notes?teacherId=${id("zahra")}&academicYear=2026`)).json()).data;
  assert.deepEqual(notes.map((n: { kind: string }) => n.kind), ["SUPPORT_ACTION", "TEACHER_RESPONSE"]);
  assert.equal(await db.auditLog.count({ where: { schoolId, tableName: "teacher_support_notes" } }), 2);
});

test("leaders and teachers read the evidence in their language", async () => {
  const page = await (await context("leader")).newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin?view=teacher-performance`);
  const panel = page.locator("[data-teaching-evidence][data-state=ready]");
  await panel.waitFor({ timeout: 30_000 });
  assert.match(await panel.locator("[data-period]").innerText(), /Dates from the campus academic year/);
  await panel.locator(`[data-teacher="${id("zahra")}"]`).getByRole("button", { name: /Support notes/ }).click();
  await panel.locator("[data-notes] [data-note-kind=TEACHER_RESPONSE]").waitFor({ timeout: 15_000 });
  await panel.locator(`[data-teacher="${id("zahra")}"]`).scrollIntoViewIfNeeded();
  await shot(page, "teaching-evidence-en-1440");
  assert.equal(await panel.locator(`[data-teacher="${id("adeel")}"] [data-available=true]`).count(), 0);
  assert.deepEqual(errors, []);
  await page.close();

  const ar = await (await context("zahra-ar", { width: 390, height: 844 })).newPage();
  await ar.goto(`${base}/teacher/insights`);
  await ar.locator("[data-teaching-evidence][data-state=ready]").waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await ar.locator("[data-teaching-evidence] h2").innerText(), /أدلة تدريسي/);
  await ar.locator("[data-teaching-evidence]").scrollIntoViewIfNeeded();
  await shot(ar, "teaching-evidence-teacher-ar-390");
  await ar.close();
});
