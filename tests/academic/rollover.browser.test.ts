import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-404 on the isolated app: the year-end plan lists every eligible learner once; missing results are
// "Needs review" and block approval; approval names an exact version and any edit withdraws it; execution
// runs in bounded batches, revalidates capacity per learner and never duplicates an enrollment on retry;
// reconciliation accounts for every learner, balances by currency and untouched prior-year records; a
// correction is refused once the new placement has its own records.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.ROLLOVER_TEST_APP || "http://localhost:3108";
const evidence = process.env.ROLLOVER_EVIDENCE_DIR || "/tmp/sko404-evidence";
const db = new PrismaClient(), password = "SyntheticRollover404!";
const schoolId = `roll404-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils: Record<string, string> = {}, classes: Record<string, string> = {};
let browser: Browser, planId = "";
const day = (offset: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const yesterday = day(-1), today = day(0);

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email });
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
const view = async () => (await (await (await context("admin")).request.get(`${base}/api/academic/rollover?campusId=${campusId}&sourceYear=2026`)).json()).data;
const post = async (body: Record<string, unknown>) => (await context("admin")).request.post(`${base}/api/academic/rollover`, { data: { campusId, ...body } });
const learner = (data: { learners: { studentId: string }[] }, key: string) => data.learners.find(l => l.studentId === pupils[key]) as unknown as Record<string, unknown> & { issues: string[] };
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Juniper Rollover School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Juniper Main", regId: campusId, city: "Karachi" } });
  await user("admin", "CAMPUS_ADMIN"); await user("admin-ar", "CAMPUS_ADMIN", "ar"); await user("teacher", "TEACHER");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  for (const [key, name, section, year] of [["five", "Five", "A", 2026], ["ten", "Ten", "A", 2026], ["sixA", "Six", "A", 2027], ["sixB", "Six", "B", 2027], ["five27", "Five", "A", 2027]] as const) {
    classes[key] = (await db.class.create({ data: { schoolId, campusId, name, section, academicYear: year } })).id;
  }
  const roster: [string, string, string, number | null][] = [
    ["pass1", "Synthetic Amna Juniper", "five", 82], ["pass2", "Synthetic Bilal Juniper", "five", 74], ["pass3", "Synthetic Dua Juniper", "five", 66],
    ["fail1", "Synthetic Faris Juniper", "five", 12], ["missing1", "Synthetic Hiba Juniper", "five", null], ["grad1", "Synthetic Imran Juniper", "ten", 90],
  ];
  const exams: Record<string, { exam: string; subject: string }> = {};
  for (const cls of ["five", "ten"]) {
    const subject = (await db.subject.create({ data: { schoolId, campusId, classId: classes[cls], name: "Mathematics", totalMarks: 100 } })).id;
    const exam = (await db.exam.create({ data: { schoolId, campusId, classId: classes[cls], subjectId: subject, title: "Synthetic Final", term: "Term 2", academicYear: 2026, examType: "FINAL", status: "PUBLISHED", totalMarks: 100 } })).id;
    exams[cls] = { exam, subject };
  }
  for (const [index, [key, name, cls, score]] of roster.entries()) {
    pupils[key] = (await db.student.create({ data: { schoolId, campusId, classId: classes[cls], fullName: name, rollNo: `JUN-${index + 1}`, gender: "OTHER", enrollmentDate: new Date("2026-04-01Z") } })).id;
    if (score !== null) await db.mark.create({ data: { schoolId, campusId, examId: exams[cls].exam, studentId: pupils[key], subjectId: exams[cls].subject, marksObtained: score } });
  }
  for (const cls of ["five", "ten"]) await db.reportCard.create({ data: { schoolId, campusId, studentId: pupils[cls === "five" ? "pass1" : "grad1"], examId: exams[cls].exam, totalMarks: 100, obtainedMarks: 80, percentage: 80, generatedAt: new Date("2026-07-01Z"), status: "PUBLISHED" } });
  await db.invoice.create({ data: { schoolId, campusId, studentId: pupils.pass1, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-10-30Z"), currency: "PKR", invoiceNumber: `ROLL-${schoolId.slice(-6)}-1`, monthlyFee: 450000, subtotal: 450000, totalAmount: 450000, balanceDue: 450000 } });
  await db.invoice.create({ data: { schoolId, campusId, studentId: pupils.grad1, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-10-30Z"), currency: "USD", invoiceNumber: `ROLL-${schoolId.slice(-6)}-2`, monthlyFee: 12000, subtotal: 12000, totalAmount: 12000, balanceDue: 12000 } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  for (const table of ["rolloverEvent", "rolloverDecision", "rolloverPlan"] as const) await (db[table] as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("the preview lists every learner once; missing results need review and block approval", async () => {
  const legacy = await (await context("admin")).request.post(`${base}/api/students/promote`, { data: { fromClassId: classes.five, toClassId: classes.sixA, academicYear: 2026, results: [{ studentId: pupils.missing1, outcome: "PASS" }] } });
  assert.equal(legacy.status(), 409, "one-step promotion is retired");
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: pupils.missing1 } })).classId, classes.five);
  assert.equal((await (await context("teacher")).request.get(`${base}/api/academic/rollover?campusId=${campusId}`)).status(), 403);

  const prepared = await post({ action: "prepare", sourceYear: 2026, effectiveDate: yesterday });
  assert.equal(prepared.status(), 200, await prepared.text());
  planId = (await prepared.json()).data.planId;
  assert.equal((await (await post({ action: "prepare", sourceYear: 2026, effectiveDate: yesterday })).json()).data.added, 0, "preparing again adds nobody twice");
  const data = await view();
  assert.equal(data.readiness.canClose, true);
  assert.equal(data.learners.length, 6);
  assert.equal(new Set(data.learners.map((l: { studentId: string }) => l.studentId)).size, 6, "each learner appears once");
  assert.deepEqual([learner(data, "pass1").evidence, learner(data, "pass1").decision], ["PASSED", "PROMOTE"]);
  assert.deepEqual([learner(data, "fail1").evidence, learner(data, "fail1").decision], ["FAILED", "RETAIN"]);
  assert.deepEqual([learner(data, "missing1").evidence, learner(data, "missing1").decision], ["MISSING", "NEEDS_REVIEW"], "missing results are never a pass or a fail");
  assert.ok(learner(data, "missing1").issues.includes("Results are missing; choose a decision"));
  assert.ok(learner(data, "pass1").issues.includes("Choose a destination class"));
  const refused = await post({ action: "approve", planId, version: data.plan.version });
  assert.equal(refused.status(), 409);
  assert.match((await refused.json()).error, /1 learner\(s\) need a decision/);
});

test("the review shows learners needing attention", async () => {
  const page = await (await context("admin")).newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin?view=promote-archive`);
  const panel = page.locator("[data-rollover]");
  await panel.locator(`[data-learner="${pupils.missing1}"]`).waitFor({ timeout: 30_000 });
  assert.match(await panel.locator("[data-plan-bar]").innerText(), /1 learners need a decision before this plan can be approved/);
  assert.equal(await panel.getByRole("button", { name: /Approve version/ }).isDisabled(), true);
  await panel.locator(`[data-learner="${pupils.missing1}"]`).scrollIntoViewIfNeeded();
  await shot(page, "rollover-review-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});

test("approval binds to the exact version and any edit withdraws it", async () => {
  let data = await view();
  for (const [source, promote, retain] of [[classes.five, classes.sixA, classes.five27], [classes.ten, null, null]]) {
    data = await view();
    assert.equal((await post({ action: "map", planId, version: data.plan.version, sourceClassId: source, promote, retain })).status(), 200);
  }
  data = await view();
  const noReason = await post({ action: "decide", planId, version: data.plan.version, rows: [{ studentId: pupils.missing1, decision: "RETAIN" }] });
  assert.equal(noReason.status(), 200);
  assert.ok(learner(await view(), "missing1").issues.includes("Give a reason for this decision"), "a decision over missing evidence needs a reason");
  data = await view();
  assert.equal((await post({ action: "decide", planId, version: data.plan.version, rows: [
    { studentId: pupils.missing1, decision: "RETAIN", reason: "Long medical absence; results were never sat" },
    { studentId: pupils.grad1, decision: "GRADUATE", reason: "Completed the final year" },
  ] })).status(), 200);
  data = await view();
  assert.equal(data.withIssues, 0, JSON.stringify(data.learners.filter((l: { issues: string[] }) => l.issues.length)));
  assert.equal((await post({ action: "approve", planId, version: data.plan.version - 1 })).status(), 409, "a stale version cannot be approved");
  assert.equal((await post({ action: "approve", planId, version: data.plan.version })).status(), 200);
  const approved = data.plan.version;
  data = await view();
  assert.deepEqual([data.plan.status, data.plan.approvalCurrent], ["APPROVED", true]);
  assert.equal((await post({ action: "decide", planId, version: approved, rows: [{ studentId: pupils.fail1, decision: "RETAIN", reason: "Confirmed with the family" }] })).status(), 200);
  data = await view();
  assert.deepEqual([data.plan.status, data.plan.version, data.plan.approvalCurrent], ["DRAFT", approved + 1, false]);
  assert.ok(data.events.some((e: { detail: Record<string, unknown> | null }) => e.detail?.approvalWithdrawn), "the history records that approval was withdrawn");
  assert.equal((await post({ action: "execute", planId, version: approved })).status(), 409, "the old approval cannot run");
  assert.equal((await post({ action: "approve", planId, version: data.plan.version })).status(), 200);
});

test("batches are bounded and resumable, capacity is rechecked per learner and retries never duplicate", async () => {
  let data = await view();
  assert.equal((await post({ action: "capacity", classId: classes.sixA, capacity: 3 })).status(), 200);
  const first = await post({ action: "execute", planId, version: data.plan.version, limit: 2 });
  assert.equal(first.status(), 200, await first.text());
  assert.deepEqual([(await first.json()).data.done, (await first.json()).data.status], [2, "PAUSED"]);
  // Capacity drops while the plan is paused: the resumed batch must notice.
  assert.equal((await post({ action: "capacity", classId: classes.sixA, capacity: 2 })).status(), 200);
  const resumed = await Promise.all([post({ action: "execute", planId, version: data.plan.version }), post({ action: "execute", planId, version: data.plan.version })]);
  assert.deepEqual(resumed.map(r => r.status()).sort(), [200, 409], "only one executor holds the lease");
  data = await view();
  assert.equal(data.plan.status, "EXCEPTIONS");
  assert.equal(learner(data, "pass3").executionStatus, "BLOCKED");
  assert.match(String(learner(data, "pass3").executionNote), /Six - A is full \(2 of 2\)/);
  assert.equal(data.reconciliation.clean, false);
  for (const key of Object.keys(pupils)) {
    const open = await db.studentEnrollment.count({ where: { studentId: pupils[key], status: "ACTIVE", endDate: null } });
    assert.equal(open, key === "grad1" ? 0 : 1, `${key} has exactly one current enrollment`);
  }
  assert.equal(await db.studentEnrollment.count({ where: { studentId: pupils.pass1, academicYear: 2027 } }), 1);

  assert.equal((await post({ action: "decide", planId, version: data.plan.version, rows: [{ studentId: pupils.pass3, decision: "PROMOTE", destinationClassId: classes.sixB }] })).status(), 200);
  data = await view();
  assert.equal((await post({ action: "approve", planId, version: data.plan.version })).status(), 200);
  const last = await post({ action: "execute", planId, version: data.plan.version });
  assert.equal((await last.json()).data.status, "COMPLETED");
  data = await view();
  assert.deepEqual([data.reconciliation.accounted, data.reconciliation.learners, data.reconciliation.clean], [6, 6, true]);
  assert.deepEqual(data.reconciliation.now.balances, data.reconciliation.baseline.balances, "balances reconcile by currency");
  assert.deepEqual(data.reconciliation.baseline.balances.map((b: { currency: string }) => b.currency), ["PKR", "USD"], "currencies are never summed together");
  assert.deepEqual(data.reconciliation.now.history, data.reconciliation.baseline.history, "prior-year records stay attached");
  assert.equal((await post({ action: "execute", planId, version: data.plan.version })).status(), 409, "a completed plan does not run again");
  assert.equal(await db.studentEnrollment.count({ where: { studentId: { in: Object.values(pupils) }, academicYear: 2027 } }), 5);
  const pass1 = await db.student.findUniqueOrThrow({ where: { id: pupils.pass1 } });
  assert.deepEqual([pass1.classId, pass1.rollNo], [classes.sixA, "SIX-A-001"]);
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: pupils.fail1 } })).classId, classes.five27, "retained learners repeat in the destination year");
  assert.equal((await db.studentEnrollment.findFirstOrThrow({ where: { studentId: pupils.grad1, academicYear: 2026 } })).status, "GRADUATED");
  const report = await db.reportCard.findFirstOrThrow({ where: { studentId: pupils.pass1 } });
  assert.equal((await db.studentEnrollment.findUniqueOrThrow({ where: { id: report.enrollmentId! } })).classId, classes.five, "last year's report keeps its class");
  assert.equal((await db.studentClassHistory.findFirstOrThrow({ where: { studentId: pupils.pass1, academicYear: 2026 } })).status, "PROMOTED");
  let notices = 0;
  for (let i = 0; i < 20 && !notices; i++) { notices = await db.notification.count({ where: { userId: users.get("admin-ar")!.id, title: "Students promoted" } }); if (!notices) await new Promise(r => setTimeout(r, 250)); }
  assert.equal(notices, 1, "completion is announced once to the other campus managers (never to the actor)");
});

