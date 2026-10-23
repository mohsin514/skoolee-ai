import { requireAutomaticUser } from "@/lib/automation/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { readBoundedJson } from "@/lib/school-ai/http";
import { WorkflowError } from "@/lib/ai-workflows/errors";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { listJobs, startJob } from "@/lib/ai-workflows/jobs/job-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return workflowJson({ jobs: await listJobs(await requireAutomaticUser()) }); }
  catch (error) { return workflowErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    if (!(await authRateLimit(`ai-workflows:${user.userId}`, { limit: 10, windowMs: 300_000 })).ok) throw new WorkflowError("BUDGET_EXHAUSTED", { retryAfterSeconds: 300 });
    return workflowJson({ job: await startJob(user, await readBoundedJson(request, 32_000)) }, { status: 201 });
  } catch (error) { return workflowErrorResponse(error); }
}
