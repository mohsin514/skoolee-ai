import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { request, type APIRequestContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-484 on the isolated app: a standalone owner (ADMIN) and a group owner (SUPER_ADMIN) both get a
// successful session before their first campus exists and after it is created.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.SESSION_TEST_APP || "http://localhost:3108";
const db = new PrismaClient(), password = "SyntheticSession484!";
const owners: { kind: string; schoolId: string; userId: string; email: string; role: "ADMIN" | "SUPER_ADMIN" }[] = [];

const secrets = new Map<string, string>();
async function signIn(email: string): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: base });
  assert.equal((await api.post("/api/auth/login", { data: { email, password } })).status(), 200);
  const known = secrets.get(email);
  if (known) { assert.equal((await api.post("/api/auth/mfa", { data: { action: "challenge", code: totp(known, Math.floor(Date.now() / 30_000) + 1) } })).status(), 200); return api; }
  const { secret } = await (await api.post("/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { secrets.set(email, secret.replace(/\s+/g, "")); await api.post("/api/auth/mfa", { data: { action: "verify-setup", code: totp(secrets.get(email)!) } }); await api.post("/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  return api;
}

before(async () => {
  for (const [kind, role] of [["standalone", "ADMIN"], ["group", "SUPER_ADMIN"]] as const) {
    const schoolId = `s484-${kind}-${randomUUID()}`, userId = randomUUID(), email = `${userId}@example.invalid`;
    await db.school.create({ data: { id: schoolId, name: `Synthetic ${kind} school`, slug: schoolId, regId: schoolId, contactEmail: email, city: "Lahore", status: "ACTIVE", plan: "BASIC" } });
    await db.user.create({ data: { id: userId, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${kind} owner`, schoolId, role, isInstitutionOwner: true, onboardingComplete: false, isActive: true } });
    owners.push({ kind, schoolId, userId, email, role });
  }
  await db.authAttempt.deleteMany({});
});
after(async () => {
  for (const o of owners) await db.school.delete({ where: { id: o.schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("both owner kinds get a session before and after their first campus", async () => {
  for (const o of owners) {
    const api = await signIn(o.email);
    for (let i = 0; i < 3; i++) {
      const res = await api.get("/api/auth/session");
      assert.equal(res.status(), 200, `${o.kind} before campus: ${await res.text()}`);
      const body = await res.json();
      assert.deepEqual([body.user.id, body.user.schoolId, body.user.role], [o.userId, o.schoolId, o.role]);
    }
    const campusId = randomUUID();
    await db.campus.create({ data: { id: campusId, schoolId: o.schoolId, name: "Main campus", regId: campusId, city: "Lahore" } });
    await db.user.update({ where: { id: o.userId }, data: { campusId } });
    await api.dispose();
    const again = await signIn(o.email);
    const res = await again.get("/api/auth/session");
    assert.equal(res.status(), 200, `${o.kind} after campus`);
    assert.equal((await res.json()).user.campusName, "Main campus");
    await again.dispose();
  }
});
