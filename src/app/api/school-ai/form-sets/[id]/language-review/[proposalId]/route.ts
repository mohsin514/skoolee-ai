import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { decideLanguageProposal } from "@/lib/school-ai/form-set-service";

export const dynamic = "force-dynamic";
// SKO-408 R9.6, R9.7: record the human decision on one finding, once; no item is edited.
export async function POST(request: Request, context: { params: Promise<{ id: string; proposalId: string }> }) {
  try { assertSameOrigin(request); const { id, proposalId } = await context.params; return Response.json({ proposal: await decideLanguageProposal(await requireAuthUser(), id, proposalId, await readBoundedJson(request, 1500)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
