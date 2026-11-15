import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-2033: the fee-setup GET routes must apply the same fees.view gate (assertFeesRead) as /api/fees/invoices,
// so a principal (fees.view denied) cannot read them, and no database read happens before the gate.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const state = { denyFees: true, dbReads: 0 };

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const read = async () => { state.dbReads += 1; return []; };
const model = { findMany: read, findFirst: read, count: async () => 0 };

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => ({ userId: "u-1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a1" }),
    assertFeesRead: async () => { if (state.denyFees) throw new ApiError("Insufficient permissions: fees.view", 403); },
    canManageFinance: () => true,
    assertPermission: async () => undefined,
    resolveCampusId: async () => "campus-a1",
    scopedCampusWhere: () => ({}),
    errorResponse: (error: unknown) => Response.json({ success: false, error: (error as Error).message }, { status: error instanceof ApiError ? error.status : 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: { feeStructure: model, feeCarryForward: model, feeGroup: model, feesMasterLine: model, feeGroupAssignment: model, feeDiscount: model },
  },
});
mock.module(src("lib/destructive/operations.ts"), { namedExports: { operationDeleteResponse: async () => new Response(null, { status: 405 }) } });
mock.module(src("lib/audit-events.ts"), { namedExports: { writeAuditEvent: async () => undefined } });
mock.module(src("lib/fees/fee-group-command.ts"), { namedExports: { createFeeGroup: async () => ({}) } });
mock.module(src("lib/fees/master-line-command.ts"), { namedExports: { createMasterLine: async () => ({}) } });
mock.module(src("lib/fees/group-assignment-command.ts"), { namedExports: { assignFeeGroup: async () => ({}) } });
mock.module(src("lib/fees/discount-command.ts"), { namedExports: { createDiscount: async () => ({}) } });
mock.module(src("lib/fees/structure-year.ts"), { namedExports: { resolveFeeStructureYearId: async () => null } });
mock.module(src("lib/fees/regulator-cap.ts"), { namedExports: { evaluateFeeCap: () => ({}), feeCapDecision: () => ({}) } });
mock.module(src("app/api/fees/reports/invoice-currency.ts"), { namedExports: { campusBillingCurrency: async () => "PKR" } });
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: async () => undefined } });
mock.module(src("lib/auth/policy.ts"), { namedExports: { campusScope: () => ({}) } });
mock.module(src("lib/api/validate.ts"), { namedExports: { parseBody: async () => ({}) } });
mock.module(src("lib/validators/route-bodies.ts"), { namedExports: { idBody: {}, jsonObjectBody: {}, requiredIdBody: {} } });

const ROUTES = ["structure", "carry-forwards", "groups", "master-lines", "assignments", "discounts"];

beforeEach(() => { state.dbReads = 0; state.denyFees = true; });

for (const name of ROUTES) {
  test(`GET /api/fees/${name} is denied without fees.view and reads nothing`, async () => {
    const { GET } = await import(`../../src/app/api/fees/${name}/route`);
    const res = await GET(new Request(`http://local/api/fees/${name}`) as never);
    assert.equal(res.status, 403);
    assert.equal(state.dbReads, 0);
  });

  test(`GET /api/fees/${name} still answers 200 once fees.view is granted`, async () => {
    state.denyFees = false;
    const { GET } = await import(`../../src/app/api/fees/${name}/route`);
    const res = await GET(new Request(`http://local/api/fees/${name}`) as never);
    assert.equal(res.status, 200);
  });
}
