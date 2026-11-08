import { z } from "zod";

/** The D2-01 pilot boundary. Geography is deliberately independent of curriculum metadata. */
export const pilotEligibilityInputSchema = z.object({
  geography: z.enum(["PAKISTAN_LAHORE", "PAKISTAN_ISLAMABAD_RAWALPINDI", "PAKISTAN_KARACHI", "KSA_RIYADH", "KSA_JEDDAH", "UAE_DUBAI", "OTHER"]),
  board: z.string().trim().min(1), grade: z.string().trim().min(1), subject: z.string().trim().min(1),
  examYear: z.string().trim().min(1), academicYear: z.string().trim().min(1), term: z.string().trim().min(1),
  tier: z.string().trim().min(1), language: z.enum(["en", "ar", "ur"]),
  approvalStatus: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "SUPERSEDED", "REVOKED"]),
  approvedAt: z.coerce.date().optional(), reviewDueAt: z.coerce.date().optional(),
  localBudgetApprover: z.boolean().default(false),
}).strict();
export type PilotEligibilityInput = z.input<typeof pilotEligibilityInputSchema>;

export type EligibilityResult = { eligible: true } | { eligible: false; reason: string; nextAction: string };

const allowedGeographies = new Set(["PAKISTAN_LAHORE", "PAKISTAN_ISLAMABAD_RAWALPINDI", "KSA_RIYADH", "KSA_JEDDAH", "UAE_DUBAI"]);
const budgetApprovalRequired = new Set(["KSA_RIYADH", "KSA_JEDDAH", "UAE_DUBAI"]);

export function evaluatePilotEligibility(raw: unknown, now = new Date()): EligibilityResult {
  const parsed = pilotEligibilityInputSchema.safeParse(raw);
  if (!parsed.success) return { eligible: false, reason: "The capability metadata is incomplete or invalid.", nextAction: "Complete every independent geography and curriculum field, then submit it for review." };
  const input = parsed.data;
  if (!allowedGeographies.has(input.geography)) return { eligible: false, reason: "This geography is outside the approved pilot scope.", nextAction: "Use Lahore, Islamabad/Rawalpindi, Riyadh, Jeddah, or Dubai for this phase." };
  if (budgetApprovalRequired.has(input.geography) && !input.localBudgetApprover) return { eligible: false, reason: "A local budget approver is required for this market.", nextAction: "Record the local budget approver before proposing the capability." };
  if (input.approvalStatus === "REVOKED") return { eligible: false, reason: "This capability approval was revoked.", nextAction: "Create a new reviewed version; revoked records cannot be reactivated." };
  if (input.approvalStatus !== "APPROVED") return { eligible: false, reason: "This capability has not been approved for pilot use.", nextAction: "Complete second-reader review and record founder approval." };
  if (!input.approvedAt) return { eligible: false, reason: "The approval record has no approval date.", nextAction: "Record the approval date in the decision log." };
  if (input.reviewDueAt && input.reviewDueAt <= now) return { eligible: false, reason: "This capability approval is stale.", nextAction: "Review the source edition and approve a current version." };
  return { eligible: true };
}
