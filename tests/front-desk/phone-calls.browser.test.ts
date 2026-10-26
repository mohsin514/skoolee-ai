import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-465 on the isolated app: a call is logged once (retries replay); a callback is an owned task that
// stays open through attempts until an outcome is recorded, and a follow-up is a new linked callback;
// reassignment keeps the due time and leaves exactly one live notification for the new owner; sensitive
// notes reach only leaders, the person who logged the call and the owner; two callers sharing a number stay
// separate; other campuses and non-front-desk roles see nothing; deletion is refused.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DESK_TEST_APP || "http://localhost:3107";
const evidence = process.env.DESK_EVIDENCE_DIR || "/tmp/sko465-evidence";
const db = new PrismaClient(), password = "SyntheticCall465!";
const schoolId = `call465-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;
// The school runs on Asia/Dubai (UTC+4, no daylight saving): wall times for the API are local.
const local = (offsetMinutes: number) => new Date(Date.now() + offsetMinutes * 60_000 + 4 * 3_600_000).toISOString().slice(0, 16);

async function user(key: string, role: string, campus: string | null = campusId, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, welcomeCompletedAt: new Date(), tourProgress: { receptionist: { v: 1, s: "done", at: new Date().toISOString() } }, preferredLanguage: language } });
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
const api = `${base}/api/front-desk/phone-calls`;
const logCall = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.post(api, { data: { name: "Synthetic Parent Hamza", phone: "+971 50 123 4567", direction: "IN", date: local(-30), purpose: "Bus timing", ...body } });
const act = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.patch(api, { data: body });
const callback = (callId: string) => db.phoneCallback.findFirstOrThrow({ where: { callId }, orderBy: { createdAt: "asc" } });
const liveActions = (key: string, sourceId: string) => db.notification.findMany({ where: { userId: users.get(key)!.id, sourceType: "callback", sourceId } });
const shot = async (page: Page, name: string) => { await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" }); await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Palm Call School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Dubai", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[campusId, "Palm Creek"], [otherCampusId, "Palm Marina"]]) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Dubai" } });
  const lead = await user("lead", "CAMPUS_ADMIN"); // role-ux G40
  await user("desk", "RECEPTIONIST"); await user("desk2", "RECEPTIONIST"); await user("desk3", "RECEPTIONIST"); await user("desk-ar", "RECEPTIONIST", campusId, "ar");
  await user("other", "RECEPTIONIST", otherCampusId); await user("teacher", "TEACHER");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Dubai", currency: "AED" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: lead, financeReviewedBy: lead } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("a call is validated and a retried save logs it once", async () => {
  const desk = await context("desk");
  for (const [body, message] of [[{ name: "H" }, /at least 2/], [{ phone: "12ab" }, /phone/i], [{ date: local(120) }, /future/], [{ callbackDue: local(-60) }, /before the call/], [{ direction: "SIDEWAYS" }, /incoming or outgoing/]] as const) {
    const response = await logCall(desk, body);
    assert.equal(response.status(), 400, JSON.stringify(body));
    assert.match((await response.json()).error, message);
  }
  const key = randomUUID();
  const replies = await Promise.all([1, 2, 3].map(() => logCall(desk, { idempotencyKey: key, purpose: "Fee question" })));
  assert.deepEqual(replies.map(r => r.status()).sort(), [200, 200, 201]);
  assert.equal(await db.phoneCallLog.count({ where: { campusId, idempotencyKey: key } }), 1);
  const mismatch = await logCall(desk, { idempotencyKey: key, purpose: "Something else" });
  assert.equal(mismatch.status(), 409);
  assert.equal((await desk.request.delete(`${api}?id=x`)).status(), 405);
});

test("a callback stays open through an attempt, needs an outcome to complete and links its follow-up", async () => {
  const desk = await context("desk");
  const created = await logCall(desk, { name: "Synthetic Parent Sana", purpose: "Admission enquiry", callbackDue: local(24 * 60), callbackOwnerId: users.get("desk2")!.id, idempotencyKey: randomUUID() });
  assert.equal(created.status(), 201);
  const callId = (await created.json()).data.id;
  const first = await callback(callId);
  assert.equal(first.ownerId, users.get("desk2")!.id);
  assert.equal((await liveActions("desk2", first.id)).length, 1, "the owner is told once");

  const attempt = await act(desk, { id: first.id, version: first.version, action: "attempt", note: "Synthetic: no answer", dueAt: local(26 * 60) });
  assert.equal(attempt.status(), 200);
  const afterAttempt = await db.phoneCallback.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(afterAttempt.status, "OPEN"); assert.equal(afterAttempt.attempts, 1);

  const noOutcome = await act(desk, { id: first.id, version: afterAttempt.version, action: "complete", outcome: "" });
  assert.equal(noOutcome.status(), 400);
  const stale = await act(desk, { id: first.id, version: first.version, action: "complete", outcome: "Synthetic: spoke to parent" });
  assert.equal(stale.status(), 409, "a stale version is refused");

  const done = await act(desk, { id: first.id, version: afterAttempt.version, action: "complete", outcome: "Synthetic: sent the admission form; parent will visit.", nextDue: local(3 * 24 * 60) });
  assert.equal(done.status(), 200);
  const closed = await db.phoneCallback.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(closed.status, "DONE"); assert.ok(closed.outcome && closed.completedAt);
  const next = await db.phoneCallback.findFirstOrThrow({ where: { previousId: first.id } });
  assert.equal(next.status, "OPEN"); assert.equal(next.callId, callId); assert.equal(next.ownerId, users.get("desk2")!.id);
  assert.deepEqual((await db.phoneCallbackEvent.findMany({ where: { callbackId: first.id }, orderBy: { createdAt: "asc" } })).map(e => e.kind), ["CREATED", "ATTEMPTED", "COMPLETED"]);
  assert.equal((await liveActions("desk2", first.id))[0].resolution, "COMPLETED");
  assert.equal((await act(desk, { id: first.id, action: "attempt", note: "again" })).status(), 409, "a completed callback cannot change");
  const call = await db.phoneCallLog.findUniqueOrThrow({ where: { id: callId } });
  assert.equal(call.purpose, "Admission enquiry", "the original call is unchanged");
});

test("an overdue callback reassigned keeps its due time and leaves one live notification for the new owner", async () => {
  const desk = await context("desk");
  const created = await logCall(desk, { name: "Synthetic Parent Omar", date: local(-3 * 24 * 60), callbackDue: local(-24 * 60), callbackOwnerId: users.get("desk2")!.id, idempotencyKey: randomUUID() });
  const cb = await callback((await created.json()).data.id);
  const overdue = await (await desk.request.get(`${api}?view=overdue`)).json();
  assert.ok(overdue.data.some((row: { callbacks: { id: string; overdue: boolean }[] }) => row.callbacks.some(c => c.id === cb.id && c.overdue)));
  assert.ok(overdue.counts.overdue >= 1);

  assert.equal((await act(desk, { id: cb.id, version: cb.version, action: "reassign", ownerId: users.get("desk2")!.id })).status(), 409, "same owner is refused");
  const moved = await act(desk, { id: cb.id, version: cb.version, action: "reassign", ownerId: users.get("desk3")!.id });
  assert.equal(moved.status(), 200);
  const after = await db.phoneCallback.findUniqueOrThrow({ where: { id: cb.id } });
  assert.equal(after.dueAt.toISOString(), cb.dueAt.toISOString(), "the clock is not reset");
  assert.equal((await liveActions("desk2", cb.id))[0].resolution, "REASSIGNED");
  const newOwner = await liveActions("desk3", cb.id);
  assert.equal(newOwner.length, 1); assert.equal(newOwner[0].resolvedAt, null);
  assert.equal(newOwner[0].message.includes("Synthetic Parent Omar"), true);
});

test("sensitive notes, other campuses and other roles stay out", async () => {
  const lead = await context("lead"), desk = await context("desk"), desk2 = await context("desk2"), other = await context("other"), teacher = await context("teacher");
  const created = await logCall(lead, { name: "Synthetic Guardian Leila", purpose: "Wellbeing", note: "Synthetic: sensitive family matter", sensitive: true, callbackDue: local(60), callbackOwnerId: users.get("desk2")!.id });
  const callId = (await created.json()).data.id, cb = await callback(callId);
  const seen = async (ctx: BrowserContext) => ((await (await ctx.request.get(`${api}?view=all`)).json()).data ?? []).find((row: { id: string }) => row.id === callId);
  const deskView = await seen(desk);
  assert.equal(deskView.note, null); assert.equal(deskView.noteWithheld, true);
  assert.equal((await seen(desk2)).note, "Synthetic: sensitive family matter", "the owner reads it");
  assert.equal((await seen(lead)).note, "Synthetic: sensitive family matter");
  const history = await (await desk.request.get(`${api}?history=${cb.id}`)).json();
  assert.ok(history.data.every((event: { note: string | null }) => event.note === null));
  assert.equal(await seen(other), undefined, "another campus never sees it");
  assert.equal((await act(other, { id: cb.id, action: "attempt", note: "Synthetic" })).status(), 404);
  assert.equal((await teacher.request.get(`${api}?view=all`)).status(), 403);
  assert.ok([403, 404].includes((await act(teacher, { id: cb.id, action: "reassign", ownerId: users.get("teacher")!.id })).status()));
});

test("two callers sharing one number stay separate and are both found by the number", async () => {
  const desk = await context("desk");
  await logCall(desk, { name: "Synthetic Mother Ayla", phone: "050-777-1234", purpose: "Uniform" });
  await logCall(desk, { name: "Synthetic Father Ayla", phone: "+050 777 1234", purpose: "Transport" });
  const found = await (await desk.request.get(`${api}?view=all&q=0507771234`)).json();
  assert.deepEqual(found.data.map((row: { name: string }) => row.name).sort(), ["Synthetic Father Ayla", "Synthetic Mother Ayla"]);
});

test("reception logs a call in the UI, keeps the draft when the save fails and records it once on retry", async () => {
  const desk = await context("desk"), page = await desk.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/receptionist?view=phone-calls`);
  const panel = page.locator("[data-phone-log]");
  await panel.locator("[data-callback]").first().waitFor({ timeout: 30_000 });
  await shot(page, "phone-calls-queue-en-1440");
  await page.getByRole("button", { name: "Log call" }).first().click(); // PageHeader primary (role-ux §4.4)
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Log call" }).click();
  await dialog.locator("[data-call-error]").waitFor();
  await dialog.getByLabel("Caller name").fill("Synthetic Parent Noor");
  await dialog.getByLabel("Phone", { exact: true }).fill("+971 55 000 1111");
  await dialog.getByLabel("Purpose").fill("Exam dates");
  await dialog.getByLabel("Call back by (school time)").fill(local(120));
  await page.route("**/api/front-desk/phone-calls", route => route.request().method() === "POST" ? route.abort("connectionreset") : route.continue());
  await dialog.getByRole("button", { name: "Log call" }).click();
  await dialog.locator("[data-call-error]").filter({ hasText: /connection failed/ }).waitFor();
  assert.equal(await dialog.getByLabel("Caller name").inputValue(), "Synthetic Parent Noor", "the draft is kept");
  await page.unroute("**/api/front-desk/phone-calls");
  await dialog.getByRole("button", { name: "Log call" }).click();
  await panel.locator("[data-call]").filter({ hasText: "Synthetic Parent Noor" }).waitFor({ timeout: 15_000 });
  assert.equal(await db.phoneCallLog.count({ where: { campusId, name: "Synthetic Parent Noor" } }), 1);
  await panel.locator("[data-call]").filter({ hasText: "Synthetic Parent Noor" }).getByRole("button", { name: /Open callback/ }).click();
  await page.getByRole("dialog").locator("[data-callback-history] [data-event]").first().waitFor();
  await shot(page, "phone-calls-callback-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Arabic reception at phone width reads the callback queue right-to-left without overflow", async () => {
  const ctx = await context("desk-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/receptionist?view=phone-calls`);
  await page.waitForLoadState("domcontentloaded");
  if (!page.url().includes("view=phone-calls")) await page.goto(`${base}/receptionist?view=phone-calls`);
  await page.locator("[data-callback]").first().waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await page.locator("[data-callback-counts]").innerText(), /معاودات الاتصال المفتوحة/);
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(page, "phone-calls-queue-ar-390");
  await page.close();
});


