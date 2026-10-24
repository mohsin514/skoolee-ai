import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { schoolAiError } from "@/lib/school-ai/http";
import { applyRemedy } from "@/lib/school-ai/exam-incident-service";

export const dynamic = "force-dynamic";
// SKO-408 R17.9: an approver authorizes this exact proposal; each candidate's outcome is returned.
export async function POST(request: Request, context: { params: Promise<{ id: string; remedyId: string }> }) {
  try { assertSameOrigin(request); const { id, remedyId } = await context.params; return Response.json({ remedy: await applyRemedy(await requireAuthUser(), id, remedyId) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
