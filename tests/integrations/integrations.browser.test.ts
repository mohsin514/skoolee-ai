import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { conforms, V1 } from "../../src/lib/integrations/contract";

// SKO-445 on the isolated app (started with INTEGRATION_TEST_ALLOWED_HOSTS=127.0.0.1:55463, INTEGRATION_TIMEOUT_MS=1500)
// and synthetic data: scoped keys never see another campus or school; keys show once, rotate with overlap and
// revoke at once; inbound commands are idempotent; webhooks are signed with a stable event id, retried with
// backoff to a terminal failure, never sent to internal addresses or through redirects, and replay keeps the id
// so a deduplicating consumer makes one logical change.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.INTEGRATIONS_TEST_APP || "http://localhost:3107";
const evidence = process.env.INTEGRATIONS_EVIDENCE_DIR || "/tmp/sko445-evidence";
const db = new PrismaClient(), password = "SyntheticIntegrations445!";
const schoolId = `int445-${randomUUID()}`, otherSchool = `int445o-${randomUUID()}`, north = randomUUID(), south = randomUUID(), otherCampus = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {}, keys: Record<string, string> = {};
let browser: Browser, receiver: ChildProcess;
// The synthetic consumer runs in its own process (tests/integrations/receiver.mjs) and applies each event id once.
const R = "http://127.0.0.1:55463";
const setMode = (m: "ok" | "slow" | "500" | "429" | "redirect") => fetch(`${R}/_mode?m=${m}`).then(r => r.text());
const log = async () => (await fetch(`${R}/_log`).then(r => r.json())) as { received: { id: string; signature: string; body: string; attempt: string }[]; applied: string[] };

