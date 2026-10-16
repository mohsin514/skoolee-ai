import { assessAIPromotion, AI_POLICY_VERSION } from "@/lib/ai/evaluation";
import { AI_PROMPT_VERSION } from "@/lib/ai/prompts";
import { getAIModel } from "@/lib/ai/openai";
import { CURRENT_AI_RELEASE_EVALUATION } from "@/config/ai-release-evaluation";

const candidate = { model: getAIModel(), promptVersion: AI_PROMPT_VERSION, policyVersion: AI_POLICY_VERSION };
const { approved, blockers } = assessAIPromotion(candidate, CURRENT_AI_RELEASE_EVALUATION);
if (!approved) {
  console.error(`AI release ${candidate.model} / ${candidate.promptVersion} / ${candidate.policyVersion} is not approved for promotion:`);
  for (const blocker of blockers) console.error(`- ${blocker}`);
  process.exitCode = 1;
} else {
  console.log(`AI release ${candidate.model} / ${candidate.promptVersion} passed its recorded educator evaluation.`);
}
