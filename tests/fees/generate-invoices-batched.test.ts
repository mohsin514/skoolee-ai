import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

// SKAI-1968: invoice generation writes invoices and tax documents in bulk inside the one generation transaction,
// keeps per-student error results, numbers both in student order and stays scoped to the caller's school and campus.
class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type User = { userId: string; role: string; schoolId: string; campusId: string; fullName: string };
type Row = Record<string, unknown>;
const state = {
  user: { userId: "acc-a", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Accountant" } as User,
  students: [] as Row[],
  ops: [] as string[],
  invoices: [] as Row[],
  docs: [] as Row[],
  seqIncrements: [] as Array<{ id: string; by: number }>,
  campusReads: [] as unknown[],
  locks: [] as unknown[],
  lastDocNumber: null as string | null,
  oneTime: {} as Record<string, number>,
  discountRules: {} as Record<string, number>,
  billedEnrollments: new Set<string>(),
  carry: new Map<string, { balance: number }>(),
  billed: [] as string[],
};
const activation = {
  id: "act-1", schoolId: "school-a", packageCode: "SA-DEMO", packageVersion: 1, currency: "SAR", exemptFeeCodes: [] as string[],
  legalName: "QA-01 Synthetic School", taxId: "300000000000003", approvedById: "admin-a", approvedAt: new Date("2026-01-01T00:00:00Z"), evidenceReference: "QA-01",
};
const tx = {
  academicCycle: { findMany: async () => [] },
  student: { findMany: async ({ where }: { where: Row }) => { state.ops.push("student.findMany"); assert.equal(where.schoolId, state.user.schoolId); return state.students; } },
  feeStructure: { findMany: async () => { state.ops.push("feeStructure.findMany"); return [{ classId: "class-1", currency: "SAR", monthlyFee: 100000, oneTimeFeesJson: state.oneTime, discountRulesJson: state.discountRules, taxPercentage: 0, approvedFee: null, approvedFeeReference: null }]; } },
  school: { findUnique: async () => { state.ops.push("school.findUnique"); return { feeCapMode: "OFF" }; } },
  studentEnrollment: {
    findMany: async ({ where }: { where: { schoolId: string; campusId: string } }) => {
      state.ops.push("studentEnrollment.findMany");
      assert.deepEqual([where.schoolId, where.campusId], [state.user.schoolId, state.students[0]?.campusId]);
      // The third student has no enrollment, so it must come back as a per-student error, mid-batch.
      return state.students.filter((_s, i) => i !== 2).map(s => ({ id: `enr-${s.id}`, studentId: s.id, classId: "class-1", academicYear: "2026-2027", startDate: new Date("2026-08-01T00:00:00Z"), endDate: null }));
    },
  },
  invoice: {
    findFirst: async () => { state.ops.push("invoice.findFirst"); return { invoiceNumber: `INV-2026-${String(state.students[0]?.campusId).split("-").pop()!.toUpperCase()}-00007` }; },
    create: async () => { throw new Error("per-row invoice.create must not run"); },
    createManyAndReturn: async ({ data }: { data: Row[] }) => {
      state.ops.push("invoice.createManyAndReturn");
      assert.ok(data.length <= 500);
      const rows = data.map((d, i) => ({ id: `inv-${state.invoices.length + i}`, invoiceNumber: d.invoiceNumber, invoiceDate: d.invoiceDate }));
      state.invoices.push(...data);
      return [...rows].reverse(); // the route must match by invoice number, not by return order
    },
  },
  taxActivation: {
    findFirst: async ({ where }: { where: Row }) => { state.ops.push("taxActivation.findFirst"); assert.equal(where.schoolId, state.user.schoolId); return activation; },
    update: async ({ where, data }: { where: { id: string }; data: { numberSeq: { increment: number } } }) => { state.ops.push("taxActivation.update"); state.seqIncrements.push({ id: where.id, by: data.numberSeq.increment }); },
  },
  taxDocument: {
    findFirst: async () => { state.ops.push("taxDocument.findFirst"); return state.lastDocNumber ? { documentNumber: state.lastDocNumber } : null; },
    create: async () => { throw new Error("per-row taxDocument.create must not run"); },
    createMany: async ({ data }: { data: Row[] }) => { state.ops.push("taxDocument.createMany"); assert.ok(data.length <= 500); state.docs.push(...data); return { count: data.length }; },
  },
  campus: { findMany: async ({ where }: { where: Row }) => { state.ops.push("campus.findMany"); state.campusReads.push(where); return [{ id: state.students[0]?.campusId, name: "QA-01 Campus" }]; } },
  $executeRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => { state.ops.push("$executeRaw"); state.locks.push(values[0]); return 1; },
  auditLog: { create: async () => { state.ops.push("auditLog.create"); } },
};

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    canManageFinance: (u: User) => u.role === "ACCOUNTANT" || u.role === "ADMIN",
    assertPermission: async () => {},
    assertFeesRead: async () => {},
    soleChecker: async () => null,
    resolveCampusId: async (u: User, requested?: string) => requested ?? u.campusId,
    errorResponse: (e: unknown) => Response.json({ error: (e as Error).message }, { status: e instanceof ApiError ? e.status : 500 }),
  },
});
mock.module("@/lib/db/prisma", { namedExports: { prisma: {} } });
mock.module("@/lib/auth/institution", { namedExports: { isInstitutionAuthority: () => false } });
mock.module("@/lib/api/validate", { namedExports: { parseBody: async (req: Request) => req.json() } });
mock.module("@/lib/validators/route-bodies", { namedExports: { jsonObjectBody: {} } });
mock.module("@/lib/validators/schemas", {
  namedExports: { generateInvoicesSchema: { safeParse: (b: { generationMonth: string }) => ({ success: true, data: b }) } },
});
mock.module("@/lib/school-ai/fee-invoices", {
  namedExports: {
    invoiceMonthDates: () => ({ start: new Date("2026-11-01T00:00:00Z"), end: new Date("2026-12-01T00:00:00Z") }),
    calculateInvoiceAmounts: () => ({}), MAX_INVOICE_MINOR: 1_000_000_000_000,
  },
});
mock.module("@/lib/fees/invoice-generation", {
  namedExports: {
    existingMonthlyStudentInvoices: async () => state.billed.map(studentId => ({ id: `old-${studentId}`, studentId, invoiceDate: new Date("2026-11-01T00:00:00Z") })),
    invoiceGenerationTransaction: async (_u: User, _campusId: string, work: (t: typeof tx) => Promise<unknown>) => work(tx),
  },
});
mock.module("@/lib/locale/package", { namedExports: { minorUnits: () => 2 } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ locale: "en" }) } });
mock.module("@/lib/fees/invoice-generation-inputs", {
  namedExports: {
    classYearKey: (a: string, b: string) => `${a}|${b}`,
    loadInvoiceGenerationInputs: async () => ({ assignmentByClassYear: new Map(), categoryDiscountsByCategory: new Map(), explicitDiscountsByStudent: new Map(), carryForwardByStudentYear: state.carry, latestOpenInvoiceByStudent: new Map() }),
    memoByKey: <T>(load: (k: string) => Promise<T>) => { const cache = new Map<string, Promise<T>>(); return (k: string) => { if (!cache.has(k)) cache.set(k, load(k)); return cache.get(k)!; }; },
  },
});
mock.module("@/lib/fees/regulator-cap", { namedExports: { evaluateFeeCap: () => ({}), feeCapDecision: () => ({}) } });
mock.module("@/lib/notifications/in-app", { namedExports: { notify: () => {} } });
mock.module("@/lib/fees/structure-year", {
  namedExports: {
    enrollmentsBilledOneTimeFees: async () => state.billedEnrollments,
    feeStructureActiveWhere: () => ({}),
    invoiceBatchStatus: (g: number, e: number) => (g === 0 && e > 0 ? 422 : 201),
    pickStructureForClass: (list: Row[], classId: string) => list.find(s => s.classId === classId) ?? null,
  },
});