test("a correction is recorded, and refused once the new placement has its own records", async () => {
  await db.invoice.create({ data: { schoolId, campusId, studentId: pupils.pass2, invoiceDate: new Date(`${today}T00:00:00Z`), dueDate: new Date(`${day(30)}T00:00:00Z`), currency: "PKR", invoiceNumber: `ROLL-${schoolId.slice(-6)}-3`, monthlyFee: 1000, subtotal: 1000, totalAmount: 1000, balanceDue: 1000 } });
  const unsafe = await post({ action: "reverse", planId, studentId: pupils.pass2, reason: "Placed in the wrong section", effectiveDate: today });
  assert.equal(unsafe.status(), 409);
  assert.match((await unsafe.json()).error, /Unsafe to undo: the new placement already has 0 attendance, 1 invoice/);
  const ok = await post({ action: "reverse", planId, studentId: pupils.pass1, reason: "Family asked to repeat after appeal", effectiveDate: today });
  assert.equal(ok.status(), 200, await ok.text());
  const pass1 = await db.student.findUniqueOrThrow({ where: { id: pupils.pass1 } });
  assert.deepEqual([pass1.classId, pass1.rollNo], [classes.five, "JUN-1"]);
  assert.equal(await db.studentEnrollment.count({ where: { studentId: pupils.pass1 } }), 3, "the correction adds a period; nothing is deleted");
  const data = await view();
  assert.equal(learner(data, "pass1").executionStatus, "REVERSED");
  assert.ok(data.events.some((e: { kind: string }) => e.kind === "CORRECTED"));
});

test("the reconciliation is shown in English and right-to-left Arabic at phone width", async () => {
  const page = await (await context("admin")).newPage();
  await page.goto(`${base}/admin?view=promote-archive`);
  await page.locator("[data-reconciliation]").waitFor({ timeout: 30_000 });
  assert.match(await page.locator("[data-accounted]").innerText(), /All 6 learners are accounted for/);
  await page.locator("[data-reconciliation]").scrollIntoViewIfNeeded();
  await shot(page, "rollover-reconciliation-en-1440");
  await page.close();
  const ar = await (await context("admin-ar", { width: 390, height: 844 })).newPage();
  await ar.goto(`${base}/admin?view=promote-archive`);
  await ar.waitForLoadState("networkidle");
  if (!ar.url().includes("view=promote-archive")) await ar.goto(`${base}/admin?view=promote-archive`);
  await ar.locator("[data-rollover] [data-plan-bar]").waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await ar.locator("[data-destination-year]").innerText(), /سنة الوجهة/);
  assert.equal(await ar.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(ar, "rollover-ar-390");
  await ar.close();
});
