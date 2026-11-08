import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1128: CRON_SECRET-guarded scheduled notification sweep, one tenant-scoped sweep per school.
const root = join(__dirname, "..", "..");
const src = (path: string) => pathToFileURL(join(root, "src", path)).href;

const h = { schools: [{ id: "school-a" }, { id: "school-b" }], calls: [] as unknown[], tenants: [] as string[], failFor: null as string | null };

mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: { school: { findMany: async () => h.schools } } } });
mock.module(src("lib/db/tenant-context.ts"), {
  namedExports: {
    runUnscoped: async (_reason: string, fn: () => unknown) => fn(),
    enterTenantContext: ({ schoolId }: { schoolId: string }) => { h.tenants.push(schoolId); },
  },
});
mock.module(src("lib/notifications/automation.ts"), {
  namedExports: {
    runNotificationAutomationSweep: async (args: { schoolId: string }) => {
      h.calls.push(args);
      if (args.schoolId === h.failFor) throw new Error("boom");
      return [{ ok: true }];
    },
  },
});

const call = async (method: "GET" | "POST", auth?: string) => {
  const route = await import("../../src/app/api/cron/notification-automation/route");
  const req = new Request("http://local/api/cron/notification-automation", { method, headers: auth ? { authorization: auth } : {} });
  return route[method](req as never);
};

const previous = process.env.CRON_SECRET;
beforeEach(() => { h.calls = []; h.tenants = []; h.failFor = null; process.env.CRON_SECRET = "test-secret"; });
afterEach(() => { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; });

test("fails closed when CRON_SECRET is not configured", async () => {
  delete process.env.CRON_SECRET;
  const res = await call("GET", "Bearer ");
  assert.equal(res.status, 503);
  assert.equal(h.calls.length, 0);
});

test("rejects a missing or wrong bearer token", async () => {
  assert.equal((await call("GET")).status, 401);
  assert.equal((await call("POST", "Bearer nope")).status, 401);
  assert.equal(h.calls.length, 0);
});

test("runs the sweep once per school inside that school's tenant scope", async () => {
  const res = await call("GET", "Bearer test-secret");
  assert.equal(res.status, 200);
  assert.deepEqual(h.calls, [{ schoolId: "school-a" }, { schoolId: "school-b" }]);
  assert.deepEqual(h.tenants, ["school-a", "school-b"]);
  const body = await res.json();
  assert.equal(body.schools, 2);
  assert.equal(body.failed, 0);
});

test("one school's failure does not stop the others", async () => {
  h.failFor = "school-a";
  const res = await call("POST", "Bearer test-secret");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(h.calls.length, 2);
  assert.equal(body.failed, 1);
});

test("vercel.json schedules the sweep", () => {
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  assert.ok(config.crons.some((cron: { path: string }) => cron.path === "/api/cron/notification-automation"));
});
