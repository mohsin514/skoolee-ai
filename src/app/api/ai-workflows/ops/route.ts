import { z } from "zod";
import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { workflowMetrics } from "@/lib/ai-workflows/adapters/platform";

export const dynamic = "force-dynamic";

/** AI Workflows operations metrics for the platform owner only (counts and timings, no tenant text). */
export async function GET(request: Request) {
  try {
    const user = await requireAutomaticUser();
    const hours = z.coerce.number().int().min(1).max(24 * 14).catch(24).parse(new URL(request.url).searchParams.get("hours") ?? 24);
    return workflowJson({ metrics: await workflowMetrics(user, hours) });
  } catch (error) { return workflowErrorResponse(error); }
}
