import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-441 on the isolated app with synthetic data and a synthetic object store (the app runs with
// S3_ENDPOINT=http://127.0.0.1:55441). A projector fault is suggested to IT and lands in its unassigned
// queue; an AC leak goes to the facilities owner; a safety report is urgent and reaches the escalation
// contact; a retried submission keeps one request; requesters never see internal notes or photos; priority
// and due changes keep reason and before/after; an overdue request escalates once per due time; resolving
// needs the work performed; the requester confirms or reopens, and reopening keeps the first timings.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.SERVICE_DESK_TEST_APP || "http://localhost:3107";
const evidence = process.env.SERVICE_DESK_EVIDENCE_DIR || "/tmp/sko441-evidence";
const db = new PrismaClient(), password = "SyntheticDesk441!";
const schoolId = `desk441-${randomUUID()}`, campusId = randomUUID(), otherSchool = `desk441o-${randomUUID()}`, otherCampus = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
const objects = new Map<string, Buffer>();
let browser: Browser;
// A 1×1 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const store = createServer((req, res) => {
  const path = decodeURIComponent((req.url || "").split("?")[0]).split("/").slice(2).join("/");
  if (req.method === "PUT") { const chunks: Buffer[] = []; req.on("data", c => chunks.push(Buffer.from(c))); req.on("end", () => { if (objects.has(path)) { res.writeHead(412); res.end("<Error><Code>PreconditionFailed</Code></Error>"); return; } objects.set(path, Buffer.concat(chunks)); res.writeHead(200, { etag: '"s"' }); res.end(); }); return; }
  const body = objects.get(path); if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "image/png", "content-length": body.length }); res.end(req.method === "HEAD" ? undefined : body);
});

async function user(key: string, role: string, school = schoolId, campus = campusId, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId: school, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
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
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const out = { status: r.status(), json: await r.json().catch(() => ({})) }; await ctx.close(); return out; };
const id = (key: string) => users.get(key)!.id;
const notices = (key: string, type: string) => db.notification.count({ where: { userId: id(key), type } });
const view = async (key: string, rid: string) => { const r = await call(key, "get", `/api/service-desk/${rid}`); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json.data; };
const act = async (key: string, rid: string, body: Record<string, unknown>) => { const v = (await db.serviceRequest.findUniqueOrThrow({ where: { id: rid } })).version; return call(key, "post", `/api/service-desk/${rid}`, { knownVersion: v, ...body }); };
const submit = (key: string, body: Record<string, unknown>) => call(key, "post", "/api/service-desk", { action: "request", idempotencyKey: `k-${randomUUID()}`, ...body });

