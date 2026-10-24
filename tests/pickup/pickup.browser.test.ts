import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-438 on the isolated app with synthetic data: only guardians with the pickup permission issue codes;
// the code is opaque and its hash alone is stored; a valid scan never releases without an identity check;
// another campus, expiry, revocation after a scan, reuse and a rotated code all block; two gates releasing
// at once give one release; a retried confirmation is not a second release; custody restrictions cannot be
// overridden at the gate, a lead-approval restriction needs the lead's recorded decision; history names
// authorizer, recipient, staff and exception.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.PICKUP_TEST_APP || "http://localhost:3107";
const evidence = process.env.PICKUP_EVIDENCE_DIR || "/tmp/sko438-evidence";
const db = new PrismaClient(), password = "SyntheticPickup438!";
const schoolId = `pick438-${randomUUID()}`, north = randomUUID(), south = randomUUID(), classId = randomUUID();
const TZ = "Asia/Karachi";
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const local = (d: Date) => ({ date: new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d), time: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) });

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
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string } = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const id = (key: string) => users.get(key)!.id;
const relate = async (guardianKey: string, pickup: boolean) => {
  const rel = await db.guardianRelationship.create({ data: { schoolId, campusId: north, studentId: ids.hana, guardianUserId: id(guardianKey), createdByUserId: id("campusAdmin"), fullName: `Synthetic ${guardianKey}`, email: users.get(guardianKey)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: id("campusAdmin"), reason: "Synthetic pickup fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup } } });
};
const issue = async (extra: Record<string, unknown> = {}) => { const start = local(new Date(Date.now() - 10 * 60_000)), end = local(new Date(Date.now() + 2 * 3_600_000)); return call("guardian", "post", "/api/pickup", { action: "issue", studentId: ids.hana, recipientName: "Synthetic Amina Rahman", recipientRelation: "Aunt", idMethod: "PHOTO_ID", idLast4: "4821", date: start.date, from: start.time, until: end.date === start.date ? end.time : "23:59", ...extra }); };
const gate = (key: string, body: Record<string, unknown>) => call(key, "post", "/api/pickup/gate", body);

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Linden School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: TZ } as never });
  for (const [cid, name] of [[north, "Linden North"], [south, "Linden South"]]) { await db.campus.create({ data: { id: cid, schoolId, name, regId: cid, city: "Lahore" } }); await db.academicCycle.create({ data: { schoolId, campusId: cid, label: "2026", academicYear: 2026, status: "ACTIVE" } }); }
  await user("campusAdmin", "CAMPUS_ADMIN"); // role-ux §7.6: campus operations (the principal is academic and holds none of this) await user("gate1", "RECEPTIONIST"); await user("gate2", "RECEPTIONIST"); await user("southGate", "RECEPTIONIST", south); await user("teacher", "TEACHER");
  await user("guardian", "PARENT"); await user("noPickup", "PARENT"); await user("guardian-ar", "PARENT", north, "ar");
  await db.class.create({ data: { id: classId, schoolId, campusId: north, name: "Grade 4", section: "A", academicYear: 2026 } });
  ids.hana = randomUUID();
  await db.student.create({ data: { id: ids.hana, schoolId, campusId: north, classId, fullName: "Synthetic Hana Rahman", rollNo: "401", gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never });
  await relate("guardian", true); await relate("noPickup", false); await relate("guardian-ar", true);
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("only guardians with the pickup permission issue an opaque, hashed, short-window code", async () => {
  assert.equal((await call("noPickup", "post", "/api/pickup", { action: "issue", studentId: ids.hana, recipientName: "X Person", recipientRelation: "Uncle", idMethod: "PHOTO_ID", date: local(new Date()).date, from: "10:00", until: "11:00" })).status, 404);
  assert.equal((await issue({ from: "00:00", until: "23:59" })).status, 400, "at most 12 hours");
  assert.equal((await issue({ idLast4: "123456789" })).status, 400, "never a full ID number");
  const made = await issue();
  assert.equal(made.status, 201, JSON.stringify(made.json));
  ids.a1 = made.json.data.id; ids.code1 = made.json.data.code;
  assert.match(ids.code1, /^SKPU1:[A-Za-z0-9_-]{30,}$/);
  assert.ok(!/hana|rahman|amina|grade|401/i.test(ids.code1), "the code carries no child or recipient detail");
  const row = await db.pickupAuthorization.findUniqueOrThrow({ where: { id: ids.a1 } });
  assert.ok(!row.tokenHash.includes(ids.code1.slice(6)) && row.tokenHash.length === 64, "only a hash is stored");
});

test("a valid scan is never a release; revocation after the scan blocks; other campus and teachers are refused", async () => {
  assert.equal((await gate("teacher", { action: "scan", code: ids.code1 })).status, 403, "pickup verification access is required");
  const away = await gate("southGate", { action: "scan", code: ids.code1 });
  // Another campus's gate cannot use it: either it cannot see the code at all or it is blocked as wrong campus.
  assert.ok(away.status === 404 || (away.json.data?.status === "BLOCKED" && away.json.data?.blockReason === "WRONG_CAMPUS"), away.body);
  const scanned = await gate("gate1", { action: "scan", code: ids.code1, gate: "North gate" });
  assert.equal(scanned.json.data.status, "OPEN");
  assert.deepEqual([scanned.json.data.recipient.name, scanned.json.data.recipient.idMethod, scanned.json.data.recipient.idLast4], ["Synthetic Amina Rahman", "PHOTO_ID", "4821"]);
  assert.equal((await gate("gate1", { action: "release", checkId: scanned.json.data.checkId, identityMethod: "PHOTO_ID" })).status, 400, "identity must be confirmed first");
  assert.equal((await call("guardian", "post", "/api/pickup", { action: "revoke", id: ids.a1 })).status, 200);
  const late = await gate("gate1", { action: "release", checkId: scanned.json.data.checkId, identityConfirmed: true, identityMethod: "PHOTO_ID" });
  assert.deepEqual([late.json.data.status, late.json.data.blockReason], ["BLOCKED", "REVOKED"], "an earlier valid scan does not override revocation");
  assert.equal(await db.pickupCheck.count({ where: { schoolId, status: "RELEASED" } }), 0);
});

test("two gates releasing at once give one release; a retry and a replay release nothing more", async () => {
  const made = await issue({ recipientName: "Synthetic Omar Rahman", recipientRelation: "Father", idMethod: "SCHOOL_PICKUP_CARD", idLast4: undefined });
  ids.a2 = made.json.data.id; ids.code2 = made.json.data.code;
  const [s1, s2] = [await gate("gate1", { action: "scan", code: ids.code2, gate: "North gate" }), await gate("gate2", { action: "scan", code: ids.code2, gate: "Side gate" })];
  assert.deepEqual([s1.json.data.status, s2.json.data.status], ["OPEN", "OPEN"]);
  assert.equal((await gate("gate1", { action: "release", checkId: s1.json.data.checkId, identityConfirmed: true, identityMethod: "PHOTO_ID" })).json.data.blockReason, "IDENTITY_METHOD", "the family's chosen identity method is required");
  const fresh = await gate("gate1", { action: "scan", code: ids.code2, gate: "North gate" });
  const [r1, r2] = await Promise.all([gate("gate1", { action: "release", checkId: fresh.json.data.checkId, identityConfirmed: true, identityMethod: "SCHOOL_PICKUP_CARD" }), gate("gate2", { action: "release", checkId: s2.json.data.checkId, identityConfirmed: true, identityMethod: "SCHOOL_PICKUP_CARD" })]);
  // The loser is refused either way: a 409 ("just used at another gate") or a blocked check (already used).
  const outcome = (r: typeof r1) => r.status === 409 ? "REFUSED" : r.json.data.status === "BLOCKED" && r.json.data.blockReason === "USED" ? "REFUSED" : r.json.data.status;
  assert.deepEqual([outcome(r1), outcome(r2)].sort(), ["REFUSED", "RELEASED"], JSON.stringify([r1.json, r2.json]));
  assert.equal(await db.pickupCheck.count({ where: { schoolId, status: "RELEASED" } }), 1, "one release");
  const r1won = r1.status === 200 && r1.json.data.status === "RELEASED";
  const winner = r1won ? fresh.json.data.checkId : s2.json.data.checkId, winnerKey = r1won ? "gate1" : "gate2";
  const retry = await gate(winnerKey, { action: "release", checkId: winner, identityConfirmed: true, identityMethod: "SCHOOL_PICKUP_CARD" });
  assert.deepEqual([retry.json.data.status, retry.json.data.repeated], ["RELEASED", true], "a retried confirmation is not a second release");
  const replay = await gate("gate1", { action: "scan", code: ids.code2 });
  assert.deepEqual([replay.json.data.status, replay.json.data.blockReason], ["BLOCKED", "USED"], "a photographed code cannot be reused");
  assert.equal(await db.notification.count({ where: { userId: id("guardian"), type: "PICKUP_RELEASED" } }), 1);
});

test("expired and rotated codes block", async () => {
  const made = await issue({ recipientName: "Synthetic Sara Rahman", recipientRelation: "Sister" });
  await db.pickupAuthorization.update({ where: { id: made.json.data.id }, data: { validFrom: new Date(Date.now() - 3 * 3_600_000), validUntil: new Date(Date.now() - 60_000) } });
  assert.equal((await gate("gate1", { action: "scan", code: made.json.data.code })).json.data.blockReason, "EXPIRED");
  const live = await issue({ recipientName: "Synthetic Bilal Rahman", recipientRelation: "Uncle" });
  const rotated = await call("guardian", "post", "/api/pickup", { action: "code", id: live.json.data.id });
  assert.equal(rotated.status, 200);
  assert.equal((await gate("gate1", { action: "scan", code: live.json.data.code })).status, 404, "the old screenshot no longer works");
  assert.equal((await gate("gate1", { action: "scan", code: rotated.json.data.code })).json.data.status, "OPEN");
  ids.a4 = live.json.data.id; ids.code4 = rotated.json.data.code;
});

test("custody restrictions cannot be overridden at the gate; lead approval is recorded and identity still checked", async () => {
  assert.equal((await call("gate1", "post", "/api/pickup/restrictions", { action: "add", studentId: ids.hana, kind: "DO_NOT_RELEASE", instruction: "x" })).status, 403);
  const added = await call("campusAdmin", "post", "/api/pickup/restrictions", { action: "add", studentId: ids.hana, kind: "CUSTODY_ORDER", instruction: "Do not release to anyone except the listed mother. Call the principal.", reason: "SYNTHETIC-COURT-ORDER-438" });
  assert.equal(added.status, 201); ids.r1 = added.json.data.id;
  const blocked = await gate("gate1", { action: "scan", code: ids.code4 });
  assert.deepEqual([blocked.json.data.status, blocked.json.data.blockReason, blocked.json.data.restriction.kind], ["BLOCKED", "RESTRICTION", "CUSTODY_ORDER"]);
  assert.ok(!blocked.body.includes("SYNTHETIC-COURT-ORDER-438"), "the gate sees the instruction, not the reason");
  assert.equal((await gate("gate1", { action: "escalate", checkId: blocked.json.data.checkId, note: "Uncle says he was sent" })).status, 200);
  assert.equal(await db.notification.count({ where: { userId: id("campusAdmin"), type: "PICKUP_EXCEPTION_REQUESTED" } }), 1);
  assert.equal((await gate("campusAdmin", { action: "decide", checkId: blocked.json.data.checkId, decision: "approve", note: "Spoke to mother" })).status, 409, "a custody order is not overridden at the gate");
  assert.equal((await gate("campusAdmin", { action: "decide", checkId: blocked.json.data.checkId, decision: "deny", note: "Custody order stands" })).status, 200);
  assert.equal((await call("campusAdmin", "post", "/api/pickup/restrictions", { action: "lift", id: ids.r1 })).status, 200);
  await call("campusAdmin", "post", "/api/pickup/restrictions", { action: "add", studentId: ids.hana, kind: "LEAD_APPROVAL", instruction: "Ask the principal to approve each pickup this week." });
  const open = await gate("gate1", { action: "scan", code: ids.code4 });
  assert.equal(open.json.data.status, "OPEN");
  assert.equal((await gate("gate1", { action: "release", checkId: open.json.data.checkId, identityConfirmed: true, identityMethod: "PHOTO_ID" })).json.data.blockReason, "RESTRICTION", "lead approval needed first");
  const again = await gate("gate1", { action: "scan", code: ids.code4 });
  await gate("gate1", { action: "escalate", checkId: again.json.data.checkId, note: "Lead approval needed" });
  assert.equal((await gate("gate2", { action: "decide", checkId: again.json.data.checkId, decision: "approve", note: "ok" })).status, 403, "only the designated lead decides");
  assert.equal((await gate("campusAdmin", { action: "decide", checkId: again.json.data.checkId, decision: "approve", note: "Confirmed with the guardian by phone" })).status, 200);
  const released = await gate("gate1", { action: "release", checkId: again.json.data.checkId, identityConfirmed: true, identityMethod: "PHOTO_ID" });
  assert.equal(released.json.data.status, "RELEASED", JSON.stringify(released.json));
  const history = (await call("campusAdmin", "get", `/api/pickup/restrictions?studentId=${ids.hana}`)).json.data;
  const rel = history.events.filter((e: { kind: string }) => e.kind === "RELEASED");
  assert.equal(rel.length, 2);
  const last = rel[0];
  assert.deepEqual([last.actor, last.authorizedBy, last.detail.recipientName, last.detail.identityMethod, Boolean(last.detail.exceptionBy)], ["Synthetic gate1", "Synthetic guardian", "Synthetic Bilal Rahman", "PHOTO_ID", true], "authorizer, recipient, verifying staff, method and exception");
  assert.equal((await call("teacher", "get", `/api/pickup/restrictions?studentId=${ids.hana}`)).status, 403);
});

test("screens: family code (EN), gate valid and revoked states, phone gate, Arabic family list", async () => {
  const fam = await (await context("guardian")).newPage();
  await fam.goto(`${base}/parent/attendance`);
  await fam.locator("[data-family-pickup] [data-pickup-new]").click();
  await fam.locator("[data-pickup-form] input").first().fill("Synthetic Zara Rahman");
  await fam.locator("[data-pickup-form] input").nth(1).fill("Grandmother");
  const now = local(new Date(Date.now() - 5 * 60_000)), later = local(new Date(Date.now() + 2 * 3_600_000));
  await fam.locator("[data-pickup-form] input[type=date]").fill(now.date);
  await fam.locator("[data-pickup-form] input[type=time]").first().fill(now.time);
  await fam.locator("[data-pickup-form] input[type=time]").nth(1).fill(later.date === now.date ? later.time : "23:59");
  await fam.locator("[data-pickup-issue]").click();
  await fam.locator("[data-pickup-code] img").waitFor();
  const shown = await fam.locator("[data-pickup-code-text]").innerText();
  await shot(fam, "01-family-code-en");
  await fam.close();
  const g = await (await context("gate1")).newPage();
  await g.goto(`${base}/pickup`);
  await g.locator("[data-pickup-gate] input").first().fill(shown);
  // The console's PageHeader owns "Check code" (one primary, P8-14); Enter in the code field runs the same check.
  await g.locator("[data-pickup-gate] input").first().press("Enter");
  await g.locator("[data-pg-check][data-pg-status=OPEN]").waitFor();
  await shot(g, "02-gate-valid-identity-pending");
  const authId = (await db.pickupAuthorization.findFirstOrThrow({ where: { schoolId, recipientName: "Synthetic Zara Rahman" } })).id;
  await call("guardian", "post", "/api/pickup", { action: "revoke", id: authId });
  await g.locator("[data-pg-identity]").check();
  await g.locator("[data-pg-release]").click();
  await g.locator("[data-pg-check][data-pg-status=BLOCKED]").waitFor();
  assert.match(await g.locator("[data-pg-state]").innerText(), /revoked/i);
  await shot(g, "03-gate-revoked-blocked");
  await g.close();
  const phone = await (await context("gate2", { width: 390, height: 844 })).newPage();
  await phone.goto(`${base}/pickup`);
  await phone.locator("[data-pickup-gate]").waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(phone, "04-gate-phone");
  await phone.close();
  const ar = await (await context("guardian-ar")).newPage();
  await ar.goto(`${base}/parent/attendance`);
  await ar.locator("[data-family-pickup]").waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await ar.locator("[data-family-pickup]").scrollIntoViewIfNeeded();
  await shot(ar, "05-family-ar");
  await ar.close();
});
