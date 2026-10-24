import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-448 on the isolated app with synthetic data: offline marks carry a stable operation id, capture time and base
// version; replays and restarts apply each once; a newer office entry is a conflict shown beside the local value and
// decided explicitly; revoked access is refused and queued for a leader; another account can neither replay nor see
// a teacher's changes; old or future captures are refused; the device keeps pending work per account and sign-out
// warns before clearing it.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.OFFLINE_TEST_APP || "http://localhost:3107";
const evidence = process.env.OFFLINE_EVIDENCE_DIR || "/tmp/sko448-evidence";
const TZ = "Asia/Karachi";
const db = new PrismaClient(), password = "SyntheticOffline448!";
const schoolId = `off448-${randomUUID()}`, campusId = randomUUID(), classA = randomUUID(), classB = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils: Record<string, string> = {}, ids: Record<string, string> = {};
let browser: Browser;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
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
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string } = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const op = (studentId: string, status: string, baseV: { status: string | null; version: number } = { status: null, version: 0 }, extra: Record<string, unknown> = {}) => ({ operationId: randomUUID(), kind: "ATTENDANCE_MARK", classId: classA, date: today, studentId, capturedAt: new Date().toISOString(), base: baseV, payload: { status, ...(status === "LATE" ? { arrivalTime: "08:20" } : {}) }, ...extra });
const sync = (key: string, operations: unknown[]) => call(key, "post", "/api/offline", { action: "sync", deviceId: "synthetic-device-0001", operations });
const row = (studentId: string) => db.attendance.findFirst({ where: { schoolId, studentId, date: new Date(`${today}T00:00:00.000Z`) } });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Offline School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: TZ } as never });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Offline North", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  const teacher = await user("teacher", "TEACHER"); await user("teacher2", "TEACHER"); await user("lead", "PRINCIPAL"); await user("teacher-ar", "TEACHER", "ar");
  await db.class.create({ data: { id: classA, schoolId, campusId, name: "Grade 4", section: "A", academicYear: 2026, classTeacherId: teacher } });
  await db.class.create({ data: { id: classB, schoolId, campusId, name: "Grade 4", section: "B", academicYear: 2026, classTeacherId: users.get("teacher-ar")!.id } });
  for (const [k, name, roll] of [["zain", "Synthetic Zain Ahmed", "401"], ["amna", "Synthetic Amna Tariq", "402"], ["bilal", "Synthetic Bilal Khan", "403"], ["sana", "Synthetic Sana Iqbal", "404"], ["omar", "Synthetic Omar Raza", "405"], ["hira", "Synthetic Hira Malik", "406"], ["ali", "Synthetic Ali Shah", "407"]] as const) {
    const sid = randomUUID(); pupils[k] = sid;
    await db.student.create({ data: { id: sid, schoolId, campusId, classId: classA, fullName: name, rollNo: roll, gender: "OTHER", status: "active", enrollmentDate: new Date("2026-04-01T00:00:00Z") } as never });
  }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  await fetch(`${base}/api/offline?view=capabilities`).catch(() => undefined); // compile the route before timing starts
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("prepare: only an assigned teacher gets a small, expiring register snapshot; capabilities are explicit", async () => {
  const p = await call("teacher", "get", `/api/offline?view=prepare&classId=${classA}&date=${today}`);
  assert.equal(p.status, 200, p.body);
  assert.equal(p.json.data.entries.length, 7);
  assert.deepEqual(Object.keys(p.json.data.entries[0]).sort(), ["arrivalTime", "name", "rollNo", "status", "studentId", "version"], "names, roll numbers and marks only");
  const hours = (new Date(p.json.data.expiresAt).getTime() - Date.now()) / 3_600_000;
  assert.ok(hours > 11 && hours <= 12, "bounded retention");
  assert.equal(p.json.data.owner.userId, users.get("teacher")!.id);
  assert.ok([403, 404].includes((await call("teacher2", "get", `/api/offline?view=prepare&classId=${classA}&date=${today}`)).status), "not their class");
  const caps = await call("teacher", "get", "/api/offline?view=capabilities");
  assert.deepEqual(caps.json.data.offline, ["Mark attendance for a class you prepared on this device"]);
  assert.ok(caps.json.data.onlineOnly.includes("Fees and payments") && caps.json.data.onlineOnly.includes("Pickup"));
});

