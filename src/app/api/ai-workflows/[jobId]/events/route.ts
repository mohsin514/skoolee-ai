import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { eventsAfter } from "@/lib/ai-workflows/jobs/job-service";

export const dynamic = "force-dynamic";

/**
 * Live progress by polling (?after=<seq>). The lean LEAP path uses polling instead of SSE (plan §9);
 * the client polls at 1 s while the job is moving and stops on a terminal status.
 */
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireAutomaticUser();
    const { jobId } = await context.params;
    const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
    return workflowJson(await eventsAfter(user, jobId, Number.isSafeInteger(after) && after >= 0 ? after : 0));
  } catch (error) { return workflowErrorResponse(error); }
}
