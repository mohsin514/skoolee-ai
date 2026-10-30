import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-417 on the isolated app: the queue is derived from source conditions (missing attendance, pending
// leave, unapproved report versions, failed family messages, ownerless or late complaints); every item
// names its trigger, owner and next action; assignment and snooze are recorded with history and never
// close an item; fixing the source closes it; campus and role limits apply; the order is explained.
// role-ux §7.5 G39: kinds follow seats. The principal (academic lead) gets report approvals, teacher leave, missing
// attendance and learning-action check-ins; the campus admin (campus operations) gets complaints, failed family
// messages, fee adjustments, payment corrections and leave for everyone who is not a teacher. QueueItemState is per
// campus, so one seat loading its slice never settles the other seat's items.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.QUEUE_TEST_APP || "http://localhost:3107";
const evidence = process.env.QUEUE_EVIDENCE_DIR || "/tmp/sko417-evidence";
const db = new PrismaClient(), password = "SyntheticQueue417!";
const schoolId = `queue417-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID(), studentId = randomUUID(), examId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, leaveId = "", officeLeaveId = "", complaintId = "", messageId = "";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const schoolDay = new Date(`${today}T12:00:00Z`).getUTCDay() !== 0;

async function user(key: string, role: string, campus = campusId, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, welcomeCompletedAt: new Date(), tourProgress: { principal: { v: 1, s: "done", at: new Date().toISOString() } }, preferredLanguage: language } });
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
const api = `${base}/api/principal/queue`;
const queue = async (key = "principal") => (await (await (await context(key)).request.get(`${api}?campusId=${campusId}`)).json()).data;
const typesOf = (data: { items: { type: string }[] }) => data.items.map(item => item.type);
const act = async (body: Record<string, unknown>, key = "principal") => (await context(key)).request.post(api, { data: { campusId, ...body } });
const shot = async (page: Page, name: string) => { await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" }); await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Oak Queue School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO", registrationKind: "GROUP" } });
  for (const [id, name] of [[campusId, "Oak Main"], [otherCampusId, "Oak East"]]) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Karachi" } });
  const principal = await user("principal", "PRINCIPAL"); await user("principal-ar", "PRINCIPAL", campusId, "ar");
  const teacher = await user("teacher", "TEACHER"); const coordinator = await user("coordinator", "TEACHER"); await user("other", "CAMPUS_ADMIN", otherCampusId);
  await user("campus", "CAMPUS_ADMIN"); const receptionist = await user("receptionist", "RECEPTIONIST");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi", currency: "PKR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: principal, financeReviewedBy: principal } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Six", academicYear: 2026, classTeacherId: teacher } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic Pupil Oak", rollNo: "Q-1", gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
  const leaveType = await db.leaveType.create({ data: { schoolId, campusId, name: "Casual" } });
  leaveId = (await db.leaveRequest.create({ data: { schoolId, campusId, userId: coordinator, leaveTypeId: leaveType.id, fromDate: new Date(Date.now() + 3 * 86_400_000), toDate: new Date(Date.now() + 4 * 86_400_000), days: 20 } })).id;
  officeLeaveId = (await db.leaveRequest.create({ data: { schoolId, campusId, userId: receptionist, leaveTypeId: leaveType.id, fromDate: new Date(Date.now() + 5 * 86_400_000), toDate: new Date(Date.now() + 6 * 86_400_000), days: 2 } })).id;
  await db.exam.create({ data: { id: examId, schoolId, campusId, classId, title: "Synthetic Midterm", term: "Term 1", academicYear: 2026, status: "PUBLISHED", isLocked: true } });
  const reportId = randomUUID(), versionId = randomUUID();
  await db.reportCard.create({ data: { id: reportId, schoolId, campusId, examId, studentId, status: "GENERATED" } });
  await db.reportVersion.create({ data: { id: versionId, schoolId, reportCardId: reportId, number: 1, contentHash: "synthetic", documentIdentity: randomUUID(), snapshot: {}, blockers: [], changedSections: [] } });
  await db.reportCard.update({ where: { id: reportId }, data: { currentVersionId: versionId } });
  messageId = (await db.parentCommunication.create({ data: { schoolId, campusId, studentId, templateKey: "fee_reminder", channel: "SMS", recipientName: "Synthetic Guardian", recipient: "+920000000000", body: "Synthetic", status: "FAILED", failedReason: "Synthetic provider error", createdAt: new Date(Date.now() - 3 * 86_400_000) } })).id;
  complaintId = (await db.complaint.create({ data: { schoolId, campusId, complainantName: "Anonymous", type: "Safeguarding", description: "Synthetic confidential narrative SECRET-NARRATIVE", date: new Date(Date.now() - 5 * 86_400_000), confidential: true, referenceCode: "CMP-0QUEUE01" } })).id;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("each source condition is one item with its trigger, owner, next action and an explained order", async () => {
  const data = await queue();
  assert.deepEqual(data.failedSources, [], "every source feed loads");
  const types = typesOf(data);
  for (const type of ["LEAVE_PENDING", "REPORT_APPROVAL"]) assert.ok(types.includes(type), type);
  if (schoolDay) {
    const attendance = data.items.find((item: { type: string }) => item.type === "ATTENDANCE_MISSING");
    assert.deepEqual([attendance.sourceOwner.name, attendance.link], ["Synthetic teacher", "/principal?view=attendance"]);
  }
  const report = data.items.find((item: { type: string }) => item.type === "REPORT_APPROVAL");
  assert.equal(report.title, "1 report version(s) still need approval");
  assert.match(data.sortingRule, /No pupil risk score/);
  assert.equal(new Set(data.items.map((item: { key: string }) => item.key)).size, data.items.length, "no duplicate items");
  assert.equal((await queue()).items.length, data.items.length, "a second check does not add items");
  // Overdue first, then the published category order.
  const overdueFlags = data.items.map((item: { overdue: boolean }) => item.overdue);
  assert.deepEqual(overdueFlags, [...overdueFlags].sort((a, b) => Number(b) - Number(a)));
});

test("kinds follow seats: the principal holds the academic items, the campus admin the operations items (G39)", async () => {
  const principal = await queue("principal");
  const principalKeys = principal.items.map((item: { key: string }) => item.key);
  for (const type of ["COMPLAINT", "DELIVERY_FAILED", "ADJUSTMENT_APPROVAL"]) assert.equal(typesOf(principal).includes(type), false, `principal: no ${type}`);
  assert.ok(principalKeys.includes(`LEAVE_PENDING:${leaveId}`), "teacher leave goes to the academic lead");
  assert.equal(principalKeys.includes(`LEAVE_PENDING:${officeLeaveId}`), false, "office staff leave goes to the campus admin");

  const campus = await queue("campus");
  assert.deepEqual(campus.failedSources, []);
  const campusKeys = campus.items.map((item: { key: string }) => item.key);
  for (const type of ["COMPLAINT", "DELIVERY_FAILED"]) assert.ok(typesOf(campus).includes(type), `campus admin: ${type}`);
  for (const type of ["REPORT_APPROVAL", "ATTENDANCE_MISSING", "SUPPORT_CHECKIN"]) assert.equal(typesOf(campus).includes(type), false, `campus admin with a principal: no ${type}`);
  assert.ok(campusKeys.includes(`LEAVE_PENDING:${officeLeaveId}`));
  assert.equal(campusKeys.includes(`LEAVE_PENDING:${leaveId}`), false);
  const complaint = campus.items.find((item: { type: string }) => item.type === "COMPLAINT");
  assert.equal(complaint.title, "Confidential concern CMP-0QUEUE01 has no owner");
  assert.equal(complaint.link, "/admin?view=front-desk&tab=complaints");
  assert.equal(campus.items.find((item: { type: string }) => item.type === "DELIVERY_FAILED").link, "/admin?view=communications");
  assert.equal(JSON.stringify(campus).includes("SECRET-NARRATIVE"), false, "no confidential narrative");
  assert.equal(JSON.stringify(campus).includes("Safeguarding"), false, "no confidential category");
  assert.equal(JSON.stringify(principal).includes("CMP-0QUEUE01"), false, "the principal never reads complaint items, active or resolved");
});

test("one seat's load never settles the other seat's items (QueueItemState is per campus)", async () => {
  const complaintKey = `COMPLAINT:${complaintId}`, reportKey = `REPORT_APPROVAL:${examId}`;
  assert.equal((await act({ action: "acknowledge", keys: [complaintKey] }, "campus")).status(), 200);
  assert.equal((await act({ action: "acknowledge", keys: [reportKey] }, "principal")).status(), 200);
  for (let round = 0; round < 2; round++) { await queue("principal"); await queue("campus"); }
  const states = await db.queueItemState.findMany({ where: { schoolId, campusId, itemKey: { in: [complaintKey, reportKey] } } });
  assert.equal(states.length, 2);
  assert.ok(states.every(state => state.resolvedAt === null), "neither item was settled by the other seat's load");
  assert.equal(await db.queueItemEvent.count({ where: { schoolId, campusId, itemKey: { in: [complaintKey, reportKey] }, kind: "RESOLVED" } }), 0, "no false RESOLVED history");
  const foreign = await act({ action: "assign", keys: [complaintKey], assigneeId: users.get("teacher")!.id }, "principal");
  assert.equal(foreign.status(), 200);
  assert.deepEqual((await foreign.json()).data.map((o: { outcome: string }) => o.outcome), ["resolved"], "the principal cannot act on a campus-operations item");
  assert.equal((await db.queueItemState.findFirstOrThrow({ where: { campusId, itemKey: complaintKey } })).assigneeId, null, "nothing changed");
});

test("assignment is idempotent with per-item outcomes and history; acknowledgement does not resolve", async () => {
  const key = `LEAVE_PENDING:${leaveId}`;
  const first = await (await act({ action: "assign", keys: [key, "LEAVE_PENDING:stale-item"], assigneeId: users.get("coordinator")!.id })).json();
  assert.deepEqual(first.data.map((o: { outcome: string }) => o.outcome), ["updated", "resolved"]);
  const again = await (await act({ action: "assign", keys: [key], assigneeId: users.get("coordinator")!.id })).json();
  assert.deepEqual(again.data.map((o: { outcome: string }) => o.outcome), ["unchanged"]);
  assert.equal((await act({ action: "assign", keys: [key], assigneeId: users.get("other")!.id })).status(), 400, "another campus's staff cannot be assigned");
  await act({ action: "acknowledge", keys: [key] });
  const item = (await queue()).items.find((i: { key: string }) => i.key === key);
  assert.deepEqual([item.assignee.name, Boolean(item.acknowledgedAt)], ["Synthetic coordinator", true]);
  const history = (await (await (await context("principal")).request.get(`${api}?campusId=${campusId}&history=${encodeURIComponent(key)}`)).json()).data;
  assert.deepEqual(history.map((e: { kind: string }) => e.kind), ["ASSIGNED", "ACKNOWLEDGED"]);
});

test("snooze needs a reason and a return time; overdue items stay discoverable", async () => {
  const key = `DELIVERY_FAILED:${messageId}`;
  assert.equal((await act({ action: "snooze", keys: [key], until: new Date(Date.now() + 86_400_000).toISOString() }, "campus")).status(), 400);
  assert.equal((await act({ action: "snooze", keys: [key], reason: "Synthetic waiting for new number", until: new Date(Date.now() - 60_000).toISOString() }, "campus")).status(), 400);
  assert.equal((await act({ action: "snooze", keys: [key], reason: "Synthetic waiting for new number", until: new Date(Date.now() + 86_400_000).toISOString() }, "campus")).status(), 200);
  const data = await queue("campus");
  const item = data.items.find((i: { key: string }) => i.key === key);
  assert.deepEqual([item.snoozed, item.overdue], [true, true], "the failed message is overdue and still listed");
  assert.equal(data.counts.snoozed, 1);
  assert.ok(data.counts.overdue >= 1);
});

test("fixing the source closes the item and keeps it in resolved history", async () => {
  const principal = await context("principal");
  const review = await principal.request.patch(`${base}/api/leave/review`, { data: { id: leaveId, status: "APPROVED", override: true } });
  assert.equal(review.status(), 200, await review.text());
  await db.parentCommunication.update({ where: { id: messageId }, data: { status: "DELIVERED" } });
  if (schoolDay) await db.attendance.create({ data: { schoolId, campusId, classId, studentId, date: new Date(`${today}T00:00:00.000Z`), status: "PRESENT" } });
  const data = await queue();
  const keys = data.items.map((i: { key: string }) => i.key);
  assert.equal(keys.includes(`LEAVE_PENDING:${leaveId}`), false);
  // The failed message was the campus admin's item; whichever seat loads next settles it, and only that seat reads it.
  const campus = await queue("campus");
  assert.equal(campus.items.some((i: { key: string }) => i.key === `DELIVERY_FAILED:${messageId}`), false);
  assert.ok(campus.resolved.some((r: { key: string }) => r.key === `DELIVERY_FAILED:${messageId}`));
  assert.equal(data.resolved.some((r: { key: string }) => r.key === `DELIVERY_FAILED:${messageId}`), false, "the principal's resolved history follows its seat");
  if (schoolDay) assert.equal(keys.some((k: string) => k.startsWith("ATTENDANCE_MISSING")), false);
  assert.ok(data.resolved.some((r: { key: string }) => r.key === `LEAVE_PENDING:${leaveId}`));
  const history = (await (await principal.request.get(`${api}?campusId=${campusId}&history=${encodeURIComponent(`LEAVE_PENDING:${leaveId}`)}`)).json()).data;
  assert.equal(history.at(-1).kind, "RESOLVED");
  assert.deepEqual((await (await act({ action: "acknowledge", keys: [`LEAVE_PENDING:${leaveId}`] })).json()).data.map((o: { outcome: string }) => o.outcome), ["resolved"], "a resolved item cannot be acted on");
});

test("teachers and other campuses cannot see the queue", async () => {
  assert.equal((await (await context("teacher")).request.get(`${api}?campusId=${campusId}`)).status(), 403);
  assert.equal((await (await context("other")).request.get(`${api}?campusId=${campusId}`)).status(), 403);
  const own = (await (await (await context("other")).request.get(api)).json()).data;
  assert.equal(JSON.stringify(own).includes("CMP-0QUEUE01"), false);
});

test("the principal sees the queue before the charts and snoozes with a reason", async () => {
  const page = await (await context("principal")).newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/principal`);
  const panel = page.locator("[data-action-queue]");
  await panel.locator("[data-queue-item]").first().waitFor({ timeout: 30_000 });
  assert.equal(await panel.locator('[data-queue-type="COMPLAINT"]').count(), 0, "complaints are the campus admin's (G39)");
  await panel.getByRole("button", { name: "Live" }).click();
  assert.match(await panel.innerText(), /Live: re-checks every 2 minutes/);
  await shot(page, "queue-principal-en-1440");
  const report = panel.locator('[data-queue-type="REPORT_APPROVAL"]');
  // §4.5.2: one inline action per row; Snooze sits in the row's overflow menu.
  await report.locator("[data-row-menu]").click();
  await page.getByRole("menuitem", { name: "Snooze", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Snooze" }).click();
  await dialog.getByRole("alert").waitFor();
  await dialog.getByLabel("Reason").fill("Synthetic: approving after the moderation meeting");
  await shot(page, "queue-snooze-en-1440");
  await dialog.getByRole("button", { name: "Snooze" }).click();
  await panel.locator('[data-queue-type="REPORT_APPROVAL"]').waitFor({ state: "detached", timeout: 15_000 });
  await panel.getByLabel("Show snoozed items").check();
  await panel.locator('[data-queue-type="REPORT_APPROVAL"][data-snoozed="true"]').waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test("Arabic principal reads the queue right-to-left at phone width", async () => {
  const page = await (await context("principal-ar", { width: 390, height: 844 })).newPage();
  await page.goto(`${base}/principal`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator("[data-action-queue] [data-queue-item]").first().waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await page.locator("#action-queue-title").innerText(), /بانتظارك/); // §8.2: "Action queue" → "Waiting on you"
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await page.locator("[data-action-queue]").scrollIntoViewIfNeeded();
  await shot(page, "queue-principal-ar-390");
  await page.close();
});
