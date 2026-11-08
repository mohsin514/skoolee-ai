/** SKAI-852: failed password sign-ins against school accounts leave a school-scoped SIGN_IN_FAILED event. */
import { before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";

const src = (path: string) => pathToFileURL(join(process.cwd(), "src", path)).href;
const HASH = bcrypt.hashSync("right-password", 4);
type Row = { id: string; email: string; schoolId: string; role: string; password: string; isActive: boolean; campus: { archivedAt: Date | null } | null; school: { status: string } };
const h = { users: [] as Row[], events: [] as { schoolId: string; kind: string; detail: Record<string, unknown> }[], throttled: false, failWrite: false };
const user = (id: string, schoolId: string, over: Partial<Row> = {}): Row => ({ id, email: "shared@example.test", schoolId, role: "TEACHER", password: HASH, isActive: true, campus: null, school: { status: "ACTIVE" }, ...over });

const prisma = {
  user: { findMany: async ({ where }: { where: { email: string } }) => h.users.filter(u => u.email === where.email) },
  identityEvent: { create: async ({ data }: { data: (typeof h.events)[number] }) => { if (h.failWrite) throw new Error("db down"); h.events.push(data); return data; } },
};
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/db/tenant-context.ts"), { namedExports: { runUnscoped: (_r: string, fn: () => unknown) => fn() } });
mock.module(src("lib/auth/login-throttle.ts"), { namedExports: { checkLoginThrottle: async () => (h.throttled ? { ok: false, retryAfterSeconds: 60, remaining: 0 } : { ok: true }) } });
mock.module(src("lib/audit.ts"), { namedExports: { logSuperAdminAction: async () => {} } });

let POST: typeof import("@/app/api/auth/login/route").POST;
let NextRequest: typeof import("next/server").NextRequest;
before(async () => { ({ POST } = await import("@/app/api/auth/login/route")); ({ NextRequest } = await import("next/server")); });
const login = async (email: string, password: string) => {
  const res = await POST(new NextRequest("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ email, password }) }));
  return { status: res.status, body: await res.json() };
};
const GENERIC = { status: 401, body: { error: "Invalid email or password" } };

beforeEach(() => { h.users = []; h.events = []; h.throttled = false; h.failWrite = false; });

test("a wrong password for a school account writes an event for that school, without the password", async () => {
  h.users = [user("u-a", "school-a")];
  assert.deepEqual(await login("shared@example.test", "wrong-password"), GENERIC);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].schoolId, "school-a");
  assert.equal(h.events[0].kind, "SIGN_IN_FAILED");
  assert.equal(h.events[0].detail.reason, "INVALID_PASSWORD");
  assert.ok(!JSON.stringify(h.events).includes("wrong-password"));
});

test("one address at two schools gives each school its own event", async () => {
  h.users = [user("u-a", "school-a"), user("u-b", "school-b")];
  assert.deepEqual(await login("shared@example.test", "wrong-password"), GENERIC);
  assert.deepEqual(h.events.map(e => e.schoolId).sort(), ["school-a", "school-b"]);
});

test("an unknown email writes no school event and gets the same response", async () => {
  h.users = [user("u-a", "school-a")];
  assert.deepEqual(await login("nobody@example.test", "wrong-password"), GENERIC);
  assert.equal(h.events.length, 0);
});

test("inactive account and archived campus are recorded with a generic response", async () => {
  h.users = [user("u-a", "school-a", { isActive: false }), user("u-b", "school-b", { campus: { archivedAt: new Date() } })];
  assert.deepEqual(await login("shared@example.test", "right-password"), GENERIC);
  assert.deepEqual(h.events.map(e => [e.schoolId, e.detail.reason]).sort(), [["school-a", "INACTIVE_ACCOUNT"], ["school-b", "ARCHIVED_CAMPUS"]]);
});

test("a throttled attempt is recorded for the matched account", async () => {
  h.users = [user("u-a", "school-a")];
  h.throttled = true;
  assert.equal((await login("shared@example.test", "wrong-password")).status, 429);
  assert.deepEqual(h.events.map(e => e.detail.reason), ["THROTTLED"]);
});

test("a failed audit write does not change the response", async () => {
  h.users = [user("u-a", "school-a")];
  h.failWrite = true;
  const error = console.error; console.error = () => {};
  try { assert.deepEqual(await login("shared@example.test", "wrong-password"), GENERIC); } finally { console.error = error; }
});
