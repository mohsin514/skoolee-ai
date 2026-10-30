import { requireAuthUser } from "@/lib/api/scope";
import { schoolAiError } from "@/lib/school-ai/http";
import { examImprovement } from "@/lib/school-ai/improve-service";

export const dynamic = "force-dynamic";
// SKO-408: item analysis and outcome feedback; a learner receives only their own, after release.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ improvement: await examImprovement(await requireAuthUser(), (await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
