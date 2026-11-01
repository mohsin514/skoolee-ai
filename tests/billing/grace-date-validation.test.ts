import assert from "node:assert/strict";
import { beforeEach, before, mock, test } from "node:test";

// SKAI-1430: a grace request names a real calendar date. An impossible date is a 400 with no request row;
// leap-year and month-length boundaries are checked by the same rule. The auth, billing and database layers
// are stubbed so the real route handler and its schema run.
class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const user = { userId: "u1", schoolId: "school-a", role: "SUPER_ADMIN", mfaVerified: true };
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    canManageSubscription: () => true,
    isFamilyRole: () => false,
    requireAuthUser: async () => user,
    errorResponse: (error: unknown) => {
      if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
      return Response.json({ error: "Request failed" }, { status: 500 });
    },
  },
});
mock.module("@/lib/api/validate", { namedExports: { readJsonBody: async (req: Request) => req.json() } });
mock.module("@/lib/stripe/server", { namedExports: { stripe: null } });
mock.module("@/lib/auth/institution", { namedExports: { kindFor: () => null } });
mock.module("@/lib/auth/institution-server", { namedExports: { getSubscriptionOwners: async () => [] } });
mock.module("@/lib/billing/lifecycle", {
  namedExports: {
    parsePlan: () => null,
    previewCancellation: async () => ({}),
    previewPlanChange: async () => ({}),
    saveSubscriptionRequest: async (input: unknown) => { rows.push(input); return { id: `row-${rows.length}` }; },
  },
});
const rows: unknown[] = [];
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      school: { findUnique: async () => ({ status: "ACTIVE", subscriptionLifecycleState: "PAST_DUE", graceEndsAt: null, planEndsAt: null, stripeSubscriptionId: null }) },
      subscriptionRequest: { findFirst: async () => null, findMany: async () => [] },
      $transaction: async () => [],
    },
  },
});

let POST: (req: Request) => Promise<Response>;
before(async () => {
  POST = (await import("../../src/app/api/billing/lifecycle/route")).POST as typeof POST;
});
beforeEach(() => { rows.length = 0; });

const grace = (graceUntil: string) => POST(new Request("http://localhost/api/billing/lifecycle", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "grace", graceUntil, reason: "Payment is delayed by the bank transfer", idempotencyKey: `grace-${graceUntil}-${Math.random()}` }),
}));

for (const impossible of ["2026-11-31", "2027-02-29", "2026-04-31", "2026-02-30", "2026-13-01", "2026-00-10"]) {
  test(`an impossible grace date ${impossible} is a 400 and saves no request row`, async () => {
    const response = await grace(impossible);
    assert.equal(response.status, 400);
    // Refused by the calendar check, not by the 30-day window that happens to apply on some days.
    assert.equal((await response.json()).error, "Choose a valid subscription action");
    assert.deepEqual(rows, []);
  });
}

test("a leap day in a leap year passes the calendar check (then the 30-day window applies)", async () => {
  const response = await grace("2028-02-29");
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /within the next 30 days/, "the date is real, so only the window refuses it");
  assert.deepEqual(rows, []);
});

test("a non-leap February 29 is refused as an invalid date", async () => {
  const response = await grace("2027-02-29");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Choose a valid subscription action");
  assert.deepEqual(rows, []);
});

test("a real date inside the 30-day window is saved as that exact day", async () => {
  const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const response = await grace(day);
  assert.equal(response.status, 202);
  assert.equal(rows.length, 1);
  assert.equal((rows[0] as { effectiveAt: Date }).effectiveAt.toISOString(), `${day}T23:59:59.000Z`);
});