before(async () => {
  await new Promise<void>(resolve => store.listen(55441, "127.0.0.1", resolve));
  for (const [sid, cid, name] of [[schoolId, campusId, "Synthetic Maple School"], [otherSchool, otherCampus, "Synthetic Birch School"]]) {
    await db.school.create({ data: { id: sid, name, slug: sid, regId: sid, contactEmail: `${sid}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
    await db.campus.create({ data: { id: cid, schoolId: sid, name: `${name} North`, regId: cid, city: "Lahore" } });
    await db.academicCycle.create({ data: { schoolId: sid, campusId: cid, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  }
  await user("coordinator", "CAMPUS_ADMIN"); await user("teacher", "TEACHER"); await user("colleague", "TEACHER"); await user("teacher-ar", "TEACHER", schoolId, campusId, "ar");
  await user("itTech", "LIBRARIAN"); await user("facTech", "RECEPTIONIST"); await user("outsider", "TEACHER", otherSchool, otherCampus);
  const it = await db.department.create({ data: { schoolId, campusId, name: "IT", kind: "ADMIN_UNIT" } });
  await db.departmentMember.create({ data: { schoolId, departmentId: it.id, userId: id("itTech"), role: "MEMBER", isPrimary: true } });
  ids.itDept = it.id;
  ids.room = (await db.classRoom.create({ data: { schoolId, campusId, roomNumber: "Room 12" } as never })).id;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); store.close(); for (const sid of [schoolId, otherSchool]) await db.school.delete({ where: { id: sid } }).catch(() => undefined); await db.$disconnect(); });

test("leaders set request types with real routing; targets are the school's own", async () => {
  assert.equal((await call("teacher", "post", "/api/service-desk", { action: "category", name: "X", kind: "REPAIR", team: "IT" })).status, 403);
  assert.equal((await call("coordinator", "post", "/api/service-desk", { action: "category", name: "Gas or electrical danger", kind: "REPAIR", team: "Facilities", safety: true })).status, 400, "a safety type needs an escalation contact");
  const it = await call("coordinator", "post", "/api/service-desk", { action: "category", name: "Projector or computer", kind: "REPAIR", team: "IT", departmentId: ids.itDept, keywords: "projector, computer, wifi", responseHours: 4, resolveHours: 24, escalationId: id("coordinator") });
  assert.equal(it.status, 201, JSON.stringify(it.json)); ids.catIt = it.json.data.id;
  ids.catFac = (await call("coordinator", "post", "/api/service-desk", { action: "category", name: "Leak or air conditioning", kind: "REPAIR", team: "Facilities", defaultOwnerId: id("facTech"), keywords: ["leak", "air conditioning", " ac "], resolveHours: 48 })).json.data.id;
  ids.catSafety = (await call("coordinator", "post", "/api/service-desk", { action: "category", name: "Gas or electrical danger", kind: "REPAIR", team: "Facilities", safety: true, escalationId: id("coordinator"), keywords: ["gas", "smoke", "sparks"] })).json.data.id;
  ids.catInfo = (await call("coordinator", "post", "/api/service-desk", { action: "category", name: "Ask the office", kind: "INFORMATION", team: "Office", defaultOwnerId: id("coordinator") })).json.data.id;
  assert.equal((await call("coordinator", "post", "/api/service-desk", { action: "category", name: "Ask the office", kind: "INFORMATION", team: "Office" })).status, 409);
});

test("routing: projector to IT's unassigned queue, AC leak to facilities, safety straight to escalation", async () => {
  const form = (await call("teacher", "get", `/api/service-desk?view=form&text=${encodeURIComponent("The projector in Room 12 will not turn on")}`)).json.data;
  assert.equal(form.suggestion.categoryId, ids.catIt, "suggested, not decided");
  assert.equal(form.categories.some((c: { keywords?: unknown }) => "keywords" in c), false);
  assert.equal((await call("teacher", "get", `/api/service-desk?view=form&text=${encodeURIComponent("Water leak under the air conditioning unit")}`)).json.data.suggestion.categoryId, ids.catFac);
  const key = `retry-${randomUUID()}`;
  const first = await submit("teacher", { categoryId: ids.catIt, title: "Projector will not turn on", description: "The projector in Room 12 shows no light. Lesson at 10:00.", location: "Room 12", roomId: ids.room, idempotencyKey: key, photo: { data: PNG, contentType: "image/png" } });
  assert.equal(first.status, 201, JSON.stringify(first.json)); ids.proj = first.json.data.id;
  assert.match(first.json.data.reference, /^SD-\d+$/);
  const retry = await submit("teacher", { categoryId: ids.catIt, title: "Projector will not turn on", description: "same", location: "Room 12", idempotencyKey: key });
  assert.deepEqual([retry.status, retry.json.data.reference, retry.json.data.repeated], [200, first.json.data.reference, true], "a retried submission keeps one request");
  assert.equal(await db.serviceRequest.count({ where: { schoolId } }), 1);
  const leak = await submit("teacher", { categoryId: ids.catFac, title: "AC leaking", description: "Water is dripping from the air conditioning unit onto desks.", location: "Library" });
  ids.leak = leak.json.data.id;
  assert.equal(leak.json.data.ownerAssigned, true);
  assert.equal(await notices("facTech", "SERVICE_REQUEST_ASSIGNED"), 1);
  const gas = await submit("colleague", { categoryId: ids.catSafety, title: "Smell of gas", description: "Smell of gas near the science lab.", location: "Science block" });
  ids.gas = gas.json.data.id;
  assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: ids.gas } })).priority, "URGENT");
  assert.equal(await notices("coordinator", "SERVICE_SAFETY_REPORTED"), 1);
  assert.equal((await act("coordinator", ids.gas, { action: "priority", priority: "LOW", reason: "test" })).status, 409, "safety stays urgent");
  // Queues: IT sees the unassigned projector only; facilities sees the leak; the leader sees everything.
  const itQ = (await call("itTech", "get", "/api/service-desk?view=queue")).json.data;
  assert.deepEqual(itQ.requests.map((r: { id: string; ownerId: string | null }) => [r.id, r.ownerId]), [[ids.proj, null]]);
  assert.deepEqual((await call("facTech", "get", "/api/service-desk?view=queue")).json.data.requests.map((r: { id: string }) => r.id), [ids.leak]);
  const lead = (await call("coordinator", "get", "/api/service-desk?view=queue")).json.data.requests;
  assert.equal(lead.length, 3); assert.equal(lead[0].ownerId, null, "unassigned first");
  assert.equal((await call("facTech", "get", `/api/service-desk/${ids.proj}`)).status, 404, "outside the service scope");
  assert.equal((await call("outsider", "get", `/api/service-desk/${ids.proj}`)).status, 404, "another school's request");
  assert.equal((await call("colleague", "get", `/api/service-desk/${ids.proj}`)).status, 404, "another staff member's request");
});

test("work: reasons and before/after kept; requesters never see internal notes or private photos", async () => {
  assert.equal((await act("teacher", ids.proj, { action: "start" })).status, 403, "the requester cannot act as the team");
  assert.equal((await act("itTech", ids.proj, { action: "start" })).status, 200);
  let row = await db.serviceRequest.findUniqueOrThrow({ where: { id: ids.proj } });
  assert.deepEqual([row.status, row.ownerId, Boolean(row.firstResponseAt)], ["IN_PROGRESS", id("itTech"), true], "starting takes ownership and is the first response");
  ids.firstResponse = row.firstResponseAt!.toISOString();
  assert.equal((await act("itTech", ids.proj, { action: "priority", priority: "HIGH" })).status, 400, "a reason is required");
  assert.equal((await act("itTech", ids.proj, { action: "priority", priority: "HIGH", reason: "Exam lesson in this room tomorrow" })).status, 200);
  const due = new Date(Date.now() + 5 * 3_600_000).toISOString();
  assert.equal((await act("itTech", ids.proj, { action: "due", resolveDueAt: due, reason: "Replacement lamp arrives this afternoon" })).status, 200);
  const changes = await db.serviceRequestEvent.findMany({ where: { requestId: ids.proj, kind: { in: ["PRIORITY", "DUE"] } }, orderBy: { version: "asc" } });
  assert.deepEqual(changes.map(e => [e.kind, e.actorId, e.body, (e.detail as { before: unknown }).before !== undefined]), [["PRIORITY", id("itTech"), "Exam lesson in this room tomorrow", true], ["DUE", id("itTech"), "Replacement lamp arrives this afternoon", true]]);
  assert.equal((await act("itTech", ids.proj, { action: "note", body: "PRIVATE-NOTE-441: lamp hours exceeded; warranty claim", photo: { data: PNG, contentType: "image/png" } })).status, 200);
  assert.equal((await act("itTech", ids.proj, { action: "update", body: "A technician will replace the lamp this afternoon." })).status, 200);
  assert.equal((await act("teacher", ids.proj, { action: "watch", watcherId: id("colleague") })).status, 200);
  const requester = await view("teacher", ids.proj);
  assert.ok(requester.events.every((e: { visibility: string }) => e.visibility === "REQUESTER"));
  assert.ok(!JSON.stringify(requester).includes("PRIVATE-NOTE-441") && !JSON.stringify(requester).includes("warranty"), "no internal note reaches the requester");
  assert.deepEqual(requester.events.map((e: { kind: string }) => e.kind), ["CREATED", "STATUS", "UPDATE"]);
  const watcher = await view("colleague", ids.proj);
  assert.equal(watcher.events.length, 3, "a watcher sees the same requester view");
  const internal = await db.serviceRequestEvent.findFirstOrThrow({ where: { requestId: ids.proj, kind: "NOTE", attachmentKey: { not: null } } });
  assert.equal((await (await context("teacher")).request.get(`${base}/api/service-desk/${ids.proj}?attachment=${internal.id}`)).status(), 404, "an internal photo is hidden from the requester");
  assert.equal((await (await context("itTech")).request.get(`${base}/api/service-desk/${ids.proj}?attachment=${internal.id}`)).status(), 200);
  const own = await db.serviceRequestEvent.findFirstOrThrow({ where: { requestId: ids.proj, kind: "CREATED" } });
  assert.equal((await (await context("teacher")).request.get(`${base}/api/service-desk/${ids.proj}?attachment=${own.id}`)).status(), 200, "the requester's own photo");
  assert.equal(await notices("teacher", "SERVICE_REQUEST_UPDATED"), 2);
  assert.equal(await notices("colleague", "SERVICE_REQUEST_UPDATED"), 0, "watching started after those updates");
  row = await db.serviceRequest.findUniqueOrThrow({ where: { id: ids.proj } });
  assert.equal((await call("itTech", "post", `/api/service-desk/${ids.proj}`, { action: "update", body: "stale", knownVersion: row.version - 1 })).status, 409, "a stale version is refused");
});

test("an overdue request escalates once per due time; reassigning keeps the response clock", async () => {
  await db.serviceRequest.update({ where: { id: ids.leak }, data: { resolveDueAt: new Date(Date.now() - 60_000) } });
  const ctx = await browser.newContext();
  const [a, b] = await Promise.all([ctx.request.post(`${base}/api/cron/service-desk`), ctx.request.post(`${base}/api/cron/service-desk`)]);
  assert.deepEqual([a.status(), b.status()], [200, 200]);
  await ctx.request.post(`${base}/api/cron/service-desk`);
  assert.equal(await notices("facTech", "SERVICE_REQUEST_ESCALATED"), 1, "one escalation to the configured owner");
  assert.equal(await db.serviceRequestEvent.count({ where: { requestId: ids.leak, kind: "ESCALATED" } }), 1);
  assert.equal((await act("coordinator", ids.leak, { action: "assign", ownerId: id("itTech"), reason: "Facilities on leave today" })).status, 200);
  assert.equal(await notices("itTech", "SERVICE_REQUEST_ASSIGNED"), 1);
  await db.serviceRequest.update({ where: { id: ids.leak }, data: { resolveDueAt: new Date(Date.now() - 30_000) } });
  await ctx.request.post(`${base}/api/cron/service-desk`);
  assert.equal(await db.serviceRequestEvent.count({ where: { requestId: ids.leak, kind: "ESCALATED" } }), 2, "a new due time can escalate again");
  await ctx.close();
  assert.equal((await db.serviceRequest.findUniqueOrThrow({ where: { id: ids.leak } })).firstResponseAt, null, "reassignment is not a response");
});

test("resolve needs the work performed; the requester confirms or reopens and first timings are kept", async () => {
  assert.equal((await act("itTech", ids.proj, { action: "resolve" })).status, 400);
  assert.equal((await act("itTech", ids.proj, { action: "resolve", workPerformed: "Replaced the projector lamp and tested with a laptop.", photo: { data: PNG, contentType: "image/png" } })).status, 200);
  const first = await db.serviceRequest.findUniqueOrThrow({ where: { id: ids.proj } });
  assert.equal(first.status, "RESOLVED");
  assert.equal(await notices("teacher", "SERVICE_REQUEST_RESOLVED"), 1);
  assert.equal((await act("colleague", ids.proj, { action: "confirm" })).status, 403, "only the requester confirms");
  assert.equal((await act("teacher", ids.proj, { action: "reopen" })).status, 400, "say what is still wrong");
  assert.equal((await act("teacher", ids.proj, { action: "reopen", reason: "The image flickers after ten minutes." })).status, 200);
  const reopened = await db.serviceRequest.findUniqueOrThrow({ where: { id: ids.proj } });
  assert.deepEqual([reopened.status, reopened.reopenedCount, reopened.firstResponseAt?.toISOString(), reopened.firstResolvedAt?.toISOString(), reopened.resolvedAt], ["IN_PROGRESS", 1, ids.firstResponse, first.firstResolvedAt?.toISOString(), null], "original response and resolution times are kept");
  assert.equal(await notices("itTech", "SERVICE_REQUEST_REOPENED"), 1);
  assert.equal((await act("itTech", ids.proj, { action: "resolve", workPerformed: "Replaced the HDMI cable; ran for 30 minutes without flicker." })).status, 200);
  assert.equal((await act("teacher", ids.proj, { action: "confirm", body: "Working now, thank you." })).status, 200);
  const closed = await db.serviceRequest.findUniqueOrThrow({ where: { id: ids.proj } });
  assert.deepEqual([closed.status, Boolean(closed.closedAt)], ["CLOSED", true]);
  const resolved = await db.serviceRequestEvent.findMany({ where: { requestId: ids.proj, kind: "RESOLVED" }, orderBy: { version: "asc" } });
  assert.deepEqual(resolved.map(e => e.visibility), ["REQUESTER", "REQUESTER"], "the work performed is shown to the requester");
});

test("screens: new request (EN, phone), queue, team detail with internal marker, requester view in Arabic", async () => {
  const phone = await (await context("teacher", { width: 390, height: 844 })).newPage();
  await phone.goto(`${base}/service-desk?tab=new`); // Help → "Report a problem" deep link (role-ux §4.2)
  await phone.locator("[data-sd-new] input").first().fill("Wifi not working");
  await phone.locator("[data-sd-new] textarea").first().fill("The wifi in the staff room drops every few minutes.");
  await phone.waitForFunction(() => (document.querySelector("[data-sd-category]") as HTMLSelectElement | null)?.value !== "");
  const wide = await phone.evaluate(() => [...document.querySelectorAll("[data-service-desk] *")].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 5).map(el => `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 120)));
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `no sideways scroll at phone width: ${wide.join(" | ")}`);
  await shot(phone, "01-new-request-suggested-phone");
  await phone.close();
  const lead = await (await context("coordinator")).newPage();
  await lead.goto(`${base}/service-desk?tab=queue`);
  await lead.locator("[data-sd-queue] [data-sd-row]").first().waitFor();
  await shot(lead, "02-queue-unassigned-first");
  await lead.close();
  const tech = await (await context("itTech")).newPage();
  await tech.goto(`${base}/service-desk?tab=queue`);
  await tech.locator("[data-sd-queue] [data-sd-row]").first().click();
  await tech.locator("[data-sd-detail] [data-sd-visibility=INTERNAL]").first().waitFor();
  await shot(tech, "03-team-detail-internal-marked");
  await tech.close();
  const req = await submit("teacher-ar", { categoryId: ids.catInfo, title: "Exam hall booking", description: "Which hall is free on Thursday afternoon?", location: "Office" });
  await act("coordinator", req.json.data.id, { action: "update", body: "Hall B is free from 13:00." });
  await act("coordinator", req.json.data.id, { action: "note", body: "PRIVATE: check with the bursar" });
  const ar = await (await context("teacher-ar")).newPage();
  await ar.goto(`${base}/service-desk`);
  await ar.locator(`[data-sd-row="${req.json.data.reference}"]`).click();
  await ar.locator("[data-sd-detail]").waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  assert.ok(!(await ar.locator("[data-sd-detail]").innerText()).includes("PRIVATE"));
  await shot(ar, "04-requester-view-ar");
  await ar.close();
});