async function user(key: string, role: string, campus = north, language = "en", school = schoolId) {
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
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string } = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const admin = (key: string, data: Record<string, unknown>) => call(key, "post", "/api/integrations", data);
const api = async (token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(`${base}/api/public/v1${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json: any = {}; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text, headers: r.headers };
};
const deliver = () => admin("owner", { action: "deliver-now" });
const delivery = (eventId: string) => db.integrationDelivery.findFirstOrThrow({ where: { eventId, connectionId: ids.conn } });
const verify = (secret: string, header: string, body: string) => { const t = /t=(\d+)/.exec(header)![1]; const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"); return header.split(",").filter(p => p.startsWith("v1=")).map(p => p.slice(3)).includes(expected); };

before(async () => {
  for (const [sid, name] of [[schoolId, "Synthetic Cedar Group"], [otherSchool, "Synthetic Other School"]]) await db.school.create({ data: { id: sid, name, slug: sid, regId: sid, contactEmail: `${sid}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi" } as never });
  for (const [sid, cid, name] of [[schoolId, north, "Cedar North"], [schoolId, south, "Cedar South"], [otherSchool, otherCampus, "Other Main"]]) {
    await db.campus.create({ data: { id: cid, schoolId: sid, name, regId: cid, city: "Lahore" } });
    const classId = randomUUID();
    await db.class.create({ data: { id: classId, schoolId: sid, campusId: cid, name: "Grade 4", section: "A", academicYear: 2026 } });
    for (let i = 0; i < 3; i++) { const id = randomUUID(); ids[`${name}-${i}`] = id; await db.student.create({ data: { id, schoolId: sid, campusId: cid, classId, fullName: `Synthetic ${name} Pupil ${i}`, rollNo: String(i + 1), gender: "OTHER", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); }
  }
  await user("owner", "SUPER_ADMIN"); await user("principal", "PRINCIPAL"); await user("teacher", "TEACHER"); await user("principal-ar", "PRINCIPAL", north, "ar");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  receiver = spawn(process.execPath, ["tests/integrations/receiver.mjs"], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise<void>(r => receiver.stdout!.on("data", d => { if (String(d).includes("receiver ready")) r(); }));
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); receiver?.kill(); for (const sid of [schoolId, otherSchool]) await db.school.delete({ where: { id: sid } }).catch(() => undefined); await db.$disconnect(); });

test("connections: admins only, own campus only, safe destinations, secrets shown once and never listed", async () => {
  assert.equal((await call("teacher", "get", "/api/integrations")).status, 403);
  assert.equal((await admin("principal", { action: "create", name: "Synthetic SIS", campusIds: [south], scopes: ["roster.read"] })).status, 403, "a campus leader connects only their campus");
  assert.equal((await admin("principal", { action: "create", name: "Synthetic SIS", campusIds: [north], scopes: ["roster.read"], topics: ["student.updated"], webhookUrl: "http://example.org/hook" })).status, 400, "HTTPS required");
  assert.equal((await admin("principal", { action: "create", name: "Synthetic SIS", campusIds: [north], scopes: ["roster.read"], topics: ["student.updated"], webhookUrl: "https://u:p@example.org/hook" })).status, 400, "no credentials in the URL");
  assert.equal((await admin("principal", { action: "create", name: "Synthetic SIS", campusIds: [north], scopes: ["admin.all"] })).status, 400, "only defined scopes");
  const c = await admin("principal", { action: "create", name: "Synthetic North SIS", campusIds: [north], scopes: ["roster.read", "roster.write"], topics: ["student.updated", "connection.test"], webhookUrl: "http://127.0.0.1:55463/hook" });
  assert.equal(c.status, 201, c.body);
  ids.conn = c.json.data.id; keys.k1 = c.json.data.apiKey; keys.sign1 = c.json.data.signingSecret;
  assert.match(keys.k1, /^skc_[0-9a-f]{12}\.[A-Za-z0-9_-]{30,}$/); assert.match(keys.sign1, /^whsec_/);
  const list = await call("principal", "get", "/api/integrations");
  assert.ok(!list.body.includes(keys.k1.split(".")[1]) && !list.body.includes(keys.sign1), "no secret in the list");
  const row = await db.integrationConnection.findUniqueOrThrow({ where: { id: ids.conn } });
  assert.ok(!row.signingSecret!.includes(keys.sign1), "the signing secret is encrypted at rest");
  const cred = await db.integrationCredential.findFirstOrThrow({ where: { connectionId: ids.conn } });
  assert.ok(!cred.secretHash.includes(keys.k1.split(".")[1]) && cred.secretHash.length === 64, "only a hash of the key is stored");
  const ro = await admin("owner", { action: "create", name: "Synthetic Read-only", campusIds: [north, south], scopes: ["roster.read"], rateLimitPerMinute: 3 });
  ids.ro = ro.json.data.id; keys.ro = ro.json.data.apiKey;
});

test("public v1: every request checks the key and scope; other campuses and schools look like not found", async () => {
  assert.equal((await api(null, "GET", "/students")).json.error.code, "UNAUTHENTICATED");
  assert.equal((await api("skc_000000000000.nope", "GET", "/students")).status, 401);
  const contract = await fetch(`${base}/api/public/v1/contract`).then(r => r.json());
  assert.equal(contract.version, "v1"); assert.ok(contract.deprecation && contract.ordering && contract.idempotency);
  const page = await api(keys.k1, "GET", "/students?limit=2");
  assert.equal(page.status, 200); assert.equal(page.headers.get("skoolee-api-version"), "v1");
  const all: string[] = [];
  let cursor: string | null = null, r = page;
  for (let i = 0; i < 5; i++) { all.push(...r.json.data.map((s: { id: string }) => s.id)); for (const s of r.json.data) assert.deepEqual(conforms(V1.resources.student, s), [], "matches the frozen contract"); cursor = r.json.nextCursor; if (!cursor) break; r = await api(keys.k1, "GET", `/students?limit=2&cursor=${cursor}`); }
  assert.deepEqual(all.sort(), [ids["Cedar North-0"], ids["Cedar North-1"], ids["Cedar North-2"]].sort(), "only North, no duplicates across pages");
  const southCampus = await api(keys.k1, "GET", `/students?campusId=${south}`);
  const missing = await api(keys.k1, "GET", `/students/${randomUUID()}`), southPupil = await api(keys.k1, "GET", `/students/${ids["Cedar South-0"]}`), otherPupil = await api(keys.k1, "GET", `/students/${ids["Other Main-0"]}`);
  assert.equal(southCampus.status, 404);
  assert.deepEqual([missing.status, southPupil.status, otherPupil.status], [404, 404, 404]);
  assert.equal(southPupil.text, missing.text, "out of scope is indistinguishable from missing");
  assert.equal((await api(keys.ro, "POST", "/external-ids", { studentId: ids["Cedar North-0"], system: "x", externalId: "1" }, { "Idempotency-Key": randomUUID() })).json.error.code, "FORBIDDEN_SCOPE");
  // Rate limit: 3 per minute for the read-only connection.
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await api(keys.ro, "GET", "/students?limit=1")).status);
  assert.deepEqual(codes, [200, 200, 200, 429]);
  const limited = await api(keys.ro, "GET", "/students?limit=1");
  assert.deepEqual([limited.json.error.code, limited.headers.get("retry-after")], ["RATE_LIMITED", "60"]);
});

