import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-464 on the isolated app: a postal item is tracked to a handoff, never closed by a log entry or a
// tracking number; incoming items need the collector's name, deliveries also need how they were confirmed;
// the same parcel cannot be opened twice and a retried save records once; corrections keep the original
// values; reassignment leaves one live notification; other campuses and teachers see nothing; delete is refused.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.DESK_TEST_APP || "http://localhost:3107";
const evidence = process.env.DESK_EVIDENCE_DIR || "/tmp/sko464-evidence";
const db = new PrismaClient(), password = "SyntheticPost464!";
const schoolId = `post464-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;
const today = new Date().toISOString().slice(0, 10);
const LONG_REF = "JD014600006281234567890-ДХЛ-واردة-0042";

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
const api = `${base}/api/front-desk/postal`;
const record = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.post(api, { data: { direction: "RECEIVE", date: today, toName: "Synthetic Teacher Farah", fromName: "Synthetic Publisher", courier: "Synthetic Express", ...body } });
const act = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.patch(api, { data: body });
const item = (code: string) => db.postalRecord.findFirstOrThrow({ where: { campusId, itemCode: code } });
const actions = (key: string, sourceId: string) => db.notification.findMany({ where: { userId: users.get(key)!.id, sourceType: "postal", sourceId } });
const shot = async (page: Page, name: string) => { await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" }); await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Post School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[campusId, "Cedar North"], [otherCampusId, "Cedar South"]]) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Riyadh" } });
  const lead = await user("lead", "CAMPUS_ADMIN"); // role-ux G40
  await user("desk", "RECEPTIONIST"); await user("desk2", "RECEPTIONIST"); await user("desk3", "RECEPTIONIST"); await user("desk-ar", "RECEPTIONIST", campusId, "ar");
  await user("other", "RECEPTIONIST", otherCampusId); await user("teacher", "TEACHER");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Riyadh", currency: "SAR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: lead, financeReviewedBy: lead } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("an item is validated; a retried save records once; the same parcel cannot be opened twice", async () => {
  const desk = await context("desk");
  for (const [body, message] of [[{ toName: "" }, /Recipient/], [{ date: "2099-01-01" }, /future/], [{ direction: "SIDEWAYS" }, /incoming or outgoing/], [{ referenceNo: "x".repeat(81) }, /too long/]] as const) {
    const response = await record(desk, body);
    assert.equal(response.status(), 400, JSON.stringify(body));
    assert.match((await response.json()).error, message);
  }
  const key = randomUUID();
  const replies = await Promise.all([1, 2, 3].map(() => record(desk, { idempotencyKey: key, referenceNo: "SYN 4455-01" })));
  assert.deepEqual(replies.map(r => r.status()).sort(), [200, 200, 201]);
  assert.equal(await db.postalRecord.count({ where: { campusId, idempotencyKey: key } }), 1);
  const again = await record(desk, { referenceNo: "syn445501", idempotencyKey: randomUUID() });
  assert.equal(again.status(), 409, "the same parcel scanned again is refused");
  assert.match((await again.json()).error, /already recorded as PST-/);
  const sameDayNoRef = await Promise.all([record(desk, { toName: "Synthetic Clerk Bilal" }), record(desk, { toName: "Synthetic Clerk Bilal" })]);
  assert.deepEqual(sameDayNoRef.map(r => r.status()), [201, 201], "two same-day items without a reference are both allowed");
  assert.equal((await desk.request.delete(`${api}?id=x`)).status(), 405);
});

test("received → assigned → collected closes the item with a named handoff and leaves the queue", async () => {
  const desk = await context("desk");
  const created = await record(desk, { referenceNo: LONG_REF, ownerId: users.get("desk2")!.id });
  assert.equal(created.status(), 201);
  const code = (await created.json()).data.itemCode, row = await item(code);
  assert.equal(row.status, "ASSIGNED");
  assert.equal((await actions("desk2", row.id)).length, 1);
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "collect", handedTo: "" })).status(), 400, "a nameless handoff is refused");
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "deliver", handedTo: "x", note: "signed" })).status(), 409, "an incoming item is not delivered");
  const collected = await act(desk, { id: row.id, version: row.version, action: "collect", handedTo: "Synthetic Teacher Farah", note: "Synthetic: signed the desk book" });
  assert.equal(collected.status(), 200);
  const closed = await item(code);
  assert.equal(closed.status, "COLLECTED"); assert.ok(closed.closedAt);
  assert.equal((await actions("desk2", row.id))[0].resolution, "COMPLETED");
  const active = await (await desk.request.get(`${api}?view=active`)).json();
  assert.equal(active.data.some((r: { itemCode: string }) => r.itemCode === code), false, "it leaves the active queue");
  assert.deepEqual((await db.postalEvent.findMany({ where: { postalId: row.id }, orderBy: { createdAt: "asc" } })).map(e => e.kind), ["CREATED", "COLLECTED"]);
  assert.equal((await act(desk, { id: row.id, version: closed.version, action: "assign", ownerId: users.get("desk3")!.id })).status(), 409);
});

test("an outgoing item needs a courier to dispatch and proof to deliver; a tracking number is not delivery", async () => {
  const desk = await context("desk");
  const code = (await (await record(desk, { direction: "DISPATCH", toName: "Synthetic Board Office", courier: null })).json()).data.itemCode;
  let row = await item(code);
  assert.equal(row.status, "PREPARED");
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "deliver", handedTo: "Synthetic Clerk", note: "Synthetic: signed" })).status(), 409, "cannot deliver before dispatch");
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "dispatch" })).status(), 400, "a courier is required");
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "dispatch", courier: "Synthetic Post", referenceNo: "SYN-OUT-77" })).status(), 200);
  row = await item(code);
  assert.equal(row.status, "DISPATCHED");
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "deliver", handedTo: "Synthetic Clerk" })).status(), 400, "delivery needs how it was confirmed");
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "deliver", handedTo: "Synthetic Clerk Mona", note: "Synthetic: courier proof of delivery, signed by Mona" })).status(), 200);
  assert.equal((await item(code)).status, "DELIVERED");
});

test("a mistyped reference and a wrong handover are corrected with the original kept and found by the new value", async () => {
  const desk = await context("desk");
  const code = (await (await record(desk, { referenceNo: "SYN-TYPO-0001" })).json()).data.itemCode;
  let row = await item(code);
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "correct", fields: { referenceNo: "SYN-REAL-0001" } })).status(), 400, "a reason is required");
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "correct", fields: { referenceNo: "SYN-TYPO-0001" }, reason: "Synthetic: no change" })).status(), 400, "a no-op is refused");
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "correct", fields: { referenceNo: "SYN-REAL-0001" }, reason: "Synthetic: label misread" })).status(), 200);
  const stale = await act(desk, { id: row.id, version: row.version, action: "correct", fields: { courier: "Other" }, reason: "Synthetic: stale tab" });
  assert.equal(stale.status(), 409);
  row = await item(code);
  await act(desk, { id: row.id, version: row.version, action: "collect", handedTo: "Synthetic Wrong Person" });
  row = await item(code);
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "correct", fields: { handedTo: "Synthetic Teacher Farah" }, reason: "Synthetic: handed to the right person after a mix-up" })).status(), 200);
  const events = await db.postalEvent.findMany({ where: { postalId: row.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(events.map(e => e.kind), ["CREATED", "CORRECTED", "COLLECTED", "CORRECTED"]);
  assert.deepEqual(events[1].changes, { referenceNo: { from: "SYN-TYPO-0001", to: "SYN-REAL-0001" } });
  assert.deepEqual(events[3].changes, { handedTo: { from: "Synthetic Wrong Person", to: "Synthetic Teacher Farah" } });
  assert.equal((events[0].changes as { referenceNo: string }).referenceNo, "SYN-TYPO-0001", "the original stays in the CREATED event");
  const found = await (await desk.request.get(`${api}?view=all&q=SYN-REAL`)).json();
  assert.deepEqual(found.data.map((r: { itemCode: string }) => r.itemCode), [code]);
});

test("reassignment leaves one live notification; other campuses and teachers are refused", async () => {
  const desk = await context("desk"), other = await context("other"), teacher = await context("teacher");
  const code = (await (await record(desk, { ownerId: users.get("desk2")!.id, toName: "Synthetic Nurse Huda" })).json()).data.itemCode;
  const row = await item(code);
  assert.equal((await act(desk, { id: row.id, version: row.version, action: "assign", ownerId: users.get("desk3")!.id })).status(), 200);
  assert.equal((await actions("desk2", row.id))[0].resolution, "REASSIGNED");
  const live = await actions("desk3", row.id);
  assert.equal(live.length, 1); assert.equal(live[0].resolvedAt, null);
  const otherList = await (await other.request.get(`${api}?view=all`)).json();
  assert.equal(otherList.data.some((r: { itemCode: string }) => r.itemCode === code), false);
  assert.equal((await act(other, { id: row.id, action: "collect", handedTo: "Synthetic Intruder" })).status(), 404);
  assert.equal((await other.request.get(`${api}?history=${row.id}`)).status(), 404);
  assert.equal((await teacher.request.get(`${api}?view=all`)).status(), 403);
  assert.equal((await act(teacher, { id: row.id, action: "collect", handedTo: "Synthetic Teacher" })).status(), 403);
});

test("reception records a parcel in the UI, keeps the draft when the save fails and records it once on retry", async () => {
  const desk = await context("desk"), page = await desk.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/receptionist?view=postal`);
  const panel = page.locator("[data-postal-register]");
  await panel.locator("[data-postal]").first().waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Record item" }).first().click(); // PageHeader primary (role-ux §4.4)
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Record item" }).click();
  await dialog.locator("[data-postal-error]").waitFor();
  await dialog.getByLabel("For (recipient)").fill("Synthetic Librarian Zain");
  await dialog.getByLabel("Tracking or reference number (optional)").fill("SYN-UI-9001");
  await page.route("**/api/front-desk/postal", route => route.request().method() === "POST" ? route.abort("connectionreset") : route.continue());
  await dialog.getByRole("button", { name: "Record item" }).click();
  await dialog.locator("[data-postal-error]").filter({ hasText: /connection failed/ }).waitFor();
  assert.equal(await dialog.getByLabel("For (recipient)").inputValue(), "Synthetic Librarian Zain", "the draft is kept");
  await page.unroute("**/api/front-desk/postal");
  await dialog.getByRole("button", { name: "Record item" }).click();
  await dialog.locator("[data-postal-receipt]").waitFor({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Done" }).click();
  assert.equal(await db.postalRecord.count({ where: { campusId, referenceNo: "SYN-UI-9001" } }), 1);
  await panel.locator("[data-postal]").filter({ hasText: "Synthetic Librarian Zain" }).waitFor({ timeout: 15_000 });
  await shot(page, "postal-queue-en-1440");
  await panel.locator("[data-postal]").filter({ hasText: "Synthetic Librarian Zain" }).getByRole("button", { name: /Open postal item/ }).click();
  await page.getByRole("dialog").locator("[data-postal-history] [data-event]").first().waitFor();
  await shot(page, "postal-item-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Arabic reception at phone width reads the register right-to-left and wraps long references", async () => {
  const ctx = await context("desk-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await record(ctx, { referenceNo: `${LONG_REF}-AR`, toName: "Synthetic Teacher Rana" });
  await page.goto(`${base}/receptionist?view=postal`);
  await page.waitForLoadState("domcontentloaded");
  if (!page.url().includes("view=postal")) await page.goto(`${base}/receptionist?view=postal`);
  await page.locator("[data-postal-reference]").first().waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await page.locator("[data-postal-counts]").innerText(), /بانتظار الاستلام/);
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "long references wrap instead of overflowing");
  await shot(page, "postal-queue-ar-390");
  await page.close();
});
