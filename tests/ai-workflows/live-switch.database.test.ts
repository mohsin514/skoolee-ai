import "./support/next-async-storage";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { RequestCookies } from "next/dist/compiled/@edge-runtime/cookies";
import { RequestCookiesAdapter } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { HeadersAdapter } from "next/dist/server/web/spec-extension/adapters/headers";
import { prisma } from "../../src/lib/db/prisma";
import { JWT_SECRET } from "../../src/lib/auth/secret";
import { SESSION_COOKIE_NAME, hashSessionToken } from "../../src/lib/auth/session-cookie";
import { isPracticeSchool } from "../../src/lib/ai-workflows/practice";
import { PUT } from "../../src/app/api/owner/schools/[id]/ai-workflows-live/route";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => {
  await db.superAdminAuditLog.deleteMany({ where: { targetId: { in: schools } } });
  await db.school.deleteMany({ where: { id: { in: schools } } });
  await db.$disconnect(); await prisma.$disconnect();
});
const production = { NODE_ENV: "production" };

async function school() {
  const schoolId = `wf-live-${randomUUID()}`; schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic live-switch school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  return schoolId;
}

async function member(schoolId: string, role: string) {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, schoolId, email: `${userId}@example.invalid`, fullName: "Synthetic tester", role: role as never, isActive: true, mfaEnabled: true } });
  const token = await new SignJWT({ userId, schoolId, role, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" })
    .setJti(randomUUID()).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(JWT_SECRET);
  await db.loginSession.create({ data: { schoolId, userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 600_000) } });
  return { userId, token };
}

/** Calls the route handler inside a Next request scope, so cookies() and headers() read this request. */
async function put(schoolId: string, body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json", ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}) });
  const req = new NextRequest(`http://127.0.0.1/api/owner/schools/${schoolId}/ai-workflows-live`, { method: "PUT", headers, body: JSON.stringify(body) });
  const workStore = { route: "/api/owner/schools/[id]/ai-workflows-live", isStaticGeneration: false, forceStatic: false, dynamicShouldError: false } as never;
  const requestStore = { type: "request", phase: "render", headers: HeadersAdapter.seal(headers), cookies: RequestCookiesAdapter.seal(new RequestCookies(headers)) } as never;
  const res = await workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(requestStore, () => PUT(req, { params: Promise.resolve({ id: schoolId }) })));
  return { status: res.status, json: await res.json() };
}

test("isPracticeSchool: production keeps a school in practice until the owner switches it live; the switch lifts it for that school only", async () => {
  const live = await school(), other = await school();
  assert.equal(await isPracticeSchool(live, production, null), true);
  await db.school.update({ where: { id: live }, data: { aiWorkflowsLiveAt: new Date(), aiWorkflowsLiveById: "synthetic-owner" } });
  assert.equal(await isPracticeSchool(live, production, null), false, "switched live");
  assert.equal(await isPracticeSchool(other, production, null), true, "another school is untouched");
  assert.equal(await isPracticeSchool(other, { ...production, AI_WORKFLOWS_LIVE_SCHOOLS: other }, null), false, "env fallback");
  assert.equal(await isPracticeSchool(other, { NODE_ENV: "test" }, null), false, "outside production nothing is practice");
});

test("the live switch route refuses anonymous callers and every school role; nothing changes", async () => {
  const target = await school();
  assert.equal((await put(target, { live: true, acknowledgeRealRecords: true })).status, 401);
  for (const role of ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "STUDENT", "PARENT"]) {
    const { token } = await member(target, role);
    const res = await put(target, { live: true, acknowledgeRealRecords: true }, token);
    assert.equal(res.status, 403, role);
  }
  assert.equal((await db.school.findUniqueOrThrow({ where: { id: target } })).aiWorkflowsLiveAt, null);
  assert.equal(await db.superAdminAuditLog.count({ where: { targetId: target } }), 0);
});

test("APP_OWNER turns a school live only with the acknowledgement, then back; both directions are audited", async () => {
  const target = await school(), platform = await school();
  const owner = await member(platform, "APP_OWNER");
  assert.equal((await put(target, { live: true }, owner.token)).status, 400, "turning on needs the confirm dialog's acknowledgement");
  assert.equal((await put(target, { live: "yes" }, owner.token)).status, 400);

  const on = await put(target, { live: true, acknowledgeRealRecords: true }, owner.token);
  assert.equal(on.status, 200, JSON.stringify(on.json));
  const row = await db.school.findUniqueOrThrow({ where: { id: target } });
  assert.ok(row.aiWorkflowsLiveAt);
  assert.equal(row.aiWorkflowsLiveById, owner.userId);
  assert.equal(await isPracticeSchool(target, production, null), false);

  const off = await put(target, { live: false }, owner.token);
  assert.equal(off.status, 200);
  assert.equal((await db.school.findUniqueOrThrow({ where: { id: target } })).aiWorkflowsLiveAt, null);
  assert.equal(await isPracticeSchool(target, production, null), true);

  const logs = await db.superAdminAuditLog.findMany({ where: { targetId: target }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(logs.map(log => [log.action, log.userId]), [["ai_workflows_live_on", owner.userId], ["ai_workflows_live_off", owner.userId]]);
});