const roster = (count: number, campusId: string) => Array.from({ length: count }, (_, i) => ({
  id: `stu-${String(i).padStart(4, "0")}`, campusId, classId: "class-1", categoryId: null, fullName: `QA Student ${i}`,
  class: { id: "class-1", name: "Grade 5", academicYear: "2026-2027" },
}));
const generate = async () => {
  const { POST } = await import("../../src/app/api/fees/generate-invoices/route");
  const res = await POST(new Request("http://local/api/fees/generate-invoices", { method: "POST", body: JSON.stringify({ generationMonth: "2026-11" }) }) as never);
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  state.user = { userId: "acc-a", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Accountant" };
  state.ops = []; state.invoices = []; state.docs = []; state.seqIncrements = []; state.campusReads = []; state.locks = [];
  state.lastDocNumber = "SAD-000041";
  state.oneTime = {}; state.discountRules = {}; state.billedEnrollments = new Set(); state.carry = new Map(); state.billed = [];
  state.students = roster(5, "campus-a1");
});

test("a batch writes invoices and tax documents in bulk, numbered in student order, with the mid-batch error kept", async () => {
  const r = await generate();
  assert.equal(r.status, 201);
  assert.equal(r.body.generated, 4);
  assert.deepEqual(r.body.errors, [{ studentId: "stu-0002", status: "error", error: "Review enrollment for this billing period before generating an invoice." }]);
  assert.deepEqual(state.invoices.map(i => [i.studentId, i.invoiceNumber, i.campusId]), [
    ["stu-0000", "INV-2026-A1-00008", "campus-a1"], ["stu-0001", "INV-2026-A1-00009", "campus-a1"],
    ["stu-0003", "INV-2026-A1-00010", "campus-a1"], ["stu-0004", "INV-2026-A1-00011", "campus-a1"],
  ]);
  const byInvoice = new Map(state.invoices.map((inv, i) => [inv.invoiceNumber, `inv-${i}`]));
  assert.deepEqual(state.docs.map(d => [d.invoiceId, d.documentNumber, d.schoolId, d.campusId]), [
    [byInvoice.get("INV-2026-A1-00008"), "SAD-000042", "school-a", "campus-a1"], [byInvoice.get("INV-2026-A1-00009"), "SAD-000043", "school-a", "campus-a1"],
    [byInvoice.get("INV-2026-A1-00010"), "SAD-000044", "school-a", "campus-a1"], [byInvoice.get("INV-2026-A1-00011"), "SAD-000045", "school-a", "campus-a1"],
  ]);
  assert.deepEqual(state.docs.map(d => (d.snapshot as { buyer: { name: string }; seller: { campus: string } })).map(s => [s.buyer.name, s.seller.campus]), [
    ["QA Student 0", "QA-01 Campus"], ["QA Student 1", "QA-01 Campus"], ["QA Student 3", "QA-01 Campus"], ["QA Student 4", "QA-01 Campus"],
  ]);
  assert.deepEqual(state.seqIncrements, [{ id: "act-1", by: 4 }]);
  assert.deepEqual(state.locks, ["taxnum:school-a:SAD-"]);
});

