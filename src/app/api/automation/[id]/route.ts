import { workflowJson } from "@/lib/ai-workflows/http";

/** Retired engine: earlier jobs no longer advance (they ran without per-step confirmation). Use /api/ai-workflows. */
export function POST() {
  return workflowJson({ code: "NOT_CONNECTED", successor: "/api/ai-workflows" }, { status: 410 });
}
