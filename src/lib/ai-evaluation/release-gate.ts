import { AI_RELEASE_THRESHOLDS } from "@/config/ai-release-thresholds";
import { assessAIPromotion, type AIPromotionCandidate, type AIReleaseEvaluation } from "@/lib/ai/evaluation";
import { EDUCATOR_EVAL_PACKS } from "./educator/item-set";
import { evaluationFingerprint, type EvaluationStatus } from "./educator/gate";

/**
 * SKAI-841 (AI-05) release evaluation gate. Fail-closed: any missing sign-off, missing, stale or
 * below-threshold evidence is a blocker, and the release is approved only with zero blockers.
 */
export type ReleaseThresholds = typeof AI_RELEASE_THRESHOLDS;
export type ThresholdSignOff = { signedOffBy: string; role: string; signedOffAt: string } | null;

export interface ReleaseGateInput {
  candidate: AIPromotionCandidate;
  promotion: AIReleaseEvaluation | null;
  status: EvaluationStatus;
  thresholds?: ReleaseThresholds;
  signOff: ThresholdSignOff;
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function assessAIReleaseGate(input: ReleaseGateInput): { approved: boolean; blockers: string[] } {
  const t = input.thresholds ?? AI_RELEASE_THRESHOLDS;
  const now = input.now ?? new Date();
  const blockers: string[] = [];

  const signedAt = input.signOff ? Date.parse(input.signOff.signedOffAt) : NaN;
  if (!input.signOff?.signedOffBy.trim() || !input.signOff.role.trim() || !Number.isFinite(signedAt)) {
    blockers.push("Release thresholds in src/config/ai-release-thresholds.ts are not signed off.");
  }

  blockers.push(...assessAIPromotion(input.candidate, input.promotion).blockers);

  const fingerprint = evaluationFingerprint(input.candidate);
  if (input.status.fingerprint !== fingerprint) {
    blockers.push(input.status.fingerprint
      ? `Educator evaluation is stale: recorded for ${input.status.model ?? "another model"}, not the current model/prompt. Re-run pnpm eval:educator.`
      : "No educator evaluation results are recorded (src/config/educator-evaluation-status.json).");
    return { approved: false, blockers };
  }

  for (const pack of EDUCATOR_EVAL_PACKS) for (const language of t.launchLanguages) {
    const where = `${pack} (${language})`;
    const result = input.status.packs[pack]?.[language];
    if (!result) { blockers.push(`${where}: no evaluation result.`); continue; }
    const evaluatedAt = Date.parse(result.evaluatedAt);
    if (!Number.isFinite(evaluatedAt)) blockers.push(`${where}: evaluation has no valid date.`);
    else if (now.getTime() - evaluatedAt > t.maxEvidenceAgeDays * DAY_MS) blockers.push(`${where}: evaluation from ${result.evaluatedAt} is older than ${t.maxEvidenceAgeDays} days.`);
    else if (Number.isFinite(signedAt) && evaluatedAt < signedAt) blockers.push(`${where}: evaluated before the thresholds were signed off; thresholds must be set before results are observed.`);
    if (result.verdict !== "PASSED") blockers.push(`${where}: verdict ${result.verdict}.`);
    const m = result.metrics;
    if (m.items < t.minItemsPerLanguage) blockers.push(`${where}: ${m.items} reviewed items, needs ${t.minItemsPerLanguage}.`);
    if (m.criticalErrors > t.maxCriticalErrors) blockers.push(`${where}: ${m.criticalErrors} critical wrong-key or harmful-feedback case(s).`);
    if (m.alignment < t.minAlignment) blockers.push(`${where}: alignment ${m.alignment} below ${t.minAlignment}.`);
    if (m.markingAgreement < t.minMarkingAgreement) blockers.push(`${where}: marking agreement ${m.markingAgreement} below ${t.minMarkingAgreement}.`);
    if (m.kappa < t.minKappa) blockers.push(`${where}: reviewer kappa ${m.kappa} below ${t.minKappa}.`);
  }
  return { approved: blockers.length === 0, blockers };
}

/** AI is treated as on unless the environment explicitly says `false`; an unset flag is enforced. */
export function aiReleaseGateRequired(env: Record<string, string | undefined> = process.env) {
  return env.AI_FEATURES_ENABLED?.trim().toLowerCase() !== "false";
}
