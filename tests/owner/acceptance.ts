/** Synthetic HTTP + browser acceptance. Requires a dedicated app using the same database and secret. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { chromium } from "playwright";
import bcrypt from "bcryptjs";

async function main() {
const base = "http://127.0.0.1:3094";
const expectedDb = "postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024";
assert.equal(process.env.DATABASE_URL, expectedDb, "Only the dedicated synthetic database is allowed");
assert.equal(process.env.AUTH_SECRET, "synthetic-owner-audit-only-20261024");
const db = new PrismaClient({ datasourceUrl: expectedDb + "?connection_limit=2" });
const results: { name: string; passed: boolean; error?: string }[] = [];
const output = "test-results/owner-audit";
await mkdir(output, { recursive: true });
async function check(name: string, fn: () => Promise<void>) {
  if (process.env.OWNER_QA_FILTER && !name.includes(process.env.OWNER_QA_FILTER)) return;
  try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (e) { const error = String(e); results.push({ name, passed: false, error }); console.log(`FAIL ${name}: ${error}`); }
}
async function actor(schoolId: string, role: "APP_OWNER" | "SUPER_ADMIN" | "TEACHER", fullName: string) {
  const user = await db.user.create({ data: { schoolId, role, fullName, email: `${randomUUID()}@example.invalid`, onboardingComplete: true, welcomeCompletedAt: new Date(), tourProgress: { owner: { v: 1, s: "done", at: new Date().toISOString() } }, mfaEnabled: true, password: await bcrypt.hash("OldPassword987", 4) } });
  const token = await new SignJWT({ userId: user.id, role, schoolId, accessVersion: user.accessVersion, email: user.email, fullName, onboardingComplete: true, schoolStatus: "ACTIVE", mfaVerified: true })
    .setProtectedHeader({ alg: "HS256" }).setJti(randomUUID()).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const session = await db.loginSession.create({ data: { schoolId, userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000) } });
  return { user, token, session };
}
async function request(path: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(base + path, { method, headers: { cookie: `skoolee_token=${token}`, origin: base, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json, headers: response.headers };
}
const id = randomUUID();
const school = await db.school.create({ data: { name: "Owner Audit Platform", city: "Synthetic", slug: id, regId: id, contactEmail: `${id}@example.invalid`, status: "ACTIVE", plan: "PRO", registrationKind: "GROUP" } });
const owner = await actor(school.id, "APP_OWNER", "Synthetic Platform Owner");
const admin = await actor(school.id, "SUPER_ADMIN", "Synthetic School Admin");
const target = await actor(school.id, "TEACHER", "Password Reset Target");
let tenant: { schoolId: string; campusId: string; ownerId: string };
const readPaths = ["stats", "schools", "users", "sessions", "audit-logs", "platform-config", "payment-settings", "subscription-requests", "provider-events", "pilots", "pilots/export", "capacity", "support/grants", "support/session"];
for (const path of readPaths) {
  await check(`owner reads ${path}`, async () => { const r = await request(`/api/owner/${path}`, owner.token); assert.equal(r.status, path === "support/session" ? 403 : 200, JSON.stringify(r.json)); });
  await check(`school admin denied ${path}`, async () => { const r = await request(`/api/owner/${path}`, admin.token); assert.equal(r.status, 403); });
}
await check("malformed pagination and date filters stay valid", async () => {
  for (const path of ["schools", "users", "sessions", "audit-logs"]) assert.equal((await request(`/api/owner/${path}?page=bad&limit=Infinity&days=bad`, owner.token)).status, 200);
});
await check("standalone provisioning and institution owner visibility", async () => {
  const r = await request("/api/owner/schools", owner.token, "POST", { kind: "STANDALONE", schoolName: "Synthetic Cedar School", city: "Synthetic", ownerName: "Cedar Owner", ownerEmail: `${randomUUID()}@example.invalid`, plan: "PRO", status: "ACTIVE" });
  assert.equal(r.status, 201, JSON.stringify(r.json)); tenant = r.json.data;
  const detail = await request(`/api/owner/schools/${tenant.schoolId}`, owner.token);
  assert.ok(detail.json.data.users.some((u: { id: string }) => u.id === tenant.ownerId));
});
await check("all staff roles can be provisioned; duplicate tenant emails are rejected", async () => {
  for (const role of ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"]) {
    const body = { schoolId: tenant.schoolId, campusId: tenant.campusId, fullName: `Synthetic ${role}`, email: `${role.toLowerCase()}-${id}@example.invalid`, role };
    const r = await request("/api/owner/users", owner.token, "POST", body);
    assert.equal(r.status, 201, `${role}: ${JSON.stringify(r.json)}`);
    assert.equal((await request("/api/owner/users", owner.token, "POST", body)).status, 409);
  }
});
await check("school user filter excludes every other tenant", async () => {
  const r = await request(`/api/owner/users?schoolId=${tenant.schoolId}`, owner.token);
  assert.equal(r.status, 200); assert.ok(r.json.data.length >= 9);
  assert.ok(r.json.data.every((u: { school: { id: string } }) => u.school.id === tenant.schoolId));
  const schools = await request(`/api/owner/schools?search=Synthetic%20Cedar&limit=100`, owner.token);
  assert.equal(schools.json.data.find((s: { id: string }) => s.id === tenant.schoolId).totalStaff, 9, "include the group admin without a campus");
});
await check("pricing saves, reloads and rejects malformed data", async () => {
  for (const path of ["/api/owner/platform-config", `/api/owner/schools/${tenant.schoolId}/pricing`]) {
    for (const pricing of [[], { BASIC: "bad" }, { BAD: { price: 1 } }, { BASIC: { price: -1 } }]) assert.equal((await request(path, owner.token, "PUT", { pricing })).status, 400);
    assert.equal((await request(path, owner.token, "PUT", { pricing: { BASIC: { price: 1234 }, ENTERPRISE: {} } })).status, 200);
  }
  assert.equal((await request("/api/owner/platform-config", owner.token)).json.data.BASIC.price, 1234);
  assert.equal((await request(`/api/owner/schools/${tenant.schoolId}`, owner.token)).json.data.planPricing.BASIC.price, 1234);
});
await check("school plan, suspension, restoration and archive are reversible", async () => {
  const path = `/api/owner/schools/${tenant.schoolId}`;
  for (const body of [{ plan: "BASIC" }, { status: "SUSPENDED" }, { status: "ACTIVE" }]) assert.equal((await request(path, owner.token, "PATCH", body)).status, 200);
  assert.equal((await request(path, owner.token, "DELETE", { confirmName: "wrong" })).status, 400);
  assert.equal((await request(path, owner.token, "DELETE", { confirmName: "Synthetic Cedar School" })).status, 200);
  assert.equal((await request(path, owner.token)).json.data.status, "DELETED");
  assert.equal((await request(path, owner.token, "PATCH", { status: "ACTIVE" })).status, 200);
  assert.equal((await request(path, owner.token)).json.data.deletedAt, null);
});
await check("AI live switch requires acknowledgement and can be reversed", async () => {
  const path = `/api/owner/schools/${tenant.schoolId}/ai-workflows-live`;
  assert.equal((await request(path, owner.token, "PUT", { live: true })).status, 400);
  assert.equal((await request(path, owner.token, "PUT", { live: true, acknowledgeRealRecords: true })).status, 200);
  assert.equal((await request(path, owner.token, "PUT", { live: false })).json.data.aiWorkflowsLiveAt, null);
});
await check("active session list excludes expired sessions", async () => {
  const expired = await db.loginSession.create({ data: { schoolId: school.id, userId: owner.user.id, tokenHash: randomUUID(), expiresAt: new Date(0), isActive: true } });
  const r = await request(`/api/owner/sessions?active=true&userId=${owner.user.id}`, owner.token);
  assert.ok(r.json.data.some((s: { id: string }) => s.id === owner.session.id));
  assert.ok(!r.json.data.some((s: { id: string }) => s.id === expired.id));
});
await check("password reset rejects current password, revokes sessions and requires replacement", async () => {
  const path = `/api/owner/users/${target.user.id}/password`;
  assert.equal((await request(path, owner.token, "PUT", { newPassword: "OldPassword987" })).status, 400);
  assert.equal((await request(path, owner.token, "PUT", { newPassword: "ReplacementPassword987" })).status, 200);
  assert.equal(await db.loginSession.count({ where: { userId: target.user.id, isActive: true } }), 0);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.user.id } })).mustChangePassword, true);
  assert.equal((await request(path, owner.token, "PUT", { newPassword: "OldPassword987" })).status, 400);
});
await check("bank settings validate input, persist, and create a redacted audit entry", async () => {
  const path = "/api/owner/payment-settings";
  assert.equal((await request(path, owner.token, "POST", { action: "save-bank", bankName: {}, accountTitle: "Synthetic", accountNumber: "12345678" })).status, 400);
  assert.equal((await request(path, owner.token, "POST", { action: "save-bank", bankName: "Synthetic Bank", accountTitle: "Test Platform", accountNumber: "12345678" })).status, 200);
  assert.equal((await request(path, owner.token)).json.data.bankName, "Synthetic Bank");
  const audit = await db.superAdminAuditLog.findFirstOrThrow({ where: { userId: owner.user.id, action: "payment_bank_details_updated" } });
  assert.ok(!JSON.stringify(audit.newValues).includes("12345678"));
});
await check("subscription grace approval applies once; repeated review is rejected", async () => {
  const until = new Date(Date.now() + 86400000).toISOString();
  const row = await db.subscriptionRequest.create({ data: { schoolId: school.id, requestedById: admin.user.id, idempotencyKey: randomUUID(), kind: "GRACE_EXTENSION", details: { requestedUntil: until } } });
  const body = { requestId: row.id, decision: "APPROVE_REQUEST", reason: "Synthetic acceptance grace extension" };
  assert.equal((await request("/api/owner/subscription-requests", owner.token, "POST", body)).status, 200);
  assert.equal((await request("/api/owner/subscription-requests", owner.token, "POST", body)).status, 409);
  assert.equal((await db.school.findUniqueOrThrow({ where: { id: school.id } })).graceEndsAt?.toISOString(), until);
});
await check("pilot can be created, read and its charter updated", async () => {
  const r = await request("/api/owner/pilots", owner.token, "POST", { name: "Synthetic audit pilot", country: "PK", curriculum: "Synthetic", language: "en", useCase: "Owner acceptance", startsOn: "2026-10-24", championName: "Test Champion", measurementOwnerId: owner.user.id, synthetic: true, workflows: [{ key: "MARKS_ENTRY", definition: "Record synthetic assessment marks", successDefinition: "All synthetic records are saved" }] });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const path = `/api/owner/pilots/${r.json.data.id}`;
  assert.equal((await request(path, owner.token)).status, 200);
  assert.equal((await request(path, owner.token, "POST", { action: "charter", data: { status: "CLOSED" } })).status, 200);
});
await check("support request, approval, scoped read, queued write, execution and closure", async () => {
  const r = await request("/api/owner/support/grants", owner.token, "POST", { schoolId: school.id, purpose: "Investigate synthetic profile issue", impact: "School phone needs correction", scope: ["school_profile"], actions: ["read", "write"], durationMinutes: 30 });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const grantId = r.json.data.grant.id;
  assert.equal((await request(`/api/owner/support/grants/${grantId}/start`, owner.token, "POST", {})).status, 403);
  assert.equal((await request("/api/super/support-grants", admin.token, "PATCH", { grantId, decision: "approve" })).status, 200);
  const started = await request(`/api/owner/support/grants/${grantId}/start`, owner.token, "POST", {});
  assert.equal(started.status, 200, JSON.stringify(started.json));
  const scopedToken = owner.token + "; " + started.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await request("/api/owner/support/workspace?domain=school_profile", scopedToken)).status, 200);
  assert.equal((await request("/api/owner/support/workspace?domain=users", scopedToken)).status, 403);
  assert.equal((await request("/api/owner/stats", scopedToken)).status, 403);
  const queued = await request("/api/owner/support/actions", scopedToken, "POST", { domain: "school_profile", action: "write", payload: { field: "phone", value: "0000000000" } });
  assert.equal(queued.status, 202, JSON.stringify(queued.json));
  assert.equal((await request(`/api/owner/support/actions/${queued.json.data.id}/execute`, scopedToken, "POST", {})).status, 200);
  assert.equal((await request(`/api/owner/support/grants/${grantId}`, scopedToken, "PATCH", { status: "closed", closureEvidence: "Synthetic profile correction verified in acceptance test." })).status, 200);
});
await check("session termination immediately closes a selected session", async () => {
  assert.equal((await request("/api/owner/sessions", owner.token, "DELETE", { sessionId: admin.session.id })).status, 200);
  assert.equal((await db.loginSession.findUniqueOrThrow({ where: { id: admin.session.id } })).isActive, false);
});
await check("real owner sign-in, MFA deferral and AI sidebar navigation on loopback IP", async () => {
  const loginOwner = await actor(school.id, "APP_OWNER", "Synthetic Password Login Owner");
  await db.user.update({ where: { id: loginOwner.user.id }, data: { mfaEnabled: false } });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const login = await context.request.post(`${base}/api/auth/login`, { data: { email: loginOwner.user.email, password: "OldPassword987" }, headers: { origin: base } });
    assert.equal(login.status(), 200); assert.equal((await login.json()).mfaRequired, true);
    const defer = await context.request.post(`${base}/api/auth/mfa`, { data: { action: "defer" }, headers: { origin: base } });
    assert.equal(defer.status(), 200, await defer.text());
    const page = await context.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const chatRequests: string[] = []; page.on("request", r => { if (r.url().includes("/api/chat/")) chatRequests.push(r.url()); });
    await page.goto(`${base}/owner`, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /AI Workflows/ }).first().click();
    await page.locator("[data-ai-workspace]").waitFor({ timeout: 90000 });
    assert.equal(new URL(page.url()).pathname, "/ai");
    assert.equal(await page.locator("[data-ai-disabled]").count(), 0);
    assert.ok(await page.locator("textarea").isEnabled());
    for (const api of ["/api/ai-workflows", "/api/ai-workflows/handoffs", "/api/ai-workflows/questionnaire"]) assert.equal((await context.request.get(base + api)).status(), 200, api);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of ["/ai", "/ai/can-do", "/ai/waiting", "/ai/setup"]) {
        await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.locator("h1").first().waitFor({ timeout: 30000 });
        await page.locator("div.pointer-events-none.fixed.inset-0[aria-hidden=true]").waitFor({ state: "hidden", timeout: 15000 });
        assert.equal(new URL(page.url()).pathname, path);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} overflows at ${width}`);
        await page.screenshot({ path: `${output}/${path.replaceAll("/", "-")}-${width}.png` });
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(chatRequests, [], "platform owner must not open school chat");
    await context.request.post(`${base}/api/auth/logout`, { headers: { origin: base } });
  } finally { await browser.close(); }
});
await check("AI-prepared school opens a populated form, provisions once and completes its workflow", async () => {
  const email = `${randomUUID()}@example.invalid`;
  const prefill = { schoolName: "Synthetic AI Prepared School", city: "Lahore", ownerName: "Synthetic Owner", ownerEmail: email, kind: "STANDALONE", plan: "BASIC" };
  const job = await db.aiWorkflowJob.create({ data: { schoolId: school.id, actorId: owner.user.id, actorRole: "APP_OWNER", origin: "FREEFORM", accessVersion: 0, language: "en", requestHash: randomUUID(), idempotencyKey: randomUUID(), status: "WAITING_HANDOFF", planVersion: 1, budget: {}, expiresAt: new Date(Date.now() + 86400000) } });
  const step = await db.aiWorkflowStep.create({ data: { schoolId: school.id, jobId: job.id, planVersion: 1, stepKey: "s1", capabilityKey: "platform.provision_school", capabilityVersion: 1, staticClass: "C", effectiveClass: "C", modelInput: prefill, status: "WAITING_HANDOFF", idempotencyKey: randomUUID() } });
  const id = randomUUID();
  const route = `/owner?view=schools&new=1&workflowHandoffId=${id}`;
  await db.aiWorkflowHandoff.create({ data: { id, schoolId: school.id, jobId: job.id, stepId: step.id, kind: "DOMAIN_SCREEN", targetRoute: route, targetRoles: ["APP_OWNER"], originRole: "APP_OWNER", originUserId: owner.user.id, prefill, idempotencyKey: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  await db.aiWorkflowStep.update({ where: { id: step.id }, data: { handoffId: id } });
  const foreign = await actor(school.id, "APP_OWNER", "Other Synthetic Owner");
  assert.equal((await request("/api/owner/schools", foreign.token, "POST", { ...prefill, workflowHandoffId: id })).status, 404);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 1000 } });
    await context.addCookies([{ name: "skoolee_token", value: owner.token, url: base }]);
    const page = await context.newPage();
    await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 90000 });
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 30000 });
    assert.equal(await dialog.locator('input').evaluateAll(nodes => nodes.some(node => (node as HTMLInputElement).value === "Synthetic AI Prepared School")), true);
    assert.equal(await dialog.locator('input').evaluateAll(nodes => nodes.some(node => (node as HTMLInputElement).value === "Lahore")), true);
    assert.equal(await dialog.getByRole("radio", { name: /Single school/ }).getAttribute("aria-checked"), "true");
    await page.screenshot({ path: `${output}/ai-prepared-school-390.png` });
    const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/owner/schools") && response.request().method() === "POST");
    await dialog.getByRole("button", { name: /Provision school/ }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 201, await response.text());
    const created = (await response.json()).data;
    assert.equal((await db.aiWorkflowHandoff.findUniqueOrThrow({ where: { id } })).completedId, created.schoolId);
    assert.equal((await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } })).outcome, "EXECUTED");
    const replay = await request("/api/owner/schools", owner.token, "POST", { ...prefill, ownerEmail: `${randomUUID()}@example.invalid`, workflowHandoffId: id });
    assert.ok([404, 409].includes(replay.status));
    assert.equal(await db.school.count({ where: { name: prefill.schoolName, contactEmail: email } }), 1);
  } finally { await browser.close(); }
});
await check("browser: all eleven owner views at desktop and mobile", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await context.addCookies([{ name: "skoolee_token", value: owner.token, url: base }]);
    const page = await context.newPage();
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ["schools", "users", "subscription-requests", "pricing", "payments", "billing", "support", "audit", "sessions", "pilots", "capacity"]) {
        await page.goto(`${base}/owner?view=${view}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.locator(`[data-owner-view="${view}"]`).waitFor({ timeout: 30000 });
        await page.locator("div.pointer-events-none.fixed.inset-0[aria-hidden=true]").waitFor({ state: "hidden", timeout: 15000 });
        await page.waitForTimeout(300);
        console.log(`VIEW ${view} ${width}`);
        assert.ok(await page.locator("h1").count(), `${view}: heading missing`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${view}: overflow at ${width}`);
        await page.screenshot({ path: `${output}/${view}-${width}.png` });
      }
    }
    await page.goto(`${base}/owner?view=users`, { waitUntil: "domcontentloaded" });
    await page.getByRole("combobox", { name: "Filter by school" }).selectOption(tenant.schoolId);
    await page.waitForTimeout(500);
    assert.ok((await page.locator("[data-owner-user-cards]").innerText()).includes("Synthetic Cedar School"));
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    for (const role of ["Accountant", "Librarian", "Receptionist"]) assert.ok(await page.getByRole("radio", { name: new RegExp(role) }).count(), `missing role ${role}`);
    await page.screenshot({ path: `${output}/add-user-390.png` });
    await page.goto(`${base}/owner?view=schools`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Provision a school", exact: true }).click();
    await page.getByRole("radiogroup", { name: "Kind of institution" }).waitFor();
    await page.screenshot({ path: `${output}/provision-school-390.png` });
    await page.goto(`${base}/owner?view=schools`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Synthetic Cedar School/ }).first().click();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await page.getByRole("button", { name: "Suspend school", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
await db.$disconnect();
console.log(`${results.filter(r => r.passed).length}/${results.length} checks passed`);
if (results.some(r => !r.passed)) process.exitCode = 1;

}
main().catch(error => { console.error(error); process.exit(1); });
