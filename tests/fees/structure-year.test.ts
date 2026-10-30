import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { feeStructureActiveWhere, invoiceBatchStatus, legacyInvoiceAmounts, pickStructureForClass, recomputePendingInvoices, resolveFeeStructureYearId } from "@/lib/fees/structure-year";

// SKAI-1123: fee structures per academic year + re-pricing unpaid PENDING invoices on edit.

const ACTOR = { schoolId: "school-a", userId: "acct-1" };

function structure(over: Record<string, unknown> = {}) {
  return {
    id: "fs-1", campusId: "campus-a", classId: "c-1", currency: "PKR",
    monthlyFee: 6000, oneTimeFeesJson: { Lab: 1000 }, discountRulesJson: { Sibling: 10 }, taxPercentage: 5,
    activeFrom: new Date("2026-01-01"), activeTo: null, class: { academicYear: 2026 }, ...over,
  } as any;
}

type Inv = { id: string; schoolId: string; campusId: string; status: string; totalAmountPaid: number; currency: string; lateFeeAmount: number; totalAmount: number; balanceDue?: number; [k: string]: unknown };

function fakeTx(invoices: Inv[], opts: { taxed?: string[]; assignment?: boolean } = {}) {
  const audits: any[] = [];
  let findWhere: any;
  const tx = {
    feeGroupAssignment: { findFirst: async () => (opts.assignment ? { id: "fga" } : null) },
    invoice: {
      findMany: async ({ where }: any) => {
        findWhere = where;
        return invoices.filter((i) => i.schoolId === where.schoolId && i.campusId === where.campusId && i.status === where.status && i.totalAmountPaid === where.totalAmountPaid);
      },
      updateMany: async ({ where, data }: any) => {
        const inv = invoices.find((i) => i.id === where.id && i.schoolId === where.schoolId && i.status === where.status && i.totalAmountPaid === where.totalAmountPaid);
        if (!inv) return { count: 0 };
        Object.assign(inv, data);
        return { count: 1 };
      },
    },
    taxDocument: { findMany: async () => (opts.taxed ?? []).map((invoiceId) => ({ invoiceId })) },
    auditLog: { create: async (args: any) => { audits.push(args.data); } },
  };
  return { tx: tx as any, audits, where: () => findWhere };
}

const inv = (id: string, over: Partial<Inv> = {}): Inv => ({ id, schoolId: "school-a", campusId: "campus-a", status: "PENDING", totalAmountPaid: 0, currency: "PKR", lateFeeAmount: 0, totalAmount: 5000, ...over });

describe("legacyInvoiceAmounts", () => {
  it("matches the generate-invoices legacy formula", () => {
    const a = legacyInvoiceAmounts(structure());
    assert.equal(a.subtotal, 7000);
    assert.equal(a.discountAmount, 700);
    assert.equal(a.taxAmount, 315);
  });
});

describe("pickStructureForClass", () => {
  const rows = [
    { id: "other-year", classId: "c-1", academicYear: { academicYear: 2027 } },
    { id: "legacy", classId: "c-1", academicYear: null },
    { id: "this-year", classId: "c-1", academicYear: { academicYear: 2026 } },
  ];
  it("prefers the class's own year", () => assert.equal(pickStructureForClass(rows, "c-1", 2026)?.id, "this-year"));
  it("falls back to a legacy year-less row, never another year", () => {
    assert.equal(pickStructureForClass(rows.slice(0, 2), "c-1", 2025)?.id, "legacy");
    assert.equal(pickStructureForClass(rows.slice(0, 1), "c-1", 2026), undefined);
  });
});

describe("resolveFeeStructureYearId", () => {
  const db = (rows: any[]) => ({ academicCycle: { findFirst: async ({ where }: any) => rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null } }) as any;
  it("uses the campus's active year by default", async () => {
    assert.equal(await resolveFeeStructureYearId(db([{ id: "y1", schoolId: "school-a", campusId: "campus-a", status: "ACTIVE" }]), "school-a", "campus-a"), "y1");
  });
  it("rejects a year from another school or campus", async () => {
    const rows = [{ id: "y2", schoolId: "school-b", campusId: "campus-a", status: "ACTIVE" }, { id: "y3", schoolId: "school-a", campusId: "campus-b", status: "ACTIVE" }];
    await assert.rejects(resolveFeeStructureYearId(db(rows), "school-a", "campus-a", "y2"), /Academic year not found/);
    await assert.rejects(resolveFeeStructureYearId(db(rows), "school-a", "campus-a", "y3"), /Academic year not found/);
  });
});