test("several hundred students take a fixed handful of statements, not several per student", async () => {
  state.students = roster(1200, "campus-a1");
  state.lastDocNumber = null;
  const started = Date.now();
  const r = await generate();
  assert.equal(r.status, 201);
  assert.equal(r.body.generated, 1199);
  const count = (op: string) => state.ops.filter(o => o === op).length;
  assert.equal(count("invoice.createManyAndReturn"), 3);
  assert.equal(count("taxDocument.createMany"), 3);
  assert.equal(count("$executeRaw"), 1);
  assert.equal(count("taxDocument.findFirst"), 1);
  assert.equal(count("taxActivation.update"), 1);
  assert.equal(count("campus.findMany"), 1);
  assert.ok(state.ops.length <= 20, `statements: ${state.ops.length}`);
  assert.ok(Date.now() - started < 5000);
  const numbers = state.docs.map(d => Number(String(d.documentNumber).slice(4)));
  assert.deepEqual(numbers, Array.from({ length: 1199 }, (_, i) => i + 1));
  assert.equal(new Set(state.invoices.map(i => i.invoiceNumber)).size, 1199);
});

test("two schools and two campuses each write only into their own school and campus", async () => {
  await generate();
  const a = { invoices: state.invoices, docs: state.docs, campus: state.campusReads[0] };
  state.user = { userId: "acc-b", role: "ACCOUNTANT", schoolId: "school-b", campusId: "campus-b2", fullName: "QA Accountant B" };
  state.students = roster(3, "campus-b2");
  state.invoices = []; state.docs = []; state.campusReads = []; state.locks = [];
  await generate();
  assert.ok(a.invoices.every(i => i.campusId === "campus-a1" && i.schoolId === undefined));
  assert.ok(a.docs.every(d => d.schoolId === "school-a" && d.campusId === "campus-a1"));
  assert.deepEqual(a.campus, { id: { in: ["campus-a1"] } });
  assert.ok(state.invoices.every(i => i.campusId === "campus-b2"));
  assert.ok(state.docs.every(d => d.schoolId === "school-b" && d.campusId === "campus-b2"));
  assert.deepEqual(state.campusReads, [{ id: { in: ["campus-b2"] } }]);
  assert.deepEqual(state.locks, ["taxnum:school-b:SAD-"]);
});

