import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { hashSessionToken } from "../../src/lib/auth/session-cookie";
import { ACCESS_DENIED } from "../../src/lib/auth/policy";

// No .env, production database, outbound transport, or shared fixture reset.
const database = new URL(process.env.DATABASE_URL || "http://invalid");
const app = new URL(process.env.AUTHZ_TEST_APP_URL || "http://localhost:3107");
if (!["127.0.0.1", "localhost"].includes(database.hostname) || database.pathname !== "/postgres" || database.port !== "55438" || process.env.DIRECT_URL !== process.env.DATABASE_URL) throw new Error("Use isolated PG55438 with matching DATABASE_URL and DIRECT_URL");
if (!["127.0.0.1", "localhost"].includes(app.hostname) || app.port !== "3107" || !process.env.AUTH_SECRET) throw new Error("Use local app3107 and explicit local-only AUTH_SECRET");
const db = new PrismaClient(), school = `delegation-${randomUUID()}`, foreignSchool = `delegation-${randomUUID()}`;
const campus = randomUUID(), otherCampus = randomUUID(), foreignCampus = randomUUID();
const visitor = randomUUID(), otherVisitor = randomUUID(), foreignVisitor = randomUUID();
const sessions = new Map<string, string>(), accounts = new Map<string, string>();
const roles = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "RECEPTIONIST", "PARENT", "STUDENT", "TEACHER"] as const;
async function request(role: string, path: string, method = "GET", body?: unknown) {
  return fetch(new URL(path, app), { method, redirect: "manual", headers: { cookie: sessions.get(role)!, origin: app.origin, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function grant(flags: Record<string, boolean>, role = "RECEPTIONIST", module = "front-desk") {
  const response = await request("SUPER_ADMIN", "/api/roles/permissions", "PATCH", { role, module, ...flags });
  assert.equal(response.status, 200, await response.clone().text());
  const { data } = await response.json(); assert.equal(data.role, role); assert.equal(data.module, module); return data;
}
before(async () => {
  for (const id of [school, foreignSchool]) await db.school.create({ data: { id, name: "Synthetic delegation school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  for (const [id, schoolId] of [[campus, school], [otherCampus, school], [foreignCampus, foreignSchool]]) await db.campus.create({ data: { id, schoolId, name: "Synthetic campus", city: "Synthetic", regId: id } });
  for (const role of roles) {
    const userId = randomUUID(), email = `${userId}@example.invalid`;
    await db.user.create({ data: { id: userId, email, fullName: "Synthetic delegation account", schoolId: school, campusId: campus, role, isInstitutionOwner: role === "ADMIN", mfaEnabled: true, onboardingComplete: true } });
    const token = await new SignJWT({ userId, schoolId: school, campusId: campus, role, email, mfaVerified: true, onboardingComplete: true }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await db.loginSession.create({ data: { schoolId: school, userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 3600_000) } });
    sessions.set(role, `skoolee_token=${token}`); accounts.set(role, userId);
  }
  for (const [id, campusId, schoolId] of [[visitor, campus, school], [otherVisitor, otherCampus, school], [foreignVisitor, foreignCampus, foreignSchool]]) await db.visitorLog.create({ data: { id, schoolId, campusId, name: "Synthetic same-name visitor", inTime: new Date(), note: "Original" } });
});
after(async () => { await db.school.deleteMany({ where: { id: { in: [school, foreignSchool] } } }); await db.$disconnect(); });

test("families and delegated staff cannot read the grant matrix or grant themselves authority", async () => {
  for (const role of ["PARENT", "STUDENT", "TEACHER", "RECEPTIONIST"]) {
    for (const method of ["GET", "PATCH"]) {
      const response = await request(role, "/api/roles/permissions", method, method === "PATCH" ? { role, module: "staff", canView: true, canEdit: true } : undefined);
      assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: ACCESS_DENIED });
    }
  }
  assert.equal(await db.rolePermission.count({ where: { schoolId: school } }), 0);
});

test("permission PATCH delegates only a scoped action and revocation applies to the same existing session", async () => {
  await grant({ canView: true, canAdd: false, canEdit: false, canDelete: false });
  assert.equal((await request("RECEPTIONIST", "/api/front-desk/visitors", "PATCH", { id: visitor, note: "Denied edit" })).status, 403);
  await grant({ canEdit: true });
  const change = await request("RECEPTIONIST", "/api/front-desk/visitors", "PATCH", { id: visitor, note: "Authorized scoped edit" });
  assert.equal(change.status, 200, await change.clone().text());
  assert.equal((await db.visitorLog.findUniqueOrThrow({ where: { id: visitor } })).note, "Authorized scoped edit");
  for (const id of [otherVisitor, foreignVisitor, randomUUID()]) {
    const denied = await request("RECEPTIONIST", "/api/front-desk/visitors", "PATCH", { id, note: "Cross-scope edit" });
    assert.equal(denied.status, 404); assert.deepEqual(await denied.json(), { error: "Visitor log not found" });
  }
  assert.equal((await request("RECEPTIONIST", "/api/accounts/chart", "POST", { campusId: campus, name: "Denied account", type: "ASSET" })).status, 403);
  assert.equal((await request("RECEPTIONIST", "/api/navigation/access")).status, 200);
  await grant({ canEdit: false });
  for (const route of ["visitors", "complaints", "phone-calls", "postal", "certificates"]) {
    for (const method of ["POST", "PATCH", "DELETE"]) assert.equal((await request("RECEPTIONIST", `/api/front-desk/${route}?id=${visitor}`, method, method === "DELETE" ? undefined : { id: visitor, note: "Denied edit" })).status, 403, `${route} ${method}`);
  }
  assert.equal((await db.visitorLog.findUniqueOrThrow({ where: { id: visitor } })).note, "Authorized scoped edit");
  assert.equal((await db.visitorLog.findUniqueOrThrow({ where: { id: otherVisitor } })).note, "Original");
  assert.equal((await db.visitorLog.findUniqueOrThrow({ where: { id: foreignVisitor } })).note, "Original");
});

test("read-only administrators cannot mutate grants after current staff permission is revoked", async () => {
  for (const role of ["CAMPUS_ADMIN", "PRINCIPAL"]) {
    const matrix = await request(role, "/api/roles/permissions"); assert.equal(matrix.status, 200); assert.equal((await matrix.json()).data.canEdit, false);
    assert.equal((await request(role, "/api/roles/permissions", "PATCH", { role: "RECEPTIONIST", module: "front-desk", canEdit: true })).status, 403, "campus manager cannot change institution-wide grants");
  }
  const owner = await request("ADMIN", "/api/roles/permissions"); assert.equal((await owner.json()).data.canEdit, true);
  await grant({ canView: true, canEdit: false }, "ADMIN", "staff");
  assert.equal((await request("ADMIN", "/api/roles/permissions", "PATCH", { role: "RECEPTIONIST", module: "front-desk", canEdit: true })).status, 403);
  await grant({ canEdit: true }, "ADMIN", "staff");
  assert.equal((await (await request("ADMIN", "/api/roles/permissions")).json()).data.canEdit, true);
  await db.user.update({ where: { id: accounts.get("ADMIN")! }, data: { isInstitutionOwner: false } });
  assert.equal((await request("ADMIN", "/api/roles/permissions", "PATCH", { role: "RECEPTIONIST", module: "front-desk", canEdit: true })).status, 403, "existing owner cookie cannot retain a revoked live owner flag");
  await grant({ canView: true, canEdit: false }, "PRINCIPAL", "staff");
  const response = await request("PRINCIPAL", "/api/roles/permissions"); assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal((await response.json()).data.canEdit, false);
  assert.equal((await request("PRINCIPAL", "/api/roles/permissions", "PATCH", { role: "RECEPTIONIST", module: "front-desk", canEdit: true })).status, 403);
  await grant({ canView: false }, "PRINCIPAL", "staff");
  assert.equal((await request("PRINCIPAL", "/api/roles/permissions")).status, 403);
  await db.user.update({ where: { id: accounts.get("CAMPUS_ADMIN")! }, data: { role: "RECEPTIONIST" } });
  assert.equal((await request("CAMPUS_ADMIN", "/api/roles/permissions", "PATCH", { role: "RECEPTIONIST", module: "front-desk", canEdit: true })).status, 401);
});

test("permission input is strict, fixed roles stay fixed, and closing View clears mutation grants", async () => {
  const crossOrigin = await fetch(new URL("/api/roles/permissions", app), { method: "PATCH", headers: { cookie: sessions.get("SUPER_ADMIN")!, origin: "https://unrelated.example.invalid", "content-type": "application/json" }, body: JSON.stringify({ role: "RECEPTIONIST", module: "front-desk", canEdit: true }) });
  assert.equal(crossOrigin.status, 403); assert.equal(crossOrigin.headers.get("cache-control"), "private, no-store");
  for (const body of [{ canEdit: "false" }, { canEdit: 1 }, { canEdit: true, schoolId: foreignSchool }]) assert.equal((await request("SUPER_ADMIN", "/api/roles/permissions", "PATCH", { role: "RECEPTIONIST", module: "front-desk", ...body })).status, 400);
  assert.equal((await request("SUPER_ADMIN", "/api/roles/permissions", "PATCH", { role: "SUPER_ADMIN", module: "staff", canView: false })).status, 403);
  await grant({ canView: true, canEdit: true, canAdd: true, canDelete: true });
  const closed = await grant({ canView: false });
  for (const key of ["canView", "canAdd", "canEdit", "canDelete"]) assert.equal(closed[key], false);
  assert.equal((await request("SUPER_ADMIN", "/api/roles/permissions", "PATCH", { role: "RECEPTIONIST", module: "front-desk", canEdit: true })).status, 400);
  assert.equal(await db.rolePermission.count({ where: { schoolId: foreignSchool } }), 0);
});
