/**
 * SKAI-1154: regulator fee caps (docs/research/2026-10/SKAI-1104-rest-of-uae-readiness.md §3).
 *
 * A school opts in per school (School.feeCapMode). Each fee structure then records the regulator-approved fee
 * (KHDA ECI framework first: the approved fee is last year's approved fee raised by at most the ECI-based
 * percentage KHDA permits for the school's rating). Charging more than the approved fee warns or blocks.
 * Amounts are integer minor units, like FeeStructure.monthlyFee.
 */
export const FEE_CAP_MODES = ["OFF", "WARN", "BLOCK"] as const;
export type FeeCapMode = (typeof FEE_CAP_MODES)[number];
export const FEE_CAP_FRAMEWORKS = ["KHDA_ECI"] as const;
export type FeeCapFramework = (typeof FEE_CAP_FRAMEWORKS)[number];

export function isFeeCapMode(value: unknown): value is FeeCapMode {
  return typeof value === "string" && (FEE_CAP_MODES as readonly string[]).includes(value);
}

export type FeeCapResult =
  | { status: "off" }
  | { status: "ok"; approvedFee: number }
  | { status: "missing"; message: string }
  | { status: "warn" | "block"; approvedFee: number; excess: number; message: string };

/** Compares a fee with its approved fee under the school's mode. "missing" = opted in but no approved fee recorded. */
export function evaluateFeeCap(input: { mode: string; fee: number; approvedFee: number | null | undefined }): FeeCapResult {
  const mode = isFeeCapMode(input.mode) ? input.mode : "OFF";
  if (mode === "OFF") return { status: "off" };
  if (input.approvedFee == null) {
    return { status: "missing", message: "Record the regulator-approved fee for this class before charging it." };
  }
  if (input.fee <= input.approvedFee) return { status: "ok", approvedFee: input.approvedFee };
  const excess = input.fee - input.approvedFee;
  return {
    status: mode === "BLOCK" ? "block" : "warn",
    approvedFee: input.approvedFee,
    excess,
    message: mode === "BLOCK"
      ? "This fee is above the regulator-approved fee. Lower it or update the approved fee."
      : "This fee is above the regulator-approved fee.",
  };
}

/** KHDA ECI: the highest fee allowed this year, from last year's approved fee and the permitted increase percentage. */
export function eciPermittedFee(previousApprovedFee: number, permittedIncreasePercent: number): number {
  if (!Number.isSafeInteger(previousApprovedFee) || previousApprovedFee < 0) throw new RangeError("previousApprovedFee must be a non-negative integer");
  if (!Number.isFinite(permittedIncreasePercent) || permittedIncreasePercent < 0) throw new RangeError("permittedIncreasePercent must be non-negative");
  return Math.floor(previousApprovedFee * (100 + permittedIncreasePercent) / 100);
}

/** Route decision: BLOCK refuses an over-cap or unrecorded approved fee; WARN saves and returns the warning. */
export function feeCapDecision(result: FeeCapResult, mode: string): { error?: string; warning?: string } {
  if (result.status === "off" || result.status === "ok") return {};
  if (result.status === "block" || (result.status === "missing" && mode === "BLOCK")) return { error: result.message };
  return { warning: result.message };
}
