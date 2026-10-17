import type { AuthUser } from "@/lib/auth";
import type { generateAIDraft } from "@/lib/ai/openai";
import type { PaperData } from "./assessment";
import { cancelledFrame, completeFrame, errorFrame, itemFrame, stageFrame, type GenerationErrorReason, type GenerationFrame } from "./generation-stream";
import { paperGenerationInputSchema } from "./paper-generation";
import { generatePaperWithReceipt } from "./paper-generation-service";

// SKO-408 R5.1, R5.2, R5.9, R5.12: the paper generator as a frame stream. It reports the stage and
// the produced/requested counts, sends each item as its own frame once the provider's answer has
// passed the paper checks, and always ends on one terminal frame. Cancelling the stream (the client
// disconnects or the reader is cancelled) aborts the provider request; the receipt is settled as
// failed and uncharged, and the cancellation is recorded. Items arrive after the provider answers,
// not token by token: the provider call itself is a single request.

const REASON_FOR_CODE: Record<string, GenerationErrorReason> = {
  AI_GENERATION_INVALID_OUTPUT: "PAPER_CHECKS_FAILED",
  AI_GENERATION_INVALID_BLUEPRINT: "PAPER_CHECKS_FAILED",
  AI_GENERATION_SOURCE_CHANGED: "CURRICULUM_CHANGED",
  AI_QUOTA_EXHAUSTED: "PROVIDER_UNAVAILABLE",
  AI_GENERATION_NOT_DISPATCHED: "PROVIDER_UNAVAILABLE",
  AI_GENERATION_UNKNOWN: "PROVIDER_FAILED",
  AI_GENERATION_KEY_CONFLICT: "INTERNAL",
  AI_SENSITIVE_CONTENT_BLOCKED: "INTERNAL",
};

export async function* paperGenerationFrames(user: AuthUser, raw: unknown, options: { signal: AbortSignal; generate?: typeof generateAIDraft; assertProvider?: () => void; now?: () => Date }): AsyncGenerator<GenerationFrame> {
  const input = paperGenerationInputSchema.parse(raw);
  const requested = input.blueprint.sections.reduce((sum, section) => sum + section.questionCount, 0);
  const now = options.now ?? (() => new Date());
  yield stageFrame("BLUEPRINT", 0, requested);
  yield stageFrame("ITEMS", 0, requested);
  let receipt;
  try {
    receipt = await generatePaperWithReceipt(user, input, { signal: options.signal, ...(options.generate ? { generate: options.generate } : {}), ...(options.assertProvider ? { assertProvider: options.assertProvider } : {}) });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 0;
    yield errorFrame(options.signal.aborted ? "CANCELLED" : status === 503 ? "PROVIDER_UNAVAILABLE" : status === 402 ? "CREDITS_EXHAUSTED" : "INTERNAL", 0);
    return;
  }
  const body = receipt.body as { paper?: PaperData; code?: string };
  if (receipt.status !== 200 || !body.paper) {
    if (body.code === "AI_GENERATION_CANCELLED" || options.signal.aborted) { yield cancelledFrame(0, now().toISOString()); return; }
    yield errorFrame(REASON_FOR_CODE[body.code ?? ""] ?? "INTERNAL", 0);
    return;
  }
  const paper = body.paper;
  let produced = 0;
  for (const question of paper.questions) {
    if (options.signal.aborted) { yield cancelledFrame(produced, now().toISOString()); return; }
    yield itemFrame(question);
    produced++;
  }
  yield stageFrame("KEYS", produced, requested);
  yield stageFrame("REVIEW", produced, requested);
  yield completeFrame(paper);
}