test("sync applies each operation once: replays and restarts never duplicate", async () => {
  const ops = [op(pupils.zain, "PRESENT"), op(pupils.amna, "ABSENT"), op(pupils.bilal, "LATE")];
  const first = await sync("teacher", ops);
  assert.equal(first.status, 200, first.body);
  assert.deepEqual(first.json.data.outcomes.map((o: { status: string }) => o.status), ["ACCEPTED", "ACCEPTED", "ACCEPTED"]);
  for (let i = 0; i < 2; i++) {
    const again = await sync("teacher", ops);
    assert.ok(again.json.data.outcomes.every((o: { status: string; repeated: boolean }) => o.status === "ACCEPTED" && o.repeated));
  }
  assert.equal(await db.attendance.count({ where: { schoolId, date: new Date(`${today}T00:00:00.000Z`) } }), 3);
  assert.deepEqual([(await row(pupils.zain))!.version, (await row(pupils.bilal))!.arrivalTime], [1, "08:20"], "one logical update each");
  assert.equal(await db.offlineOperation.count({ where: { schoolId } }), 3);
  const recorded = await db.offlineOperation.findFirstOrThrow({ where: { schoolId, studentId: pupils.zain } });
  assert.deepEqual([recorded.baseVersion, recorded.baseStatus, recorded.deviceId, recorded.userId], [0, null, "synthetic-device-0001", users.get("teacher")!.id], "base version, device and owner are recorded");
});

test("a newer office entry is a conflict beside the local value; the teacher decides and both observations stay", async () => {
  // The office records Sana late at 10:05 after the teacher's device was prepared (base version 0).
  const office = await call("lead", "post", "/api/attendance/register", { classId: classA, date: today, entries: [{ studentId: pupils.sana, status: "LATE", knownStatus: null, arrivalTime: "10:05" }] });
  assert.equal(office.status, 200, office.body);
  const c = await sync("teacher", [op(pupils.sana, "ABSENT")]);
  const out = c.json.data.outcomes[0];
  assert.equal(out.status, "CONFLICT");
  assert.deepEqual([out.server.status, out.server.arrivalTime, out.server.markedBy], ["LATE", "10:05", "Synthetic lead"]);
  assert.equal((await row(pupils.sana))!.status, "LATE", "nothing overwritten");
  assert.equal((await call("teacher2", "post", "/api/offline", { action: "resolve", operationId: out.operationId, decision: "KEEP_SERVER" })).status, 404, "only the capturer resolves");
  assert.equal((await call("teacher", "post", "/api/offline", { action: "resolve", operationId: out.operationId, decision: "KEEP_SERVER" })).json.data.status, "RESOLVED_SERVER");
  const kept = await db.offlineOperation.findFirstOrThrow({ where: { schoolId, operationId: out.operationId } });
  assert.deepEqual([(kept.payload as { status: string }).status, (kept.serverValue as { status: string }).status], ["ABSENT", "LATE"], "both observations kept");
  // Omar: office marks present; the teacher reviews and applies theirs.
  await call("lead", "post", "/api/attendance/register", { classId: classA, date: today, entries: [{ studentId: pupils.omar, status: "PRESENT", knownStatus: null }] });
  const c2 = (await sync("teacher", [op(pupils.omar, "ABSENT")])).json.data.outcomes[0];
  assert.equal(c2.status, "CONFLICT");
  // If the office changes it again before the decision, applying is refused.
  await call("lead", "post", "/api/attendance/register", { classId: classA, date: today, entries: [{ studentId: pupils.omar, status: "LEAVE", knownStatus: "PRESENT" }] });
  assert.equal((await call("teacher", "post", "/api/offline", { action: "resolve", operationId: c2.operationId, decision: "APPLY_LOCAL" })).status, 409);
  // Overriding the office's entry needs edit rights a teacher does not have: the authorised path is a correction.
  const omarAgain = (await sync("teacher", [op(pupils.omar, "ABSENT", { status: null, version: 0 })])).json.data.outcomes[0];
  assert.equal(omarAgain.status, "CONFLICT");
  const deny = await call("teacher", "post", "/api/offline", { action: "resolve", operationId: omarAgain.operationId, decision: "APPLY_LOCAL" });
  assert.equal(deny.status, 403, deny.body);
  assert.equal((await row(pupils.omar))!.status, "LEAVE");
  assert.equal((await call("teacher", "post", "/api/offline", { action: "resolve", operationId: omarAgain.operationId, decision: "REQUEST_CORRECTION", note: "Pupil was in class at 09:30" })).json.data.status, "CORRECTION_REQUESTED");
  // The teacher's own mark from another device conflicts with this device's: they may apply theirs.
  await call("teacher", "post", "/api/attendance/register", { classId: classA, date: today, entries: [{ studentId: pupils.hira, status: "PRESENT", knownStatus: null }] });
  const c4 = (await sync("teacher", [op(pupils.hira, "LATE", { status: null, version: 0 })])).json.data.outcomes[0];
  assert.equal(c4.status, "CONFLICT");
  assert.equal((await call("teacher", "post", "/api/offline", { action: "resolve", operationId: c4.operationId, decision: "APPLY_LOCAL" })).json.data.status, "RESOLVED_LOCAL");
  assert.deepEqual([(await row(pupils.hira))!.status, (await row(pupils.hira))!.arrivalTime], ["LATE", "08:20"]);
  assert.ok(await db.attendanceEditHistory.count({ where: { schoolId, attendance: { studentId: pupils.hira } } }) >= 1, "the audit history keeps the change");
});

