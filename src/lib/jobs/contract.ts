import { z } from "zod";
import { workflowRetryReasons, workflowCancelReasons } from "@/lib/queue/operation-contract";

export const outcomes = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type Outcome = (typeof outcomes)[number];
export function reconcileCounts(items: { state: string }[]) {
  const counts = {
    total: items.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const item of items) {
    if (!outcomes.includes(item.state as Outcome))
      throw new Error("Unknown job outcome");
    counts[item.state as Outcome]++;
  }
  return counts;
}
export function failureCategory(reason: string | null) {
  if (/CONTACT|RECIPIENT/i.test(reason || "")) return "missing_contact";
  if (/AUTHORIZATION|PUBLICATION|BLOCKED/i.test(reason || ""))
    return "authorization";
  if (/UNCERTAIN/i.test(reason || "")) return "uncertain";
  if (/FILE|CSV|INVALID/i.test(reason || "")) return "invalid_file";
  if (/PROVIDER/i.test(reason || "")) return "provider";
  return "processing";
}

const itemIds = z.array(z.string().min(1).max(100)).max(500).refine(ids => new Set(ids).size === ids.length);
export const jobOperationSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("retry"), items: itemIds.min(1), reason: z.enum(workflowRetryReasons) }),
  z.strictObject({ action: z.literal("cancel"), items: itemIds.max(0), reason: z.enum(workflowCancelReasons) }),
]);
export type JobOperation = z.infer<typeof jobOperationSchema>;

/** A retry is a replay of this exact input, never a repair or a new recipient selection. */
export function retryBlockReason(item: { state: string; uncertain: boolean; reason: string | null; workflow_id: string | null; communication_id: string | null }, cancelled: boolean): string | null {
  if (item.uncertain) return "OUTCOME_UNCERTAIN";
  if (cancelled) return "JOB_CANCELLED";
  if (item.state !== "failed") return "NOT_FAILED";
  if (/INVALID_FILE|UNSUPPORTED_VERSION|UNKNOWN_EVENT_KIND/.test(item.reason || "")) return "SOURCE_CORRECTION_REQUIRED";
  if (!item.workflow_id && !item.communication_id) return "WORKFLOW_UNAVAILABLE";
  return null;
}

export function attentionCount(items: { state: string; uncertain: boolean; delivery_failed_at: Date | null }[]) {
  return items.filter(item => item.state === "failed" || item.uncertain || item.delivery_failed_at).length;
}

const safeReasons = new Set(["INVALID_FILE", "PROVIDER_UNAVAILABLE", "LEASE_LOST", "CANCEL_REQUESTED", "EXTERNAL_OUTCOME_UNCERTAIN", "UNSUPPORTED_VERSION", "UNKNOWN_EVENT_KIND", "AUTHORIZATION_OR_PUBLICATION_REVOKED", "ATTEMPTS_EXHAUSTED", "WORKER_FAILURE", "MISSING_CONTACT", "AUTHORIZATION_BLOCKED"]);
export function publicFailureReason(reason: string | null) {
  return reason === null ? null : safeReasons.has(reason) ? reason : "WORKER_FAILURE";
}
/** Persisted processing output is not an API DTO; never return imported pupil rows or provider payloads. */
export function publicJobResult(kind: string, item: { state: string; reference_id: string; version_id: string | null; result: unknown }) {
  if (item.state !== "completed" || !item.result || typeof item.result !== "object" || Array.isArray(item.result)) return null;
  const value = item.result as Record<string, unknown>;
  const count = (key: string) => typeof value[key] === "number" && Number.isSafeInteger(value[key]) && (value[key] as number) >= 0 ? value[key] as number : null;
  if (kind === "PDF" && item.version_id) return { bytes: count("bytes"), url: `/api/reports/download?reportCardId=${encodeURIComponent(item.reference_id)}&versionId=${encodeURIComponent(item.version_id)}` };
  if (kind === "IMPORT") return { totalTransactions: count("totalTransactions"), matched: count("matched"), unmatched: count("unmatched") };
  return null;
}
