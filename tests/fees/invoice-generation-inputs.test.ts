import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classYearKey, loadInvoiceGenerationInputs, memoByKey } from "@/lib/fees/invoice-generation-inputs";

// SKAI-1814: monthly invoice generation reads its per-student inputs once per batch, always school-scoped.

type Row = Record<string, any>;
const A = { schoolId: "school-a", campusId: "campus-a" };
const B = { schoolId: "school-b", campusId: "campus-b" };

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === "object" && "in" in cond) return (cond.in as unknown[]).includes(row[key]);
    return row[key] === cond;
  });
}

function fakeTx(data: Record<string, Row[]>) {
  const calls: Array<{ model: string; where: Row }> = [];
  const delegate = (model: string) => ({
    findMany: async ({ where, orderBy }: { where: Row; orderBy?: Row }) => {
      calls.push({ model, where });
      const rows = (data[model] ?? []).filter(row => matches(row, where));
      return orderBy?.dueDate === "desc" ? [...rows].sort((x, y) => y.dueDate.getTime() - x.dueDate.getTime()) : rows;
    },
  });
  const tx = Object.fromEntries(["feeGroupAssignment", "feeDiscount", "feeDiscountAssignment", "feeCarryForward", "invoice"].map(m => [m, delegate(m)]));
  return { tx: tx as any, calls };
}

const student = (id: string, classId: string, categoryId: string | null = null, academicYear = 2026) => ({ id, classId, categoryId, class: { academicYear } });

function seed() {
  const discount = (id: string, scope: typeof A, categoryId: string | null) => ({ id, ...scope, categoryId, name: id, code: id, type: "FLAT", value: 100, currency: "PKR" });
  return {
    feeGroupAssignment: [
      { id: "fga-a", ...A, classId: "class-new", academicYear: 2026, feeGroup: { currency: "PKR", lines: [] } },
      { id: "fga-b", ...B, classId: "class-new", academicYear: 2026, feeGroup: { currency: "USD", lines: [] } },
    ],
    feeDiscount: [discount("cat-a", A, "cat-1"), discount("cat-b", B, "cat-1")],
    feeDiscountAssignment: [
      { id: "fda-a", schoolId: A.schoolId, studentId: "s1", discount: discount("explicit-a", A, null) },
      { id: "fda-b", schoolId: B.schoolId, studentId: "s1", discount: discount("explicit-b", B, null) },
    ],
    feeCarryForward: [
      { id: "cf-a", ...A, studentId: "s2", toAcademicYear: 2026, balance: 0, currency: "PKR" },
      { id: "cf-b", ...B, studentId: "s2", toAcademicYear: 2026, balance: 500, currency: "USD" },
    ],
    invoice: [
      { schoolId: A.schoolId, studentId: "s3", status: "PENDING", currency: "PKR", dueDate: new Date("2026-08-31Z"), balanceDue: 10 },
      { schoolId: A.schoolId, studentId: "s3", status: "OVERDUE", currency: "PKR", dueDate: new Date("2026-09-30Z"), balanceDue: 20 },
      { schoolId: A.schoolId, studentId: "s3", status: "PAID", currency: "PKR", dueDate: new Date("2026-10-31Z"), balanceDue: 0 },
      { schoolId: B.schoolId, studentId: "s3", status: "PENDING", currency: "USD", dueDate: new Date("2026-12-31Z"), balanceDue: 99 },
      { schoolId: A.schoolId, studentId: "s1", status: "PENDING", currency: "PKR", dueDate: new Date("2026-09-30Z"), balanceDue: 5 },
    ],
  };
}

describe("loadInvoiceGenerationInputs", () => {
  it("issues a fixed number of queries however many students are billed", async () => {
    const few = fakeTx(seed()), many = fakeTx(seed());
    await loadInvoiceGenerationInputs(few.tx, A, [student("s1", "class-new", "cat-1"), student("s3", "class-old")], true);
    const crowd = Array.from({ length: 500 }, (_, i) => student(`n${i}`, i % 2 ? "class-new" : "class-old", "cat-1"));
    await loadInvoiceGenerationInputs(many.tx, A, crowd, true);
    assert.equal(few.calls.length, 5);
    assert.equal(many.calls.length, 5);
  });

  it("scopes every read to the acting school and campus and ignores another school's rows", async () => {
    const { tx, calls } = fakeTx(seed());
    const inputs = await loadInvoiceGenerationInputs(tx, A, [student("s1", "class-new", "cat-1"), student("s2", "class-new"), student("s3", "class-old")], true);
    for (const call of calls) assert.equal(call.where.schoolId, A.schoolId, `${call.model} must carry schoolId`);
    for (const call of calls.filter(c => c.model === "feeGroupAssignment" || c.model === "feeDiscount")) assert.equal(call.where.campusId, A.campusId);
    assert.equal(inputs.assignmentByClassYear.get(classYearKey("class-new", 2026))?.id, "fga-a");
    assert.deepEqual(inputs.categoryDiscountsByCategory.get("cat-1")?.map(d => d.id), ["cat-a"]);
    assert.deepEqual(inputs.explicitDiscountsByStudent.get("s1")?.map(a => a.discount.id), ["explicit-a"]);
    assert.equal(inputs.carryForwardByStudentYear.get(classYearKey("s2", 2026))?.id, "cf-a");
    assert.equal(inputs.latestOpenInvoiceByStudent.get("s3")?.balanceDue, 20);
  });

  it("the same batch in the other school sees only that school's rows", async () => {
    const { tx, calls } = fakeTx(seed());
    const inputs = await loadInvoiceGenerationInputs(tx, B, [student("s1", "class-new", "cat-1"), student("s2", "class-new"), student("s3", "class-old")], true);
    for (const call of calls) assert.equal(call.where.schoolId, B.schoolId);
    assert.equal(inputs.assignmentByClassYear.get(classYearKey("class-new", 2026))?.id, "fga-b");
    assert.deepEqual(inputs.explicitDiscountsByStudent.get("s1")?.map(a => a.discount.id), ["explicit-b"]);
    assert.equal(inputs.carryForwardByStudentYear.get(classYearKey("s2", 2026))?.balance, 500);
    assert.equal(inputs.latestOpenInvoiceByStudent.get("s3")?.balanceDue, 99);
  });

  it("looks up late fees only when asked, and only for students on a legacy fee structure", async () => {
    const off = fakeTx(seed());
    await loadInvoiceGenerationInputs(off.tx, A, [student("s1", "class-new"), student("s3", "class-old")], false);
    assert.equal(off.calls.some(c => c.model === "invoice"), false);
    const on = fakeTx(seed());
    const inputs = await loadInvoiceGenerationInputs(on.tx, A, [student("s1", "class-new"), student("s3", "class-old")], true);
    assert.deepEqual(on.calls.find(c => c.model === "invoice")?.where.studentId, { in: ["s3"] });
    assert.equal(inputs.latestOpenInvoiceByStudent.has("s1"), false);
  });

  it("skips every read when there is nothing to look up", async () => {
    const { tx, calls } = fakeTx(seed());
    await loadInvoiceGenerationInputs(tx, A, [], true);
    assert.equal(calls.length, 0);
  });
});

describe("memoByKey", () => {
  it("loads each key once", async () => {
    const seen: string[] = [];
    const load = memoByKey(async key => { seen.push(key); return key.length; });
    assert.equal(await load("2026-10-01"), 10);
    await Promise.all([load("2026-10-01"), load("2026-10-15"), load("2026-10-15")]);
    assert.deepEqual(seen, ["2026-10-01", "2026-10-15"]);
  });
});