test("revoked access is refused and queued for a leader; another account can neither replay nor see the change", async () => {
  // teacher2 is assigned to class A, captures offline, then loses the class before reconnecting.
  await db.class.update({ where: { id: classA }, data: { classTeacherId: users.get("teacher2")!.id } });
  const captured = op(pupils.ali, "ABSENT");
  await db.class.update({ where: { id: classA }, data: { classTeacherId: users.get("teacher")!.id } });
  const r = (await sync("teacher2", [captured])).json.data.outcomes[0];
  assert.equal(r.status, "REJECTED_ACCESS");
  assert.equal(await row(pupils.ali), null, "nothing applied");
  // The original teacher replaying teacher2's operation id learns nothing and changes nothing.
  const leak = (await sync("teacher", [captured])).json.data.outcomes[0];
  assert.deepEqual([leak.status, leak.server ?? null], ["INVALID", null]);
  assert.match(leak.message, /another account/);
  assert.equal((await call("teacher", "get", "/api/offline?view=review")).status, 403);
  const queue = await call("lead", "get", "/api/offline?view=review");
  assert.deepEqual(queue.json.data.map((q: { operationId: string; capturedBy: string }) => [q.operationId, q.capturedBy]), [[captured.operationId, "Synthetic teacher2"]]);
  assert.equal((await call("lead", "post", "/api/offline", { action: "review-decide", operationId: captured.operationId, decision: "APPLY" })).status, 200);
  assert.equal((await row(pupils.ali))!.status, "ABSENT", "an authorised reviewer applied it");
  // A revoked session cannot sync at all.
  await db.user.update({ where: { id: users.get("teacher2")!.id }, data: { accessVersion: { increment: 1 } } });
  assert.equal((await sync("teacher2", [op(pupils.ali, "PRESENT")])).status, 401);
});

test("old and future captures are refused rather than applied", async () => {
  const old = (await sync("teacher", [op(pupils.zain, "ABSENT", { status: "PRESENT", version: 1 }, { capturedAt: new Date(Date.now() - 4 * 86_400_000).toISOString() })])).json.data.outcomes[0];
  assert.equal(old.status, "EXPIRED");
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const future = (await sync("teacher", [{ ...op(pupils.zain, "ABSENT", { status: "PRESENT", version: 1 }), date: tomorrow }])).json.data.outcomes[0];
  assert.equal(future.status, "EXPIRED");
  assert.equal((await row(pupils.zain))!.status, "PRESENT");
});

