import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1287: the sandbox simulator can never settle a subscription, so replaying
// a plan completion through it cannot extend the paid-through date.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
const calls: string[] = [];
const prisma = new Proxy({}, { get: (_t, model) => new Proxy({}, { get: (_m, op) => async () => { calls.push(`${String(model)}.${String(op)}`); return null; } }) });
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/db/tenant-context.ts"), { namedExports: { runUnscoped: (_r: string, fn: () => unknown) => fn(), runWithTenantContext: (_c: unknown, fn: () => unknown) => fn() } });
mock.module(src("lib/fees/payment.ts"), { namedExports: { recordPayment: async () => { calls.push("recordPayment"); } } });

test("replaying a plan completion through the simulator is refused every time and writes nothing", async () => {
  const { POST } = await import("../../src/app/api/safepay/simulate/route");
  const body = JSON.stringify({ orderRef: "QA-REPLAY-001", schoolId: "school-a", plan: "BASIC", billingPeriod: "annual" });
  for (let i = 0; i < 2; i++) {
    const res = await POST(new Request("http://localhost/api/safepay/simulate", { method: "POST", headers: { "content-type": "application/json" }, body }) as never);
    assert.equal(res.status, 403);
  }
  assert.deepEqual(calls, []);
});
