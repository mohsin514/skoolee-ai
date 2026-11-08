import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eciPermittedFee, evaluateFeeCap, feeCapDecision, isFeeCapMode } from "@/lib/fees/regulator-cap";
import { recomputePendingInvoices } from "@/lib/fees/structure-year";

// SKAI-1154: regulator fee caps — the pure rule, the route decision and the invoice snapshot on re-pricing.

describe("evaluateFeeCap", () => {
  it("is inert while the school has not opted in", () => {
    assert.deepEqual(evaluateFeeCap({ mode: "OFF", fee: 999_999, approvedFee: 1 }), { status: "off" });
    assert.deepEqual(evaluateFeeCap({ mode: "nonsense", fee: 999_999, approvedFee: 1 }), { status: "off" });
  });
  it("accepts a fee at or below the approved fee", () => {
    assert.equal(evaluateFeeCap({ mode: "BLOCK", fee: 5000, approvedFee: 5000 }).status, "ok");
    assert.equal(evaluateFeeCap({ mode: "WARN", fee: 4000, approvedFee: 5000 }).status, "ok");
  });
  it("warns or blocks above the approved fee and reports the excess", () => {
    const warn = evaluateFeeCap({ mode: "WARN", fee: 5200, approvedFee: 5000 });
    assert.equal(warn.status, "warn");
    assert.equal(warn.status === "warn" && warn.excess, 200);
    assert.equal(evaluateFeeCap({ mode: "BLOCK", fee: 5001, approvedFee: 5000 }).status, "block");
  });
  it("flags a missing approved fee once opted in", () => {
    assert.equal(evaluateFeeCap({ mode: "WARN", fee: 5000, approvedFee: null }).status, "missing");
  });
});

describe("feeCapDecision", () => {
  it("BLOCK refuses over-cap and unrecorded fees; WARN only warns", () => {
    assert.ok(feeCapDecision(evaluateFeeCap({ mode: "BLOCK", fee: 6000, approvedFee: 5000 }), "BLOCK").error);
    assert.ok(feeCapDecision(evaluateFeeCap({ mode: "BLOCK", fee: 6000, approvedFee: null }), "BLOCK").error);
    const warn = feeCapDecision(evaluateFeeCap({ mode: "WARN", fee: 6000, approvedFee: 5000 }), "WARN");
    assert.ok(warn.warning && !warn.error);
    assert.deepEqual(feeCapDecision(evaluateFeeCap({ mode: "OFF", fee: 6000, approvedFee: 5000 }), "OFF"), {});
  });
});

describe("eciPermittedFee (KHDA ECI)", () => {
  it("raises last year's approved fee by the permitted percentage, rounding down", () => {
    assert.equal(eciPermittedFee(100_000, 2.6), 102_600);
    assert.equal(eciPermittedFee(33_333, 1.5), 33_832);
    assert.equal(eciPermittedFee(50_000, 0), 50_000);
  });
  it("rejects invalid inputs", () => {
    assert.throws(() => eciPermittedFee(-1, 2), RangeError);
    assert.throws(() => eciPermittedFee(100, -2), RangeError);
    assert.throws(() => eciPermittedFee(1.5, 2), RangeError);
  });
  it("knows its modes", () => {
    assert.ok(isFeeCapMode("WARN"));
    assert.ok(!isFeeCapMode("warn"));
  });
});

describe("recomputePendingInvoices copies the approved fee", () => {
  it("snapshots approvedFee and reference onto re-priced PENDING invoices", async () => {
    const invoices: any[] = [{ id: "i-1", schoolId: "school-a", campusId: "campus-a", status: "PENDING", totalAmountPaid: 0, currency: "AED", lateFeeAmount: 0, totalAmount: 1 }];
    const tx = {
      feeGroupAssignment: { findFirst: async () => null },
      invoice: {
        findMany: async () => invoices,
        updateMany: async ({ where, data }: any) => { Object.assign(invoices.find((i) => i.id === where.id), data); return { count: 1 }; },
      },
      taxDocument: { findMany: async () => [] },
      auditLog: { create: async () => undefined },
    } as any;
    const structure = {
      id: "fs-1", campusId: "campus-a", classId: "c-1", currency: "AED", monthlyFee: 5000, approvedFee: 5200, approvedFeeReference: "KHDA-2026-77",
      oneTimeFeesJson: null, discountRulesJson: null, taxPercentage: 0, activeFrom: new Date("2026-01-01"), activeTo: null, class: { academicYear: 2026 },
    } as any;
    await recomputePendingInvoices(tx, { schoolId: "school-a", userId: "u" }, structure);
    assert.equal(invoices[0].approvedFee, 5200);
    assert.equal(invoices[0].approvedFeeReference, "KHDA-2026-77");
  });
});
