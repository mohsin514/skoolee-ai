import { requireAutomaticUser } from "@/lib/automation/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { authorizeActor, inTenant } from "@/lib/ai-workflows/jobs/actor";
import { claimHandoff } from "@/lib/ai-workflows/executor/handoff";

export const dynamic = "force-dynamic";

/** Claim a hand-off before opening it, so two approvers cannot act on the same prepared work. */
export async function POST(request: Request, context: { params: Promise<{ handoffId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    const { handoffId } = await context.params;
    return workflowJson({ handoff: await inTenant(user, async () => { await authorizeActor(user); return claimHandoff(user, handoffId); }) });
  } catch (error) { return workflowErrorResponse(error); }
}
