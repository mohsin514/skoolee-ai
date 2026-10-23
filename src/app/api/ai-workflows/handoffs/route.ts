import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { inTenant } from "@/lib/ai-workflows/jobs/actor";
import { handoffsFor } from "@/lib/ai-workflows/executor/handoff";

export const dynamic = "force-dynamic";

/** Work the AI prepared for this person to decide on their own screen. */
export async function GET() {
  try { const user = await requireAutomaticUser(); return workflowJson({ handoffs: await inTenant(user, () => handoffsFor(user)) }); }
  catch (error) { return workflowErrorResponse(error); }
}
