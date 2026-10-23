import { requireAutomaticUser } from "@/lib/automation/auth";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { getJob } from "@/lib/ai-workflows/jobs/job-service";
import { toRunView } from "@/lib/ai-workflows/view";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireAutomaticUser();
    const { jobId } = await context.params;
    return workflowJson({ run: toRunView(await getJob(user, jobId)) });
  } catch (error) { return workflowErrorResponse(error); }
}
