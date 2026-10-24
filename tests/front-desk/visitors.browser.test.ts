import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-466 on the isolated app: namesakes are told apart and the same person cannot be on site twice;
// a lost check-in response retried posts once; check-out is idempotent; refused visitors are never on
// site; corrections keep the original in the audit log and records cannot be deleted; overdue visits
// are flagged; old contact details are removed; other campuses see nothing.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DESK_TEST_APP || "http://localhost:3107";
const evidence = process.env.DESK_EVIDENCE_DIR || "/tmp/sko466-evidence";
const db = new PrismaClient(), password = "SyntheticDesk466!";
const schoolId = `desk466-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, firstBilal = "", secondBilal = "", oldVisit = "", lateVisit = "";

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
const api = `${base}/api/front-desk/visitors`;
const checkIn = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.post(api, { data: { action: "check-in", name: "Synthetic Bilal Ahmed", purpose: "Synthetic parent meeting", toMeet: "Ms Synthetic Noor", ...body } });
const patch = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.patch(api, { data: body });
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Juniper Front Desk School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[campusId, "Juniper Gate"], [otherCampusId, "Juniper Park"]]) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Riyadh" } });
  const desk = await user("desk", "RECEPTIONIST"); await user("desk-ar", "RECEPTIONIST", campusId, "ar"); await user("other", "RECEPTIONIST", otherCampusId); await user("teacher", "TEACHER");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Riyadh", currency: "SAR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: desk, financeReviewedBy: desk } });
  // An old closed visit with contact details past retention, and a visitor still on site after five hours.
  oldVisit = (await db.visitorLog.create({ data: { schoolId, campusId, name: "Synthetic Old Visitor", phone: "+966 500 000 111", purpose: "Synthetic delivery", toMeet: "Office", inTime: new Date(Date.now() - 200 * 86_400_000), outTime: new Date(Date.now() - 200 * 86_400_000 + 3_600_000), status: "LEFT", note: "Synthetic note" } })).id;
  lateVisit = (await db.visitorLog.create({ data: { schoolId, campusId, name: "Synthetic Late Contractor", purpose: "Synthetic repairs", toMeet: "Facilities", reference: "Synthetic Repairs Co", inTime: new Date(Date.now() - 5 * 3_600_000), status: "ON_SITE" } })).id;
  await db.visitorLog.create({ data: { schoolId, campusId: otherCampusId, name: "Synthetic Park Visitor", purpose: "Synthetic tour", toMeet: "Admissions", inTime: new Date(), status: "ON_SITE" } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("invalid check-ins are refused with guidance", async () => {
  const ctx = await context("desk");
  for (const [body, message] of [[{ toMeet: "" }, /Host/], [{ inTime: new Date(Date.now() + 3_600_000).toISOString() }, /future/], [{ phone: "call me" }, /valid phone/], [{ name: "" }, /Visitor name/]] as const) {
    const response = await checkIn(ctx, body);
    assert.equal(response.status(), 400, JSON.stringify(body));
    assert.match((await response.json()).error, message);
  }
});

test("namesakes need a reference; the same person cannot be on site twice; check-out is per visit and idempotent", async () => {
  const ctx = await context("desk");
  const first = await checkIn(ctx, { reference: "Synthetic Acme Ltd", phone: "+966 511 111 222" });
  assert.equal(first.status(), 201);
  firstBilal = (await first.json()).data.id;
  // The old visit's phone number is past retention and was removed when this check-in was written.
  const old = await db.visitorLog.findUniqueOrThrow({ where: { id: oldVisit } });
  assert.deepEqual([old.phone, old.note, Boolean(old.contactRedactedAt), old.name], [null, null, true, "Synthetic Old Visitor"]);
  const namesake = await checkIn(ctx, {});
  assert.equal(namesake.status(), 409);
  const namesakeBody = await namesake.json();
  assert.match(namesakeBody.error, /Another Synthetic Bilal Ahmed is on site/);
  assert.equal(namesakeBody.duplicates.length, 1);
  const same = await checkIn(ctx, { reference: "synthetic acme ltd" });
  assert.equal(same.status(), 409);
  assert.match((await same.json()).error, /already on site/);
  const second = await checkIn(ctx, { reference: "Synthetic Water Board", toMeet: "Mr Synthetic Saleem" });
  assert.equal(second.status(), 201);
  secondBilal = (await second.json()).data.id;
  const out = await Promise.all([1, 2].map(() => patch(ctx, { id: firstBilal, action: "check-out" })));
  assert.deepEqual(out.map(r => r.status()), [200, 200]);
  const states = Object.fromEntries((await db.visitorLog.findMany({ where: { id: { in: [firstBilal, secondBilal] } } })).map(row => [row.id, row.status]));
  assert.deepEqual([states[firstBilal], states[secondBilal]], ["LEFT", "ON_SITE"]);
  assert.equal(await db.auditLog.count({ where: { recordId: firstBilal, tableName: "visitor_logs" } }), 2, "check-in and one check-out audited");
});

test("a lost check-in response retried posts once; a refused visitor is never on site", async () => {
  const ctx = await context("desk"), key = randomUUID();
  const replies = await Promise.all([1, 2, 3].map(() => checkIn(ctx, { name: "Synthetic Hana Retry", reference: "Synthetic Courier", idempotencyKey: key })));
  assert.deepEqual(replies.map(r => r.status()).sort(), [200, 200, 201]);
  assert.equal(await db.visitorLog.count({ where: { campusId, name: "Synthetic Hana Retry" } }), 1);
  assert.equal((await checkIn(ctx, { name: "Synthetic Hana Retry", reference: "Synthetic Courier", purpose: "Changed", idempotencyKey: key })).status(), 409);
  const refused = await ctx.request.post(api, { data: { action: "refuse", name: "Synthetic Unknown Caller", purpose: "Synthetic: asked to collect a pupil", refusedReason: "Synthetic: not on the pickup list; referred to the pickup register" } });
  assert.equal(refused.status(), 201);
  const refusedId = (await refused.json()).data.id;
  assert.equal((await patch(ctx, { id: refusedId, action: "check-out" })).status(), 409);
  const list = await (await ctx.request.get(api)).json();
  assert.equal(list.onSite, 3, "second Bilal, the retried visitor and the late contractor");
  assert.equal(list.data.find((row: { id: string }) => row.id === refusedId).status, "REFUSED");
  assert.equal(list.overdue, 1);
  assert.equal(list.data.find((row: { id: string }) => row.id === lateVisit).overdue, true);
  assert.equal(JSON.stringify(list).includes("idempotencyKey"), false);
});

test("corrections keep the original in the audit log; departure cannot precede arrival; records cannot be deleted", async () => {
  const ctx = await context("desk");
  const visit = await db.visitorLog.findUniqueOrThrow({ where: { id: firstBilal } });
  const early = new Date(visit.inTime.getTime() - 60_000).toISOString();
  assert.equal((await patch(ctx, { id: firstBilal, action: "correct", changes: { outTime: early }, reason: "Synthetic typo", version: visit.version })).status(), 400);
  assert.equal((await patch(ctx, { id: firstBilal, action: "correct", changes: { outTime: visit.outTime!.toISOString() }, reason: "no" })).status(), 400, "a reason is required");
  const arrived = new Date(visit.inTime.getTime() - 40 * 60_000).toISOString(), left = new Date(visit.inTime.getTime() - 10 * 60_000).toISOString();
  assert.equal((await patch(ctx, { id: firstBilal, action: "correct", changes: { inTime: arrived, outTime: left }, reason: "Synthetic: left earlier, gate log checked", version: visit.version })).status(), 200);
  assert.equal((await patch(ctx, { id: firstBilal, action: "correct", changes: { purpose: "Synthetic other" }, reason: "Synthetic stale edit", version: visit.version })).status(), 409, "a stale version is refused");
  const audit = await db.auditLog.findMany({ where: { recordId: firstBilal, tableName: "visitor_logs" }, orderBy: { createdAt: "asc" } });
  const last = audit.at(-1)!;
  assert.equal((last.oldValue as { outTime: string }).outTime, visit.outTime!.toISOString(), "original departure kept");
  assert.equal((last.newValue as { correctionReason: string }).correctionReason, "Synthetic: left earlier, gate log checked");
  assert.equal((await ctx.request.delete(`${api}?id=${firstBilal}`)).status(), 405);
  assert.ok(await db.visitorLog.findUnique({ where: { id: firstBilal } }));
});

test("other campuses and roles without front-desk access see nothing", async () => {
  const other = await context("other");
  assert.equal((await other.request.get(`${api}?campusId=${campusId}`)).status(), 403);
  assert.equal((await other.request.get(`${api}?campusId=${campusId}&format=csv`)).status(), 403);
  assert.equal((await patch(other, { id: secondBilal, action: "check-out" })).status(), 404);
  const own = await (await other.request.get(api)).json();
  assert.deepEqual(own.data.map((row: { name: string }) => row.name), ["Synthetic Park Visitor"]);
  const teacher = await context("teacher");
  assert.equal((await teacher.request.get(api)).status(), 403);
  const csv = await (await (await context("desk")).request.get(`${api}?format=csv`)).text();
  assert.match(csv, /Synthetic Bilal Ahmed/);
  assert.doesNotMatch(csv, /Synthetic Park Visitor/);
});

test("reception sees on-site visitors first, is warned about a namesake and checks a visitor out", async () => {
  const ctx = await context("desk"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/receptionist?view=visitors`);
  const register = page.locator("[data-visitor-register]");
  await register.locator("[data-visit]").first().waitFor({ timeout: 30_000 });
  assert.equal(await register.locator("[data-visit]").first().getAttribute("data-visit-status"), "ON_SITE");
  await page.getByRole("button", { name: "Check in visitor" }).first().click(); // PageHeader primary (role-ux §4.4)
  const form = register.locator('[data-visitor-form="check-in"]');
  await form.getByLabel("Visitor name").fill("Synthetic Bilal Ahmed");
  await form.getByLabel("Purpose of visit").fill("Synthetic sports kit delivery");
  await form.getByLabel("Person to meet").fill("Coach Synthetic Imran");
  await form.getByRole("button", { name: "Check in", exact: true }).click();
  await form.locator("[data-visitor-error]").waitFor();
  assert.match(await form.locator("[data-visitor-error]").innerText(), /Another Synthetic Bilal Ahmed is on site/);
  assert.equal(await form.getByLabel("Visitor name").inputValue(), "Synthetic Bilal Ahmed", "the draft is kept");
  await shot(page, "visitors-namesake-warning-en-1440");
  await form.getByLabel("Reference (optional)").fill("Synthetic Sports Supplies");
  await form.getByRole("button", { name: "Check in", exact: true }).click();
  await form.waitFor({ state: "detached", timeout: 15_000 });
  await page.waitForFunction(`document.querySelector('[data-on-site]')?.getAttribute('data-on-site') === '4'`, undefined, { timeout: 15_000 });
  const row = register.locator(`[data-visit="${secondBilal}"]`);
  await row.getByRole("button", { name: /Check out/ }).click();
  const confirm = page.getByRole("alertdialog");
  assert.match(await confirm.innerText(), /Mr Synthetic Saleem/);
  await confirm.getByRole("button", { name: "Check out" }).click();
  await register.locator(`[data-visit="${secondBilal}"][data-visit-status="LEFT"]`).waitFor({ timeout: 15_000 });
  assert.equal(await register.locator("[data-on-site]").getAttribute("data-on-site"), "3");
  await shot(page, "visitors-register-en-1440");
  await register.locator(`[data-visit="${firstBilal}"]`).getByRole("button", { name: /Correct visit/ }).click();
  await page.getByRole("dialog").locator("[data-visitor-correct]").waitFor();
  await shot(page, "visitors-correction-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Arabic reception at phone width works right-to-left without overflow", async () => {
  const ctx = await context("desk-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/receptionist?view=visitors`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("view=visitors")) await page.goto(`${base}/receptionist?view=visitors`);
  await page.locator("[data-visit]").first().waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await page.locator("[data-visitor-counts]").innerText(), /في الموقع الآن/);
  assert.match(await page.locator('[data-tour="page.header"]').first().innerText(), /الزوار/, "the console header is translated");
  // A capture desk keeps its one primary action under the thumb on a phone (role-ux §4.5.1).
  assert.match(await page.locator("[data-console-sticky-action]").innerText(), /تسجيل دخول زائر/, "Check in visitor sits in the sticky bar");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(page, "visitors-register-ar-390");
  await page.close();
});
