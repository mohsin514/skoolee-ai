import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { deliverNotification } from "../../src/lib/notifications/in-app";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { redis } from "../../src/lib/queue/connection";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-416 on the isolated app: a leave request becomes one "Needs you" action for its reviewer seat; reading or
// "mark all as seen" never completes it; a duplicate event bumps the same row; the review (or the requester
// cancelling) resolves it; revoked access withholds the stored text and refuses the open; direct messages are
// consolidated mentions. G41 routing: a teacher's leave goes to the academic lead (the principal) only; a
// non-teaching staff member's leave goes to the campus operator only (§2.5).
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.NOTIF_TEST_APP || "http://localhost:3107";
const evidence = process.env.NOTIF_EVIDENCE_DIR || "/tmp/sko416-evidence";
const db = new PrismaClient(), password = "SyntheticInbox416!";
const schoolId = `inbox416-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, leaveTypeId = "", firstLeave = "";
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

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
const inbox = async (key: string, view = "all") => (await (await (await context(key)).request.get(`${base}/api/notifications?view=${view}`)).json());
async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let attempt = 0; attempt < 40; attempt++) { const value = await read(); if (done(value)) return value; await new Promise(resolve => setTimeout(resolve, 250)); }
  return read();
}
const actionsFor = (userId: string, sourceId: string) => db.notification.findMany({ where: { userId, sourceType: "leave", sourceId } });
async function applyLeave(from: number, to: number) {
  const response = await (await context("teacher")).request.post(`${base}/api/leave`, { data: { leaveTypeId, fromDate: day(from), toDate: day(to), reason: "Synthetic family event" } });
  assert.equal(response.status(), 201, await response.text());
  const id = (await response.json()).data.id as string;
  await waitFor(() => actionsFor(users.get("principal")!.id, id), rows => rows.length === 1);
  return id;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Maple Inbox School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Maple Inbox", regId: campusId, city: "Lahore" } });
  await user("principal", "PRINCIPAL"); await user("admin", "CAMPUS_ADMIN"); await user("teacher", "TEACHER"); await user("principal-ar", "PRINCIPAL", "ar");
  await user("accountant", "ACCOUNTANT");
  leaveTypeId = (await db.leaveType.create({ data: { schoolId, campusId, name: "Casual", defaultDays: 100 } })).id;
  for (const role of ["TEACHER", "ACCOUNTANT"]) for (const year of [2026, 2027]) await db.leaveAllocation.create({ data: { schoolId, campusId, leaveTypeId, role: role as never, days: 200, academicYear: year } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); await appPrisma.$disconnect(); redis.disconnect(); });

test("a leave request is one open action per reviewer that reading never completes", async () => {
  firstLeave = await applyLeave(10, 11);
  const [principalRow] = await actionsFor(users.get("principal")!.id, firstLeave);
  const stored = await db.leaveRequest.findUniqueOrThrow({ where: { id: firstLeave } });
  assert.equal(principalRow.category, "ACTION");
  assert.equal(principalRow.dueAt?.getTime(), new Date(stored.fromDate.toISOString().slice(0, 10) + "T00:00:00.000Z").getTime() - 86_400_000, "due the day before the leave starts");
  assert.equal((await actionsFor(users.get("admin")!.id, firstLeave)).length, 0, "teaching-staff leave goes to the academic lead only (G41)");
  const principal = await context("principal");
  const opened = await (await principal.request.post(`${base}/api/notifications/${principalRow.id}/open`)).json();
  assert.deepEqual([opened.data.state, opened.data.link, opened.data.isRead], ["open", "/principal?view=leave", true]);
  assert.equal((await principal.request.patch(`${base}/api/notifications`, { data: { all: true } })).status(), 200);
  const after = await inbox("principal", "actions");
  assert.equal(after.counts.openActions, 1, "seen is not done");
  assert.equal(after.notifications[0].state, "open");
  assert.equal((await db.leaveRequest.findUniqueOrThrow({ where: { id: firstLeave } })).status, "PENDING");
});

test("a duplicate event bumps the same action instead of adding another", async () => {
  await runWithTenantContext({ schoolId, unscoped: false } as never, () => deliverNotification("LEAVE_APPLIED", { schoolId, campusId, actorId: users.get("teacher")!.id, actorName: "Synthetic teacher", leaveId: firstLeave, leaveTypeName: "Casual", fromDate: day(10), toDate: day(11) }));
  const rows = await actionsFor(users.get("principal")!.id, firstLeave);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].reminderCount, rows[0].isRead], [1, false]);
});

test("the review resolves the reviewer's action; a cancelled request resolves as withdrawn", async () => {
  // The academic lead decides teaching-staff leave (§2.5); the campus admin holds no row for it.
  const principal = await context("principal");
  const review = await principal.request.patch(`${base}/api/leave/review`, { data: { id: firstLeave, status: "APPROVED" } });
  assert.equal(review.status(), 200, await review.text());
  const [row] = await actionsFor(users.get("principal")!.id, firstLeave);
  assert.ok(row, "the principal's action exists");
  assert.deepEqual([Boolean(row.resolvedAt), row.resolution], [true, "COMPLETED"]);
  assert.equal((await actionsFor(users.get("admin")!.id, firstLeave)).length, 0);
  const unresolved = await db.notification.findMany({ where: { sourceType: "leave", sourceId: firstLeave, resolvedAt: null }, select: { userId: true, campusId: true, schoolId: true } });
  assert.deepEqual(unresolved, [], "every reviewer's action is resolved");
  assert.equal((await inbox("principal", "actions")).counts.openActions, 0);
  const second = await applyLeave(20, 20);
  assert.equal((await (await context("teacher")).request.patch(`${base}/api/leave`, { data: { id: second, action: "cancel" } })).status(), 200);
  const [withdrawn] = await actionsFor(users.get("principal")!.id, second);
  assert.equal(withdrawn.resolution, "CANCELLED");
});

test("a non-teaching staff member's leave goes to the campus operator, never the principal (G41)", async () => {
  const response = await (await context("accountant")).request.post(`${base}/api/leave`, { data: { leaveTypeId, fromDate: day(40), toDate: day(40), reason: "Synthetic appointment" } });
  assert.equal(response.status(), 201, await response.text());
  const id = (await response.json()).data.id as string;
  const rows = await waitFor(() => actionsFor(users.get("admin")!.id, id), found => found.length === 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "ACTION");
  assert.equal((await actionsFor(users.get("principal")!.id, id)).length, 0, "the principal does not decide office staff leave");
  const opened = await (await (await context("admin")).request.post(`${base}/api/notifications/${rows[0].id}/open`)).json();
  assert.deepEqual([opened.data.state, opened.data.link], ["open", "/admin?view=leave"]);
});

test("revoked access withholds the stored text and refuses the open", async () => {
  const third = await applyLeave(30, 31);
  const [row] = await actionsFor(users.get("principal")!.id, third);
  await db.rolePermission.create({ data: { schoolId, role: "PRINCIPAL", module: "leave", canView: true, canAdd: false, canEdit: false, canDelete: false } });
  try {
    const list = await inbox("principal");
    const item = list.notifications.find((n: { id: string }) => n.id === row.id);
    assert.deepEqual([item.state, item.title, item.link], ["unavailable", "No longer available", null]);
    assert.equal(JSON.stringify(item).includes("Synthetic teacher"), false, "no copied source text");
    assert.equal((await (await context("principal")).request.post(`${base}/api/notifications/${row.id}/open`)).status(), 403);
  } finally {
    await db.rolePermission.deleteMany({ where: { schoolId, role: "PRINCIPAL", module: "leave" } });
  }
});

test("direct messages are consolidated mentions", async () => {
  const admin = await context("admin");
  const conversation = (await (await admin.request.post(`${base}/api/chat/conversations`, { data: { kind: "DIRECT", userId: users.get("teacher")!.id } })).json()).conversation;
  for (const body of ["Synthetic: can you cover period 3?", "Synthetic: room 12 please"]) await admin.request.post(`${base}/api/chat/conversations/${conversation.id}/messages`, { data: { body, clientKey: randomUUID() } });
  const mentions = await db.notification.findMany({ where: { userId: users.get("teacher")!.id, sourceType: "chat", sourceId: conversation.id } });
  assert.deepEqual(mentions.map(m => [m.category, m.reminderCount]), [["MENTION", 1]]);
  const view = await inbox("teacher", "mentions");
  assert.equal(view.counts.mentionsUnread, 1);
  assert.equal(view.notifications[0].link, `/messages?c=${conversation.id}`);
});

test("the principal sees Needs you, marks a task seen without completing it, and opens the task", async () => {
  const page = await (await context("principal")).newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/principal`);
  await page.getByRole("button", { name: "View notifications" }).first().click({ timeout: 30_000 });
  const center = page.locator("[data-notification-center]");
  await center.getByRole("tab", { name: /Needs you/ }).click();
  const task = center.locator('[data-category="ACTION"][data-state="open"]').first();
  await task.waitFor({ timeout: 15_000 });
  if (await task.getByRole("button", { name: /as seen/ }).count()) {
    await task.getByRole("button", { name: /as seen/ }).click();
    await task.getByText("Marked seen. The task is still waiting for you.").waitFor();
  }
  assert.equal(await task.getAttribute("data-state"), "open");
  await shot(page, "inbox-needs-you-en-1440");
  await center.getByRole("tab", { name: /^All/ }).click();
  await center.locator("[data-notification]").first().waitFor();
  await shot(page, "inbox-all-en-1440");
  await center.getByRole("tab", { name: /Needs you/ }).click();
  await center.locator('[data-category="ACTION"][data-state="open"]').first().getByRole("button", { name: /^Open / }).click();
  await page.waitForURL(/view=leave/, { timeout: 15_000 });
  assert.deepEqual(errors, []);
  await page.close();
});

test("Arabic principal reads the inbox right-to-left at phone width", async () => {
  const ctx = await context("principal-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/principal`);
  await page.waitForLoadState("networkidle");
  await page.locator("header button[aria-haspopup], header button").filter({ has: page.locator("svg") }).first().waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /الإشعارات|View notifications/ }).first().click();
  const center = page.locator("[data-notification-center]");
  await center.getByRole("tab", { name: /يحتاجك/ }).click({ timeout: 15_000 });
  await center.locator("[data-notification]").first().waitFor({ timeout: 15_000 });
  assert.equal(await center.locator('[data-category="ACTION"][data-state="resolved"]').count(), 0, "Needs you lists only open actions");
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(page, "inbox-needs-you-ar-390");
  await page.close();
});
