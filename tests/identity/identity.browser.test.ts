import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-446 on the isolated app (IDENTITY_TEST_ALLOWED_ISSUERS=http://127.0.0.1:55465,
// IDENTITY_TEST_VERIFIED_DOMAINS=cedar.example,oak.example) with a synthetic OIDC provider (tests/identity/idp.mjs):
// setup validates issuer and metadata; links come only from a verified email on a verified domain or an
// administrator; the stable subject survives an email change; two schools on one provider stay apart; MFA and
// access versions apply to SSO sessions; outages leave password recovery and audited emergency access; roster
// batches preview, bind, replay idempotently, keep namesakes apart, honour field ownership and conflicts, and
// withdrawals revoke access while keeping records.
// role-ux §7.3 G14: the identity connection, links and emergency access belong to the institution authority (the group
// admin of a GROUP school); roster batches are reviewed by the authority or a campus operator (the principal no longer
// reviews them, and campus operators have no identity screen, R-I13). `/identity` redirects the group admin to
// Settings › Identity (§6.3) and sends everyone else home.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.IDENTITY_TEST_APP || "http://localhost:3107";
const evidence = process.env.IDENTITY_EVIDENCE_DIR || "/tmp/sko446-evidence";
const IDP = "http://127.0.0.1:55465";
const db = new PrismaClient(), password = "SyntheticIdentity446!";
const schoolA = `idn446a-${randomUUID()}`, schoolB = `idn446b-${randomUUID()}`, north = randomUUID(), south = randomUUID(), oakCampus = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser, idp: ChildProcess;

async function user(key: string, role: string, opts: { campus?: string; school?: string; email?: string; name?: string; language?: string } = {}) {
  const id = randomUUID(), email = opts.email ?? `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: opts.name ?? `Synthetic ${key}`, role: role as never, schoolId: opts.school ?? schoolA, campusId: opts.campus ?? north, isActive: true, onboardingComplete: true, preferredLanguage: opts.language ?? "en" } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const login = await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } });
  assert.equal(login.status(), 200, await login.text());
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string } = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const idn = (key: string, data: Record<string, unknown>) => call(key, "post", "/api/identity", data);
const id = (key: string) => users.get(key)!.id;
/** A real local class change made through the school's own enrollment review (effective yesterday). */
async function localMove(studentId: string, classId: string) {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const from = await db.studentEnrollment.findFirstOrThrow({ where: { studentId, endDate: null, status: "ACTIVE" } });
  const pupil = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const p = await call("campus", "post", "/api/students/enrollments", { action: "propose", studentId, effectiveDate: yesterday, fromEnrollmentId: from.id, targetClassId: classId, rollNo: pupil.rollNo, reason: "Synthetic local class change" });
  assert.ok(p.status < 300, p.body);
  const proposal = await db.enrollmentProposal.findFirstOrThrow({ where: { studentId, status: "PROPOSED" } });
  const c = await call("campus", "post", "/api/students/enrollments", { action: "confirm", studentId, proposalId: proposal.id, reviewed: true, capacityChecked: true });
  assert.ok(c.status < 300, c.body);
}
const idpMode = (m: string) => fetch(`${IDP}/_mode?m=${m}`).then(r => r.text());

/** Runs the full browser-less SSO round trip with the claims the synthetic provider will assert. */
async function sso(connectionId: string, claims: Record<string, unknown>) {
  const ctx = await browser.newContext();
  const start = await ctx.request.get(`${base}/api/auth/sso/start?connection=${connectionId}`, { maxRedirects: 0 });
  const authorize = new URL(start.headers().location);
  if (!authorize.href.startsWith(IDP)) { await ctx.close(); return { status: 0, json: { redirected: authorize.href } as any, session: null }; }
  authorize.searchParams.set("login_hint", Buffer.from(JSON.stringify(claims)).toString("base64url"));
  const back = new URL((await fetch(authorize, { redirect: "manual" })).headers.get("location")!);
  const r = await ctx.request.post(`${base}/api/auth/sso/callback`, { data: { code: back.searchParams.get("code"), state: back.searchParams.get("state") } });
  const json = await r.json().catch(() => ({}));
  const s = await ctx.request.get(`${base}/api/auth/session`);
  const session = s.status() === 200 ? (await s.json()).user : null;
  const state = await ctx.storageState();
  await ctx.close();
  return { status: r.status(), json, session, state };
}

before(async () => {
  for (const [sid, name] of [[schoolA, "Synthetic Cedar Group"], [schoolB, "Synthetic Oak School"]]) await db.school.create({ data: { id: sid, name, slug: sid, regId: sid, contactEmail: `${sid}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi", registrationKind: "GROUP" } as never });
  for (const [sid, cid, name] of [[schoolA, north, "Cedar North"], [schoolA, south, "Cedar South"], [schoolB, oakCampus, "Oak Main"]]) {
    await db.campus.create({ data: { id: cid, schoolId: sid, name, regId: cid, city: "Lahore" } });
    for (const section of ["A", "B"]) { const classId = randomUUID(); ids[`${name}-${section}`] = classId; await db.class.create({ data: { id: classId, schoolId: sid, campusId: cid, name: "Grade 4", section, academicYear: 2026 } }); }
  }
  await user("owner", "SUPER_ADMIN"); await user("owner2", "SUPER_ADMIN"); await user("owner-ar", "SUPER_ADMIN", { language: "ar" });
  await user("campus", "CAMPUS_ADMIN"); await user("principal", "PRINCIPAL");
  await user("teacher", "TEACHER", { email: "t.khan@cedar.example", name: "Synthetic Tariq Khan" });
  await user("namesake", "TEACHER", { email: "s.ali@cedar.example", name: "Synthetic Sara Ali" });
  await user("oakTeacher", "TEACHER", { school: schoolB, campus: oakCampus, email: "t.khan@cedar.example", name: "Synthetic Tariq Khan" });
  await user("oakOwner", "SUPER_ADMIN", { school: schoolB, campus: oakCampus });
  ids.existingPupil = randomUUID();
  await db.student.create({ data: { id: ids.existingPupil, schoolId: schoolA, campusId: north, classId: ids["Cedar North-A"], fullName: "Synthetic Old Name", rollNo: "9", admissionNo: "ADM-9", gender: "OTHER", status: "active" } as never });
  for (const [k, adm] of [["P1", "ADM-11"], ["P2", "ADM-12"]]) { ids[k] = randomUUID(); await db.student.create({ data: { id: ids[k], schoolId: schoolA, campusId: north, classId: ids["Cedar North-A"], fullName: `Synthetic Pupil ${k}`, rollNo: adm, admissionNo: adm, gender: "OTHER", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  idp = spawn(process.execPath, ["tests/identity/idp.mjs"], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise<void>(r => idp.stdout!.on("data", d => { if (String(d).includes("idp ready")) r(); }));
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); idp?.kill(); for (const sid of [schoolA, schoolB]) await db.school.delete({ where: { id: sid } }).catch(() => undefined); await db.$disconnect(); });

test("setup: group admins only, owner roles never mappable, issuer and metadata validated before enabling", async () => {
  assert.equal((await idn("principal", { action: "save", name: "Synthetic Directory", issuer: IDP, clientId: "skoolee-cedar" })).status, 403, "the principal cannot change group identity policy");
  assert.equal((await idn("campus", { action: "save", name: "Synthetic Directory", issuer: IDP, clientId: "skoolee-cedar" })).status, 403, "campus reviewers cannot change group identity policy");
  assert.equal((await idn("owner", { action: "save", name: "Synthetic Directory", issuer: IDP, clientId: "skoolee-cedar", roleMap: { "it-admins": "SUPER_ADMIN" } })).status, 400);
  assert.equal((await idn("owner", { action: "save", name: "Synthetic Directory", issuer: IDP, clientId: "skoolee-cedar", roleMap: { "it-admins": "APP_OWNER" } })).status, 400);
  const c = await idn("owner", { action: "save", name: "Synthetic Directory", issuer: IDP, clientId: "skoolee-cedar", clientSecret: "synthetic-client-secret", roleMap: { "staff-teachers": "TEACHER" }, fieldOwnership: { fullName: "SOURCE", className: "SOURCE", status: "SOURCE", admissionNo: "LOCAL" }, emergencyAdminIds: [id("owner2")] });
  assert.equal(c.status, 201, c.body); ids.conn = c.json.data.id;
  const row = await db.identityConnection.findUniqueOrThrow({ where: { id: ids.conn } });
  assert.ok(row.clientSecret && !row.clientSecret.includes("synthetic-client-secret"), "the client secret is encrypted");
  assert.ok(!(await call("owner", "get", "/api/identity")).body.includes("synthetic-client-secret"), "never shown again");
  assert.equal((await idn("owner", { action: "status", id: ids.conn, status: "ENABLED" })).status, 409, "test first");
  await idpMode("wrongIssuer");
  const bad = await idn("owner", { action: "test", id: ids.conn });
  assert.equal(bad.json.data.ok, false); assert.match(bad.json.data.problems.join(" "), /different issuer/);
  await idpMode("ok");
  const insecure = await idn("owner", { action: "save", name: "Synthetic Insecure", issuer: "http://insecure.example", clientId: "x" });
  assert.equal((await idn("owner", { action: "test", id: insecure.json.data.id })).json.data.problems[0], "The issuer must be an HTTPS URL.");
  const ok = await idn("owner", { action: "test", id: ids.conn });
  assert.deepEqual([ok.json.data.ok, ok.json.data.audience], [true, "skoolee-cedar"]);
  assert.match(ok.json.data.callback, /\/sso\/callback$/);
  assert.equal((await idn("owner", { action: "status", id: ids.conn, status: "ENABLED" })).status, 200);
  const d = await idn("owner", { action: "add-domain", id: ids.conn, domain: "cedar.example" });
  assert.match(d.json.data.token, /^skoolee-verify=/);
  assert.equal((await idn("owner", { action: "verify-domain", id: ids.conn, domain: "cedar.example" })).status, 200);
  await idn("owner", { action: "add-domain", id: ids.conn, domain: "unverified-synthetic.example" });
  assert.equal((await idn("owner", { action: "verify-domain", id: ids.conn, domain: "unverified-synthetic.example" })).status, 409, "no TXT record, no verification");
});

test("sign-in: a verified email on a verified domain links once; the stable subject survives an email change", async () => {
  const first = await sso(ids.conn, { sub: "synthetic-sub-001", email: "t.khan@cedar.example", email_verified: true, name: "Synthetic Tariq Khan" });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.equal(first.session.id, id("teacher"));
  const link = await db.identityLink.findFirstOrThrow({ where: { connectionId: ids.conn, subject: "synthetic-sub-001" } });
  assert.deepEqual([link.userId, link.method], [id("teacher"), "VERIFIED_EMAIL"]);
  const renamed = await sso(ids.conn, { sub: "synthetic-sub-001", email: "tariq.khan@cedar.example", email_verified: true });
  assert.equal(renamed.session.id, id("teacher"), "the same person after an email change upstream");
  assert.equal(await db.user.count({ where: { schoolId: schoolA, fullName: "Synthetic Tariq Khan" } }), 1, "no duplicate account");
  // Tampering: wrong audience, wrong nonce or a forged state are refused.
  assert.equal((await sso(ids.conn, { sub: "synthetic-sub-001", email: "t.khan@cedar.example", email_verified: true, __aud: "someone-else" })).status, 401);
  assert.equal((await sso(ids.conn, { sub: "synthetic-sub-001", email: "t.khan@cedar.example", email_verified: true, __nonce: "replayed" })).status, 401);
  const ctx = await browser.newContext();
  const forged = await ctx.request.post(`${base}/api/auth/sso/callback`, { data: { code: "x", state: "y" } });
  assert.equal(forged.status(), 400); await ctx.close();
});

test("no link without proof: unverified email, unknown domain or a name match waits for an administrator", async () => {
  const unverified = await sso(ids.conn, { sub: "synthetic-sub-002", email: "s.ali@cedar.example", email_verified: false, name: "Synthetic Sara Ali" });
  assert.deepEqual([unverified.status, unverified.json.pending, unverified.session], [202, true, null]);
  const nameOnly = await sso(ids.conn, { sub: "synthetic-sub-003", email: "sara.personal@gmail.example", email_verified: true, name: "Synthetic Sara Ali" });
  assert.equal(nameOnly.json.pending, true, "a matching display name never links");
  const reqs = await db.identityLinkRequest.findMany({ where: { connectionId: ids.conn, status: "PENDING" }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(reqs.map(r => r.reason), ["The provider did not verify the email.", "The domain gmail.example is not verified for this school."]);
  assert.equal((await idn("principal", { action: "decide-link", id: reqs[0].id, userId: id("namesake") })).status, 403);
  assert.equal((await idn("owner", { action: "decide-link", id: reqs[0].id, userId: id("namesake") })).status, 200);
  assert.equal((await idn("owner", { action: "decide-link", id: reqs[1].id, decision: "REJECT" })).status, 200);
  const now = await sso(ids.conn, { sub: "synthetic-sub-002", email: "s.ali@cedar.example", email_verified: false });
  assert.equal(now.session.id, id("namesake"), "linked by an accountable decision");
  assert.equal((await db.identityLink.findFirstOrThrow({ where: { subject: "synthetic-sub-002" } })).method, "ADMIN_DECISION");
  // Owners keep their second factor: SSO leads to the MFA challenge, not a session.
  await idn("owner", { action: "decide-link", id: (await db.identityLinkRequest.upsert({ where: { connectionId_subject: { connectionId: ids.conn, subject: "synthetic-sub-owner" } }, create: { schoolId: schoolA, connectionId: ids.conn, subject: "synthetic-sub-owner", reason: "synthetic" }, update: {} })).id, userId: id("owner2") });
  await context("owner2"); // enrols MFA for owner2
  const mfa = await sso(ids.conn, { sub: "synthetic-sub-owner", email: users.get("owner2")!.email, email_verified: true });
  assert.deepEqual([mfa.json.mfaRequired, mfa.session], [true, null]);
});

test("two schools on one provider stay apart", async () => {
  const oak = await idn("oakOwner", { action: "save", name: "Synthetic Oak Directory", issuer: IDP, clientId: "skoolee-oak" });
  ids.oak = oak.json.data.id;
  await idn("oakOwner", { action: "test", id: ids.oak }); await idn("oakOwner", { action: "status", id: ids.oak, status: "ENABLED" });
  await idn("oakOwner", { action: "add-domain", id: ids.oak, domain: "cedar.example" }); await idn("oakOwner", { action: "verify-domain", id: ids.oak, domain: "cedar.example" });
  // The same subject and email at the other school's connection reaches only that school's account.
  const r = await sso(ids.oak, { sub: "synthetic-sub-001", email: "t.khan@cedar.example", email_verified: true });
  assert.equal(r.session.id, id("oakTeacher"));
  assert.equal(r.session.schoolId, schoolB);
  assert.equal((await db.identityLink.findFirstOrThrow({ where: { connectionId: ids.conn, subject: "synthetic-sub-001" } })).userId, id("teacher"), "school A's link is untouched");
  assert.equal((await call("oakOwner", "get", "/api/identity")).body.includes(ids.conn), false, "school B cannot see school A's connection");
  assert.equal((await idn("oakOwner", { action: "test", id: ids.conn })).status, 404);
});

test("roster batches: preview first, stable ids, namesakes kept apart, idempotent replay, protected fields", async () => {
  const rows = [
    { kind: "student", externalId: "SIS-S-1", fullName: "Synthetic Sam Lee", className: "Grade 4", section: "A", status: "active" },
    { kind: "student", externalId: "SIS-S-2", fullName: "Synthetic Sam Lee", className: "Grade 4", section: "A", status: "active" },
    { kind: "student", externalId: "SIS-S-9", fullName: "Synthetic New Name", admissionNo: "ADM-9", className: "Grade 4", section: "A", status: "active" },
    { kind: "student", externalId: "SIS-P-1", fullName: "Synthetic Pupil P1", admissionNo: "ADM-11", className: "Grade 4", section: "A", status: "active" },
    { kind: "student", externalId: "SIS-P-2", fullName: "Synthetic Pupil P2", admissionNo: "ADM-12", className: "Grade 4", section: "A", status: "active" },
    { kind: "staff", externalId: "SIS-T-1", fullName: "Synthetic New Staff", email: "new.staff@cedar.example", group: "staff-teachers", status: "active" },
    { kind: "staff", externalId: "SIS-T-2", fullName: "Synthetic Tariq Khan", email: "t.khan@cedar.example", group: "staff-teachers", status: "active" },
    { kind: "staff", externalId: "SIS-T-3", fullName: "Synthetic Admin", email: "admin@cedar.example", group: "it-admins", status: "active" },
  ];
  assert.equal((await idn("principal", { action: "batch", connectionId: ids.conn, externalBatchId: "ROSTER-042", rows })).status, 403, "G14: the principal no longer reviews roster batches");
  const b = await idn("campus", { action: "batch", connectionId: ids.conn, externalBatchId: "ROSTER-042", rows });
  assert.equal(b.status, 201, b.body); ids.b1 = b.json.data.id;
  const detail = await call("campus", "get", `/api/identity?view=batch&id=${ids.b1}`);
  const byExt = Object.fromEntries(detail.json.data.changes.map((c: { externalId: string }) => [c.externalId, c]));
  assert.deepEqual([byExt["SIS-S-1"].action, byExt["SIS-S-2"].action], ["ADD", "ADD"], "namesakes are two people");
  assert.equal(byExt["SIS-S-9"].action, "UPDATE"); assert.equal(byExt["SIS-S-9"].note, "Matched by admission number.");
  assert.equal(byExt["SIS-T-2"].action, "CONFLICT", "an existing email is never adopted by a roster");
  assert.equal(byExt["SIS-T-3"].action, "ERROR", "an unmapped group grants nothing");
  assert.equal(await db.student.count({ where: { schoolId: schoolA, fullName: "Synthetic Sam Lee" } }), 0, "a preview changes nothing");
  assert.equal((await idn("campus", { action: "apply", id: ids.b1, previewHash: "0".repeat(64) })).status, 409, "approval binds the preview");
  const applied = await idn("campus", { action: "apply", id: ids.b1, previewHash: detail.json.data.previewHash });
  assert.equal(applied.status, 200, applied.body);
  assert.deepEqual(applied.json.data.result, { applied: 4, skippedConflicts: 1, errors: 1, keptLocal: 0 });
  assert.equal(await db.student.count({ where: { schoolId: schoolA, fullName: "Synthetic Sam Lee" } }), 2);
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: ids.existingPupil } })).fullName, "Synthetic New Name");
  const staff = await db.user.findFirstOrThrow({ where: { schoolId: schoolA, email: "new.staff@cedar.example" } });
  assert.deepEqual([staff.role, staff.password], ["TEACHER", null], "mapped role, no password: signs in through the provider");
  ids.newStaff = staff.id;
  // Replays: same id + same rows → same batch; apply again → nothing more; same id + other rows → refused.
  const replay = await idn("campus", { action: "batch", connectionId: ids.conn, externalBatchId: "ROSTER-042", rows });
  assert.deepEqual([replay.json.data.id, replay.json.data.replayed], [ids.b1, true]);
  assert.equal((await idn("campus", { action: "apply", id: ids.b1, previewHash: detail.json.data.previewHash })).json.data.repeated, true);
  assert.equal(await db.student.count({ where: { schoolId: schoolA, fullName: "Synthetic Sam Lee" } }), 2, "no duplicates");
  assert.equal((await idn("campus", { action: "batch", connectionId: ids.conn, externalBatchId: "ROSTER-042", rows: rows.slice(0, 1) })).status, 409);
  assert.equal(await db.rosterExternalId.count({ where: { connectionId: ids.conn } }), 6, "matched pupils are mapped too");
});

test("withdrawal with a conflicting local class change: nothing destructive without a decision; staff access revoked, records kept", async () => {
  const sam = await db.rosterExternalId.findFirstOrThrow({ where: { connectionId: ids.conn, externalId: "SIS-P-1" } });
  await localMove(sam.localId, ids["Cedar North-B"]); // a local change after the last sync
  const staffCtx = await context("teacher"); await staffCtx.close();
  const rows = [
    { kind: "student", externalId: "SIS-P-1", fullName: "Synthetic Pupil P1", admissionNo: "ADM-11", className: "Grade 4", section: "A", status: "withdrawn" },
    { kind: "staff", externalId: "SIS-T-1", fullName: "Synthetic New Staff", email: "new.staff@cedar.example", group: "staff-teachers", status: "withdrawn" },
  ];
  ids.b2 = (await idn("campus", { action: "batch", connectionId: ids.conn, externalBatchId: "ROSTER-043", rows })).json.data.id;
  const d = await call("campus", "get", `/api/identity?view=batch&id=${ids.b2}`);
  const byExt = Object.fromEntries(d.json.data.changes.map((c: { externalId: string }) => [c.externalId, c]));
  assert.equal(byExt["SIS-P-1"].action, "CONFLICT");
  assert.deepEqual([byExt["SIS-T-1"].action, byExt["SIS-T-1"].destructive], ["WITHDRAW", true]);
  const before = await db.user.findUniqueOrThrow({ where: { id: ids.newStaff } });
  const r = await idn("campus", { action: "apply", id: ids.b2, previewHash: d.json.data.previewHash });
  assert.deepEqual(r.json.data.result, { applied: 1, skippedConflicts: 1, errors: 0, keptLocal: 0 });
  const pupil = await db.student.findUniqueOrThrow({ where: { id: sam.localId } });
  assert.deepEqual([pupil.archivedAt, pupil.classId], [null, ids["Cedar North-B"]], "the local class change survives an undecided conflict");
  const after = await db.user.findUniqueOrThrow({ where: { id: ids.newStaff } });
  assert.deepEqual([after.isActive, after.accessVersion], [false, before.accessVersion + 1], "access revoked and sessions invalidated");
  // A later batch with an explicit decision applies the withdrawal; the pupil's record stays.
  ids.b3 = (await idn("campus", { action: "batch", connectionId: ids.conn, externalBatchId: "ROSTER-044", rows: rows.slice(0, 1) })).json.data.id;
  const d3 = await call("campus", "get", `/api/identity?view=batch&id=${ids.b3}`);
  await idn("campus", { action: "apply", id: ids.b3, previewHash: d3.json.data.previewHash, decisions: { "student:SIS-P-1": "APPLY_SOURCE" } });
  const withdrawn = await db.student.findUniqueOrThrow({ where: { id: sam.localId } });
  assert.ok(withdrawn.archivedAt, "withdrawn by an accountable decision");
  assert.equal(withdrawn.archiveReason, "Withdrawn by roster sync");
  assert.ok((await db.identityEvent.findMany({ where: { schoolId: schoolA, kind: "ROSTER_APPLIED" } })).length >= 3, "every apply is audited");
});

test("provider outage: SSO refuses, password recovery works, emergency access disables school sign-in and is audited", async () => {
  await idpMode("down");
  const r = await sso(ids.conn, { sub: "synthetic-sub-001", email: "t.khan@cedar.example", email_verified: true });
  assert.equal(r.status, 401); assert.match(r.json.error, /did not confirm/);
  assert.equal((await db.identityEvent.count({ where: { connectionId: ids.conn, kind: "SIGN_IN_FAILED" } })) >= 1, true);
  const ctx = await browser.newContext();
  assert.equal((await ctx.request.post(`${base}/api/auth/login`, { data: { email: users.get("teacher")!.email, password } })).status(), 200, "local password sign-in still works");
  await ctx.close();
  assert.equal((await idn("principal", { action: "status", id: ids.conn, status: "DISABLED", emergency: true })).status, 403, "only named emergency administrators");
  assert.equal((await idn("owner2", { action: "status", id: ids.conn, status: "DISABLED", emergency: true, reason: "Synthetic provider outage" })).status, 200);
  const ev = await db.identityEvent.findFirstOrThrow({ where: { connectionId: ids.conn, kind: "EMERGENCY_DISABLE" } });
  assert.equal(ev.actorId, id("owner2"));
  const after = await sso(ids.conn, { sub: "synthetic-sub-001" });
  assert.match(after.json.redirected, /\/sso\?error=/, "a disabled connection sends people to the password option");
  await idpMode("ok");
  await idn("owner", { action: "test", id: ids.conn }); await idn("owner", { action: "status", id: ids.conn, status: "ENABLED" });
});

test("screens: connection and link review, roster review with a conflict, school sign-in, Arabic and phone", async () => {
  const settings = /\/super\?view=settings&tab=identity/;
  const o = await (await context("owner")).newPage();
  await o.goto(`${base}/identity`);
  await o.waitForURL(settings);
  await o.locator('[data-identity-connection="Synthetic Directory"]').waitFor();
  assert.ok(!(await o.content()).includes("synthetic-client-secret"), "the secret is not in the page");
  await shot(o, "01-identity-connection");
  await o.close();
  await sso(ids.conn, { sub: "synthetic-sub-004", email: "unknown@cedar.example", email_verified: true, name: "Synthetic Unknown" });
  const o2 = await (await context("owner")).newPage();
  await o2.goto(`${base}/identity`);
  await o2.waitForURL(settings);
  await o2.locator('[data-link-request="synthetic-sub-004"] [data-link-review]').click();
  await o2.locator("[data-link-modal]").waitFor();
  await shot(o2, "02-link-review");
  await o2.close();
  const sam2 = await db.rosterExternalId.findFirstOrThrow({ where: { connectionId: ids.conn, externalId: "SIS-P-2" } });
  await localMove(sam2.localId, ids["Cedar North-B"]);
  // The roster review screen lives in the authority's settings; campus operators review batches through the API only.
  const p = await (await context("owner")).newPage();
  await p.goto(`${base}/identity`);
  await p.waitForURL(settings);
  await p.locator("[data-roster]").waitFor();
  await p.locator("[data-roster-batch-id]").fill("ROSTER-045");
  await p.locator("[data-roster-rows]").fill(JSON.stringify([{ kind: "student", externalId: "SIS-P-2", fullName: "Synthetic Pupil P2", admissionNo: "ADM-12", className: "Grade 4", section: "A", status: "withdrawn" }, { kind: "student", externalId: "SIS-S-7", fullName: "Synthetic Noor Shah", className: "Grade 4", section: "A", status: "active" }]));
  await p.locator("[data-roster-preview]").click();
  await p.locator('[data-roster-batch="ROSTER-045"] [data-roster-action="CONFLICT"]').waitFor();
  await shot(p, "03-roster-review-conflict");
  await p.close();
  const s = await (await browser.newContext()).newPage();
  await s.goto(`${base}/sso?school=${schoolA}`);
  await s.locator('[data-sso-connection="Synthetic Directory"]').waitFor();
  await shot(s, "04-school-sign-in");
  await s.close();
  const ar = await (await context("owner-ar")).newPage();
  await ar.goto(`${base}/identity`);
  await ar.waitForURL(settings);
  await ar.locator("[data-identity]").waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await shot(ar, "05-identity-ar");
  await ar.close();
  const phone = await (await context("owner", { width: 390, height: 844 })).newPage();
  await phone.goto(`${base}/identity`);
  await phone.waitForURL(settings);
  await phone.locator("[data-identity-connection]").first().waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(phone, "06-phone");
  await phone.close();
  // Everyone else is sent home (§6.3), never to an identity screen they cannot use.
  for (const [key, home] of [["principal", "/principal"], ["campus", "/admin"], ["teacher", "/teacher"]] as const) {
    const page = await (await context(key)).newPage();
    await page.goto(`${base}/identity`);
    await page.waitForURL((target) => target.pathname === home);
    await page.close();
  }
});
