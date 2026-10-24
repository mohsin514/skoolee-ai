import { z } from "zod";

// SKO-410: operational assessment access. Only capabilities and instructions travel to teachers,
// invigilators and learners; supporting context stays in restricted records.

export const ASSESSMENT_TYPES = ["EXAM", "ASSIGNMENT", "PRACTICE"] as const;
export type AssessmentType = typeof ASSESSMENT_TYPES[number];
export const SUBMISSION_MODES = ["STANDARD", "TYPED", "ORAL", "PAPER"] as const;

export const capabilitiesSchema = z.object({
  reader: z.boolean().default(false), scribe: z.boolean().default(false), largeText: z.boolean().default(false),
  highContrast: z.boolean().default(false), screenReader: z.boolean().default(false), cameraExempt: z.boolean().default(false),
  assistiveTech: z.array(z.string().trim().min(1).max(80)).max(5).default([]),
  submissionMode: z.enum(SUBMISSION_MODES).default("STANDARD"),
}).strict();
export type Capabilities = z.infer<typeof capabilitiesSchema>;

export type PlanRow = { id: string; version: number; status: string; validFrom: Date; validUntil: Date; assessmentTypes: string[]; extraMinutes: number; extraPercent: number; breakMinutes: number; capabilities: unknown; instructions: string };
export type ExamApproval = { extraMinutes: number; breakMinutes?: number; reader?: boolean; scribe?: boolean; largeText?: boolean; cameraExempt?: boolean };

const day = (date: Date) => date.toISOString().slice(0, 10);
/** A plan covers an assessment when it is active, the day falls in its window and the type is listed. */
export function planCovers(plan: PlanRow, type: AssessmentType, at: Date) {
  return plan.status === "ACTIVE" && plan.assessmentTypes.includes(type) && day(plan.validFrom) <= day(at) && day(at) <= day(plan.validUntil);
}

export type EffectiveSettings = {
  source: "EXAM_APPROVAL" | "PLAN" | "NONE";
  planId: string | null; planVersion: number | null;
  baseMinutes: number; extraMinutes: number; breakMinutes: number; totalMinutes: number;
  capabilities: Capabilities; instructions: string;
  steps: Array<{ key: "base" | "fixed" | "percent" | "break" | "examApproval" | "total"; minutes: number; percent?: number }>;
};

/**
 * Deterministic: an exam-specific approval wins (it was approved for this assessment); otherwise the
 * plan covering the assessment applies; otherwise nothing. Percent extra time rounds up to whole minutes.
 */
export function effectiveSettings(input: { baseMinutes: number; type: AssessmentType; at: Date; plan?: PlanRow | null; examApproval?: ExamApproval | null }): EffectiveSettings {
  const { baseMinutes } = input;
  if (input.examApproval) {
    const approval = input.examApproval, breakMinutes = approval.breakMinutes ?? 0;
    return { source: "EXAM_APPROVAL", planId: null, planVersion: null, baseMinutes, extraMinutes: approval.extraMinutes, breakMinutes, totalMinutes: baseMinutes + approval.extraMinutes + breakMinutes,
      capabilities: capabilitiesSchema.parse({ reader: approval.reader ?? false, scribe: approval.scribe ?? false, largeText: approval.largeText ?? false, cameraExempt: approval.cameraExempt ?? false }), instructions: "",
      steps: [{ key: "base", minutes: baseMinutes }, { key: "examApproval", minutes: approval.extraMinutes }, { key: "break", minutes: breakMinutes }, { key: "total", minutes: baseMinutes + approval.extraMinutes + breakMinutes }] };
  }
  const plan = input.plan && planCovers(input.plan, input.type, input.at) ? input.plan : null;
  if (!plan) return { source: "NONE", planId: null, planVersion: null, baseMinutes, extraMinutes: 0, breakMinutes: 0, totalMinutes: baseMinutes, capabilities: capabilitiesSchema.parse({}), instructions: "", steps: [{ key: "base", minutes: baseMinutes }, { key: "total", minutes: baseMinutes }] };
  const percentMinutes = Math.ceil(baseMinutes * plan.extraPercent / 100);
  const extraMinutes = plan.extraMinutes + percentMinutes, totalMinutes = baseMinutes + extraMinutes + plan.breakMinutes;
  const steps: EffectiveSettings["steps"] = [{ key: "base", minutes: baseMinutes }];
  if (plan.extraMinutes) steps.push({ key: "fixed", minutes: plan.extraMinutes });
  if (plan.extraPercent) steps.push({ key: "percent", minutes: percentMinutes, percent: plan.extraPercent });
  if (plan.breakMinutes) steps.push({ key: "break", minutes: plan.breakMinutes });
  steps.push({ key: "total", minutes: totalMinutes });
  return { source: "PLAN", planId: plan.id, planVersion: plan.version, baseMinutes, extraMinutes, breakMinutes: plan.breakMinutes, totalMinutes, capabilities: capabilitiesSchema.parse(plan.capabilities), instructions: plan.instructions, steps };
}

/** Plans ending within the review window (or already past it but still active) need a coordinator decision. */
export function needsReview(plan: Pick<PlanRow, "status" | "validUntil">, now: Date, windowDays = 14) {
  return plan.status === "ACTIVE" && plan.validUntil.getTime() < now.getTime() + windowDays * 86_400_000;
}

/** Words that suggest diagnosis or medical context in operational notes; the coordinator is asked to move them. */
const SENSITIVE = /\b(diagnos\w*|adhd|autis\w*|dyslexi\w*|epilep\w*|disorder|syndrome|medication|medical|therapy|psychiatr\w*|depress\w*|anxiety)\b/i;
export function sensitiveInstructionIssue(text: string) {
  return SENSITIVE.test(text) ? "Operational instructions should describe the adjustment only. Move diagnosis or medical context to the restricted supporting record." : null;
}
