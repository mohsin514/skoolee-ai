import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { advanceJob, getJob } from "@/lib/ai-workflows/jobs/job-service";
import { startQuestionnaireJob } from "@/lib/ai-workflows/jobs/questionnaire";
import { toRunView } from "@/lib/ai-workflows/view";
import { setupStatus } from "@/lib/ai-workflows/questionnaire/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Start (or reopen) the AI Workflows job for a confirmed campus questionnaire version. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    const job = await startQuestionnaireJob(user, await readBoundedJson(request, 4_000));
    if (job.status === "PLANNING") await advanceJob(user, job.id).catch(() => undefined);
    return workflowJson({ run: toRunView(await getJob(user, job.id)) });
  } catch (error) { return workflowErrorResponse(error); }
}

/** The signed-in user's own role questionnaire status (drives the first-login prompt). */
export async function GET() {
  try {
    const user = await requireAutomaticUser();
    return workflowJson({ setup: await setupStatus(user) });
  } catch (error) { return workflowErrorResponse(error); }
}
