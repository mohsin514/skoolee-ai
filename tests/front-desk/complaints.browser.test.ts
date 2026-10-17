import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-467 on the isolated app: a confidential concern never reaches the reception queue, direct link or
// dashboard; leaders and the assigned owner see it; every case has an owner or is explicitly unassigned;
// resolve and reopen need reasons and keep the original report and timing; a retried intake records
// once; stale edits and deletion are refused; other campuses and families see nothing.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DESK_TEST_APP || "http://localhost:3107";
const evidence = process.env.DESK_EVIDENCE_DIR || "/tmp/sko467-evidence";
const db = new PrismaClient(), password = "SyntheticCase467!";
const schoolId = `case467-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, routineId = "", confidentialId = "";
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

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
const api = `${base}/api/front-desk/complaints`;
const report = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.post(api, { data: { complainantName: "Synthetic Parent Rehan", type: "Transport", description: "Synthetic: the afternoon bus left fifteen minutes early twice this week.", date: today, ...body } });
const act = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.patch(api, { data: body });
const version = async (id: string) => (await db.complaint.findUniqueOrThrow({ where: { id } })).version;
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Olive Case School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Dubai", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[campusId, "Olive Creek"], [otherCampusId, "Olive Marina"]]) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Dubai" } });
  const lead = await user("lead", "PRINCIPAL"); await user("desk", "RECEPTIONIST"); await user("desk2", "RECEPTIONIST"); await user("desk-ar", "RECEPTIONIST", campusId, "ar");
  await user("other", "RECEPTIONIST", otherCampusId); await user("teacher", "TEACHER"); await user("parent", "PARENT");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Dubai", currency: "AED" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: lead, financeReviewedBy: lead } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("intake validates the report; a retried intake records once with a receipt code", async () => {
  const desk = await context("desk");
  for (const [body, message] of [[{ description: "short" }, /at least 10/], [{ date: "2099-01-01" }, /future/], [{ dueDate: daysAgo(3), date: today }, /cannot be before/], [{ confidential: true, ownerId: users.get("desk2")!.id }, /campus leader assigns/]] as const) {
    const response = await report(desk, body);
    assert.ok([400, 403].includes(response.status()), JSON.stringify(body));
    assert.match((await response.json()).error, message);
  }
  const key = randomUUID();
  const replies = await Promise.all([1, 2, 3].map(() => report(desk, { idempotencyKey: key, date: daysAgo(5) })));
  assert.deepEqual(replies.map(r => r.status()).sort(), [200, 200, 201]);
  const rows = await db.complaint.findMany({ where: { campusId, idempotencyKey: key } });
  assert.equal(rows.length, 1);
  assert.match(rows[0].referenceCode!, /^CMP-[0-9A-F]{8}$/);
  routineId = rows[0].id;
  assert.equal(await db.complaintEvent.count({ where: { complaintId: routineId, kind: "CREATED" } }), 1);
});

test("a confidential concern is hidden from reception and reaches leaders and the assigned owner", async () => {
  const desk = await context("desk"), lead = await context("lead"), desk2 = await context("desk2");
  const created = await report(desk, { confidential: true, anonymous: true, type: "Safeguarding", description: "Synthetic: a pupil said an adult at the gate made them uncomfortable." });
  assert.equal(created.status(), 201);
  const receipt = (await created.json()).data;
  assert.deepEqual(Object.keys(receipt).sort(), ["confidential", "referenceCode"], "reception gets a receipt, not the case");
  confidentialId = (await db.complaint.findFirstOrThrow({ where: { campusId, referenceCode: receipt.referenceCode } })).id;
  const queue = await (await desk.request.get(api + "?status=all")).json();
  assert.equal(queue.data.some((row: { id: string }) => row.id === confidentialId), false);
  assert.equal(JSON.stringify(queue).includes("Safeguarding"), false);
  assert.equal((await desk.request.get(`${api}?id=${confidentialId}`)).status(), 404, "a direct link reveals nothing");
  assert.equal((await act(desk, { id: confidentialId, action: "note", note: "Synthetic peek" })).status(), 404);
  const leadView = await (await lead.request.get(`${api}?id=${confidentialId}`)).json();
  assert.deepEqual([leadView.data.confidential, leadView.data.complainantName], [true, "Anonymous"]);
  assert.equal((await act(desk, { id: routineId, action: "assign", ownerId: users.get("desk2")!.id })).status(), 200, "reception may assign routine cases");
  assert.equal((await act(lead, { id: confidentialId, action: "assign", ownerId: users.get("desk2")!.id, dueDate: today, version: await version(confidentialId) })).status(), 200);
  assert.equal((await desk2.request.get(`${api}?id=${confidentialId}`)).status(), 200, "the assigned owner can open it");
  assert.equal((await desk.request.get(`${api}?id=${confidentialId}`)).status(), 404, "still hidden from the rest of reception");
  const summary = await db.complaint.groupBy({ by: ["status"], where: { campusId, schoolId, confidential: false }, _count: true });
  assert.equal(summary.reduce((n, g) => n + g._count, 0), 1, "the reception dashboard counts only routine cases");
});

test("owner and due date, resolve and reopen need reasons and keep the original report and history", async () => {
  const lead = await context("lead"), desk2 = await context("desk2");
  const original = await db.complaint.findUniqueOrThrow({ where: { id: routineId } });
  assert.equal((await act(lead, { id: routineId, action: "assign", ownerId: users.get("desk2")!.id, dueDate: daysAgo(1), version: original.version })).status(), 200);
  const overdue = await (await lead.request.get(api)).json();
  assert.equal(overdue.counts.overdue, 1);
  assert.equal(overdue.data.find((row: { id: string }) => row.id === routineId).overdue, true);
  assert.equal((await act(desk2, { id: routineId, action: "start", version: await version(routineId) })).status(), 200);
  assert.equal((await act(desk2, { id: routineId, action: "note", note: "Synthetic: called the transport office", version: await version(routineId) })).status(), 200);
  assert.equal((await act(desk2, { id: routineId, action: "resolve", resolution: "", version: await version(routineId) })).status(), 400);
  const stale = await version(routineId) - 1;
  assert.equal((await act(desk2, { id: routineId, action: "resolve", resolution: "Synthetic: timetable fixed", version: stale })).status(), 409, "a stale edit is refused");
  assert.equal((await act(desk2, { id: routineId, action: "resolve", resolution: "Synthetic: bus timetable corrected with the driver", publicResponse: "The bus now leaves at the published time.", version: await version(routineId) })).status(), 200);
  assert.equal((await act(lead, { id: routineId, action: "reopen", reason: "no", version: await version(routineId) })).status(), 400);
  assert.equal((await act(lead, { id: routineId, action: "reopen", reason: "Synthetic: the parent reports it happened again", version: await version(routineId) })).status(), 200);
  const after = await (await lead.request.get(`${api}?id=${routineId}`)).json();
  assert.deepEqual(after.data.events.map((event: { kind: string }) => event.kind), ["CREATED", "ASSIGNED", "ASSIGNED", "STATUS", "NOTE", "RESOLVED", "REOPENED"]);
  assert.deepEqual([after.data.status, after.data.reopenedCount, after.data.description, after.data.date], ["OPEN", 1, original.description, original.date.toISOString()], "the original report and timing are unchanged");
  assert.equal(after.data.events.find((event: { kind: string }) => event.kind === "RESOLVED").note, "Synthetic: bus timetable corrected with the driver", "the earlier resolution is kept in history");
  assert.equal((await lead.request.delete(`${api}?id=${routineId}`)).status(), 405);
});

test("other campuses, teachers and families cannot reach complaints", async () => {
  const other = await context("other");
  assert.equal((await other.request.get(`${api}?campusId=${campusId}`)).status(), 403);
  assert.equal((await act(other, { id: routineId, action: "note", note: "Synthetic cross-campus" })).status(), 404);
  assert.equal((await (await other.request.get(api)).json()).data.length, 0);
  for (const key of ["teacher", "parent"]) {
    const ctx = await context(key);
    assert.equal((await ctx.request.get(api)).status(), 403, key);
    assert.equal((await ctx.request.get(`${api}?id=${confidentialId}`)).status(), 403, key);
  }
});

test("reception records a routine complaint and gets a receipt; the leader reviews a confidential case", async () => {
  const desk = await context("desk"), page = await desk.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/receptionist?view=complaints`);
  const panel = page.locator("[data-complaints-desk]");
  await panel.getByRole("button", { name: "Record complaint" }).click({ timeout: 30_000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Record complaint" }).click();
  await dialog.locator("[data-complaint-error]").waitFor();
  await dialog.getByLabel("Complainant name").fill("Synthetic Parent Amna");
  await dialog.getByLabel("Category").fill("Canteen");
  await dialog.getByLabel("What happened").fill("Synthetic: lunch was served cold three days in a row.");
  await shot(page, "complaints-intake-en-1440");
  await dialog.getByRole("button", { name: "Record complaint" }).click();
  await dialog.locator("[data-complaint-receipt]").waitFor({ timeout: 15_000 });
  assert.match(await dialog.innerText(), /CMP-[0-9A-F]{8}/);
  await dialog.getByRole("button", { name: "Done" }).click();
  await panel.locator("[data-complaint]").filter({ hasText: "Canteen" }).waitFor({ timeout: 15_000 });
  assert.equal(await panel.locator('[data-confidential="true"]').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();

  const lead = await context("lead"), leaderPage = await lead.newPage();
  await leaderPage.goto(`${base}/principal?view=complaints`);
  const leaderPanel = leaderPage.locator("[data-complaints-desk]");
  await leaderPanel.locator('[data-confidential="true"]').waitFor({ timeout: 30_000 });
  await leaderPanel.locator('[data-confidential="true"]').getByRole("button", { name: /Open complaint/ }).click();
  const caseView = leaderPage.getByRole("dialog").locator("[data-complaint-case]");
  await caseView.locator("[data-case-history] [data-event]").first().waitFor();
  await shot(leaderPage, "complaints-confidential-case-en-1440");
  await leaderPage.close();
});

test("Arabic reception at phone width reads the queue right-to-left without overflow", async () => {
  const ctx = await context("desk-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/receptionist?view=complaints`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("view=complaints")) await page.goto(`${base}/receptionist?view=complaints`);
  await page.locator("[data-complaint]").first().waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await page.locator("[data-complaint-counts]").innerText(), /غير مسندة/);
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(page, "complaints-queue-ar-390");
  await page.close();
});