test("Today callbacks follow the school day when the receptionist's device is abroad", async () => {
  const signedIn = await context("desk");
  const ctx = await browser.newContext({ storageState: await signedIn.storageState(), viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-10-25T20:30:00Z") });
  await page.route("**/api/pickup/gate", route => route.fulfill({ json: { success: true, data: { checks: [] } } }));
  await page.route("**/api/front-desk/visitors?status=ON_SITE", route => route.fulfill({ json: { success: true, data: [] } }));
  await page.route("**/api/front-desk/phone-calls?view=open", route => route.fulfill({ json: { success: true, data: [
    { id: "today", name: "School day callback", callbacks: [{ id: "today", status: "OPEN", dueAt: "2026-10-26T10:00:00Z", overdue: false }] },
    { id: "tomorrow", name: "Tomorrow callback", callbacks: [{ id: "tomorrow", status: "OPEN", dueAt: "2026-10-26T21:00:00Z", overdue: false }] },
  ] } }));
  await page.goto(`${base}/receptionist`);
  await page.getByText("Call back School day callback", { exact: true }).waitFor();
  assert.equal(await page.getByText("Call back Tomorrow callback", { exact: true }).count(), 0);
  await page.getByText("Call back School day callback", { exact: true }).scrollIntoViewIfNeeded();
  await shot(page, "callback-school-day-390");
  await ctx.close(); await signedIn.close();
});
