// ─── Fee computation — the ONLY place amount maths lives ──
// Used by /api/fees/resolve and invoice generation. The UI never recomputes
// totals; it renders what this module returns.
//
// All amounts are Int paisa. No floats.
//
// Discount stacking order (documented, deterministic):
//   1. FLAT discounts first — deducted straight from the subtotal.
//   2. PERCENT discounts then apply to the REMAINDER (after flats), with the
//      combined percent capped at 100.
//   3. Carry-forward balance is added last: a positive balance (owed from the
//      previous session) increases the payable; a negative balance (credit)
//      reduces it. The payable floors at 0 and any excess credit is reported
//      separately via `remainingCredit`.

export type FeeLineInput = {
  id: string;
  typeName: string;
  typeCode: string;
  amount: number;
  dueDate: Date | null;
};

export type FeeDiscountInput = {
  id: string;
  name: string;
  code: string;
  type: "PERCENT" | "FLAT";
  value: number;
  source: "EXPLICIT" | "CATEGORY";
};

export type AppliedDiscount = FeeDiscountInput & {
  amount: number;
};

export type ResolvedStudentFees = {
  lines: FeeLineInput[];
  subtotal: number;
  flatDiscounts: AppliedDiscount[];
  percentDiscounts: AppliedDiscount[];
  totalDiscount: number;
  carryForwardBalance: number;
  payable: number;
  remainingCredit: number;
};

export function resolveStudentFees(
  lines: FeeLineInput[],
  discounts: FeeDiscountInput[],
  carryForwardBalance: number
): ResolvedStudentFees {
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);

  const flatDiscounts: AppliedDiscount[] = [];
  const percentDiscounts: AppliedDiscount[] = [];

  for (const discount of discounts) {
    if (discount.type === "FLAT") {
      const amount = Math.min(Math.max(discount.value, 0), Math.max(subtotal, 0));
      flatDiscounts.push({ ...discount, amount });
    } else {
      percentDiscounts.push({ ...discount, amount: 0 });
    }
  }

  const flatTotal = flatDiscounts.reduce((sum, d) => sum + d.amount, 0);
  const remainderAfterFlats = Math.max(0, subtotal - flatTotal);

  // Combined percent capped at 100.
  const percentTotal = percentDiscounts.reduce((sum, d) => sum + Math.max(d.value, 0), 0);
  const appliedPercent = Math.min(percentTotal, 100);
  const percentAppliedAmount = Math.round((remainderAfterFlats * appliedPercent) / 100);

  for (const discount of percentDiscounts) {
    const share = percentTotal > 0 ? Math.max(discount.value, 0) / percentTotal : 0;
    discount.amount = Math.round(percentAppliedAmount * share);
  }

  const totalDiscount = flatTotal + percentAppliedAmount;
  const afterDiscounts = Math.max(0, subtotal - totalDiscount);

  const withCarryForward = afterDiscounts + carryForwardBalance;
  const payable = Math.max(0, withCarryForward);
  const remainingCredit = Math.max(0, -withCarryForward);

  return {
    lines,
    subtotal,
    flatDiscounts,
    percentDiscounts,
    totalDiscount,
    carryForwardBalance,
    payable,
    remainingCredit,
  };
}
