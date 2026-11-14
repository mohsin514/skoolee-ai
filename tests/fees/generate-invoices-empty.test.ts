import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

// SKAI-1946: generating invoices for a class/campus with no active students is an empty result (200), not a 404.
class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type User = { userId: string; role: string; schoolId: string; campusId: string };
const state: { user: User; studentWheres: unknown[]; lockedCampus: string[]; notified: number } = {
  user: { userId: "acc-a", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a" },
  studentWheres: [], lockedCampus: [], notified: 0,
};
const tx = {
  student: { findMany: async ({ where }: { where: unknown }) => { state.studentWheres.push(where); return []; } },
};

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    canManageFinance: (u: User) => u.role === "ACCOUNTANT" || u.role === "ADMIN",
    assertPermission: async () => {},
    resolveCampusId: async (u: User, requested?: string) => requested ?? u.campusId,
    errorResponse: (e: unknown) => Response.json({ error: (e as Error).message }, { status: e instanceof ApiError ? e.status : 500 }),
  },
});
mock.module("@/lib/api/validate", { namedExports: { parseBody: async (req: Request) => req.json() } });
mock.module("@/lib/validators/route-bodies", { namedExports: { jsonObjectBody: {} } });
mock.module("@/lib/validators/schemas", {
  namedExports: { generateInvoicesSchema: { safeParse: (b: { generationMonth: string; classId?: string }) => ({ success: true, data: b }) } },
});
mock.module("@/lib/school-ai/fee-invoices", {
  namedExports: {
    invoiceMonthDates: () => ({ start: new Date("2026-11-01T00:00:00Z"), end: new Date("2026-12-01T00:00:00Z") }),
    calculateInvoiceAmounts: () => ({}), MAX_INVOICE_MINOR: 0,
  },
});
mock.module("@/lib/fees/invoice-generation", {
  namedExports: {
    existingMonthlyStudentInvoices: async () => { throw new Error("must not run for an empty roster"); },
    invoiceGenerationTransaction: async (_u: User, campusId: string, work: (t: typeof tx) => Promise<unknown>) => { state.lockedCampus.push(campusId); return work(tx); },
  },
});
mock.module("@/lib/fees/invoice-context", { namedExports: { invoiceEnrollmentContext: () => null } });
mock.module("@/lib/locale/package", { namedExports: { minorUnits: () => 2 } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => null } });
mock.module("@/lib/tax/service", { namedExports: { activationFor: async () => null, issueDocument: async () => null, taxForActivation: () => null } });
mock.module("@/lib/fees/invoice-generation-inputs", { namedExports: { classYearKey: () => "", loadInvoiceGenerationInputs: async () => ({}), memoByKey: () => () => null } });
mock.module("@/lib/notifications/in-app", { namedExports: { notify: () => { state.notified += 1; } } });
mock.module("@/lib/fees/structure-year", {
  namedExports: { feeStructureActiveWhere: () => ({}), invoiceBatchStatus: (g: number, e: number) => (g === 0 && e > 0 ? 422 : 201), pickStructureForClass: () => null },
});

const generate = async (body: Record<string, unknown>) => {
  const { POST } = await import("../../src/app/api/fees/generate-invoices/route");
  const res = await POST(new Request("http://local/api/fees/generate-invoices", { method: "POST", body: JSON.stringify({ generationMonth: "2026-11", ...body }) }) as never);
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  state.user = { userId: "acc-a", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a" };
  state.studentWheres = []; state.lockedCampus = []; state.notified = 0;
});

test("no active students answers 200 with a zero count and the same message", async () => {
  const r = await generate({});
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { success: false, error: "No active students found for this class/campus", totalStudents: 0, generated: 0, errors: [] });
  assert.equal(state.notified, 0);
});

test("the empty roster lookup stays scoped to the caller's school and campus", async () => {
  await generate({ campusId: "campus-a2", classId: "class-1" });
  state.user = { userId: "acc-b", role: "ACCOUNTANT", schoolId: "school-b", campusId: "campus-b" };
  await generate({});
  const [a, b] = state.studentWheres as Array<{ schoolId: string; campusId: string; class: { schoolId: string; campusId: string; id?: string } }>;
  assert.deepEqual([a.schoolId, a.campusId, a.class.schoolId, a.class.campusId, a.class.id], ["school-a", "campus-a2", "school-a", "campus-a2", "class-1"]);
  assert.deepEqual([b.schoolId, b.campusId, b.class.schoolId, b.class.campusId], ["school-b", "campus-b", "school-b", "campus-b"]);
  assert.deepEqual(state.lockedCampus, ["campus-a2", "campus-b"]);
});

test("roles without finance access are still refused with 403", async () => {
  for (const role of ["TEACHER", "PARENT", "STUDENT"]) {
    state.user = { ...state.user, role };
    assert.equal((await generate({})).status, 403, role);
  }
  assert.equal(state.studentWheres.length, 0);
});
