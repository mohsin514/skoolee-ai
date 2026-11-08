import type { DocumentJob } from "./document-jobs";

export const SOURCE_POLL_LIMIT = 45;
export const SOURCE_POLL_DEADLINE_MS = 180_000;

/** Only the extraction for the current source revision can keep its reader waiting. */
export function sourceExtractionState(version: number, jobs: ReadonlyArray<Pick<DocumentJob, "kind" | "recordVersion" | "status">>, polls: number): "waiting" | "review" | "attention" {
  const job = jobs.find(row => row.kind === "EXTRACT" && row.recordVersion === version);
  if (job?.status === "READY") return "review";
  if (job && ["QUEUED", "PROCESSING"].includes(job.status) && polls < SOURCE_POLL_LIMIT) return "waiting";
  return "attention";
}
