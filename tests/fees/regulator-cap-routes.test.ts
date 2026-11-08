import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1154: the fee-cap policy route (opt-in per school, admins only) and the fee-structure POST honouring it.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const state = {
  user: null as Record<string, unknown> | null,
  schools: {} as Record<string, { feeCapMode: string; feeCapFramework: string }>,
  structures: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
};

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
class ValidationError extends ApiError {
  constructor(public fieldErrors: Record<string, string[]>, message = "Please check the highlighted fields") { super(message, 400); }
}

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    ValidationError,
    requireAuthUser: async () => state.user,
    resolveCampusId: async () => "campus-a",
    canManageFinance: (user: { role: string }) => ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"].includes(user.role),
    assertPermission: async () => undefined,
    assertFeesRead: async () => undefined,
    errorResponse: (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ success: false, error: (error as Error).message }, { status });
    },
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      school: {
        findUnique: async ({ where }: any) => state.schools[where.id] ?? null,
        update: async ({ where, data }: any) => Object.assign(state.schools[where.id], data),
      },
      feeStructure: {
        findFirst: async () => null,
        create: async ({ data }: any) => { const row = { id: `fs-${state.structures.length + 1}`, ...data, class: { id: data.classId, name: "Grade 1", section: null } }; state.structures.push(row); return row; },
      },
      auditLog: { create: async ({ data }: any) => { state.audits.push(data); } },
    },
  },
});
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: () => undefined } });
mock.module(src("lib/locale/store.ts"), { namedExports: { getLocalePackage: async () => ({ currency: "AED" }) } });
mock.module(src("lib/fees/structure-year.ts"), { namedExports: { resolveFeeStructureYearId: async () => "year-1" } });

const json = (url: string, method: string, body: unknown) => new Request(`http://local${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
const structureBody = (over: Record<string, unknown> = {}) => ({ currency: "AED", classId: "c-1", monthlyFee: 6000, approvedFee: 5000, approvedFeeReference: "KHDA-1", activeFrom: "2026-09-01", ...over });

beforeEach(() => {
  state.schools = { "school-a": { feeCapMode: "OFF", feeCapFramework: "KHDA_ECI" }, "school-b": { feeCapMode: "BLOCK", feeCapFramework: "KHDA_ECI" } };
  state.structures = [];
  state.audits = [];
  state.user = { userId: "admin-a", role: "ADMIN", schoolId: "school-a", campusId: "campus-a", fullName: "Admin" };
});

test("an admin opts the school in; the change is audited and stays in their own school", async () => {
  const { PUT, GET } = await import("../../src/app/api/fees/fee-cap-policy/route");
  const res = await PUT(json("/api/fees/fee-cap-policy", "PUT", { mode: "WARN" }));
  assert.equal(res.status, 200);
  assert.equal(state.schools["school-a"].feeCapMode, "WARN");
  assert.equal(state.schools["school-b"].feeCapMode, "BLOCK");
  assert.equal(state.audits[0].tableName, "school_fee_cap_policy");
  const read = (await (await GET()).json()).data;
  assert.equal(read.mode, "WARN");
  assert.equal(read.canEdit, true);
});

test("an accountant cannot change the policy and an unknown mode is rejected", async () => {
  const { PUT } = await import("../../src/app/api/fees/fee-cap-policy/route");
  state.user = { ...state.user, role: "ACCOUNTANT" };
  assert.equal((await PUT(json("/api/fees/fee-cap-policy", "PUT", { mode: "OFF" }))).status, 403);
  state.user = { ...state.user, role: "ADMIN" };
  assert.equal((await PUT(json("/api/fees/fee-cap-policy", "PUT", { mode: "LOOSE" }))).status, 400);
  assert.equal(state.schools["school-a"].feeCapMode, "OFF");
});

test("with the cap off, an over-cap fee saves silently with its approved fee", async () => {
  const { POST } = await import("../../src/app/api/fees/structure/route");
  const res = await POST(json("/api/fees/structure", "POST", structureBody()));
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.feeCapWarning, undefined);
  assert.equal(state.structures[0].approvedFee, 5000);
  assert.equal(state.structures[0].approvedFeeReference, "KHDA-1");
});

test("WARN saves an over-cap fee and returns the warning", async () => {
  state.schools["school-a"].feeCapMode = "WARN";
  const { POST } = await import("../../src/app/api/fees/structure/route");
  const res = await POST(json("/api/fees/structure", "POST", structureBody()));
  assert.equal(res.status, 201);
  assert.match((await res.json()).feeCapWarning, /above the regulator-approved fee/);
});

test("BLOCK refuses an over-cap or unrecorded approved fee and writes nothing", async () => {
  state.user = { ...state.user, schoolId: "school-b" };
  const { POST } = await import("../../src/app/api/fees/structure/route");
  assert.equal((await POST(json("/api/fees/structure", "POST", structureBody()))).status, 422);
  assert.equal((await POST(json("/api/fees/structure", "POST", structureBody({ approvedFee: null })))).status, 422);
  assert.equal(state.structures.length, 0);
  assert.equal((await POST(json("/api/fees/structure", "POST", structureBody({ monthlyFee: 5000 })))).status, 201);
});
