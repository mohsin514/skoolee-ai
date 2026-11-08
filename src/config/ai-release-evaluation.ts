import type { AIReleaseEvaluation } from "@/lib/ai/evaluation";

// The evaluation record for the AI release currently being promoted.
// No educator-reviewed evaluation has been recorded yet, so the promotion
// gate (`npm run check:ai-release`) reports the current release as blocked.
// Record a reviewed run here only from real reviewer results — never invent one.
export const CURRENT_AI_RELEASE_EVALUATION: AIReleaseEvaluation | null = null;
