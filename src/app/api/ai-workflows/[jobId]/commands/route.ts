import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { sessionTokenHash, workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { runCommand } from "@/lib/ai-workflows/jobs/commands";
import { getJob } from "@/lib/ai-workflows/jobs/job-service";
import { toRunView } from "@/lib/ai-workflows/view";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** confirm | answer | pause | resume | cancel for the signed-in user's own job. */
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    const { jobId } = await context.params;
    await runCommand(user, jobId, await readBoundedJson(request, 16_000), await sessionTokenHash());
    return workflowJson({ run: toRunView(await getJob(user, jobId)) });
  } catch (error) { return workflowErrorResponse(error); }
}