test("roles without finance access are refused before any write", async () => {
  for (const role of ["TEACHER", "PARENT", "STUDENT"]) {
    state.user = { ...state.user, role };
    assert.equal((await generate()).status, 403, role);
  }
  assert.deepEqual(state.ops, []);
});

test("SKAI-2061: a legacy one-time fee is billed on the first invoice only, not on later months", async () => {
  state.students = roster(2, "campus-a1");
  state.oneTime = { Lab: 100000 };
  state.billedEnrollments = new Set(["enr-stu-0001"]); // already charged the fee on an earlier invoice
  const r = await generate();
  assert.equal(r.status, 201);
  const byStudent = new Map(state.invoices.map(i => [i.studentId, i]));
  assert.equal(byStudent.get("stu-0000")!.oneTimeFees, 100000);
  assert.equal(byStudent.get("stu-0000")!.subtotal, 200000);
  assert.equal(byStudent.get("stu-0001")!.oneTimeFees, 0);
  assert.equal(byStudent.get("stu-0001")!.subtotal, 100000);
});

test("SKAI-2099: a per-class student with a carry-forward balance (owed or credit) is refused, not billed without it", async () => {
  state.carry = new Map([["stu-0000|2026-2027", { balance: 120000 }], ["stu-0001|2026-2027", { balance: -80000 }], ["stu-0003|2026-2027", { balance: 0 }]]);
  const r = await generate();
  const refused = r.body.errors.filter((e: Row) => e.error === "Review carry-forward allocation before generating another invoice.").map((e: Row) => e.studentId);
  assert.deepEqual(refused, ["stu-0000", "stu-0001"]);
  assert.deepEqual(state.invoices.map(i => i.studentId), ["stu-0003", "stu-0004"]);
});

test("SKAI-2024: a fully discounted pupil gets a PAID zero invoice, others stay PENDING", async () => {
  state.students = roster(2, "campus-a1");
  state.discountRules = { scholarship: 100 };
  const full = await generate();
  assert.equal(full.status, 201);
  assert.deepEqual(state.invoices.map(i => [i.totalAmount, i.balanceDue, i.status]), [[0, 0, "PAID"], [0, 0, "PAID"]]);
  state.invoices = [];
  state.discountRules = { scholarship: 50 };
  await generate();
  assert.deepEqual(state.invoices.map(i => [i.totalAmount, i.status]), [[57500, "PENDING"], [57500, "PENDING"]]);
});

test("SKAI-2058: a re-run skips students already billed and invoices the late joiner", async () => {
  state.students = roster(4, "campus-a1");
  state.billed = ["stu-0000", "stu-0001", "stu-0002"];
  const r = await generate();
  assert.equal(r.status, 201);
  assert.equal(r.body.generated, 1);
  assert.equal(r.body.alreadyBilled, 3);
  assert.deepEqual(state.invoices.map(i => i.studentId), ["stu-0003"]);
});

test("SKAI-2058: a re-run where every student is already billed still answers 409 and writes nothing", async () => {
  state.students = roster(3, "campus-a1");
  state.billed = ["stu-0000", "stu-0001", "stu-0002"];
  const r = await generate();
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "Invoices already exist for 3 student(s) this month");
  assert.equal(state.invoices.length, 0);
});
