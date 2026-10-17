import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-419 on the isolated app with synthetic families: one inbox across siblings at two campuses, each child
// under its own permissions; every item names the child and school; reading never completes; a co-guardian's
// answer shows as completed by another guardian and blocks a duplicate; the school's request for detail,
// the reply and the decision flow back; past-window items are expired, not overdue; a single-child link
// stays single-child.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.INBOX_TEST_APP || "http://localhost:3107";
const evidence = process.env.INBOX_EVIDENCE_DIR || "/tmp/sko419-evidence";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "/4XXCUlbpg5LxjwQcplP8JDypkNOSzUC7IShVucMoMU=");
const db = new PrismaClient(), password = "SyntheticInbox419!";
const schoolId = `inbox419-${randomUUID()}`, north = randomUUID(), south = randomUUID(), classN = randomUUID(), classS = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, campus = north, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret: mfa } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (mfa) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(mfa.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
type Item = { id: string; kind: string; state: string; childId: string; childName: string; schoolName: string; campusName: string; overdue: boolean; completedByOther: boolean; title: string };
type Inbox = { children: { id: string }[]; counts: { action: number }; items: Item[] };
const inbox = async (ctx: BrowserContext, query = "") => { const r = await ctx.request.get(`${base}/api/parent/inbox${query}`); return { status: r.status(), data: (await r.json()).data as Inbox }; };
const daysAgo = (n: number) => new Date(`${new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`);
const relate = async (studentId: string, guardianKey: string, campus: string, permissions: Record<string, boolean>) => {
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId: campus, studentId, guardianUserId: users.get(guardianKey)!.id, createdByUserId: users.get("lead")!.id, fullName: `Synthetic ${guardianKey}`, email: users.get(guardianKey)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: users.get("lead")!.id, reason: "Synthetic inbox fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: false, attendance: false, finances: false, communication: false, pickup: false, ...permissions } } });
  return relationship.id;
};

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Crescent School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[north, "Crescent North"], [south, "Crescent South"]]) {
    await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Lahore" } });
    await db.academicCycle.create({ data: { schoolId, campusId: id, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  }
  await user("lead", "PRINCIPAL"); await user("parent", "PARENT"); await user("coparent", "PARENT"); await user("otherParent", "PARENT"); await user("parent-ar", "PARENT", north, "ar");
  await db.class.create({ data: { id: classN, schoolId, campusId: north, name: "Grade 4", section: "A", academicYear: 2026 } });
  await db.class.create({ data: { id: classS, schoolId, campusId: south, name: "Grade 2", section: "B", academicYear: 2026 } });
  const pupil = async (key: string, name: string, campus: string, classId: string) => { ids[key] = randomUUID(); await db.student.create({ data: { id: ids[key], schoolId, campusId: campus, classId, fullName: name, rollNo: key, gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); };
  await pupil("ali", "Synthetic Ali Raza", north, classN); await pupil("zoya", "Synthetic Zoya Raza", south, classS); await pupil("omar", "Synthetic Omar Khan", north, classN);
  ids.relAli = await relate(ids.ali, "parent", north, { attendance: true, finances: true, learningRecords: true });
  ids.relZoya = await relate(ids.zoya, "parent", south, { attendance: true });
  await relate(ids.ali, "coparent", north, { attendance: true });
  await relate(ids.omar, "otherParent", north, { attendance: true, finances: true });
  await relate(ids.ali, "parent-ar", north, { attendance: true, finances: true });
  const absent = async (key: string, studentId: string, campus: string, classId: string, ago: number) => { ids[key] = (await db.attendance.create({ data: { schoolId, campusId: campus, classId, studentId, date: daysAgo(ago), status: "ABSENT" } })).id; };
  await absent("aliRecent", ids.ali, north, classN, 3); await absent("aliOld", ids.ali, north, classN, 20); await absent("zoyaRecent", ids.zoya, south, classS, 2); await absent("omarRecent", ids.omar, north, classN, 1);
  const invoice = async (key: string, studentId: string, campus: string, due: Date, balance: number, status: string) => { ids[key] = (await db.invoice.create({ data: { schoolId, campusId: campus, studentId, invoiceNumber: `INV-${key}-${randomUUID().slice(0, 6)}`, invoiceDate: daysAgo(30), dueDate: due, monthlyFee: 5000, subtotal: 5000, totalAmount: 5000, totalAmountPaid: 5000 - balance, balanceDue: balance, status: status as never, currency: "PKR" } as never })).id; };
  await invoice("aliDue", ids.ali, north, daysAgo(1), 5000, "PENDING"); await invoice("aliPaid", ids.ali, north, daysAgo(10), 0, "PAID"); await invoice("zoyaDue", ids.zoya, south, daysAgo(-5), 3000, "PENDING");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("one inbox across siblings, each child under its own permissions, child and school on every item", async () => {
  const parent = await context("parent");
  const { status, data } = await inbox(parent);
  assert.equal(status, 200);
  assert.deepEqual(data.children.map(c => c.id).sort(), [ids.ali, ids.zoya].sort());
  const byId = new Map(data.items.map(item => [item.id, item]));
  assert.equal(byId.get(`attendance:${ids.aliRecent}`)!.state, "ACTION");
  assert.equal(byId.get(`attendance:${ids.aliOld}`)!.state, "EXPIRED", "past the explanation window is expired, not overdue");
  assert.equal(byId.get(`attendance:${ids.zoyaRecent}`)!.state, "ACTION");
  assert.deepEqual([byId.get(`attendance:${ids.zoyaRecent}`)!.childName, byId.get(`attendance:${ids.zoyaRecent}`)!.campusName], ["Synthetic Zoya Raza", "Crescent South"]);
  const fee = byId.get(`invoice:${ids.aliDue}`)!;
  assert.deepEqual([fee.state, fee.overdue, fee.schoolName], ["ACTION", true, "Synthetic Crescent School"]);
  assert.equal(byId.get(`invoice:${ids.aliPaid}`)!.state, "COMPLETED");
  assert.ok(!byId.has(`invoice:${ids.zoyaDue}`), "no finance access for Zoya, so her fee is not shown");
  assert.ok(!data.items.some(item => item.childId === ids.omar), "another family's child never appears");
  assert.equal(data.counts.action, 3);
  // Reading changes nothing.
  assert.deepEqual((await inbox(parent)).data.items.map(i => [i.id, i.state]), data.items.map(i => [i.id, i.state]));
  assert.equal((await parent.request.get(`${base}/api/parent/inbox?studentId=${ids.omar}`)).status(), 403);
});

test("a co-guardian's answer, the school's request for detail, the reply and the decision", async () => {
  const parent = await context("parent"), coparent = await context("coparent"), lead = await context("lead");
  const sent = await coparent.request.post(`${base}/api/parent/attendance`, { data: { attendanceId: ids.aliRecent, reason: "Synthetic dentist appointment", proposedStatus: "EXCUSED" } });
  assert.equal(sent.status(), 201, await sent.text());
  let item = (await inbox(parent)).data.items.find(i => i.id === `attendance:${ids.aliRecent}`)!;
  assert.deepEqual([item.state, item.completedByOther], ["WAITING", true]);
  assert.equal((await parent.request.post(`${base}/api/parent/attendance`, { data: { attendanceId: ids.aliRecent, reason: "Sending a second one", proposedStatus: "EXCUSED" } })).status(), 409, "no duplicate action");
  const explanation = await db.attendanceExplanation.findFirstOrThrow({ where: { attendanceId: ids.aliRecent } });
  assert.equal((await lead.request.post(`${base}/api/attendance/register`, { data: { review: { id: explanation.id, action: "clarify", note: "Please share the appointment slip" } } })).status(), 200);
  item = (await inbox(parent)).data.items.find(i => i.id === `attendance:${ids.aliRecent}`)!;
  assert.deepEqual([item.kind, item.state], ["CLARIFY_ABSENCE", "ACTION"]);
  assert.equal((await parent.request.post(`${base}/api/parent/attendance`, { data: { attendanceId: ids.aliRecent, reason: "Slip handed to the office today", proposedStatus: "EXCUSED" } })).status(), 201);
  assert.equal((await inbox(parent)).data.items.find(i => i.id === `attendance:${ids.aliRecent}`)!.state, "WAITING");
  assert.equal((await lead.request.post(`${base}/api/attendance/register`, { data: { review: { id: explanation.id, action: "accept" } } })).status(), 200);
  item = (await inbox(parent)).data.items.find(i => i.id === `attendance:${ids.aliRecent}`)!;
  assert.deepEqual([item.state, item.title], ["COMPLETED", "ACCEPTED"]);
  assert.equal((await inbox(coparent)).data.items.find(i => i.id === `attendance:${ids.aliRecent}`)!.state, "COMPLETED", "the other guardian sees the same outcome");
  assert.equal((await parent.request.post(`${base}/api/parent/attendance`, { data: { attendanceId: ids.aliOld, reason: "Very late explanation", proposedStatus: "EXCUSED" } })).status(), 409, "the window has closed at the source too");
});

test("a single-child link stays single-child", async () => {
  const token = await new SignJWT({ type: "parent_portal", studentId: ids.zoya, schoolId, relationshipId: ids.relZoya, guardianUserId: users.get("parent")!.id }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secret);
  const anonymous = await browser.newContext();
  const scoped = await inbox(anonymous, `?token=${encodeURIComponent(token)}`);
  assert.equal(scoped.status, 200, JSON.stringify(scoped.data));
  assert.deepEqual(scoped.data.children.map(c => c.id), [ids.zoya]);
  assert.ok(scoped.data.items.every(item => item.childId === ids.zoya));
  const probe = await inbox(anonymous, `?token=${encodeURIComponent(token)}&studentId=${ids.ali}`);
  assert.ok(probe.data.items.every(item => item.childId === ids.zoya), "a sibling id does not widen a single-child link");
  await anonymous.close();
});

test("screens: the inbox across siblings, opening a request switches child, Arabic phone", async () => {
  const page = await (await context("parent")).newPage();
  await page.goto(`${base}/parent`);
  const panel = page.locator("[data-family-inbox]");
  await panel.locator("[data-inbox-item]").first().waitFor({ timeout: 30_000 });
  await shot(page, "01-inbox-needs-action");
  await panel.locator(`[data-inbox-item="attendance:${ids.zoyaRecent}"] [data-inbox-open]`).click();
  await page.waitForURL(/\/parent\/attendance/, { timeout: 30_000 });
  await page.getByText("Synthetic Zoya Raza").first().waitFor({ timeout: 30_000 });
  await page.locator("[data-guardian-absences]").waitFor({ timeout: 30_000 });
  await shot(page, "02-opened-for-zoya");
  await page.goto(`${base}/parent`);
  await panel.locator('[data-inbox-view="COMPLETED"]').click();
  await panel.locator(`[data-inbox-item="attendance:${ids.aliRecent}"]`).waitFor();
  await shot(page, "03-completed-with-outcome");
  await page.close();
  const ar = await (await context("parent-ar", { width: 390, height: 844 })).newPage();
  await ar.goto(`${base}/parent`);
  await ar.locator("[data-family-inbox] [data-inbox-item]").first().waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await shot(ar, "04-inbox-ar-390");
  await ar.close();
});
