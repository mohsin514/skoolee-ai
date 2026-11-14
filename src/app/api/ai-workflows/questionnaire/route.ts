import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { setupStatus } from "@/lib/ai-workflows/questionnaire/status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// SKAI-1977: GET is the first-login status read on every landing page, so this module statically loads
// only the lean status path. POST pulls the job runtime (registry, planner, OpenAI SDK) on demand.

/** Start (or reopen) the AI Workflows job for a confirmed campus questionnaire version. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    const [{ readBoundedJson }, { advanceJob, getJob }, { startQuestionnaireJob }, { toRunView }] = await Promise.all([
      import("@/lib/school-ai/http"),
      import("@/lib/ai-workflows/jobs/job-service"),
      import("@/lib/ai-workflows/jobs/questionnaire"),
      import("@/lib/ai-workflows/view"),
    ]);
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