test("screens: device-only saves survive a restart, sync once, conflicts in context, sign-out warning, Arabic and phone", async () => {
  // A fresh class B register for the Arabic-language teacher on a phone.
  const ctx = await context("teacher-ar", { width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${base}/teacher/attendance?tab=offline`);
  await page.locator("[data-offline-register]").waitFor();
  await page.locator("[data-offline-class]").selectOption(classB);
  const bPupil = randomUUID();
  await db.student.create({ data: { id: bPupil, schoolId, campusId, classId: classB, fullName: "Synthetic Noor Fatima", rollNo: "451", gender: "OTHER", status: "active", enrollmentDate: new Date("2026-04-01T00:00:00Z") } as never });
  await page.locator("[data-offline-prepare]").click();
  await page.locator(`[data-offline-row="${bPupil}"]`).waitFor();
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.locator(`[data-offline-row="${bPupil}"] [data-offline-mark="ABSENT"]`).click();
  await page.locator(`[data-offline-row="${bPupil}"][data-offline-state="LOCAL"]`).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(page, "01-saved-on-device-ar-phone");
  assert.equal(await row(bPupil), null, "not recorded until the server accepts it");
  await page.close();
  // "Restart": a new page while the sync endpoint is still unreachable shows the same pending change.
  await ctx.setOffline(false);
  const again = await ctx.newPage();
  await again.route("**/api/offline", r => r.request().method() === "POST" ? r.abort() : r.continue());
  await again.goto(`${base}/teacher/attendance?tab=offline`);
  await again.locator("[data-offline-class]").selectOption(classB);
  await again.locator(`[data-offline-row="${bPupil}"][data-offline-state="LOCAL"]`).waitFor();
  assert.equal(await again.locator("[data-offline-pending]").getAttribute("data-offline-pending"), "1");
  await again.unroute("**/api/offline");
  await again.locator("[data-offline-sync]").click();
  await again.locator(`[data-offline-row="${bPupil}"][data-offline-state="ACCEPTED"]`).waitFor();
  await again.reload();
  await again.waitForTimeout(1500);
  assert.equal(await db.offlineOperation.count({ where: { schoolId, studentId: bPupil } }), 1, "accepted once across restarts");
  assert.equal((await row(bPupil))!.status, "ABSENT");
  await again.close();
  // Conflict in context on desktop for the English teacher.
  const t = await (await context("teacher")).newPage();
  await t.goto(`${base}/teacher/attendance?tab=offline`);
  await t.locator("[data-offline-prepare]").click();
  await t.locator(`[data-offline-row="${pupils.zain}"]`).waitFor();
  await call("lead", "post", "/api/attendance/register", { classId: classA, date: today, entries: [{ studentId: pupils.zain, status: "LATE", knownStatus: "PRESENT", arrivalTime: "10:05" }] });
  await t.locator(`[data-offline-row="${pupils.zain}"] [data-offline-mark="ABSENT"]`).click();
  await t.locator("[data-offline-sync]").click();
  await t.locator(`[data-offline-conflict="${pupils.zain}"]`).click();
  await t.locator("[data-offline-resolve]").waitFor();
  assert.match(await t.locator("[data-offline-server]").innerText(), /10:05/);
  await shot(t, "02-conflict-review");
  await t.locator("[data-offline-keep]").click();
  await t.locator("[data-offline-resolve]").waitFor({ state: "detached" });
  // Sign-out with unsynced work: the shared ConfirmAction (an alertdialog, not a browser dialog) warns, and
  // "Keep editing" keeps the session.
  await t.locator(`[data-offline-row="${pupils.amna}"] [data-offline-mark="PRESENT"]`).click();
  await t.route("**/api/offline", r => r.abort());
  const warning = t.getByRole("alertdialog", { name: "Sign out with unsynced changes?" });
  await t.getByRole("button", { name: "Account menu" }).first().click();
  await t.getByRole("menuitem", { name: "Sign out" }).click();
  await warning.waitFor();
  assert.match(await warning.innerText(), /1 changes on this device are not synced yet/, "sign-out warns about unsynced work");
  await shot(t, "03-pending-before-sign-out");
  await warning.getByRole("button", { name: "Keep editing", exact: true }).click();
  await warning.waitFor({ state: "detached" });
  assert.equal(new URL(t.url()).pathname, "/teacher/attendance", "keeping editing keeps the session");
  assert.notEqual(await t.evaluate(() => localStorage.getItem("sk-offline-v1")), null, "the device copy stays until sign-out is confirmed");
  // Confirming follows the shared-device policy: the device copy is removed.
  if (!(await t.locator('[role="menu"]').count())) await t.getByRole("button", { name: "Account menu" }).first().click();
  await t.getByRole("menuitem", { name: "Sign out" }).click();
  await warning.waitFor();
  await warning.getByRole("button", { name: "Sign out", exact: true }).click();
  await t.waitForURL(/\/login/);
  assert.equal(await t.evaluate(() => localStorage.getItem("sk-offline-v1")), null, "offline registers and unsynced marks cleared on sign-out");
  await t.close();
});
