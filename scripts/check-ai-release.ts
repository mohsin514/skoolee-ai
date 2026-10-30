/**
 * SKAI-841 (AI-05) — `pnpm check:ai-release [--report]`. Fail-closed release evaluation gate.
 * Exits 1 when the thresholds are unsigned or the evaluation is missing, stale or below threshold.
 * The production deploy runs it unless the environment sets AI_FEATURES_ENABLED=false (AI off).
 * --report prints the blockers but exits 0 (used by PR checks so day-to-day work is not blocked).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_POLICY_VERSION } from "@/lib/ai/evaluation";
import { AI_PROMPT_VERSION } from "@/lib/ai/prompts";
import { getAIModel } from "@/lib/ai/openai";
import { CURRENT_AI_RELEASE_EVALUATION } from "@/config/ai-release-evaluation";
import { AI_RELEASE_THRESHOLDS_SIGN_OFF } from "@/config/ai-release-thresholds";
import { evaluationStatusSchema } from "@/lib/ai-evaluation/educator/gate";
import { aiReleaseGateRequired, assessAIReleaseGate } from "@/lib/ai-evaluation/release-gate";

const report = process.argv.includes("--report");
try {
  if (!report && !aiReleaseGateRequired()) {
    console.log("AI_FEATURES_ENABLED=false: AI stays off in this environment, so the release evaluation gate is not required.");
  } else {
    const candidate = { model: getAIModel(), promptVersion: AI_PROMPT_VERSION, policyVersion: AI_POLICY_VERSION };
    const status = evaluationStatusSchema.parse(JSON.parse(readFileSync(join(process.cwd(), "src", "config", "educator-evaluation-status.json"), "utf8")));
    const { approved, blockers } = assessAIReleaseGate({ candidate, promotion: CURRENT_AI_RELEASE_EVALUATION, status, signOff: AI_RELEASE_THRESHOLDS_SIGN_OFF });
    if (approved) console.log(`AI release ${candidate.model} / ${candidate.promptVersion} / ${candidate.policyVersion} passed its release evaluation gate.`);
    else {
      console.error(`AI release ${candidate.model} / ${candidate.promptVersion} / ${candidate.policyVersion} is blocked (${blockers.length} blocker(s)):`);
      for (const blocker of blockers) console.error(`- ${blocker}`);
      if (!report) process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(`AI release evaluation gate could not run, so the release is blocked: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
