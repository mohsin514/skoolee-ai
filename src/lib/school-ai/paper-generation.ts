import { z } from "zod";
import { generatePaperRequestSchema, paperDataSchema } from "./assessment";

export const PAPER_GENERATION_FEATURE = "PAPER_GENERATION";
export const PAPER_GENERATION_LEASE_MS = 180_000;
export const paperGenerationInputSchema = generatePaperRequestSchema.extend({
  idempotencyKey: z.string().uuid(),
  curriculumVersion: z.number().int().positive(),
});
export const paperGenerationReplySchema = z.object({ paper: paperDataSchema }).strict();
export type PaperGenerationInput = z.infer<typeof paperGenerationInputSchema>;
export type PaperGenerationReply = z.infer<typeof paperGenerationReplySchema>;
export type PaperGenerationFailure = { error: string; code: string; details?: string[]; state: "FAILED" | "UNKNOWN" };

export const unknownPaperGeneration: PaperGenerationFailure = {
  error: "The provider outcome could not be confirmed. This request will not be sent again. No credit was charged. Check this receipt again before explicitly starting a new request.",
  code: "AI_GENERATION_UNKNOWN", state: "UNKNOWN",
};

/** Stable input identity shared by client recovery and the server's scoped hash. */
export function paperGenerationFingerprint(input: Omit<PaperGenerationInput, "idempotencyKey">): string {
  const sort = (value: unknown): unknown => Array.isArray(value) ? value.map(sort) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, sort(item)])) : value;
  return JSON.stringify(sort(input));
}

export function paperGenerationReplayState(row: { status: string; leaseExpiresAt: Date | null }, now: Date): "COMPLETED" | "FAILED" | "UNKNOWN" | "PROCESSING" {
  if (row.status === "COMPLETED" || row.status === "FAILED" || row.status === "UNKNOWN") return row.status;
  return row.leaseExpiresAt && row.leaseExpiresAt > now ? "PROCESSING" : "UNKNOWN";
}
