import { requireAutomaticUser } from "@/lib/automation/auth";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { getJob } from "@/lib/ai-workflows/jobs/job-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireAutomaticUser();
    const { jobId } = await context.params;
    return workflowJson({ job: await getJob(user, jobId) });
  } catch (error) { return workflowErrorResponse(error); }
}