test("inbound commands are idempotent and emit one event; delivery is signed with a stable event id", async () => {
  const body = { studentId: ids["Cedar North-0"], system: "synthetic-sis", externalId: "SIS-1001" };
  assert.equal((await api(keys.k1, "POST", "/external-ids", body)).json.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const key = randomUUID();
  const first = await api(keys.k1, "POST", "/external-ids", body, { "Idempotency-Key": key });
  assert.equal(first.status, 200, first.text);
  const again = await api(keys.k1, "POST", "/external-ids", body, { "Idempotency-Key": key });
  assert.deepEqual([again.status, again.headers.get("idempotent-replayed"), again.json], [200, "true", first.json]);
  assert.equal((await api(keys.k1, "POST", "/external-ids", { ...body, externalId: "SIS-9999" }, { "Idempotency-Key": key })).json.error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal((await api(keys.k1, "POST", "/external-ids", { ...body, studentId: ids["Cedar South-0"] }, { "Idempotency-Key": randomUUID() })).status, 404, "cannot write outside the campus");
  assert.equal(await db.integrationExternalRef.count({ where: { connectionId: ids.conn } }), 1);
  const events = await db.integrationEvent.findMany({ where: { schoolId, topic: "student.updated" } });
  assert.equal(events.length, 1, "one logical change, one event");
  ids.ev1 = events[0].id;
  await setMode("ok");
  await deliver();
  const d = await delivery(ids.ev1);
  assert.equal(d.status, "DELIVERED");
  const req = (await log()).received.find(x => x.id === ids.ev1)!;
  assert.ok(verify(keys.sign1, req.signature, req.body), "HMAC signature verifies with the shown secret");
  const env = JSON.parse(req.body);
  assert.deepEqual([env.id, env.topic, env.contractVersion], [ids.ev1, "student.updated", "v1"]);
  assert.deepEqual(conforms(V1.topics["student.updated"], env.data), []);
});

test("a timeout after the consumer committed, then replay with the same id: one logical change", async () => {
  await setMode("slow");
  const key = randomUUID();
  await api(keys.k1, "POST", "/external-ids", { studentId: ids["Cedar North-1"], system: "synthetic-sis", externalId: "SIS-1002" }, { "Idempotency-Key": key });
  const ev = await db.integrationEvent.findFirstOrThrow({ where: { schoolId, topic: "student.updated", resourceId: ids["Cedar North-1"] } });
  ids.ev2 = ev.id;
  await deliver();
  let d = await delivery(ev.id);
  const attempt = await db.integrationDeliveryAttempt.findFirstOrThrow({ where: { deliveryId: d.id } });
  assert.deepEqual([d.status, attempt.outcome], ["PENDING", "TIMEOUT"]);
  assert.ok(d.nextAttemptAt.getTime() > Date.now() + 20_000, "backs off before retrying");
  await setMode("ok");
  await new Promise(r => setTimeout(r, 2000));
  const rep = await admin("principal", { action: "replay", id: d.id });
  assert.deepEqual([rep.status, rep.json.data.eventId], [200, ev.id], "replay keeps the original event id");
  await deliver();
  d = await delivery(ev.id);
  assert.deepEqual([d.status, d.replayCount], ["DELIVERED", 1]);
  const l = await log();
  assert.equal(l.received.filter(x => x.id === ev.id).length, 2, "the consumer saw the event twice");
  assert.equal(l.applied.filter(x => x === ev.id).length, 1, "and applied it once (deduplicated on the stable id)");
});

test("retries back off, honour Retry-After, end in a terminal failure; private destinations and redirects are refused", async () => {
  await setMode("500");
  await admin("principal", { action: "test", id: ids.conn });
  const ev = await db.integrationEvent.findFirstOrThrow({ where: { schoolId, topic: "connection.test" }, orderBy: { createdAt: "desc" } });
  for (let i = 0; i < 6; i++) { await db.integrationDelivery.updateMany({ where: { eventId: ev.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } }); await deliver(); }
  const failed = await delivery(ev.id);
  assert.deepEqual([failed.status, failed.attempts], ["FAILED", 6]);
  assert.match(failed.lastError ?? "", /failed after 6 attempts/);
  ids.failed = failed.id;
  await setMode("429");
  await admin("principal", { action: "test", id: ids.conn });
  const ev429 = await db.integrationEvent.findFirstOrThrow({ where: { schoolId, topic: "connection.test" }, orderBy: { createdAt: "desc" } });
  await deliver();
  const limited = await delivery(ev429.id);
  assert.ok(limited.status === "PENDING" && limited.nextAttemptAt.getTime() >= Date.now() + 110_000, "Retry-After is honoured");
  await setMode("redirect");
  await admin("principal", { action: "test", id: ids.conn });
  const evRedirect = await db.integrationEvent.findFirstOrThrow({ where: { schoolId, topic: "connection.test" }, orderBy: { createdAt: "desc" } });
  await deliver();
  const red = await delivery(evRedirect.id);
  assert.equal(red.status, "BLOCKED");
  assert.equal((await db.integrationDeliveryAttempt.findFirstOrThrow({ where: { deliveryId: red.id } })).outcome, "REDIRECT_REFUSED");
  // Destination changed to internal addresses: refused at send time, even when the URL looks fine.
  for (const target of ["https://10.0.0.5/hook", "https://169.254.169.254/latest", "https://localhost:55463/hook"]) {
    assert.equal((await admin("principal", { action: "webhook", id: ids.conn, webhookUrl: target })).status, 200);
    const t = await admin("principal", { action: "test", id: ids.conn });
    assert.equal(t.json.data.ok, false, target);
    assert.match(t.json.data.reason, /internal or private address/);
  }
  assert.equal((await admin("principal", { action: "webhook", id: ids.conn, webhookUrl: "http://127.0.0.1:55464/hook" })).status, 400, "plain HTTP only to the allowed test host");
  // A queued delivery whose destination changed to a private address is blocked when it is sent.
  await db.integrationDelivery.update({ where: { id: limited.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await db.integrationConnection.update({ where: { id: ids.conn }, data: { webhookUrl: "https://10.0.0.5/hook" } });
  await deliver();
  const blocked = await db.integrationDelivery.findUniqueOrThrow({ where: { id: limited.id } });
  assert.match(blocked.lastError ?? "", /internal or private address/);
  assert.equal(blocked.status, "BLOCKED");
  assert.equal((await admin("principal", { action: "webhook", id: ids.conn, webhookUrl: "http://127.0.0.1:55463/hook" })).status, 200);
  await setMode("ok");
});

test("rotation with overlap, immediate revocation, signing during overlap, and pause holds the queue", async () => {
  const rot = await admin("principal", { action: "rotate-key", id: ids.conn, overlapMinutes: 60 });
  keys.k2 = rot.json.data.apiKey;
  assert.equal((await api(keys.k1, "GET", "/students?limit=1")).status, 200, "the old key works during the overlap");
  assert.equal((await api(keys.k2, "GET", "/students?limit=1")).status, 200);
  assert.equal((await admin("principal", { action: "revoke-key", id: ids.conn, keyId: keys.k1.split(".")[0] })).status, 200);
  assert.equal((await api(keys.k1, "GET", "/students?limit=1")).status, 401, "revoked keys stop at once");
  const now = await admin("principal", { action: "rotate-key", id: ids.conn, overlapMinutes: 0 });
  assert.equal((await api(keys.k2, "GET", "/students?limit=1")).status, 401, "no overlap means the previous key stops now");
  keys.k3 = now.json.data.apiKey;
  const sign = await admin("principal", { action: "rotate-signing", id: ids.conn, overlapMinutes: 60 });
  keys.sign2 = sign.json.data.signingSecret;
  await admin("principal", { action: "test", id: ids.conn });
  await deliver();
  const all = (await log()).received, last = all[all.length - 1];
  assert.ok(verify(keys.sign2, last.signature, last.body) && verify(keys.sign1, last.signature, last.body), "both secrets verify during the overlap");
  // Paused: deliveries wait; resumed: they go.
  assert.equal((await admin("principal", { action: "status", id: ids.conn, status: "PAUSED" })).status, 200);
  assert.equal((await api(keys.k3, "GET", "/students?limit=1")).json.error.code, "CONNECTION_PAUSED");
  await admin("owner", { action: "test", id: ids.conn });
  const pausedEv = await db.integrationEvent.findFirstOrThrow({ where: { schoolId, topic: "connection.test" }, orderBy: { createdAt: "desc" } });
  await deliver();
  assert.equal((await delivery(pausedEv.id)).status, "PAUSED");
  await admin("principal", { action: "status", id: ids.conn, status: "ACTIVE" });
  await deliver();
  assert.equal((await delivery(pausedEv.id)).status, "DELIVERED");
  // Operators see a redacted payload and attempt log, never a secret.
  const detail = await call("principal", "get", `/api/integrations?view=delivery&id=${ids.failed}`);
  assert.equal(detail.status, 200);
  assert.ok(!detail.body.includes(keys.sign1) && !detail.body.includes(keys.sign2) && !detail.body.includes("whsec_"));
  assert.equal(detail.json.data.attemptLog.length, 6);
});

test("screens: connections without secrets, failed delivery review, Arabic and phone; revocation ends it", async () => {
  const p = await (await context("principal")).newPage();
  await p.goto(`${base}/integrations`);
  await p.locator('[data-connection="Synthetic North SIS"]').waitFor();
  assert.ok(!(await p.content()).includes(keys.k3.split(".")[1]), "no key in the page");
  await shot(p, "01-connections");
  await p.locator('[data-connection="Synthetic North SIS"] [data-open-deliveries]').click();
  await p.locator("[data-delivery-filter]").selectOption("FAILED");
  await p.locator("[data-delivery-status=FAILED]").first().click();
  await p.locator("[data-delivery-detail]").waitFor();
  await p.locator("[data-replay]").click();
  await p.locator("[data-replay-confirm]").waitFor();
  await shot(p, "02-failed-delivery-replay");
  await p.close();
  const ar = await (await context("principal-ar")).newPage();
  await ar.goto(`${base}/integrations`);
  await ar.locator("[data-integrations]").waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await shot(ar, "03-connections-ar");
  await ar.close();
  const phone = await (await context("principal", { width: 390, height: 844 })).newPage();
  await phone.goto(`${base}/integrations`);
  await phone.locator("[data-connection]").first().waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(phone, "04-phone");
  await phone.close();
  assert.equal((await admin("principal", { action: "status", id: ids.conn, status: "REVOKED" })).status, 200);
  assert.equal((await api(keys.k3, "GET", "/students?limit=1")).status, 401, "a revoked connection's keys stop working");
  assert.equal((await admin("principal", { action: "status", id: ids.conn, status: "ACTIVE" })).status, 409, "revoked stays revoked");
  const t = await (await context("teacher")).newPage();
  await t.goto(`${base}/integrations`);
  await t.locator("[data-integrations-denied]").waitFor();
  await t.close();
});
