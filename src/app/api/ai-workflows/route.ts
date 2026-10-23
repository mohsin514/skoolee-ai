import { requireAutomaticUser } from "@/lib/automation/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { readBoundedJson } from "@/lib/school-ai/http";
import { WorkflowError } from "@/lib/ai-workflows/errors";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { advanceJob, getJob, listJobs, startJob } from "@/lib/ai-workflows/jobs/job-service";
import { toRunView } from "@/lib/ai-workflows/view";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const jobs = await listJobs(await requireAutomaticUser());
    return workflowJson({ jobs: jobs.map(job => ({ id: job.id, status: job.status, outcome: job.outcome, version: job.version, createdAt: job.createdAt, updatedAt: job.updatedAt })) });
  }
  catch (error) { return workflowErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    if (!(await authRateLimit(`ai-workflows:${user.userId}`, { limit: 10, windowMs: 300_000 })).ok) throw new WorkflowError("BUDGET_EXHAUSTED", { retryAfterSeconds: 300 });
    const job = await startJob(user, await readBoundedJson(request, 32_000));
    // Plan in the same request so the first response already shows the plan or a question.
    if (job.status === "PLANNING") await advanceJob(user, job.id).catch(() => undefined);
    return workflowJson({ run: toRunView(await getJob(user, job.id)) }, { status: 201 });
  } catch (error) { return workflowErrorResponse(error); }
}
