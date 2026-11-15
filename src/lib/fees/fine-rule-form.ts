export type FineRuleFormType = "PERCENT" | "FLAT" | "PER_DAY";

export type FineRuleFormResult =
  | { ok: true; value: number; graceDays: number }
  | { ok: false; error: string };

/**
 * SKAI-2025: validate the fine-rule form instead of silently rounding. Percent must be a whole number
 * (the API stores integers), grace days a non-negative whole number; money amounts may carry decimals
 * and are converted to paisa.
 */
export function parseFineRuleForm(type: FineRuleFormType, rawValue: string, rawGrace: string): FineRuleFormResult {
  const value = Number(rawValue);
  if (rawValue.trim() === "" || !Number.isFinite(value) || value < 0) return { ok: false, error: "Value must be zero or more" };
  let stored: number;
  if (type === "PERCENT") {
    if (!Number.isInteger(value)) return { ok: false, error: "Percent must be a whole number" };
    if (value > 100) return { ok: false, error: "Percent cannot exceed 100" };
    stored = value;
  } else {
    stored = Math.round(value * 100);
  }
  const graceText = rawGrace.trim() === "" ? "0" : rawGrace.trim();
  const grace = Number(graceText);
  if (!Number.isFinite(grace) || !Number.isInteger(grace)) return { ok: false, error: "Grace days must be a whole number" };
  if (grace < 0) return { ok: false, error: "Grace days cannot be negative" };
  return { ok: true, value: stored, graceDays: grace };
}
