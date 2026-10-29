import { z } from "zod";
import { canonicalJson, EDUCATOR_EVAL_LANGUAGES, EDUCATOR_EVAL_PACKS, sha256, type EducatorEvalPack } from "./item-set";

/**
 * SKAI-1053 (D5-04): the per-pack AI capability flag driven by the educator evaluation.
 * `src/config/educator-evaluation-status.json` is written only by `pnpm eval:educator` from real
 * reviewer files. A pack's AI is on only when every launch language PASSED for the current
 * model/prompt fingerprint; a FAILED or REPEAT verdict always turns it off. Missing or stale
 * results turn it off once `EDUCATOR_EVAL_ENFORCE=1` (default off until D5-03 reviewers report).
 */

/** The instruction the evaluated AI marker receives. Changing it changes the fingerprint. */
export const EDUCATOR_EVAL_SCORING_PROMPT = [
  "You are marking a synthetic mathematics answer against a reference answer.",
  "Reply with JSON only: {\"mark\": <integer from 0 to maxMarks>}.",
  "Award method and accuracy marks as a board examiner would. Do not explain.",
].join("\n");
export const EDUCATOR_EVAL_PROMPT_VERSION = "d5-marking-v1";

export type ModelPromptVersion = { model: string; promptVersion: string; policyVersion: string };

/** Hash of model + app prompt/policy versions + the D5 scoring prompt: any change forces a re-run. */
export function evaluationFingerprint(version: ModelPromptVersion): string {
  return sha256(canonicalJson({ ...version, evalPromptVersion: EDUCATOR_EVAL_PROMPT_VERSION, scoringPrompt: EDUCATOR_EVAL_SCORING_PROMPT }));
}

export const languageStatusSchema = z.object({
  verdict: z.enum(["PASSED", "FAILED", "REPEAT"]),
  itemSetSha256: z.string(),
  setVersion: z.string(),
  evaluatedAt: z.string(),
  metrics: z.object({ items: z.number(), alignment: z.number(), criticalErrors: z.number(), markingAgreement: z.number(), kappa: z.number(), disputed: z.number() }),
  failures: z.array(z.string()),
});
export const evaluationStatusSchema = z.object({
  fingerprint: z.string().nullable(),
  model: z.string().nullable(),
  updatedAt: z.string().nullable(),
  packs: z.record(z.string(), z.record(z.string(), languageStatusSchema)),
});
export type EvaluationStatus = z.infer<typeof evaluationStatusSchema>;

/** Catalogue pack id to its D5 evaluation pack. Unknown packs have no evaluation. */
export function evaluationPackFor(packId: string): EducatorEvalPack | null {
  if (packId.startsWith("fbise-")) return "fbise-g9-maths";
  if (packId.startsWith("bise-lahore-")) return "bise-lahore-g9-maths";
  if (packId.startsWith("ksa-moe-")) return "ksa-intermediate-maths";
  if (packId.startsWith("cambridge-0580-")) return "igcse-0580";
  return null;
}

export type AiEvaluationGate = { allowed: true } | { allowed: false; reasons: string[] };

export function packAiEvaluationGate(packId: string, status: EvaluationStatus, fingerprint: string, enforce: boolean): AiEvaluationGate {
  const pack = evaluationPackFor(packId);
  const off = (reason: string): AiEvaluationGate => ({ allowed: false, reasons: [reason] });
  if (!pack || !(EDUCATOR_EVAL_PACKS as readonly string[]).includes(pack)) return enforce ? off(`Pack ${packId} has no educator evaluation; its AI capability stays off.`) : { allowed: true };
  const current = status.fingerprint === fingerprint;
  const results = current ? status.packs[pack] ?? {} : {};
  const failed = Object.entries(results).filter(([, result]) => result.verdict !== "PASSED");
  if (failed.length) return { allowed: false, reasons: failed.map(([language, result]) => `Educator evaluation ${result.verdict} for ${pack} (${language}): ${result.failures.join(" ")} AI for this pack stays off.`) };
  if (!enforce) return { allowed: true };
  if (!current) return off(`No educator evaluation for the current AI model and prompt (${pack}). Run pnpm eval:educator; AI for this pack stays off.`);
  const missing = EDUCATOR_EVAL_LANGUAGES.filter(language => !results[language]);
  if (missing.length) return off(`Educator evaluation for ${pack} is missing ${missing.join(", ")}. AI for this pack stays off.`);
  return { allowed: true };
}

export function educatorEvalEnforced(env: Record<string, string | undefined> = process.env) {
  return env.EDUCATOR_EVAL_ENFORCE === "1";
}