describe("recomputePendingInvoices", () => {
  it("re-prices unpaid PENDING invoices, keeps late fees, and audits once", async () => {
    const invoices = [inv("i-1"), inv("i-2", { lateFeeAmount: 200 })];
    const f = fakeTx(invoices);
    const res = await recomputePendingInvoices(f.tx, ACTOR, structure());
    assert.deepEqual(res, { updated: 2, skipped: 0 });
    assert.equal(invoices[0].totalAmount, 6615);
    assert.equal(invoices[0].balanceDue, 6615);
    assert.equal(invoices[1].totalAmount, 6815);
    assert.equal(f.audits.length, 1);
    assert.equal(f.audits[0].newValue.count, 2);
    assert.deepEqual(f.where().student, { classId: "c-1" });
    assert.equal(f.where().schoolId, "school-a");
  });

  it("never touches paid, partial or other-status invoices", async () => {
    const invoices = [inv("paid", { status: "PAID", totalAmountPaid: 5000 }), inv("partial", { status: "PARTIAL", totalAmountPaid: 100 })];
    const f = fakeTx(invoices);
    assert.deepEqual(await recomputePendingInvoices(f.tx, ACTOR, structure()), { updated: 0, skipped: 0 });
    assert.equal(invoices[0].totalAmount, 5000);
    assert.equal(f.audits.length, 0);
  });

  it("skips invoices of another school", async () => {
    const invoices = [inv("foreign", { schoolId: "school-b" })];
    const f = fakeTx(invoices);
    assert.equal((await recomputePendingInvoices(f.tx, ACTOR, structure())).updated, 0);
    assert.equal(invoices[0].totalAmount, 5000);
  });

  it("skips tax-documented, other-currency invoices and fee-group-priced classes", async () => {
    const invoices = [inv("taxed"), inv("usd", { currency: "USD" })];
    const f = fakeTx(invoices, { taxed: ["taxed"] });
    assert.deepEqual(await recomputePendingInvoices(f.tx, ACTOR, structure()), { updated: 0, skipped: 2 });
    const g = fakeTx([inv("x")], { assignment: true });
    assert.deepEqual(await recomputePendingInvoices(g.tx, ACTOR, structure()), { updated: 0, skipped: 0 });
  });
});

// SKAI-1285: fixed-term structures (activeTo set) still bill the months inside their validity.
describe("feeStructureActiveWhere", () => {
  const monthStart = new Date("2026-11-01T00:00:00Z");
  const monthEnd = new Date("2026-11-30T00:00:00Z");
  /** Evaluates the Prisma where the way Postgres would for these two fields. */
  function matches(where: any, row: { activeFrom: Date; activeTo: Date | null }) {
    if (where.AND) return false; // the reported bug: AND [activeTo null, activeTo range]
    if (!(row.activeFrom <= where.activeFrom.lte)) return false;
    return where.OR.some((branch: any) => branch.activeTo === null ? row.activeTo === null : row.activeTo !== null && row.activeTo >= branch.activeTo.gte);
  }
  const where = feeStructureActiveWhere(monthStart, monthEnd);

  it("selects a fixed-term structure whose activeTo is after the month", () => {
    assert.equal(matches(where, { activeFrom: new Date("2025-12-31"), activeTo: new Date("2026-12-31") }), true);
  });
  it("selects an open-ended structure", () => {
    assert.equal(matches(where, { activeFrom: new Date("2025-12-31"), activeTo: null }), true);
  });
  it("selects a structure ending mid-month and one starting mid-month", () => {
    assert.equal(matches(where, { activeFrom: new Date("2025-01-01"), activeTo: new Date("2026-11-15") }), true);
    assert.equal(matches(where, { activeFrom: new Date("2026-11-20"), activeTo: null }), true);
  });
  it("skips structures that ended before or start after the month", () => {
    assert.equal(matches(where, { activeFrom: new Date("2025-01-01"), activeTo: new Date("2026-10-31") }), false);
    assert.equal(matches(where, { activeFrom: new Date("2026-12-01"), activeTo: null }), false);
  });
  it("never conjoins activeTo null with an activeTo range", () => {
    assert.equal("AND" in where, false);
    assert.deepEqual(where.OR, [{ activeTo: null }, { activeTo: { gte: monthStart } }]);
  });
});

describe("invoiceBatchStatus", () => {
  it("a run that billed nobody and errored is 422, not 201", () => {
    assert.equal(invoiceBatchStatus(0, 10), 422);
  });
  it("partial and full successes stay 201", () => {
    assert.equal(invoiceBatchStatus(9, 1), 201);
    assert.equal(invoiceBatchStatus(10, 0), 201);
  });
});
